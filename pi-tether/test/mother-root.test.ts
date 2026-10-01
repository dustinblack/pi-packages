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
	id, parent, state, kind, label: id.replaceAll("_", " "), intent, observed: "", actor: "lead", sources: [source], purposeSource: source,
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

test("the host assigns public Why provenance while intent remains free text", () => {
	const user: FeedEvent = { ref: "s:user", actor: "lead", kind: "user", at: "", text: "Keep this original session purpose while mapping work." };
	const ruleSource: FeedEvent = { ref: "s:rule", actor: "lead", kind: "user", at: "", text: "Do not push or close the todo." };
	const known = new Map([[user.ref, user], [ruleSource.ref, ruleSource]]), root = node("mother", null, "active", user.ref, "Keep this original session purpose");
	const rule = { ...node("hold", "mother", "active", ruleSource.ref, "Do not push or close the todo", "rule"), sources: [user.ref, ruleSource.ref] };
	const transaction = { revision: 0, purpose: "mother", focus: "mother", unfinished: [], upsertNodes: [root, rule],
		upsertEdges: [], removeEdges: [], merges: [], folds: [], removeNodes: [], supersessions: [], note: null };
	const accepted = acceptGraph(transaction, emptyGraph(), undefined, known, new Set(known.keys()), new Set());
	assert.equal(accepted.graph.nodes.length, 2);
	const rendered = readText(presentGraph(graphSlice(accepted.graph)));
	assert.match(rendered, /Why: Do not push or close the todo \[src:s:user\]/);
	const canonical = acceptGraph({ ...transaction, upsertNodes: [
		{ ...root, sources: [ruleSource.ref, user.ref], purposeSource: ruleSource.ref },
		{ ...rule, purposeSource: user.ref },
	] }, emptyGraph(), undefined, known, new Set(known.keys()), new Set());
	assert.equal(canonical.graph.nodes.find(item => item.id === "mother")?.purposeSource, user.ref, "initial root chooses grounded user evidence");
	assert.equal(canonical.graph.nodes.find(item => item.id === "hold")?.purposeSource, user.ref, "earliest cited user source owns public Why");
	assert.throws(() => acceptGraph({ ...transaction, upsertNodes: [{ ...root, rationale: "Because efficiency demands it." }, rule] }, emptyGraph(), undefined,
		known, new Set(known.keys()), new Set()), /Invalid graph transaction shape/);
	const genericOverlap = { ...transaction, upsertNodes: [node("mother", null, "active", user.ref, "Keep this original goal for an unrelated deployment."), rule] };
	const synthesized = acceptGraph(genericOverlap, emptyGraph(), undefined, known, new Set(known.keys()), new Set());
	assert.equal(synthesized.graph.nodes[0]?.intent, "Keep this original goal for an unrelated deployment.", "cold start keeps the synthesized purpose, not the first message verbatim");
	assert.deepEqual(synthesized.repairs, []);
	const reworded = acceptGraph({ ...transaction, upsertNodes: [{ ...root, label: "Renamed", intent: "Something else now." }, rule] }, synthesized.graph, "saved", known, new Set(), new Set());
	assert.equal(reworded.graph.nodes[0]?.intent, "Keep this original goal for an unrelated deployment.", "a rewording with no new user direction is restored");
	assert.equal(reworded.graph.nodes[0]?.label, "mother");
	assert.deepEqual(reworded.repairs, [{ from: "mother purpose", to: "kept: no new user direction cited" }]);
	const turn: FeedEvent = { ref: "s:turn", actor: "lead", kind: "user", at: "", text: "Forget the deployment; make this a library instead." };
	const withTurn = new Map([...known, [turn.ref, turn]]);
	const redirected = acceptGraph({ ...transaction, upsertNodes: [{ ...root, label: "Library", intent: "Make this a library.", sources: [user.ref, turn.ref] }, rule] }, synthesized.graph, "saved", withTurn, new Set([turn.ref]), new Set());
	assert.equal(redirected.graph.nodes[0]?.intent, "Make this a library.", "a new user direction cited on the root redirects the purpose");
	assert.equal(redirected.graph.nodes[0]?.purposeSource, turn.ref, "Why follows the redirecting direction");
	assert.deepEqual(redirected.repairs, []);
	const paraphrasedRule = { ...transaction, upsertNodes: [root, { ...rule, intent: "Never publish or finish this task." }] };
	assert.equal(acceptGraph(paraphrasedRule, emptyGraph(), undefined, known, new Set(known.keys()), new Set()).graph.nodes[1]?.intent,
		"Never publish or finish this task.");
	const assistant: FeedEvent = { ref: "s:assistant", actor: "lead", kind: "assistant", at: "", text: "I invented a purpose." };
	const assistantKnown = new Map([[assistant.ref, assistant]]);
	assert.throws(() => acceptGraph({ ...transaction, upsertNodes: [node("mother", null, "active", assistant.ref, "I invented a purpose")] }, emptyGraph(), undefined,
		assistantKnown, new Set([assistant.ref]), new Set()), /needs an observed lead user event/);
});

