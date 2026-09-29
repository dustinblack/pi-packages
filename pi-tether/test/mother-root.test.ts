import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { acceptGraph } from "../src/contract.ts";
import { checkGraph, editGraph, emptyGraph, graphSlice, normalizeMotherRoot, type GraphEdit, type GraphNode } from "../src/graph.ts";
import { presentGraph, readText } from "../src/presentation.ts";
import { SidecarStore } from "../src/sidecar.ts";
import type { FeedEvent } from "../src/feed.ts";
import { input, isMomRequest, readSidecar, setup } from "./fixture.ts";

const refs = new Set(["s:origin", "s:current", "s:pivot", "s:alternative", "s:blocker"]);
const node = (id: string, parent: string | null, state: GraphNode["state"], source: string, intent: string, kind: GraphNode["kind"] = "feature"): GraphNode => ({
	id, parent, state, kind, label: id.replaceAll("_", " "), intent, observed: "", actor: "lead", sources: [source],
});
const put = (value: GraphNode): GraphEdit => ({ op: "put_node", node: value });
const edge = (from: string, relation: "depends_on" | "alternative_to", to: string, source: string): GraphEdit => ({
	op: "put_edge", edge: { from, relation, to, sources: [source] },
});
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function purposeMap() {
	return editGraph(emptyGraph(), 0, [
		put(node("mother", null, "active", "s:origin", "Build Tether into Mom while preserving the session's original purpose.")),
		put(node("current_work", "mother", "active", "s:current", "Finish the current Mom map behavior.")),
		put(node("interrupted_branch", "mother", "parked", "s:pivot", "Return to the interrupted replay branch after current work.")),
		put(node("considered_alternative", "mother", "proposed", "s:alternative", "Consider a second navigation approach.")),
		put(node("blocking_proof", "mother", "active", "s:blocker", "Establish the missing acceptance proof.")),
		edge("current_work", "depends_on", "blocking_proof", "s:blocker"),
		edge("considered_alternative", "alternative_to", "current_work", "s:alternative"),
	], "mother", "current_work", refs);
}

