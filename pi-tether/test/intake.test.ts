import assert from "node:assert/strict";
import { test } from "node:test";
import { acceptGraph } from "../src/contract.ts";
import { emptyGraph } from "../src/graph.ts";
import type { FeedEvent } from "../src/feed.ts";

const event: FeedEvent = { ref: "s:user", actor: "lead", kind: "user", at: "", text: "Locate the code; do not answer yet. No edits." };
const known = new Map([[event.ref, event]]), fresh = new Set([event.ref]);
const quote = "do not answer yet", scope = "the investigation answer";
const main = { id: "main", parent: null, kind: "try", state: "active", label: "Locate code", intent: "Locate the code", observed: "", actor: "lead", sources: [event.ref] };
const hold = { id: "hold", parent: "main", kind: "rule", state: "active", label: "Answer withheld", intent: `${scope}: ${quote}`, observed: "User direction", actor: "user", sources: [event.ref] };
const constraint = { node: "hold", quote };
const base = { revision: 0, purpose: "main", focus: "main", directions: [{ source: event.ref, authorizedWork: "Locate the code", continuingConstraints: [constraint] }], unfinished: [],
	upsertNodes: [main, hold], upsertEdges: [{ from: "hold", relation: "governs", to: "main", sources: [event.ref] }], removeEdges: [], merges: [], folds: [], removeNodes: [], note: null };
const accept = (value: unknown, events = known) => acceptGraph(value, emptyGraph(), undefined, events, fresh, new Set());

test("user intake binds exact quotes to active rules, with scope written once in the rule's intent", () => {
	const result = accept(base);
	assert.equal(result.graph.nodes.find(n => n.id === "hold")!.intent, `${scope}: ${quote}`);
	const intent = `Defer the investigation answer: ${quote}`;
	assert.equal(accept({ ...base, upsertNodes: [main, { ...hold, intent }] }).graph.nodes.find(n => n.id === "hold")!.intent, intent);
	assert.throws(() => accept({ ...base, directions: [{ ...base.directions[0], continuingConstraints: [{ ...constraint, scope }] }] }), /Invalid graph transaction shape/);
	assert.throws(() => accept({ ...base, directions: [] }), /Missing user-direction intake: s:user/);
	assert.throws(() => accept({ ...base, directions: [...base.directions, ...base.directions] }), /duplicate\/old ref s:user/);
	assert.throws(() => accept({ ...base, directions: [{ ...base.directions[0], continuingConstraints: [{ ...constraint, quote: "Answer now" }] }] }), /quote is not exact recorded user text/);
	assert.throws(() => accept({ ...base, upsertNodes: [main, { ...hold, state: "settled" }] }), /hold needs an active rule annotation/);
	assert.throws(() => accept({ ...base, upsertEdges: [] }), /hold needs an active rule annotation/);
	assert.throws(() => accept({ ...base, upsertNodes: [main, { ...hold, intent: scope }] }), /exact quote/);
	assert.throws(() => accept({ ...base, upsertNodes: [main, { ...hold, kind: "try" }] }), /active rule annotation/);
	assert.doesNotThrow(() => accept(base, new Map([[event.ref, { ...event, kind: "user_answer" }]])), "dialog answers receive the same treatment");
});

test("worker task text is not promoted to human direction; empty constraints remains a model claim", () => {
	assert.throws(() => accept(base, new Map([[event.ref, { ...event, actor: "worker" }]])), /duplicate\/old ref/);
	assert.doesNotThrow(() => accept({ ...base, directions: [{ ...base.directions[0], continuingConstraints: [] }], upsertNodes: [main], upsertEdges: [] }), "host cannot certify omitted prose constraints");
});

test("invalid intake is reported before unrelated fold failures without relaxing either contract", () => {
	const previous = accept(base).graph, snapshot = structuredClone(previous);
	const child = { ...main, id: "child", parent: "main", state: "settled" };
	const transaction = { ...base, revision: previous.revision, upsertNodes: [{ ...hold, kind: "choice", state: "parked" }, child],
		folds: [{ thread: "child", reason: "Preparation complete", sources: [event.ref] }] };
	const submit = (value: unknown, graph = previous) => acceptGraph(value, graph, "checkpoint", known, fresh, new Set());
	assert.throws(() => submit(transaction), /Continuing constraint hold needs an active rule annotation/);
	assert.throws(() => submit({ ...transaction, directions: [] }), /Missing user-direction intake/);
	assert.throws(() => submit({ ...transaction, directions: [...base.directions, ...base.directions], upsertNodes: [hold, child] }), /duplicate\/old ref/);
	assert.throws(() => submit({ ...transaction, directions: [{ ...base.directions[0], continuingConstraints: [{ ...constraint, quote: "Answer now" }] }] }), /quote is not exact recorded user text/);
	assert.throws(() => submit({ ...transaction, upsertNodes: [hold, child] }), /endeavor from the previous saved map/);
	const withChild = { ...previous, nodes: [...previous.nodes, { ...previous.nodes[0], id: "child", parent: "main" }] };
	assert.throws(() => submit({ ...transaction, upsertNodes: [hold, child] }, withChild), /parent target upserted/);
	assert.deepEqual(previous, snapshot, "neither early intake rejection nor graph rejection mutates the checkpoint");
	assert.doesNotThrow(() => submit({ ...transaction, upsertNodes: [hold, child, main] }, withChild));
});

