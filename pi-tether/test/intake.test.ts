import assert from "node:assert/strict";
import { test } from "node:test";
import { acceptGraph, MOM_PROMPT } from "../src/contract.ts";
import { emptyGraph } from "../src/graph.ts";
import type { FeedEvent } from "../src/feed.ts";

const earlier: FeedEvent = { ref: "s:earlier", actor: "lead", kind: "user", at: "", text: "An earlier unrelated direction." };
const first: FeedEvent = { ref: "s:first", actor: "lead", kind: "user", at: "", text: "Investigate formatter behavior." };
const progress: FeedEvent = { ref: "s:progress", actor: "lead", kind: "assistant", at: "", text: "Routine implementation progress." };
const second: FeedEvent = { ref: "s:second", actor: "lead", kind: "user", at: "", text: "Keep this read-only and summarize the feature-level result." };
const known = new Map([[earlier.ref, earlier], [first.ref, first], [progress.ref, progress], [second.ref, second]]), fresh = new Set(known.keys());
const main = { id: "main", parent: null, kind: "theory", state: "active", label: "Understand formatter behavior",
	intent: "Explain the formatter's behavior without changing it.", observed: "The session is investigating the formatter.", actor: "lead", sources: [first.ref] };
const transaction = { revision: 0, purpose: "main", focus: "main", unfinished: [], upsertNodes: [main], upsertEdges: [],
	removeEdges: [], merges: [], folds: [], removeNodes: [], supersessions: [], note: null };
const accept = (value: unknown) => acceptGraph(value, emptyGraph(), undefined, known, fresh, new Set());

test("Mom silently parks interrupted work and checks explicit assent against later directions", () => {
	assert.match(MOM_PROMPT, /silently mark that work parked/);
	assert.match(MOM_PROMPT, /Do not ask whether to park it/);
	assert.match(MOM_PROMPT, /Surface parked threads only at session start or when current work depends on or conflicts with one/);
	assert.match(MOM_PROMPT, /Treat explicit user assent in context/);
	assert.match(MOM_PROMPT, /check the relevant session evidence and ordering/);
	assert.match(MOM_PROMPT, /follow the latest clear user direction/);
	assert.match(MOM_PROMPT, /supersessions is transaction evidence only/);
});

test("session synthesis does not require one declaration or graph record per message", () => {
	const result = accept(transaction);
	assert.equal(result.graph.nodes.length, 1);
	assert.deepEqual(result.graph.nodes[0].sources, [first.ref], "irrelevant or reinforcing messages need no coverage record");
});

test("existing user authority cannot be accidentally replaced by progress evidence", () => {
	const baseline = accept(transaction).graph;
	const update = { ...transaction, revision: baseline.revision,
		upsertNodes: [{ ...main, observed: "Routine work continued.", sources: [progress.ref] }] };
	assert.throws(() => acceptGraph(update, baseline, "one", known, new Set([progress.ref]), new Set()), /omits prior user authority/);
});

test("all omitted authority and invalid supersessions are reported in one repair", () => {
	const refs = ["s0:eb0f23f4", "s0:61332fe3", "s0:b3de2315", "s0:7e0b39de", "s0:542649d5", "s0:5b2a18b4", "s0:46984f5c"];
	const directions = refs.map((source, index): FeedEvent => ({ ref: source, actor: "lead", kind: "user", at: `2026-01-01T00:00:0${index}.000Z`, text: source }));
	const progressEvent: FeedEvent = { ref: "s0:progress", actor: "lead", kind: "assistant", at: "2026-01-01T00:00:09.000Z", text: "continued" };
	const evidence = new Map([...directions, progressEvent].map(event => [event.ref, event]));
	const before = { revision: 1, purpose: "main", focus: "main", nodes: [{ ...main, sources: refs }], edges: [] } as any;
	const update = { ...transaction, revision: 1, upsertNodes: [{ ...main, sources: [progressEvent.ref] }],
		supersessions: [{ node: "main", prior: refs[0], by: "s0:missing" }, { node: "main", prior: refs[0], by: "s0:missing" }] };
	let message = "";
	try { acceptGraph(update, before, "one", evidence, new Set([progressEvent.ref]), new Set()); }
	catch (error) { message = String(error); }
	assert.match(message, /Graph transaction defects/);
	for (const source of refs) assert.match(message, new RegExp(source), `one rejection names ${source}`);
	assert.match(message, /Duplicate authority supersession/);
	assert.match(message, /unknown source s0:missing/);
});

test("batch-16 authority omissions and missing review disposition are one deterministic rejection", () => {
	const refs = ["s0:7e0b39de", "s0:542649d5", "s0:5b2a18b4", "s0:46984f5c"];
	const directions = refs.map((source, index): FeedEvent => ({ ref: source, actor: "lead", kind: "user", at: `2026-01-01T00:00:0${index}.000Z`, text: source }));
	const progressEvent: FeedEvent = { ref: "s0:progress16", actor: "lead", kind: "assistant", at: "2026-01-01T00:00:09.000Z", text: "continued" };
	const evidence = new Map([...directions, progressEvent].map(event => [event.ref, event]));
	const parent = { ...main, id: "skillsuite", label: "Skill suite", sources: refs };
	const child = { ...main, id: "batch16", parent: parent.id, state: "active", label: "Batch 16", sources: [refs[0]] };
	const review = { ...main, id: "reviewfindings", parent: child.id, state: "active", label: "Review findings", sources: [refs[0]] };
	const before = { revision: 1, purpose: parent.id, focus: child.id, nodes: [parent, child, review], edges: [] } as any;
	const update = { ...transaction, revision: 1, purpose: parent.id, focus: parent.id,
		upsertNodes: [{ ...parent, observed: "Batch finished", sources: [progressEvent.ref] }, { ...child, state: "settled", sources: [refs[0]] }],
		folds: [{ thread: child.id, reason: "Close batch", sources: [refs[0]] }] };
	let message = "";
	try { acceptGraph(update, before, "one", evidence, new Set([progressEvent.ref]), new Set()); } catch (error) { message = String(error); }
	assert.match(message, /Graph transaction defects/);
	for (const source of refs) assert.match(message, new RegExp(`omits prior user authority ${source}`));
	assert.match(message, /Missing unfinished disposition for reviewfindings/);
});

