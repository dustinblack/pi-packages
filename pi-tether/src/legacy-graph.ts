/** Read-only decoder for recorded v2 flat maps. Never infer a hierarchy from their edges. */
import { Type, type Static } from "typebox";
import { Check } from "typebox/value";
const object = { additionalProperties: false } as const;
const id = Type.String({ pattern: "^[A-Za-z][A-Za-z0-9_-]{0,63}$" });
const refs = Type.Array(Type.String({ minLength: 1 }), { minItems: 1 });
const pointer = Type.Union([id, Type.Null()]);
const History = Type.Object({ checkpoint: Type.String({ minLength: 1 }), nodes: Type.Array(id, { minItems: 1, uniqueItems: true }), reason: Type.String({ minLength: 1 }), sources: refs }, object);
const Node = Type.Object({ id, kind: Type.Union([Type.Literal("work"), Type.Literal("decision"), Type.Literal("finding")]),
	state: Type.Union([Type.Literal("proposed"), Type.Literal("active"), Type.Literal("parked"), Type.Literal("settled"), Type.Literal("unknown")]),
	label: Type.String({ minLength: 1, maxLength: 160 }), intent: Type.String({ maxLength: 1200 }), observed: Type.String({ maxLength: 2400 }),
	actor: Type.String({ maxLength: 200 }), sources: refs, history: Type.Optional(History),
}, object);
const Edge = Type.Object({ from: id, to: id, sources: refs,
	relation: Type.Union([Type.Literal("branches_from"), Type.Literal("returns_to"), Type.Literal("informs"), Type.Literal("governs"), Type.Literal("depends_on")]),
}, object);
const Schema = Type.Object({ revision: Type.Integer({ minimum: 0 }), purpose: pointer, focus: pointer, nodes: Type.Array(Node), edges: Type.Array(Edge) }, object);
export type FlatGraph = Static<typeof Schema>;
export function checkFlatGraph(value: unknown): asserts value is FlatGraph {
	if (!Check(Schema, value)) throw new Error("Invalid legacy flat graph.");
	const ids = new Set(value.nodes.map(n => n.id)), edges = new Set<string>();
	if (ids.size !== value.nodes.length || value.nodes.length && (!value.purpose || !value.focus)) throw new Error("Invalid legacy graph identities.");
	for (const p of [value.purpose, value.focus]) if (p !== null && !ids.has(p)) throw new Error("Invalid legacy graph pointer.");
	for (const item of [...value.nodes, ...value.edges]) if (new Set(item.sources).size !== item.sources.length) throw new Error("Duplicate legacy source.");
	for (const e of value.edges) {
		const key = `${e.from}/${e.relation}/${e.to}`;
		if (!ids.has(e.from) || !ids.has(e.to) || e.from === e.to || edges.has(key)) throw new Error("Invalid legacy graph connection.");
		edges.add(key);
	}
	if (JSON.stringify(value).length > 24000) throw new Error("Legacy graph exceeds its recorded format limit.");
}
export function flatSlice(graph: FlatGraph, selected?: readonly string[], depth = 1) {
	if (!Number.isSafeInteger(depth) || depth < 0 || depth > 3) throw new Error("Graph depth must be 0..3.");
	const ids = new Set(graph.nodes.map(n => n.id));
	if (selected?.some(id => !ids.has(id))) throw new Error("Unknown graph node in selection.");
	const included = new Set(selected ?? ids);
	let frontier = new Set(included);
	for (let i = 0; selected && i < depth; i++) {
		const next = new Set<string>();
		for (const e of graph.edges) {
			if (frontier.has(e.from) && !included.has(e.to)) next.add(e.to);
			if (frontier.has(e.to) && !included.has(e.from)) next.add(e.from);
		}
		for (const id of next) included.add(id);
		frontier = next;
	}
	const edges = graph.edges.filter(e => included.has(e.from) || included.has(e.to));
	const boundary = new Set(edges.flatMap(e => [e.from, e.to]).filter(id => !included.has(id)));
	return { revision: graph.revision, purpose: graph.purpose, focus: graph.focus,
		nodes: graph.nodes.filter(n => included.has(n.id)), edges,
		boundaryNodes: graph.nodes.filter(n => boundary.has(n.id)).map(({id, kind, state, label}) => ({id, kind, state, label})),
		totalNodes: graph.nodes.length, omittedNodes: graph.nodes.length - included.size };
}
