import assert from "node:assert/strict";
import { test } from "node:test";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { emptyUsage, loadState, isCheckpoint } from "../src/checkpoint.ts";
import type { FeedEvent } from "../src/feed.ts";
import { acceptGraph } from "../src/contract.ts";
import { emptyGraph } from "../src/graph.ts";
import { SidecarStore, type MomStore, type SidecarRecord } from "../src/sidecar.ts";

const checkpoint = (sessionId: string) => ({ version: 4, sessionId, graph: emptyGraph(), note: null,
	cut: { parent: null, workers: [] }, at: Date.now(), model: "fixture/fixture", usage: emptyUsage() });
const memoryStore = (sessionId: string, records: SidecarRecord[] = []): MomStore => ({
	load: async () => records.filter(r => r.sessionId === sessionId),
	append: async (type, data) => { const record = { v: 1 as const, id: `r${records.length + 1}`, sessionId, type, at: Date.now(), data }; records.push(record); return record; },
});

const asRecord = (id: string, sessionId: string, data: unknown, at = Date.now()): SidecarRecord =>
	({ v: 1, id, sessionId, type: "checkpoint", at, data: data as Record<string, unknown> });

test("a session without a persisted transcript has no accidental sidecar path", async () => {
	assert.deepEqual(await new SidecarStore(() => undefined, "memory-only").load(), []);
});

test("sidecar records restore checkpoint, control, delivery, and usage; abandoned branches stay invisible", async () => {
	const manager = SessionManager.inMemory("/tmp");
	const sessionId = manager.getSessionId();
	const current = checkpoint(sessionId);
	const store = memoryStore(sessionId, [
		asRecord("abandoned", sessionId, { ...checkpoint(sessionId), at: 1, cut: { parent: "not-on-branch", workers: [] } }, 1),
		asRecord("keep", sessionId, current),
	]);
	await store.append("control", { enabled: false });
	await store.append("notice", { key: "obligation|trigger" });
	await store.append("attempt", { usage: { ...emptyUsage(), calls: 9 } });
	assert.deepEqual(await loadState(store, manager), { checkpoint: current, checkpointId: "keep", coverageCut: current.cut, enabled: false, gaps: [],
		delivered: "obligation|trigger", usage: { ...emptyUsage(), calls: 9 } });
	// A checkpoint whose cursor is not on the selected branch never applies, even as the only record.
	const gone = memoryStore(sessionId, [asRecord("gone", sessionId, { ...current, cut: { parent: "missing", workers: [] } })]);
	assert.equal((await loadState(gone, manager)).checkpoint, undefined);
});

test("progress cursors apply only to their checkpoint and selected branch", async () => {
	const manager = SessionManager.inMemory("/tmp"), sessionId = manager.getSessionId();
	const root = manager.appendMessage({ role: "user", content: "root", timestamp: Date.now() });
	const leaf = manager.appendMessage({ role: "user", content: "leaf", timestamp: Date.now() });
	const current = { ...checkpoint(sessionId), cut: { parent: root, workers: [] } };
	const records = [asRecord("keep", sessionId, current)];
	const store = memoryStore(sessionId, records);
	await store.append("progress", { checkpoint: "other", cut: { parent: leaf, workers: [] } });
	await store.append("progress", { checkpoint: "keep", cut: { parent: "abandoned", workers: [] } });
	assert.equal((await loadState(store, manager)).checkpoint?.cut.parent, root);
	await store.append("progress", { checkpoint: "keep", cut: { parent: leaf, workers: [] } });
	assert.equal((await loadState(store, manager)).checkpoint?.cut.parent, leaf);
	const invalid = memoryStore(sessionId);
	await invalid.append("progress", { checkpoint: "keep", cut: { parent: leaf } });
	await assert.rejects(() => loadState(invalid, manager), /Invalid Mom progress/);
});

