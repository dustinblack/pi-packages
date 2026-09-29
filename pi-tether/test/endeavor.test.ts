import assert from "node:assert/strict";
import { test } from "node:test";
import { acceptGraph } from "../src/contract.ts";
import { checkGraph, editGraph, emptyGraph, isEndeavor, type GraphNode } from "../src/graph.ts";

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
	assert.equal(isEndeavor({ kind: "thread" }), false, "unknown kinds are never endeavors");
	const unknownKind = { revision: 0, purpose: "main", focus: "main", unfinished: [],
		upsertNodes: [{ ...record("main", "try", null), kind: "thread" }], upsertEdges: [], removeEdges: [], merges: [], folds: [], removeNodes: [], supersessions: [] };
	assert.throws(() => acceptGraph(unknownKind, emptyGraph(), undefined, new Map(), new Set(), new Set()), /Invalid graph transaction shape/);
});
