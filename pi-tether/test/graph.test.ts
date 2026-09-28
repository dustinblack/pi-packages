import assert from "node:assert/strict";
import { test } from "node:test";
import { editGraph, emptyGraph, graphSlice, type GraphEdit, type GraphNode } from "../src/graph.ts";
const refs = new Set(["s:user", "s:result"]);
const node = (id: string, parent: string | null, state: GraphNode["state"] = "settled"): GraphNode => ({
	id, kind: "try", parent, state, label: id, intent: `Intent of ${id}`, observed: `Recorded ${id}`, actor: "", sources: ["s:user"],
});
const put = (node: GraphNode): GraphEdit => ({ op: "put_node", node });
const initial = () => editGraph(emptyGraph(), 0, [put(node("main", null, "active")), put(node("research", "main")), put(node("second", "main")), put(node("pending", "research", "parked"))], "main", "pending", refs);
const outcome = () => put({ ...node("main", null, "active"), observed: "Research outcomes incorporated; pending work remains.", sources: ["s:user", "s:result"] });

test("invalid/stale transactions leave the prior hierarchy untouched; omitted nodes stay unchanged", () => {
	const before = initial(), original = structuredClone(before);
	assert.throws(() => editGraph(before, 0, [], "main", "pending", refs), /Stale/);
	assert.throws(() => editGraph(before, 1, [{ op: "remove_node", id: "research", reason: "obsolete", sources: ["s:user"] }], "main", "pending", refs), /Parent/);
	assert.throws(() => editGraph(before, 1, [put({ ...node("new", "main"), sources: ["unknown"] })], "main", "pending", refs), /Unknown/);
	assert.throws(() => editGraph(before, 1, [{ op: "fold", thread: "pending", reason: "hide unfinished work", sources: ["s:user"] }], "main", "main", refs, "one"), /resolved/);
	assert.throws(() => editGraph(before, 1, [{ op: "fold", thread: "main", reason: "hide main line", sources: ["s:user"] }], "second", "second", refs, "one"), /parent/);
	assert.deepEqual(before, original);
	assert.deepEqual(editGraph(before, 1, [], "main", "pending", refs), before);
});

for (const op of ["fold", "merge"] as const) test(`${op} copies only operation sources into the explicitly updated target`, () => {
	const before = initial(), saved = structuredClone(before);
	const known = new Set([...refs, "s:content", "s:operation", "s:later", "s:detail"]);
	const contraction: GraphEdit = op === "fold"
		? { op, thread: "research", reason: "Returned result incorporated", sources: ["s:operation", "s:result", "s:later"] }
		: { op, thread: "research", into: "main", reason: "Returned result incorporated", sources: ["s:operation", "s:result", "s:later"] };
	const targetUpdate = { ...node("main", null, "active"), observed: "Research returned; unfinished work remains.", sources: ["s:result", "s:content"] };
	const sourceUpdate = { ...node("research", "main"), sources: ["s:detail"] };
	const apply = (edits: GraphEdit[]) => editGraph(before, 1, edits, "main", "pending", known, "prior");
	assert.throws(() => apply([contraction]), new RegExp(`${op} needs the ${op === "fold" ? "parent" : "destination"} target upserted in this batch: main`));
	assert.throws(() => apply([put(targetUpdate), { ...contraction, sources: ["unresolved"] }]), /Unknown or unobserved source: unresolved/);
	assert.throws(() => apply([put(targetUpdate), { ...contraction, sources: ["s:oper"] }]), /Use the exact observed source s:operation/);
	assert.throws(() => apply([put({ ...targetUpdate, sources: ["unresolved"] }), contraction]), /Unknown or unobserved source: unresolved/);
	assert.throws(() => apply([put({ ...sourceUpdate, sources: ["unresolved"] }), put(targetUpdate), contraction]), /Unknown or unobserved source: unresolved/);
	assert.throws(() => apply([put(targetUpdate), { ...contraction, sources: ["s:result", "s:result"] }]), /Duplicate graph source reference/);
	const after = apply([put(sourceUpdate), put(targetUpdate), contraction]);
	const target = after.nodes.find(n => n.id === "main")!;
	assert.deepEqual(target.sources, ["s:result", "s:content", "s:operation", "s:later"], "retain target order, append only missing operation refs in operation order");
	assert.deepEqual(target.history!.sources, ["s:operation", "s:result", "s:later", "s:user", "s:detail"], "retired provenance stays in history, not on the live target");
	assert.equal(after.nodes.find(n => n.id === "pending")!.parent, "main");
	assert.deepEqual(targetUpdate.sources, ["s:result", "s:content"], "do not mutate the supplied target update");
	const completeUpdate = { ...targetUpdate, sources: [...target.sources] };
	const alreadyCited = apply([put(completeUpdate), contraction]);
	assert.strictEqual(alreadyCited.nodes.find(n => n.id === "main")!.sources, completeUpdate.sources, "do not copy sources when none are missing");
	assert.deepEqual(before, saved, "leave the old published graph unchanged");
});

test("repeated folds chain through prior parent outcomes rather than accumulating retired nodes", () => {
	const before = initial();
	const once = editGraph(before, 1, [outcome(), { op: "fold", thread: "research", reason: "first returned", sources: ["s:result"] }], "main", "pending", refs, "first");
	const twice = editGraph(once, 2, [outcome(), { op: "fold", thread: "second", reason: "second returned", sources: ["s:result"] }], "main", "pending", refs, "second");
	assert.deepEqual(twice.nodes.find(n => n.id === "main")!.history!.nodes, ["main", "second"]);
	assert.equal(once.nodes.find(n => n.id === "main")!.history!.checkpoint, "first");
	assert.equal(twice.nodes.find(n => n.id === "pending")!.parent, "main");
});

test("neighborhoods reject invalid selectors and retain child membership", () => {
	const graph = initial(), local = graphSlice(graph, ["research"], 0);
	assert.equal(local.nodes.length, 1);
	assert(local.boundaryNodes.some(n => n.id === "pending" && n.parent === "research"));
	assert.equal(graphSlice(graph).nodes.length, graph.nodes.length);
	assert.throws(() => graphSlice(graph, ["missing"]), /Unknown/);
	assert.throws(() => graphSlice(graph, ["research"], -1), /depth/);
});