test("early intake checks preserve source identity and explicit upsert requirements", () => {
	const other: FeedEvent = { ...event, ref: "s:other" };
	assert.throws(() => accept({ ...base, upsertNodes: [main, { ...hold, sources: [other.ref] }] }, new Map([...known, [other.ref, other]])), /user source s:user/);
	assert.throws(() => accept({ ...base, upsertNodes: [main, hold, { ...hold, kind: "choice" }] }), /active rule annotation/);
	const previous = accept(base).graph;
	assert.doesNotThrow(() => acceptGraph({ ...base, revision: previous.revision, upsertNodes: [] }, previous, "checkpoint", known, fresh, new Set()), "an unchanged active rule need not be copied");
});

test("reiterated constraints mechanically add their exact quote and source to an existing governing rule", () => {
	const previous = accept(base).graph, snapshot = structuredClone(previous);
	const repeated: FeedEvent = { ...event, ref: "s:repeat", text: "Still do not answer yet." };
	const events = new Map([...known, [repeated.ref, repeated]]), direction = { source: repeated.ref, authorizedWork: "", continuingConstraints: [{ node: "hold", quote: "Still do not answer yet" }] };
	const transaction = { ...base, revision: previous.revision, directions: [direction], upsertNodes: [], upsertEdges: [] };
	const result = acceptGraph(transaction, previous, "checkpoint", events, new Set([repeated.ref]), new Set());
	const rebound = result.graph.nodes.find(node => node.id === "hold")!;
	assert.deepEqual(rebound.sources, [event.ref, repeated.ref]);
	assert.match(rebound.intent, /Exact continuing constraint: “Still do not answer yet”/);
	assert(result.graph.edges.some(edge => edge.from === "hold" && edge.relation === "governs"));
	assert.deepEqual(previous, snapshot, "mechanical binding does not mutate the published graph");
	const another: FeedEvent = { ...event, ref: "s:again", text: "Keep waiting; do not answer yet." };
	const secondDirection = { source: another.ref, authorizedWork: "", continuingConstraints: [{ node: "hold", quote: "Keep waiting; do not answer yet" }] };
	const accumulated = acceptGraph({ ...transaction, directions: [direction, secondDirection] }, previous, "checkpoint",
		new Map([...events, [another.ref, another]]), new Set([repeated.ref, another.ref]), new Set()).graph.nodes.find(node => node.id === "hold")!;
	assert.deepEqual(accumulated.sources, [event.ref, repeated.ref, another.ref]);
	assert.match(accumulated.intent, /Still do not answer yet/); assert.match(accumulated.intent, /Keep waiting; do not answer yet/);
	assert.throws(() => acceptGraph({ ...transaction, upsertNodes: [{ ...hold, sources: [event.ref] }] }, previous, "checkpoint", events, new Set([repeated.ref]), new Set()), /user source s:repeat/, "an explicit invalid replacement is not repaired silently");
});

test("intake bindings must survive graph edits with a governing edge and valid hierarchy", () => {
	const previous = accept(base).graph;
	const edge = base.upsertEdges[0];
	const submit = (changes: object) => acceptGraph({ ...base, revision: previous.revision, upsertNodes: [hold], upsertEdges: [], ...changes }, previous, "checkpoint", known, fresh, new Set());
	assert.doesNotThrow(() => submit({}), "an unchanged governing edge still counts");
	assert.throws(() => submit({ removeEdges: [{ from: edge.from, relation: edge.relation, to: edge.to }] }), /governs connection/);
	assert.doesNotThrow(() => submit({ removeEdges: [{ from: edge.from, relation: edge.relation, to: edge.to }], upsertEdges: [edge] }), "explicit replacement restores the edge");
	assert.throws(() => submit({ removeEdges: [{ from: edge.from, relation: edge.relation, to: edge.to }], removeNodes: [{ id: hold.id, reason: "Discard", sources: [event.ref] }] }), /active rule annotation/);
	assert.throws(() => submit({ upsertNodes: [{ ...hold, parent: null }] }), /Only an endeavor can be a root/);
	assert.throws(() => submit({ upsertEdges: [{ ...edge, to: "missing" }] }), /Dangling graph connection/);
});
