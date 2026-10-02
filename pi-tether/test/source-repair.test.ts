import assert from "node:assert/strict";
import { test } from "node:test";
import { acceptGraph } from "../src/contract.ts";
import { emptyGraph, sourceSuggestion } from "../src/graph.ts";
import type { FeedEvent } from "../src/feed.ts";

const observed = "01a0e020-12a4-7474-819f-ad784bb5febd:5d21d97a";
const mangled = "01a0e020-12a4-7474-819f-ad69-0d1013ad5066:5d21d97a";
const event: FeedEvent = { ref: observed, actor: "lead", kind: "user", at: "", text: "Repair source references." };
const known = new Map([[event.ref, event]]);
const root = { id: "root", parent: null, kind: "try", state: "active", label: "Repair sources",
	intent: "Repair source references.", observed: "Repair requested.", actor: "lead", sources: [mangled], purposeSource: mangled };
const transaction = { revision: 0, purpose: "root", focus: "root", unfinished: [], upsertNodes: [root], upsertEdges: [],
	removeEdges: [], merges: [], folds: [], removeNodes: [], supersessions: [], note: null };
const accept = (value: unknown, evidence = known, question?: string) =>
	acceptGraph(value, emptyGraph(), undefined, evidence, new Set(evidence.keys()), new Set(), question);

test("shortened entry:block references resolve exactly or remain ambiguous", () => {
	const sources = ["lead:58f1150b", "lead:58f1150b:b2", "lead:58f1150b:b4"];
	assert.equal(sourceSuggestion("58f1150b:b4", sources), "lead:58f1150b:b4");
	assert.equal(sourceSuggestion("58f1150b:b4", [...sources, "worker:58f1150b:b4"]), undefined);
	assert.equal(sourceSuggestion("58f1150b:b7", sources), undefined);
});

test("acceptGraph repairs the production mangled UUID source", () => {
	const result = accept(transaction);
	assert.deepEqual(result.graph.nodes[0]?.sources, [observed]);
	assert.equal(result.graph.nodes[0]?.purposeSource, observed);
	assert.deepEqual(result.repairs, [{ from: mangled, to: observed }]);
});

test("acceptGraph still rejects an ambiguous terminal source", () => {
	const other = `other-stream:5d21d97a`;
	const evidence = new Map([...known, [other, { ...event, ref: other } as FeedEvent]]);
	assert.throws(() => accept(transaction, evidence), new RegExp(`Unknown or unobserved source on node root: ${mangled.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
});

test("acceptGraph still rejects a source with no candidate", () => {
	const missing = "wrong-stream:no-such-entry";
	assert.throws(() => accept({ ...transaction, upsertNodes: [{ ...root, sources: [missing], purposeSource: missing }] }),
		new RegExp(`Unknown or unobserved source on node root: ${missing}`));
});

test("acceptGraph rewrites source citations in free text", () => {
	const result = accept({ ...transaction, answer: `Supported here [src:${mangled}].` }, known, "What supports this?");
	assert.equal(result.answer, `Supported here [src:${observed}].`);
});

test("acceptGraph collapses sources that collide after repair", () => {
	const result = accept({ ...transaction, upsertNodes: [{ ...root, sources: [observed, mangled], purposeSource: mangled }] });
	assert.deepEqual(result.graph.nodes[0]?.sources, [observed]);
	assert.deepEqual(result.repairs, [{ from: mangled, to: observed }]);
});

test("acceptGraph repairs the production stray-space source, in arrays and in prose", () => {
	const spaced = "01a0e020-12a4-7474-819f-ad784bb5febd: 5d21d97a";
	const result = accept({ ...transaction, upsertNodes: [{ ...root, sources: [spaced], purposeSource: spaced, observed: `Requested [src:${spaced}].` }] });
	assert.deepEqual(result.graph.nodes[0]?.sources, [observed]);
	assert.equal(result.graph.nodes[0]?.observed, `Requested [src:${observed}].`);
	assert.deepEqual(result.repairs, [{ from: spaced, to: observed }]);
});

test("acceptGraph still rejects a stray-space source whose stripped form is ambiguous", () => {
	const spaced = "wrong-stream: 5d21d97a", other = "other-stream:5d21d97a";
	const evidence = new Map([...known, [other, { ...event, ref: other } as FeedEvent]]);
	assert.throws(() => accept({ ...transaction, upsertNodes: [{ ...root, sources: [spaced], purposeSource: spaced }] }, evidence), /Unknown or unobserved source/);
});

test("acceptGraph drops an invented source when the record keeps observed evidence", () => {
	const invented = "01a0e020-12a4-7474-819f-ad784bb5febd:6b477779";
	const result = accept({ ...transaction, upsertNodes: [{ ...root, sources: [observed, invented], purposeSource: observed, observed: `Requested [src:${observed}] and [src:${invented}].` }] });
	assert.deepEqual(result.graph.nodes[0]?.sources, [observed]);
	assert.equal(result.graph.nodes[0]?.observed, `Requested [src:${observed}] and .`);
	assert.deepEqual(result.repairs, [{ from: invented, to: "dropped: unobserved citation" }, { from: invented, to: "dropped: unobserved source" }]);
});