test("names have one to six words and legacy root shortening preserves purpose", () => {
	const user: FeedEvent = { ref: "s:user", actor: "lead", kind: "user", at: "", text: "Improve extensions and the footer." };
	const known = new Map([[user.ref, user]]);
	const root = { ...node("mother", null, "active", user.ref, "Maintain the extensions and footer."), label: "Improve pi extensions and investigate footer behavior" };
	const prior = editGraph(emptyGraph(), 0, [put(root)], "mother", "mother", new Set(known.keys()));
	const transaction = { focus: "mother", unfinished: [], upsertNodes: [{ ...root, label: "Extension improvements", intent: "Silently change the purpose." }],
		upsertEdges: [], removeEdges: [], merges: [], folds: [], removeNodes: [] };
	const accepted = acceptGraph(transaction, prior, "saved", known, new Set(), new Set());
	assert.equal(accepted.graph.nodes[0].label, "Extension improvements");
	assert.equal(accepted.graph.nodes[0].intent, root.intent);
	assert.equal(accepted.graph.nodes[0].purposeSource, root.purposeSource);
	for (const label of ["One", "One two three four five six"]) {
		assert.equal(acceptGraph({ ...transaction, upsertNodes: [{ ...root, label }] }, emptyGraph(), undefined, known, new Set(known.keys()), new Set()).graph.nodes[0].label, label);
	}
	for (const [label, error] of [["   ", /label.*fewer than 1/], ["One two three four five six seven", /1–6-word name/]] as const) {
		assert.throws(() => acceptGraph({ ...transaction, upsertNodes: [{ ...root, label }] }, emptyGraph(), undefined, known, new Set(known.keys()), new Set()), error);
	}
	assert.equal(acceptGraph({ ...transaction, upsertNodes: [root] }, prior, "saved", known, new Set(), new Set()).graph.nodes[0].label, root.label, "unchanged legacy labels do not invalidate an update");
});

test("cold start rejects multiple roots and names every candidate", () => {
	const user: FeedEvent = { ref: "s:user", actor: "lead", kind: "user", at: "", text: "Map both." };
	const transaction = { focus: "one", unfinished: [], upsertNodes: [
		node("one", null, "active", user.ref, "One."), node("two", null, "active", user.ref, "Two."),
	], upsertEdges: [], removeEdges: [], merges: [], folds: [], removeNodes: [] };
	assert.throws(() => acceptGraph(transaction, emptyGraph(), undefined, new Map([[user.ref, user]]), new Set([user.ref]), new Set()),
		/Cold-start graph needs exactly one upserted root; candidates: one, two/);
});

test("live-shaped prose pointers are derived or repaired without a revision", () => {
	const user: FeedEvent = { ref: "s:user", actor: "lead", kind: "user", at: "", text: "Build a reliable work map." };
	const transaction = { purpose: "Build a reliable work map for this session", focus: "Current Work", unfinished: [], upsertNodes: [
		{ ...node("mother", null, "active", user.ref, "Build a reliable work map."), label: "Session purpose" },
		{ ...node("current", "mother", "active", user.ref, "Continue current work."), label: "Current Work" },
	], upsertEdges: [], removeEdges: [], merges: [], folds: [], removeNodes: [] };
	const result = acceptGraph(transaction, emptyGraph(), undefined, new Map([[user.ref, user]]), new Set([user.ref]), new Set());
	assert.equal(result.graph.purpose, "mother");
	assert.equal(result.graph.focus, "current");
	assert.deepEqual(result.repairs, [{ from: "Current Work", to: "current" }]);
});

test("current-format forest cutover is deterministic, idempotent, source-preserving, and cold-stable", { timeout: 15000 }, async () => {
	const h = await setup(); let mom = h.createMom();
	try {
		await h.runtime.session.prompt("Build Tether into Mom and keep the replay alternative visible.");
		await mom.open();
		const captured = await mom.feed.capture(24000, true), source = captured.events.find(event => event.kind === "user")!.ref;
		mom.close();
		const inherited = (value: GraphNode) => { const { purposeSource: _missingBeforeThisContract, ...legacy } = value; return legacy; };
		const oldGraph = { revision: 4, purpose: "main", focus: "alternative", nodes: [
			inherited(node("main", null, "active", source, "Build Tether into Mom.")),
			inherited(node("alternative", null, "parked", source, "Keep the replay alternative available.")),
			inherited(node("probe", "alternative", "proposed", source, "Probe the alternative later.")),
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
		assert.match(readText(presentGraph(graphSlice(mom.graph))), /Why: evidence unavailable/, "grandfathered text is not exposed as grounded Why");
		h.api.onUnscripted((request) => {
			if (!isMomRequest(request)) return { text: "No material map change." };
			const body = input(request);
			return { tool: { name: "commit_graph", arguments: { revision: body.graph.revision, purpose: body.graph.purpose, focus: body.graph.focus,
				unfinished: [], upsertNodes: [], upsertEdges: [], removeEdges: [], merges: [], folds: [], removeNodes: [], supersessions: [], note: null } } };
		});
		await h.runtime.session.prompt("No material map change; retain the inherited account.");
		const beforeNoop = structuredClone(mom.graph); await mom.update();
		assert.deepEqual(mom.graph, beforeNoop, "first post-cutover no-op preserves inherited nodes without forced rewriting");
		assert.equal(mom.usage.calls, 1, "grandfathered no-op accepts in one proposal");
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
