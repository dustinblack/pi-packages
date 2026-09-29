import assert from "node:assert/strict";
import test from "node:test";
import { classifyGraphDiff } from "./classifier.ts";
import type { WorkGraph, GraphNode } from "../../src/graph.ts";

const source = "s0:source";
const node = (id: string, overrides: Partial<GraphNode> = {}): GraphNode => ({ id, kind: "try", parent: id === "root" ? null : "root", state: "active",
	label: id, intent: id, observed: "observed", actor: "lead", sources: [source], purposeSource: source, ...overrides });
const graph = (nodes = [node("root")], overrides: Partial<WorkGraph> = {}): WorkGraph => ({ revision: 1, motherThread: "root", purpose: "root", focus: "root", nodes, edges: [], ...overrides });

test("classifier accepts provenance-only refreshes", () => {
	const before = graph(), after = graph([node("root", { observed: "new evidence", sources: [source, "s0:new"] })], { revision: 2 });
	assert.equal(classifyGraphDiff(before, after).label, "accept");
});

test("classifier expands new durable material", () => {
	assert.equal(classifyGraphDiff(graph(), graph([node("root"), node("scope")], { revision: 2 })).label, "expand");
});

test("classifier contracts removal or resolution before expansion", () => {
	const before = graph([node("root"), node("old")]);
	const after = graph([node("root", { label: "broader root" }), node("new")], { revision: 2 });
	assert.equal(classifyGraphDiff(before, after).label, "contract");
	assert.equal(classifyGraphDiff(graph(), graph([node("root", { state: "settled" })], { revision: 2 })).label, "contract");
});

test("classifier redirects current/focus and return focus before contraction", () => {
	const before = graph([node("root"), node("a"), node("b", { state: "parked" })], { focus: "a",
		edges: [{ from: "a", relation: "returns_to", to: "b", sources: [source] }] });
	const after = graph([node("root"), node("a", { state: "parked" }), node("b")], { revision: 2, focus: "b", edges: [] });
	assert.equal(classifyGraphDiff(before, after).label, "redirect");
});

test("classifier gives hierarchy and existing-link restructuring highest precedence", () => {
	const before = graph([node("root"), node("a"), node("b")], { focus: "a" });
	const after = graph([node("root"), node("a", { parent: "b", state: "parked" }), node("b")], { revision: 2, focus: "b" });
	assert.equal(classifyGraphDiff(before, after).label, "reorganize");
});
