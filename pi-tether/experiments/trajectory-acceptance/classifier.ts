import type { WorkGraph, GraphNode, GraphEdge } from "../../src/graph.ts";

export const MOVEMENTS = ["accept", "expand", "contract", "redirect", "reorganize"] as const;
export type Movement = typeof MOVEMENTS[number];
export interface Classification { label: Movement; reasons: string[] }

const byId = (graph: WorkGraph) => new Map(graph.nodes.map(node => [node.id, node]));
const edgeKey = (edge: GraphEdge) => `${edge.from}\u0000${edge.relation}\u0000${edge.to}`;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const current = (node: GraphNode) => node.state === "active";

/**
 * Precommitted production-graph precedence:
 *
 * 1. Existing hierarchy or cross-link restructuring is reorganize.
 * 2. Purpose/focus/current-course/return-focus movement is redirect.
 * 3. Retirement or resolution is contract.
 * 4. New durable graph material is expand.
 * 5. Otherwise the graph accepted the evidence without a trajectory movement.
 *
 * Edges incident to a newly created node count as part of expansion, rather than
 * making every expansion reorganize. A returns_to change between existing nodes
 * is a return-focus move and therefore redirect; other existing-node link changes
 * are structural and take the higher reorganize precedence.
 */
export function classifyGraphDiff(before: WorkGraph, after: WorkGraph): Classification {
	const oldNodes = byId(before), newNodes = byId(after);
	const shared = [...oldNodes.keys()].filter(id => newNodes.has(id));
	const created = [...newNodes.keys()].filter(id => !oldNodes.has(id));
	const retired = [...oldNodes.keys()].filter(id => !newNodes.has(id));
	const oldEdges = new Map(before.edges.map(edge => [edgeKey(edge), edge]));
	const newEdges = new Map(after.edges.map(edge => [edgeKey(edge), edge]));
	const changedEdges = [...oldEdges.keys()].filter(key => !newEdges.has(key)).map(key => oldEdges.get(key)!)
		.concat([...newEdges.keys()].filter(key => !oldEdges.has(key)).map(key => newEdges.get(key)!));
	const existingEdgeChanges = changedEdges.filter(edge => oldNodes.has(edge.from) && oldNodes.has(edge.to) && newNodes.has(edge.from) && newNodes.has(edge.to));

	const hierarchy = shared.filter(id => oldNodes.get(id)!.parent !== newNodes.get(id)!.parent);
	const links = existingEdgeChanges.filter(edge => edge.relation !== "returns_to");
	if (hierarchy.length || links.length) return { label: "reorganize", reasons: [
		...(hierarchy.length ? [`parent changed: ${hierarchy.join(", ")}`] : []),
		...(links.length ? [`existing links changed: ${links.map(edgeKey).join(", ")}`] : []),
	] };

	const active = shared.filter(id => {
		const a = oldNodes.get(id)!, b = newNodes.get(id)!;
		// Closing current work is contraction below; other changes into/out of current are redirects.
		return b.state !== "settled" && current(a) !== current(b);
	});
	const returns = existingEdgeChanges.filter(edge => edge.relation === "returns_to");
	if (before.purpose !== after.purpose || before.focus !== after.focus || active.length || returns.length) return { label: "redirect", reasons: [
		...(before.purpose !== after.purpose ? [`purpose ${before.purpose} -> ${after.purpose}`] : []),
		...(before.focus !== after.focus ? [`focus ${before.focus} -> ${after.focus}`] : []),
		...(active.length ? [`current state changed: ${active.join(", ")}`] : []),
		...(returns.length ? [`return focus changed: ${returns.map(edgeKey).join(", ")}`] : []),
	] };

	const resolved = shared.filter(id => {
		const a = oldNodes.get(id)!, b = newNodes.get(id)!;
		return a.state !== "settled" && b.state === "settled";
	});
	if (retired.length || resolved.length) return { label: "contract", reasons: [
		...(retired.length ? [`nodes retired: ${retired.join(", ")}`] : []),
		...(resolved.length ? [`nodes resolved: ${resolved.join(", ")}`] : []),
	] };

	const durableUpdates = shared.filter(id => {
		const a = oldNodes.get(id)!, b = newNodes.get(id)!;
		// Provenance/observed refreshes are evidence maintenance, not added scope.
		return !same({ kind: a.kind, label: a.label, intent: a.intent }, { kind: b.kind, label: b.label, intent: b.intent });
	});
	if (created.length || changedEdges.length || durableUpdates.length) return { label: "expand", reasons: [
		...(created.length ? [`nodes created: ${created.join(", ")}`] : []),
		...(changedEdges.length ? [`links added with new material: ${changedEdges.map(edgeKey).join(", ")}`] : []),
		...(durableUpdates.length ? [`durable node material changed: ${durableUpdates.join(", ")}`] : []),
	] };
	return { label: "accept", reasons: ["no trajectory-bearing production graph field changed"] };
}
