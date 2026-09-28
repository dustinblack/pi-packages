import assert from "node:assert/strict";
import { test } from "node:test";
import { CHECKPOINT, FLAT_CHECKPOINT, LEGACY_CHECKPOINT, emptyUsage, loadState } from "../src/checkpoint.ts";
import { LiveFeed } from "../src/feed.ts";
import { setup, input, isMomRequest, replacement, until } from "./fixture.ts";

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("agents read current neighborhoods, folded history and original sources without inference; cold restore preserves the compacted graph", { timeout: 15000 }, async () => {
	const h = await setup(true);
	const checkpoints = () => h.runtime.session.sessionManager.getBranch().filter((e: any) => e.customType === CHECKPOINT);
	const read = async (args: unknown) => {
		const result = await h.tools.get("mom").execute("read", args, undefined);
		assert.match(result.content[0].text, /main|Original recorded evidence/);
		assert(!result.content[0].text.startsWith("{"), "English must precede selected details");
		if ((args as any).graph?.nodes?.length) {
			const publicView = JSON.parse(result.content[0].text.split("Recorded details:\n")[1]);
			assert(Array.isArray(publicView.endeavors)); assert.equal(publicView.nodes, undefined);
			assert(publicView.endeavors.every((n: any) => ["feature", "theory", "postulate", "try"].includes(n.kind)));
		} else if ((args as any).graph) {
			assert(!result.content[0].text.includes("Recorded details:"), "default maps do not dump records");
			assert(!result.content[0].text.includes('"sources":'), "source arrays require explicit selection");
			assert(!result.content[0].text.includes('"relation": "governs"'));
		}
		return result.details.data;
	};
	try {
		h.api.onUnscripted((request) => {
			if (!isMomRequest(request)) return { text: "Recorded the research result; deferred wording remains open." };
			const body = input(request), ref = /\[src:([^\]]+)\]/.exec(body.newEvents)![1];
			const put = (id: string, kind: string, state: string, parent: string | null = "main") => ({
				id, kind, parent, state, label: id, intent: id === "hold" ? "No file edits." : id, observed: "Reported in the source.", actor: "lead", sources: [ref],
			});
			const edge = (from: string, relation: string, to: string) => ({ from, relation, to, sources: [ref] });
			return { tool: { name: "commit_graph", arguments: { revision: body.graph.revision, purpose: "main", focus: body.graph.revision ? "pending" : "research", note: null,
				directions: body.userDirections.map((event: any) => ({ source: event.ref, authorizedWork: event.text, continuingConstraints: [] })),
				unfinished: body.graph.revision ? [{ node: "pending", label: "pending", disposition: "carried", target: "main", sources: [ref] }] : [],
				upsertNodes: body.graph.revision ? [{ ...put("main", "try", "active", null), observed: "Research outcomes incorporated; wording remains parked.", sources: [...new Set([...body.graph.nodes.find((n: any) => n.id === "research").sources, ref])] }, put("research", "try", "settled")]
					: [put("main", "try", "active", null), put("research", "try", "active"), put("finding_a", "observation", "settled", "research"), put("finding_b", "observation", "settled", "research"), put("pending", "try", "parked", "research"), put("hold", "rule", "active")],
				upsertEdges: body.graph.revision ? [] : [edge("research", "returns_to", "main"), edge("finding_a", "informs", "main"), edge("finding_a", "informs", "pending"), edge("finding_b", "informs", "research"), edge("hold", "governs", "main")],
				folds: body.graph.revision ? [{ thread: "research", reason: "Research returned; retain its outcome and links.", sources: [ref] }] : [],
				merges: [], removeEdges: [], removeNodes: [],
			} } };
		});
		// Control capture boundaries, not wall-clock speed: parent and Mom are independent.
		await h.command("pause");
		await h.runtime.session.prompt("Keep the goal. Research returned with two findings; defer wording. No file edits.");
		await h.command("resume");
		await until(() => checkpoints().length === 1);
		const before = await read({ graph: {} }), saved = structuredClone(before);
		await h.command("pause");
		await h.runtime.session.prompt("Fold the completed research. Keep the wording obligation and no-edit constraint.");
		await h.command("resume");
		await until(() => checkpoints().length === 2);
		const calls = h.api.requests.length, current = await read({ graph: {} });
		assert.equal(current.nodes.length, 3); assert.equal(before.nodes.length, 6);
		assert.equal(current.change.before, 6); assert.equal(current.change.after, 3);
		assert.deepEqual(current.change.created, []);
		assert.deepEqual(current.change.retired.map((n: any) => n.id).sort(), ["finding_a", "finding_b", "research"]);
		assert(current.change.retired.every((n: any) => n.sources.length));
		assert.deepEqual(before, saved, "published graph results must remain immutable");
		assert.equal(current.nodes.find((n: any) => n.id === "pending").state, "parked");
		assert.equal(current.nodes.find((n: any) => n.id === "hold").state, "active");
		assert.equal(current.nodes.find((n: any) => n.id === "pending").parent, "main");
		assert.match(current.original.text, /Keep the goal/);
		const local = await read({ graph: { nodes: ["main"], depth: 0 } });
		assert.equal(local.nodes.length, 1);
		assert(local.boundaryNodes.some((n: any) => n.id === "pending"));
		const history = local.nodes[0].history;
		const old = await read({ graph: { checkpoint: history.checkpoint, nodes: history.nodes, depth: 0 } });
		assert.equal(old.historical, true); assert.equal(old.nodes.length, 5);
		const source = await read({ source: { ref: local.nodes[0].sources.at(-1) } });
		assert.match(source.text, /Fold the completed research/);
		await assert.rejects(() => read({ graph: {}, question: "Why?" }), /Choose one/);
		await assert.rejects(() => read({ graph: { checkpoint: "missing" } }), /couldn't read that saved view or source/);
		await h.runtime.session.reload(); await pause(300);
		const restored = await read({ graph: {} });
		assert.deepEqual(restored.nodes, current.nodes); assert.deepEqual(restored.edges, current.edges);
		assert.equal(restored.checkpoint, current.checkpoint);
		assert.equal(h.api.requests.length, calls, "graph/source/history reads and reload are inference-free");
		const cold = h.sdk.SessionManager.open(h.parent);
		const state = loadState(cold);
		assert(state.checkpoint?.version === 4);
		assert.deepEqual(state.checkpoint.graph.nodes, current.nodes);
		assert.deepEqual(state.checkpoint.unfinished, current.unfinished);
		assert.equal(current.unfinished[0].node, "pending");
		assert.equal(current.unfinished[0].disposition, "carried");
		assert.deepEqual(h.errors, []); assert.deepEqual(h.api.errors, []);
	} finally { await h.close(); }
});

