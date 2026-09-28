import assert from "node:assert/strict";
import { test } from "node:test";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { CHECKPOINT, CONTROL, emptyUsage, loadState, isCheckpoint } from "../src/checkpoint.ts";
import { EMPTY_HASH, type FeedEvent } from "../src/feed.ts";
import { acceptGraph } from "../src/contract.ts";
import { emptyGraph } from "../src/graph.ts";

const checkpoint = (sessionId: string) => ({ version: 4, sessionId, graph: emptyGraph(), note: null,
	cut: { parent: null, parentHash: EMPTY_HASH, workers: [] }, at: Date.now(), model: "fixture/fixture", usage: emptyUsage() });

test("one self-contained checkpoint restores state; inherited session state does not apply", () => {
	const manager = SessionManager.inMemory("/tmp");
	manager.appendCustomEntry(CHECKPOINT, checkpoint("other-session"));
	assert.equal(loadState(manager).checkpoint, undefined);
	const current = checkpoint(manager.getSessionId());
	const checkpointId = manager.appendCustomEntry(CHECKPOINT, current);
	manager.appendCustomEntry(CONTROL, { sessionId: manager.getSessionId(), enabled: false });
	assert.deepEqual(loadState(manager), { checkpoint: current, checkpointId, enabled: false, delivered: undefined });
	assert(isCheckpoint(current));
	manager.appendCustomEntry(CHECKPOINT, { ...current, cut: { ...current.cut, parentHash: "wrong" } });
	assert.throws(() => loadState(manager), /Invalid Mom checkpoint/);
});

test("source validator rejects invented citations and user-as-violation notices", () => {
	const events: FeedEvent[] = [
		{ ref: "s:u", at: "", actor: "lead", kind: "user", text: "Do not delete." },
		{ ref: "s:a", at: "", actor: "lead", kind: "assistant", text: "I will delete it." },
		{ ref: "s:r", at: "", actor: "lead", kind: "tool_result", name: "bash" },
	];
	const known = new Map(events.map((e) => [e.ref, e])), fresh = new Set(events.map((e) => e.ref)), inspected = new Set<string>();
	const node = { id: "main", kind: "try", parent: null, state: "active", label: "Purpose", intent: "Keep user files.", observed: "", actor: "lead", sources: ["s:u"] };
	const base = { revision: 0, purpose: "main", focus: "main", upsertNodes: [node], directions: [{ source: "s:u", authorizedWork: "", continuingConstraints: [] }], unfinished: [], upsertEdges: [], removeEdges: [], merges: [], folds: [], removeNodes: [], note: null };
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
