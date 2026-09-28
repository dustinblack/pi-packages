import assert from "node:assert/strict";
import { test } from "node:test";
import { checkGraph, editGraph, emptyGraph, graphSlice, isEndeavor, type ThreadGraph } from "../src/graph.ts";

const refs = new Set(["s:request", "s:return"]);
const node = (id: string, parent: string | null, state = "settled", kind = "try") => ({
	id, parent, kind, state, label: id, intent: id === "hold" ? "Do not answer the negative-zero question until the user authorizes it." : `Purpose of ${id}${id === "pending" ? "; no edits until approved." : ""}`, observed: "Reported result", actor: "", sources: ["s:request"],
});
const put = (n: any): any => ({ op: "put_node", node: n });
const link = (from: string, relation: string, to: string): any => ({ op: "put_edge", edge: { from, relation, to, sources: ["s:request"] } });
function initial() {
	return editGraph(emptyGraph(), 0, [put(node("main", null, "active")), put(node("research", "main")),
		put(node("probe", "research")), put(node("finding", "probe", "settled", "observation")),
		put(node("pending", "probe", "parked")), put(node("partial", "pending", "settled", "observation")),
		put(node("hold", "research", "active", "rule")), put(node("other", null, "active")),
		link("research", "returns_to", "main"), link("finding", "informs", "other"),
		link("hold", "governs", "research")], "main", "pending", refs);
}
const fold: any = { op: "fold", thread: "research", reason: "Research returned; carry unfinished work.", sources: ["s:return"] };

test("thread parents form a forest independently of cross-links", () => {
	const graph = initial(); checkGraph(graph);
	assert.equal(graph.nodes.find(n => n.id === "probe")!.parent, "research");
	assert.throws(() => editGraph(graph, 1, [put(node("main", "probe", "active"))], "other", "pending", refs), /cycle/i);
	assert.throws(() => editGraph(graph, 1, [put(node("pending", "finding", "parked"))], "main", "pending", refs), /parent.*endeavor/i);
	assert.throws(() => editGraph(graph, 1, [put(node("orphan", null, "active", "rule"))], "main", "pending", refs), /endeavor.*root/i);
	assert.throws(() => editGraph(graph, 1, [], "research", "pending", refs), /purpose.*root/i);
	assert.doesNotThrow(() => editGraph(graph, 1, [link("main", "depends_on", "other"), link("other", "depends_on", "main")], "main", "pending", refs));
});

test("fold contracts a subtree into its parent and carries unfinished descendants without silently widening a constraint", () => {
	const before = initial(), saved = structuredClone(before);
	assert.throws(() => editGraph(before, 1, [fold], "main", "pending", refs, "prior"), /governs.*explicit/i);
	const after = editGraph(before, 1, [
		{ op: "remove_edge", from: "hold", relation: "governs", to: "research" },
		// Explicit interpretation: the continuing hold applies to the retained pending branch, not every sibling.
		link("hold", "governs", "pending"),
		put({ ...node("main", null, "active"), observed: "Research outcome incorporated; wording and the scoped hold remain.", sources: ["s:request", "s:return"] }), fold,
	], "main", "pending", refs, "prior");
	assert.equal(after.nodes.length, before.nodes.length - 3);
	assert.equal(after.nodes.find(n => n.id === "pending")!.parent, "main");
	assert.equal(after.nodes.find(n => n.id === "partial")!.parent, "pending");
	assert.equal(after.nodes.find(n => n.id === "hold")!.parent, "main");
	assert.equal(after.nodes.find(n => n.id === "hold")!.intent, before.nodes.find(n => n.id === "hold")!.intent);
	assert(after.edges.some(e => e.from === "main" && e.relation === "informs" && e.to === "other"));
	assert(!after.edges.some(e => e.from === "hold" && e.to === "main"));
	const history = after.nodes.find(n => n.id === "main")!.history!;
	assert(history.nodes.includes("probe"));
	assert.deepEqual(history.returns, [{ from: "research", to: "main" }], "landing must remain represented, not become a dropped self-edge");
	assert.deepEqual(before, saved, "failed/successful transactions never mutate earlier checkpoints");
});