test("legacy snapshot migration keeps the old page and cut on failure, then publishes a real graph without replaying consumed events", { timeout: 15000 }, async () => {
	const h = await setup(); let mom = h.createMom();
	try {
		await h.runtime.session.prompt("Keep this permission hold: no edits yet.");
		const manager = h.runtime.session.sessionManager, feed = new LiveFeed(manager);
		await feed.capture();
		const ref = feed.events.find((e) => e.kind === "user")!.ref;
		const legacy = { version: 1, sessionId: manager.getSessionId(), snapshot: `No edits yet. [src:${ref}]`, note: null,
			cut: feed.cut(), at: Date.now(), model: "fixture/fixture", usage: emptyUsage() };
		manager.appendCustomEntry(LEGACY_CHECKPOINT, legacy);
		await mom.open();
		assert.match(mom.readGraph().legacySummary!, /No edits yet/); assert.equal(mom.readGraph().initialized, false);
		h.api.onUnscripted(() => ({ error: 400 }));
		await assert.rejects(() => mom.update(), /Fixture provider failure/);
		assert.deepEqual(mom.checkpoint, legacy); assert.deepEqual(loadState(manager).checkpoint, legacy);
		mom.close(); mom = h.createMom(); await mom.open();
		h.api.onUnscripted((request) => {
			const body = input(request);
			assert.equal(body.newEvents, ""); assert.equal(body.legacySummary, legacy.snapshot);
			assert.match(body.userHistory, /no edits yet/);
			return replacement(request);
		});
		await mom.update();
		assert.equal(mom.checkpoint?.version, 4); assert.equal(mom.readGraph().initialized, true);
		const legacyEntries = manager.getBranch().filter((e: any) => e.customType === LEGACY_CHECKPOINT);
		assert.equal(legacyEntries.length, 1);
		const earlier = mom.readGraph({ checkpoint: legacyEntries[0].id });
		assert.equal(earlier.format, "text-v1"); assert.equal(earlier.legacySummary, legacy.snapshot); assert.equal(earlier.historical, true);
		const cold = h.sdk.SessionManager.open(h.parent);
		assert.equal(loadState(cold).checkpoint?.version, 4);
		const calls = h.requests().length;
		mom.close(); mom = h.createMom(); await mom.open(); await mom.update();
		assert.equal(h.requests().length, calls, "migration is not repeated after successful publication");
	} finally { mom.close(); await h.close(); }
});