test("a later fresh user source can explicitly supersede prior authority without creating a ledger", () => {
	const baseline = accept(transaction).graph;
	const update = { ...transaction, revision: baseline.revision,
		upsertNodes: [{ ...main, intent: "Keep the formatter explanation read-only.", sources: [second.ref] }],
		supersessions: [{ node: main.id, prior: first.ref, by: second.ref }] };
	const result = acceptGraph(update, baseline, "one", known, new Set([second.ref]), new Set());
	assert.deepEqual(result.graph.nodes.find(node => node.id === main.id)?.sources, [second.ref]);
	assert.equal((result.graph.nodes[0] as any).supersessions, undefined);
	assert.throws(() => acceptGraph(update, baseline, "one", known, new Set(), new Set()), /fresh observed user source/);
	assert.throws(() => acceptGraph({ ...update, upsertNodes: [{ ...main, sources: [earlier.ref] }],
		supersessions: [{ node: main.id, prior: first.ref, by: earlier.ref }] }, baseline, "one", known, new Set([earlier.ref]), new Set()), /must be later/);
	assert.throws(() => acceptGraph({ ...update, supersessions: [...update.supersessions, ...update.supersessions] }, baseline, "one", known, new Set([second.ref]), new Set()), /Duplicate authority supersession/);
	assert.throws(() => acceptGraph({ ...update, supersessions: [{ node: main.id, prior: progress.ref, by: second.ref }] }, baseline, "one", known, new Set([second.ref]), new Set()), /not omitted user authority/);
});

test("batch-12 source, fold, and independently provable disposition defects are reported together", () => {
	const parent = { ...main, id: "parent", label: "Parent" }, child = { ...main, id: "child", parent: "parent", state: "active", label: "Child" };
	const review = { ...main, id: "reviewfindings", parent: "child", state: "active", label: "Review findings" };
	const before = { revision: 1, purpose: "parent", focus: "child", nodes: [parent, child, review], edges: [] } as any;
	const update = { ...transaction, revision: 1, purpose: "parent", focus: "parent", upsertNodes: [],
		folds: [{ thread: "child", reason: "Close it", sources: ["s0:43f2ec15"] }] };
	let message = "";
	try { acceptGraph(update, before, "one", known, fresh, new Set()); } catch (error) { message = String(error); }
	assert.match(message, /s0:43f2ec15/);
	assert.match(message, /fold only a resolved thread/);
	assert.match(message, /target upserted.*parent/);
	assert.match(message, /Missing unfinished disposition for reviewfindings/);
});

test("unfinished disposition validation reports every independent missing node", () => {
	const parent = { ...main, id: "parent", label: "Parent" };
	const child = { ...main, id: "child", parent: "parent", state: "active", label: "Child" };
	const left = { ...main, id: "reviewfindings", parent: "child", state: "active", label: "Review findings" };
	const right = { ...main, id: "commitpush", parent: "child", state: "parked", label: "Commit and push" };
	const before = { revision: 1, purpose: "parent", focus: "child", nodes: [parent, child, left, right], edges: [] } as any;
	const update = { ...transaction, revision: 1, purpose: "parent", focus: "parent",
		upsertNodes: [{ ...parent, observed: "Child finished", sources: [first.ref] }, { ...child, state: "settled", sources: [first.ref] }],
		folds: [{ thread: "child", reason: "Close it", sources: [first.ref] }] };
	let message = "";
	try { acceptGraph(update, before, "one", known, fresh, new Set()); } catch (error) { message = String(error); }
	assert.match(message, /Graph transaction defects/);
	assert.match(message, /reviewfindings/);
	assert.match(message, /commitpush/);
});

test("legacy message-accounting fields are rejected instead of becoming a second ledger", () => {
	assert.throws(() => accept({ ...transaction, directions: [] }), /Invalid graph transaction shape/);
	assert.throws(() => accept({ ...transaction, fragments: [] }), /Invalid graph transaction shape/);
});

test("material durable rules remain source-backed feature annotations", () => {
	const rule = { id: "read_only", parent: "main", kind: "rule", state: "active", label: "Keep the investigation read-only",
		intent: "The formatter investigation remains read-only.", observed: "The user retained control of changes.", actor: "user", sources: [second.ref] };
	const edge = { from: rule.id, relation: "governs", to: main.id, sources: [second.ref] };
	const result = accept({ ...transaction, upsertNodes: [main, rule], upsertEdges: [edge] });
	assert.equal(result.graph.nodes.find(node => node.id === rule.id)?.parent, main.id);
	assert(result.graph.edges.some(item => item.from === rule.id && item.relation === "governs" && item.to === main.id));
	assert.throws(() => accept({ ...transaction, upsertNodes: [{ ...main, sources: ["s:missing"] }] }), /Unknown or unobserved source/);
});

test("observed session work still needs a feature-level purpose", () => {
	assert.throws(() => accept({ ...transaction, purpose: null, focus: null, upsertNodes: [] }), /needs a purpose node/);
});
