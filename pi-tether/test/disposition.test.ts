import assert from "node:assert/strict";
import { test } from "node:test";
import { checkUnfinished, editGraph, emptyGraph, type GraphNode, type GraphEdit, type UnfinishedItems } from "../src/graph.ts";

const refs = new Set(["s:user", "s:return"]);
const node = (id: string, parent: string | null, state: GraphNode["state"] = "active", kind: GraphNode["kind"] = "try"): GraphNode => ({
	id, parent, state, kind, label: id, intent: id === "hold" ? "Wait for user permission to answer." : id, observed: "Recorded work", actor: "", sources: ["s:user"],
});
const put = (node: GraphNode): GraphEdit => ({ op: "put_node", node });
const item = (node: string, disposition: UnfinishedItems[number]["disposition"] = "carried", target: string | null = "main"): UnfinishedItems[number] => ({ node, label: node, disposition, target, sources: ["s:return"] });
const initial = () => editGraph(emptyGraph(), 0, [put(node("main", null)), put(node("child", "main")), put(node("hold", "child", "active", "rule")), put(node("pending", "child", "parked")), put(node("other", "main"))], "main", "child", refs);
const closing = () => [{ ...node("main", null), observed: "Child outcome incorporated", sources: ["s:return"] }, node("child", "main", "settled")];
const folds = [{ thread: "child", reason: "Limited step completed", sources: ["s:return"] }];
const fold = (before: ReturnType<typeof initial>, updates = closing()) => editGraph(before, before.revision, [...updates.map(put), { op: "fold", ...folds[0] }], "main", "main", refs, "previous");

test("fold requires each active/parked descendant's declared disposition and preserves carried holds", () => {
	const before = initial(), updates = closing(), after = fold(before, updates);
	assert.throws(() => checkUnfinished(before, updates, folds, after, [item("pending")], refs), /Missing unfinished disposition for hold: declare carried, reparented, or resolved/);
	assert.doesNotThrow(() => checkUnfinished(before, updates, folds, after, [item("hold"), item("pending")], refs));
	assert.equal(after.nodes.find(n => n.id === "hold")!.state, "active");
	assert.equal(after.nodes.find(n => n.id === "hold")!.parent, "main");
	assert.throws(() => checkUnfinished(before, updates, folds, after, [item("hold", "carried", "other"), item("pending")], refs), /Carried disposition needs hold in the closing thread's surviving parent\/root/);
	assert.throws(() => checkUnfinished(before, updates, folds, after, [item("hold", "resolved", null), item("pending")], refs),
		/Resolved disposition needs hold settled in this transaction; it is active\./);
	// Each half reports on its own: naming a survivor and leaving the node open are different defects.
	assert.throws(() => checkUnfinished(before, updates, folds, after, [{ ...item("hold", "resolved", "other") }, item("pending")], refs),
		/Resolved disposition needs hold target=null, closing its scope; it names surviving thread other\./);
	assert.throws(() => checkUnfinished(before, updates, folds, after, [{ ...item("hold"), sources: ["unknown"] }, item("pending")], refs), /Unknown unfinished disposition source for hold: unknown/);
	assert.throws(() => checkUnfinished(before, updates, folds, after, [{ ...item("hold"), sources: ["s:ret"] }, item("pending")], refs), /Use the exact observed source s:return/);
});

test("disposition failures distinguish an absent closing scope, unknown ID, and stale label", () => {
	const before = initial();
	assert.throws(() => checkUnfinished(before, [], [], before, [item("hold")], refs), /transaction closes no endeavor\. Set unfinished=\[\]/);
	const updates = closing(), after = fold(before, updates);
	assert.throws(() => checkUnfinished(before, updates, folds, after, [{ ...item("hold"), label: "Answer hold" }, item("pending")], refs),
		/label for hold must exactly match "hold"; received "Answer hold"/);
	assert.throws(() => checkUnfinished(before, updates, folds, after, [{ ...item("missing"), label: "Missing" }, item("hold"), item("pending")], refs),
		/Unknown unfinished disposition node: missing/);
});

test("moving or settling a prior open node cannot evade disposition coverage", () => {
	const before = initial(), updates = [...closing(), node("pending", "other", "parked"), node("hold", "child", "settled", "rule")], after = fold(before, updates);
	assert.throws(() => checkUnfinished(before, updates, folds, after, [], refs), /Missing unfinished disposition for hold,pending/);
	assert.doesNotThrow(() => checkUnfinished(before, updates, folds, after, [item("hold", "resolved", null), item("pending", "reparented", "other")], refs));
	assert.throws(() => checkUnfinished(before, updates, folds, after, [item("hold", "resolved", null), item("pending", "carried", "other")], refs), /Carried disposition needs pending in the closing thread's surviving parent\/root/);
});

test("a settled endeavor first created in this transaction needs no dispositions for its new open children", () => {
	const updates = [node("main", null), node("done", "main", "settled"), node("hold", "done", "active", "rule")];
	const after = editGraph(emptyGraph(), 0, updates.map(put), "main", "main", refs);
	assert.doesNotThrow(() => checkUnfinished(emptyGraph(), updates, [], after, [], refs));
	assert.throws(() => checkUnfinished(emptyGraph(), updates, [], after, [item("hold")], refs), /transaction closes no endeavor/);
	// A prior open node moved under a brand-new settled endeavor is still not lost: the new scope is not "closing".
	const before = initial(), moved = [node("done", "main", "settled"), node("pending", "done", "parked")];
	assert.doesNotThrow(() => checkUnfinished(before, moved, [], editGraph(before, 1, moved.map(put), "main", "main", refs), [], refs));
});

test("carried items inside an unfinished cluster keep their internal parent instead of flattening", () => {
	const before = initial();
	const nested = editGraph(before, 1, [put(node("cluster", "child")), put(node("hold", "cluster", "active", "rule"))], "main", "child", refs);
	const updates = closing(), after = fold(nested, updates);
	assert.equal(after.nodes.find(n => n.id === "cluster")!.parent, "main");
	assert.equal(after.nodes.find(n => n.id === "hold")!.parent, "cluster");
	assert.doesNotThrow(() => checkUnfinished(nested, updates, folds, after, [item("cluster"), item("hold"), item("pending")], refs));
});

test("root completion can retain active governing decisions with explicit carried disposition", () => {
	const before = editGraph(emptyGraph(), 0, [put(node("main", null)), put(node("hold", "main", "active", "rule")), { op: "put_edge", edge: { from: "hold", relation: "governs", to: "main", sources: ["s:user"] } }], "main", "main", refs);
	const updates = [node("main", null, "settled")], after = editGraph(before, 1, updates.map(put), "main", "main", refs);
	assert.throws(() => checkUnfinished(before, updates, [], after, [], refs), /Missing unfinished disposition for hold/);
	assert.doesNotThrow(() => checkUnfinished(before, updates, [], after, [item("hold")], refs));
	assert.equal(after.nodes.find(n => n.id === "main")!.state, "settled");
	assert.equal(after.nodes.find(n => n.id === "hold")!.state, "active");
	assert(after.edges.some(e => e.from === "hold" && e.relation === "governs"));
	assert.throws(() => checkUnfinished(before, updates, [], after, [item("hold"), item("hold")], refs), /Duplicate unfinished disposition: hold/);
});