test("v2 migration retains its cut on failure and links changed IDs back through earlier flat fold history", { timeout: 15000 }, async () => {
	const h = await setup(); let mom = h.createMom();
	try {
		await h.runtime.session.prompt("Keep the main purpose visible. No edits without permission.");
		const manager = h.runtime.session.sessionManager, feed = new LiveFeed(manager);
		await feed.capture();
		const ref = feed.events.find(e => e.kind === "user")!.ref;
		const node = (id: string) => ({ id, kind: "work", state: "settled", label: id, intent: "No edits without permission.", observed: "Earlier account", actor: "", sources: [ref] });
		const base = { version: 2, sessionId: manager.getSessionId(), note: null, cut: feed.cut(), at: Date.now(), model: "fixture/fixture", usage: emptyUsage() };
		const first = manager.appendCustomEntry(FLAT_CHECKPOINT, { ...base, graph: { revision: 1, purpose: "old_main", focus: "old_child", nodes: [node("old_main"), node("old_child")], edges: [] } });
		const legacy = { ...base, graph: { revision: 2, purpose: "old_main", focus: "old_main", nodes: [{ ...node("old_main"), history: { checkpoint: first, nodes: ["old_main", "old_child"], reason: "Old flat fold", sources: [ref] } }], edges: [] } };
		const second = manager.appendCustomEntry(FLAT_CHECKPOINT, legacy);
		await mom.open();
		assert.equal(mom.readGraph().format, "flat-v2");
		assert.equal(mom.readGraph().initialized, false, "do not present invented hierarchy before migration");
		h.api.onUnscripted(() => ({ error: 400 }));
		await assert.rejects(() => mom.update(), /Fixture provider failure/);
		assert.deepEqual(mom.checkpoint, legacy); assert.deepEqual(loadState(manager).checkpoint, legacy);
		mom.close(); mom = h.createMom(); await mom.open();
		h.api.onUnscripted(request => {
			const body = input(request);
			assert.equal(body.newEvents, ""); assert.deepEqual(body.legacyGraph, legacy.graph);
			return replacement(request); // Deliberately changes old_main to main.
		});
		await mom.update();
		const current = mom.readGraph();
		assert.equal(current.format, "endeavors-v4"); assert.equal(current.previousCheckpoint, second);
		assert.equal(current.nodes[0].id, "main"); assert.match(current.original!.text!, /main purpose visible/);
		assert.equal(current.change!.before, 1); assert.equal(current.change!.after, 1);
		assert.deepEqual(current.change!.created.map(n => n.id), ["main"]);
		assert.deepEqual(current.change!.retired.map(n => n.id), ["old_main"]);
		const old = mom.readGraph({ checkpoint: current.previousCheckpoint });
		assert.equal(old.historical, true); assert.equal(old.format, "flat-v2");
		const oldest = mom.readGraph({ checkpoint: old.nodes[0].history!.checkpoint, nodes: ["old_child"], depth: 0 });
		assert.equal(oldest.nodes[0].id, "old_child");
		assert.match((await mom.feed.lookup(oldest.nodes[0].sources[0])).text, /No edits without permission/);
		const calls = h.requests().length;
		mom.close(); mom = h.createMom(); await mom.open(); await mom.update();
		assert.deepEqual(mom.readGraph(), current); assert.equal(h.requests().length, calls);
		assert.equal(loadState(h.sdk.SessionManager.open(h.parent)).checkpoint?.version, 4);
	} finally { mom.close(); await h.close(); }
});
