import assert from "node:assert/strict";
import { test } from "node:test";
import { CHECKPOINT, THREAD_CHECKPOINT, emptyUsage, isCheckpoint, loadState } from "../src/checkpoint.ts";
import { acceptGraph } from "../src/contract.ts";
import { LiveFeed } from "../src/feed.ts";
import { checkGraph, checkThreadGraph, editGraph, emptyGraph, isEndeavor, upgradeThreadGraph, type GraphNode, type ThreadGraph } from "../src/graph.ts";
import { input, replacement, setup } from "./fixture.ts";

const record = (id: string, kind: GraphNode["kind"], parent: string | null): GraphNode => ({
	id, kind, parent, state: "active", label: id, intent: id, observed: "", actor: "user", sources: ["s:user"],
});

test("endeavors own rule, choice and observation annotations; annotations cannot be work centers", () => {
	for (const kind of ["feature", "theory", "postulate", "try"] as const) {
		const graph = editGraph(emptyGraph(), 0, [
			{ op: "put_node", node: record("main", kind, null) },
			...(["rule", "choice", "observation"] as const).map(kind => ({ op: "put_node" as const, node: record(kind, kind, "main") })),
		], "main", "choice", new Set(["s:user"]));
		checkGraph(graph); assert(isEndeavor(graph.nodes[0]));
		assert(graph.nodes.slice(1).every(node => !isEndeavor(node) && node.parent === "main"));
		assert.throws(() => editGraph(graph, 1, [{ op: "put_node", node: record("nested", "try", "rule") }], "main", "main", new Set(["s:user"])), /Parent must be an existing endeavor/);
		assert.throws(() => editGraph(graph, 1, [{ op: "put_node", node: record("rule", "rule", null) }], "main", "main", new Set(["s:user"])), /attach annotation rule/);
	}
	assert.equal(isEndeavor({ kind: "thread" }), false, "old kinds require explicit saved-map conversion");
	const oldTransaction = { revision: 0, purpose: "main", focus: "main", directions: [], unfinished: [],
		upsertNodes: [{ ...record("main", "try", null), kind: "thread" }], upsertEdges: [], removeEdges: [], merges: [], folds: [], removeNodes: [] };
	assert.throws(() => acceptGraph(oldTransaction, emptyGraph(), undefined, new Map(), new Set(), new Set()), /Invalid graph transaction shape/);
});

test("v3 conversion preserves identity, parentage, quotations, history and state without inventing endeavor semantics", () => {
	const graph: ThreadGraph = { revision: 7, purpose: "main", focus: "choice", nodes: [
		{ ...record("main", "try", null), kind: "thread", history: { checkpoint: "older", nodes: ["main", "folded"], sources: ["s:user"], reason: "Folded earlier detail", returns: [{ from: "folded", to: "main" }] } },
		{ ...record("rule", "rule", "main"), kind: "decision", intent: 'User said "do not answer yet"; applies to this question.' },
		{ ...record("choice", "choice", "main"), kind: "decision", state: "parked" },
		{ ...record("observation", "observation", "main"), kind: "finding", state: "settled" },
	], edges: [{ from: "rule", relation: "governs", to: "main", sources: ["s:user"] }] };
	const saved = structuredClone(graph); checkThreadGraph(graph);
	const next = upgradeThreadGraph(graph); checkGraph(next);
	assert.deepEqual(next.nodes.map(node => node.kind), ["try", "rule", "choice", "observation"]);
	for (const [index, old] of graph.nodes.entries()) {
		const { kind: _oldKind, ...before } = old, { kind: _newKind, ...after } = next.nodes[index];
		assert.deepEqual(after, before);
	}
	assert.deepEqual(next.edges, graph.edges); assert.deepEqual(graph, saved);
	next.nodes[0].sources.push("new");
	assert.deepEqual(graph, saved, "converted live account cannot mutate the saved record");
	assert.throws(() => checkThreadGraph({ ...graph, nodes: [record("main", "feature", null)] }), /Invalid saved v3/);
});