test("deterministic failure and skipped-gap cursors restore without using the transcript as state", async () => {
	const manager = SessionManager.inMemory("/tmp"), sessionId = manager.getSessionId();
	const root = manager.appendMessage({ role: "user", content: "root", timestamp: Date.now() });
	const leaf = manager.appendMessage({ role: "user", content: "leaf", timestamp: Date.now() });
	const current = { ...checkpoint(sessionId), cut: { parent: root, workers: [] } };
	const store = memoryStore(sessionId, [asRecord("keep", sessionId, current, 1)]);
	const from = current.cut, through = { parent: leaf, workers: [] };
	await store.append("failure", { key: "range", from, through, refs: [], error: "rejected", failures: 1 });
	assert.equal((await loadState(store, manager)).failure?.failures, 1);
	await store.append("gap", { action: "open", id: "gap-one", key: "range", checkpoint: "keep", from, cut: through, refs: [], error: "rejected", failures: 2 });
	const skipped = await loadState(store, manager);
	assert.equal(skipped.failure, undefined); assert.equal(skipped.coverageCut?.parent, leaf); assert.equal(skipped.gaps[0]?.id, "gap-one");
	await store.append("gap", { action: "resolved", id: "gap-one" });
	assert.deepEqual((await loadState(store, manager)).gaps, []);
});

test("the session transcript is never a Mom state source; only sidecar records load", async () => {
	const manager = SessionManager.inMemory("/tmp");
	const store = memoryStore(manager.getSessionId());
	const current = checkpoint(manager.getSessionId());
	manager.appendCustomEntry("pi-tether.mom.v4", current);
	manager.appendCustomEntry("pi-tether.mom-control", { sessionId: manager.getSessionId(), enabled: false });
	assert.deepEqual(await loadState(store, manager), { enabled: true, gaps: [] });
	await store.append("checkpoint", current);
	assert.equal((await loadState(store, manager)).checkpoint, current);
	assert(isCheckpoint(current));
	const bad = memoryStore(manager.getSessionId(), [asRecord("bad", manager.getSessionId(), { ...current, version: 3 })]);
	await assert.rejects(() => loadState(bad, manager), /Invalid Mom checkpoint/);
});

test("source validator rejects invented citations and user-as-violation notices", () => {
	const events: FeedEvent[] = [
		{ ref: "s:u", at: "", actor: "lead", kind: "user", text: "Do not delete." },
		{ ref: "s:a", at: "", actor: "lead", kind: "assistant", text: "I will delete it." },
		{ ref: "s:r", at: "", actor: "lead", kind: "tool_result", name: "bash" },
	];
	const known = new Map(events.map((e) => [e.ref, e])), fresh = new Set(events.map((e) => e.ref)), inspected = new Set<string>();
	const node = { id: "main", kind: "try", parent: null, state: "active", label: "Purpose", intent: "Keep user files.", observed: "", actor: "lead", sources: ["s:u"] };
	const base = { revision: 0, purpose: "main", focus: "main", upsertNodes: [node], unfinished: [], upsertEdges: [], removeEdges: [], merges: [], folds: [], removeNodes: [], supersessions: [], note: null };
	const accept = (value: unknown, refs = fresh, question?: string) => acceptGraph(value, emptyGraph(), undefined, known, refs, inspected, question);
	assert.equal(accept(base).note, null);
	assert.throws(() => accept({ ...base, upsertNodes: [{ ...node, sources: ["s:nope"] }] }), /Unknown/);
	assert.throws(() => accept({ ...base, upsertNodes: [{ ...node, sources: ["s:u", "s:u"] }] }), /Duplicate/);
	assert.throws(() => accept({ ...base, note: { text: "Wrong", obligationRef: "s:a", triggerRef: "s:u" } }), /agent action/);
	assert.throws(() => accept({ ...base, note: { text: "Check", obligationRef: "s:u", triggerRef: "s:r" } }), /agent action/);
	assert.throws(() => accept(base, fresh, "Why?"), /explicit question/);
	const note = { text: "The user forbids deletion.", obligationRef: "s:u", triggerRef: "s:a" };
	assert.deepEqual(accept({ ...base, note }).note, note);
	assert.throws(() => accept({ ...base, note }, new Set(["s:u"])), /new agent action/);
});