test("one persisted mother-thread root coordinates current, interrupted, blocker, and alternative work", () => {
	const graph = purposeMap(); checkGraph(graph);
	assert.equal(graph.motherThread, "mother");
	assert.deepEqual(graph.nodes.filter(item => item.parent === null).map(item => item.id), ["mother"]);
	assert.deepEqual(graphSlice(graph).focusPath, ["mother", "current_work"]);
	const text = readText(presentGraph(graphSlice(graph)));
	assert.match(text, /^Mother thread: mother \[mother\]/);
	assert.match(text, /Endeavor: current work \[current_work\].*current/);
	assert.match(text, /Endeavor: interrupted branch \[interrupted_branch\] — waiting/);
	assert.match(text, /Endeavor: considered alternative \[considered_alternative\] — proposed/);
	assert.match(text, /Depends on: blocking proof/);
	assert.match(text, /Alternative to: current work/);
	assert.match(text, /Why: Build Tether into Mom while preserving the session's original purpose\. \[src:s:origin\]/);
});

test("roots and alternatives preserve the mother-thread structural contract", () => {
	assert.throws(() => editGraph(emptyGraph(), 0, [
		put(node("one", null, "active", "s:origin", "One purpose.")),
		put(node("two", null, "active", "s:current", "Peer purpose.")),
	], "one", "one", refs), /exactly one coordinating mother-thread root/);
	const graph = purposeMap();
	assert.throws(() => editGraph(graph, graph.revision, [], "current_work", "current_work", refs), /Mother-thread root identity is stable/);
	assert.throws(() => checkGraph({ ...graph, motherThread: null }), /stable mother-thread root/);
	const rule = node("rule", "mother", "active", "s:current", "Keep the map read-only.", "rule");
	assert.throws(() => editGraph(graph, graph.revision, [put(rule), edge("current_work", "alternative_to", "rule", "s:current")],
		"mother", "current_work", refs), /endpoints must both be endeavors/);
	assert.throws(() => editGraph(graph, graph.revision, [put(rule), edge("rule", "alternative_to", "current_work", "s:current")],
		"mother", "current_work", refs), /endpoints must both be endeavors/);
});

test("public Why accepts full literal quotes and rejects overlap, paraphrase, invented fields, and assistant-only roots", () => {
	const user: FeedEvent = { ref: "s:user", actor: "lead", kind: "user", at: "", text: "Keep this original session purpose while mapping work." };
	const ruleSource: FeedEvent = { ref: "s:rule", actor: "lead", kind: "user", at: "", text: "Do not push or close the todo." };
	const known = new Map([[user.ref, user], [ruleSource.ref, ruleSource]]), root = node("mother", null, "active", user.ref, "Keep this original session purpose");
	const rule = node("hold", "mother", "active", ruleSource.ref, "Do not push or close the todo", "rule");
	const transaction = { revision: 0, purpose: "mother", focus: "mother", unfinished: [], upsertNodes: [root, rule],
		upsertEdges: [], removeEdges: [], merges: [], folds: [], removeNodes: [], supersessions: [], note: null };
	const accepted = acceptGraph(transaction, emptyGraph(), undefined, known, new Set(known.keys()), new Set());
	assert.equal(accepted.graph.nodes.length, 2);
	assert.throws(() => acceptGraph({ ...transaction, upsertNodes: [{ ...root, rationale: "Because efficiency demands it." }, rule] }, emptyGraph(), undefined,
		known, new Set(known.keys()), new Set()), /Invalid graph transaction shape/);
	// The former three-word anchor accepted "Keep this original" even though the
	// rest was invented and unrelated. Full-intent grounding must reject it.
	const genericOverlap = { ...transaction, upsertNodes: [node("mother", null, "active", user.ref, "Keep this original goal for an unrelated deployment."), rule] };
	assert.throws(() => acceptGraph(genericOverlap, emptyGraph(), undefined, known, new Set(known.keys()), new Set()), /normalized contiguous quote/);
	const paraphrasedRule = { ...transaction, upsertNodes: [root, { ...rule, intent: "Never publish or finish this task." }] };
	assert.throws(() => acceptGraph(paraphrasedRule, emptyGraph(), undefined, known, new Set(known.keys()), new Set()), /Public Why for hold/);
	const assistant: FeedEvent = { ref: "s:assistant", actor: "lead", kind: "assistant", at: "", text: "I invented a purpose." };
	const assistantKnown = new Map([[assistant.ref, assistant]]);
	assert.throws(() => acceptGraph({ ...transaction, upsertNodes: [node("mother", null, "active", assistant.ref, "I invented a purpose")] }, emptyGraph(), undefined,
		assistantKnown, new Set([assistant.ref]), new Set()), /cited user purpose source/);
});

test("current-format forest cutover is deterministic, idempotent, source-preserving, and cold-stable", { timeout: 15000 }, async () => {
	const h = await setup(); let mom = h.createMom();
	try {
		await h.runtime.session.prompt("Build Tether into Mom and keep the replay alternative visible.");
		await mom.open();
		const captured = await mom.feed.capture(24000, true), source = captured.events.find(event => event.kind === "user")!.ref;
		mom.close();
		const oldGraph = { revision: 4, purpose: "main", focus: "alternative", nodes: [
			node("main", null, "active", source, "Build Tether into Mom."),
			node("alternative", null, "parked", source, "Keep the replay alternative available."),
			node("probe", "alternative", "proposed", source, "Probe the alternative later."),
		], edges: [] };
		const normalized = normalizeMotherRoot(oldGraph);
		assert.equal(normalized.changed, true); assert.equal(normalized.graph.revision, 5);
		assert.equal(normalized.graph.motherThread, "main");
		assert.equal(normalized.graph.nodes.find(item => item.id === "alternative")!.parent, "main");
		assert.deepEqual(normalized.graph.nodes.map(item => item.sources), oldGraph.nodes.map(item => item.sources));
		assert.deepEqual(normalizeMotherRoot(normalized.graph), { graph: normalized.graph, changed: false });

		const store = new SidecarStore(() => h.parent, h.runtime.session.sessionManager.getSessionId());
		await store.append("map", { snapshot: { sessionId: h.runtime.session.sessionManager.getSessionId(), graph: oldGraph,
			note: null, cut: captured.cut, at: Date.now(), model: "fixture/fixture" } });
		mom = h.createMom(); await mom.open();
		const firstId = mom.checkpointId, coldHash = hash({ graph: mom.graph, cut: mom.checkpoint!.cut });
		assert.equal(mom.graph.motherThread, "main");
		assert.equal((await readSidecar(h)).filter(record => record.type === "map" && record.data.snapshot).length, 2, "open writes one atomic normalized snapshot");
		mom.close(); mom = h.createMom(); await mom.open();
		assert.equal(mom.checkpointId, firstId);
		assert.equal(hash({ graph: mom.graph, cut: mom.checkpoint!.cut }), coldHash);
		assert.equal((await readSidecar(h)).filter(record => record.type === "map" && record.data.snapshot).length, 2, "cold reopen does not repeat the idempotent cutover");
	} finally { mom.close(); await h.close(); }
});

test("one deterministic cold catch-up maps a multi-chapter backlog within one healthy call", { timeout: 15000 }, async () => {
	const h = await setup(); let mom = h.createMom();
	try {
		await h.runtime.session.prompt("Build Tether into Mom with a durable purpose map.");
		await h.runtime.session.prompt("Pause implementation and validate the production map first.");
		await h.runtime.session.prompt("Keep replay navigation as a considered alternative.");
		h.api.onUnscripted((request) => {
			if (!isMomRequest(request)) return { text: "Lead continued." };
			const body = input(request), source = (phrase: string) => {
				const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
				return new RegExp(`\\[src:([^\\]]+)\\][^\\n]*\\n${escaped}`).exec(body.newEvents)?.[1] ?? body.original.ref;
			};
			const origin = body.original.ref, pivot = source("Pause implementation"), alternative = source("Keep replay navigation");
			return { tool: { name: "commit_graph", arguments: { revision: body.graph.revision, purpose: "mother", focus: "acceptance", unfinished: [],
				upsertNodes: [
					node("mother", null, "active", origin, "Build Tether into Mom with a durable purpose map"),
					node("implementation", "mother", "parked", pivot, "Pause implementation and validate the production map first"),
					node("acceptance", "mother", "active", pivot, "validate the production map first"),
					node("replay_alternative", "mother", "proposed", alternative, "Keep replay navigation as a considered alternative"),
				], upsertEdges: [{ from: "replay_alternative", relation: "alternative_to", to: "acceptance", sources: [alternative] }],
				removeEdges: [], merges: [], folds: [], removeNodes: [], supersessions: [], note: null } } };
		});
		await mom.open(); await mom.update();
		assert.equal(h.requests().length, 1); assert.equal(mom.usage.calls, 1, "the settled multi-chapter backlog costs one healthy proposal call");
		assert.deepEqual(mom.graph.nodes.filter(item => item.parent === "mother").map(item => item.id).sort(), ["acceptance", "implementation", "replay_alternative"]);
		const before = hash({ graph: mom.graph, cut: mom.checkpoint!.cut }), checkpointId = mom.checkpointId;
		mom.close(); await h.runtime.session.reload(); mom = h.createMom(); await mom.open();
		assert.equal(hash({ graph: mom.graph, cut: mom.checkpoint!.cut }), before);
		assert.equal(mom.checkpointId, checkpointId);
		const calls = h.requests().length; await mom.update(); assert.equal(h.requests().length, calls, "cold reopen replays no accepted chapter");
	} finally { mom.close(); await h.close(); }
});