test("v3 cold opening is inference-free, next update saves v4, and v3 history and attached state remain readable", { timeout: 15000 }, async () => {
	const h = await setup(); let mom = h.createMom();
	try {
		await h.runtime.session.prompt("Locate the code; do not answer yet. Leave the wording to me.");
		const manager = h.runtime.session.sessionManager, feed = new LiveFeed(manager); await feed.capture();
		const ref = feed.events.find(event => event.kind === "user")!.ref;
		const oldNode = (id: string, kind: "thread" | "decision" | "finding", parent: string | null, state: ThreadGraph["nodes"][number]["state"]): ThreadGraph["nodes"][number] => ({
			id, kind, parent, state, label: id, intent: id === "hold" ? "This question: do not answer yet" : id, observed: "Recorded result", actor: "user", sources: [ref],
		});
		const graph: ThreadGraph = { revision: 2, purpose: "main", focus: "choice", nodes: [oldNode("main", "thread", null, "active"), oldNode("child", "thread", "main", "settled"),
			oldNode("hold", "decision", "child", "active"), oldNode("choice", "decision", "child", "parked"), oldNode("finding", "finding", "child", "settled")],
			edges: [{ from: "hold", relation: "governs", to: "main", sources: [ref] }, { from: "child", relation: "returns_to", to: "main", sources: [ref] }] };
		const saved = { version: 3, sessionId: manager.getSessionId(), graph, note: null, cut: feed.cut(), at: Date.now(), model: "fixture/fixture", usage: emptyUsage() };
		assert(isCheckpoint(saved));
		const oldId = manager.appendCustomEntry(THREAD_CHECKPOINT, saved), savedCopy = structuredClone(saved);
		await mom.open();
		const calls = h.requests().length;
		assert.equal(mom.graph.nodes[0].kind, "try"); assert.equal(mom.graph.nodes.find(node => node.id === "hold")!.kind, "rule");
		assert.equal(mom.readGraph().format, "endeavors-v4"); assert.equal(mom.readGraph().savedFormat, "threads-v3");
		assert.equal(mom.readGraph().initialized, true);
		await mom.update(); assert.equal(h.requests().length, calls); assert.equal(loadState(manager).checkpoint?.version, 3);
		mom.close(); mom = h.createMom(); await mom.open();
		assert.equal(h.requests().length, calls);
		h.api.onUnscripted(request => {
			const body = input(request), newRef = body.userDirections[0].ref;
			assert(body.graph.nodes.every((node: any) => !["thread", "decision", "finding"].includes(node.kind)));
			return replacement(request, { focus: "choice", folds: [{ thread: "child", reason: "Preparation result folded into main work", sources: [newRef] }],
				unfinished: ["hold", "choice"].map(node => ({ node, label: node, disposition: "carried", target: "main", sources: [ref] })),
			});
		});
		manager.appendMessage({ role: "user", content: "The limited preparation is finished; keep my existing hold and wording choice.", timestamp: Date.now() });
		await mom.update();
		assert.equal(mom.checkpoint?.version, 4); assert.equal(manager.getBranch().filter((entry: any) => entry.customType === CHECKPOINT).length, 1);
		assert.equal(mom.readGraph().previousCheckpoint, oldId);
		assert.equal(mom.graph.nodes.find(node => node.id === "hold")!.parent, "main");
		assert.equal(mom.graph.nodes.find(node => node.id === "hold")!.state, "active");
		assert.match(mom.graph.nodes.find(node => node.id === "hold")!.intent, /do not answer yet/);
		assert.equal(mom.graph.nodes.find(node => node.id === "choice")!.kind, "choice");
		assert(mom.graph.nodes.find(node => node.id === "main")!.history!.sources.includes(ref));
		const historical = mom.readGraph({ checkpoint: oldId, nodes: ["child", "hold"], depth: 0 });
		assert.equal(historical.format, "threads-v3"); assert.equal(historical.historical, true);
		assert.deepEqual(historical.nodes.map(node => node.kind), ["thread", "decision"]);
		assert.deepEqual((manager.getEntry(oldId) as any).data, savedCopy);
		const original = await mom.feed.lookup(ref); assert.match(original.text, /do not answer yet/);
		const cold = h.sdk.SessionManager.open(h.parent), state = loadState(cold);
		assert.equal(state.checkpoint?.version, 4);
		assert.deepEqual(state.checkpoint, mom.checkpoint);
		assert.deepEqual(h.api.errors, []);
	} finally { mom.close(); await h.close(); }
});