test("centers merge only with an explicit sourced target update carrying the unfinished purpose", () => {
	const graph = initial();
	const merge: any = { op: "merge", thread: "pending", into: "other", reason: "Combine the two investigations.", sources: ["s:return"] };
	assert.throws(() => editGraph(graph, 1, [merge], "main", "other", refs, "prior"), /merge needs the destination target upserted in this batch: other/i);
	const target = { ...node("other", null, "active"), intent: "Other investigation plus Purpose of pending; no edits until approved.", sources: ["s:return"] };
	const after = editGraph(graph, 1, [put(target), merge], "main", "other", refs, "prior");
	assert(!after.nodes.some(n => n.id === "pending"));
	assert.equal(after.nodes.find(n => n.id === "partial")!.parent, "other");
	assert.match(after.nodes.find(n => n.id === "other")!.intent, /no edits until approved/);
	assert(after.nodes.find(n => n.id === "other")!.history!.nodes.includes("pending"));
	assert(after.nodes.find(n => n.id === "other")!.history!.sources.includes("s:request"));
	assert.throws(() => editGraph(graph, 1, [put(node("probe", "research", "active")), { ...merge, thread: "research", into: "probe" }], "main", "probe", refs, "prior"), /descendant/i);
});

test("depth-zero reads retain main line, roots, ancestry and focus path instead of flattening the selected thread", () => {
	const graph = editGraph(initial(), 1, [put(node("other_branch", "other", "active")), put(node("other_finding", "other_branch", "settled", "observation")), link("pending", "informs", "other_finding")], "main", "pending", refs);
	const slice = graphSlice(graph, ["pending"], 0);
	assert.deepEqual(slice.roots, ["main", "other"]);
	assert.deepEqual(slice.focusPath, ["main", "research", "probe", "pending"]);
	assert.deepEqual(slice.nodes.map(n => n.id), ["pending"]);
	for (const id of ["main", "research", "probe", "other"]) assert(slice.boundaryNodes.some(n => n.id === id));
	assert.equal(slice.boundaryNodes.find(n => n.id === "probe")!.parent, "research");
	assert.equal(slice.nodes[0].parent, "probe");
	assert.equal(slice.boundaryNodes.find(n => n.id === "other_finding")!.parent, "other_branch");
	assert.equal(slice.boundaryNodes.find(n => n.id === "other_branch")!.parent, "other");
});

test("depth-zero boundary context includes exact ancestor purpose and attached annotations without expanding the selection", () => {
	const graph = editGraph(initial(), 1, [
		put({ ...node("main", null, "active"), intent: "Understand the formatter before changing it.", observed: "The original explanation is complete.", sources: ["s:request", "s:return"] }),
		put({ ...node("root_choice", "main", "parked", "choice"), intent: "Wording stays with the user." }),
		put({ ...node("unrelated", "other", "active"), intent: "Different investigation" }),
		put(node("unrelated_rule", "unrelated", "active", "rule")),
	], "main", "pending", refs);
	const before = structuredClone(graph);
	const legacy: ThreadGraph = { ...graph, nodes: graph.nodes.map(n => ({ ...n,
		kind: isEndeavor(n) ? "thread" : n.kind === "observation" ? "finding" : "decision",
	})) };
	for (const source of [graph, legacy]) {
		const slice = graphSlice(source, ["pending"], 0);
		assert.deepEqual(slice.nodes.map(n => n.id), ["pending"]);
		assert.equal(slice.totalNodes, source.nodes.length);
		assert.equal(slice.omittedNodes, source.nodes.length - 1);
		const purpose = slice.boundaryNodes.find(n => n.id === "main")!;
		assert.equal(purpose.intent, "Understand the formatter before changing it.");
		assert.equal(purpose.observed, "The original explanation is complete.");
		assert.deepEqual(purpose.sources, ["s:request", "s:return"]);
		for (const id of ["hold", "root_choice", "finding"]) {
			const annotation = slice.boundaryNodes.find(n => n.id === id)!;
			assert.deepEqual(annotation, source.nodes.find(n => n.id === id), "boundary annotations preserve recorded content and sources");
		}
		assert(!slice.boundaryNodes.some(n => n.id === "unrelated_rule"), "do not recursively expose annotations from unrelated hidden branches");
		assert.equal(new Set([...slice.nodes, ...slice.boundaryNodes].map(n => n.id)).size, slice.nodes.length + slice.boundaryNodes.length);
		assert(slice.nodes.length + slice.boundaryNodes.length <= source.nodes.length);
	}
	assert.deepEqual(graph, before, "neighborhood reads leave the map unchanged");
});
