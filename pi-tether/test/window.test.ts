import assert from "node:assert/strict";
import { test } from "node:test";
import { collectTurnSignals, lastDirectionOf, parseWindowVerdict, pathTokens, renderCorrection, stageOne, windowMessages,
	WINDOW_CORRECTION, WINDOW_TASK, type TurnSignal, type WindowDirection, type WindowFeed, type WindowFlag } from "../src/window.ts";
import type { Checkpoint } from "../src/checkpoint.ts";
import type { FeedEvent } from "../src/feed.ts";
import type { GraphNode, WorkGraph } from "../src/graph.ts";
import { deferred, input, isMomRequest, isWindowCheck, readSidecar, replacement, setup, until } from "./fixture.ts";

const node = (over: Partial<GraphNode>): GraphNode => ({ id: "n", kind: "try", parent: null, state: "active",
	label: "L", intent: "I", observed: "", actor: "lead", sources: ["s:u1"], ...over });
const checkpointOf = (graph: WorkGraph): Checkpoint => ({ sessionId: "s", graph, note: null,
	cut: { parent: null, workers: [] }, at: Date.now(), model: "fixture/fixture" });
const feedStub = (pages: Record<string, string>): WindowFeed =>
	({ events: [], lookup: async (ref: string) => { const text = pages[ref] ?? ""; return { text, totalChars: text.length }; } });

test("stageOne flags parked, settled, folded, rule, and off-goal work outside the current line", async () => {
	const graph: WorkGraph = { revision: 1, motherThread: "main", purpose: "main", focus: "line", edges: [], nodes: [
		node({ id: "main", label: "Main purpose", intent: "Keep the main-file.ts line moving.", sources: ["s:m"] }),
		node({ id: "line", kind: "feature", parent: "main", label: "Main line", intent: "Continue the line-file.ts work.", sources: ["s:l"] }),
		node({ id: "rule1", kind: "rule", parent: "main", label: "Test gate", intent: "Run npm test before committing.", sources: ["s:r"] }),
		node({ id: "park1", kind: "theory", parent: "main", state: "parked", label: "Parked idea", intent: "A parked-idea.ts side idea.", sources: ["s:p"] }),
		node({ id: "done1", kind: "theory", parent: "main", state: "settled", label: "Settled idea", intent: "The done-thing.ts idea is settled.", sources: ["s:d"] }),
		node({ id: "fold1", kind: "theory", parent: "main", state: "settled", label: "Folded away", intent: "Old exploration.", sources: ["s:f1"],
			history: { checkpoint: "c1", nodes: ["fold1"], reason: "The folded-thing.ts exploration finished.", sources: ["s:fh"], returns: [] } }),
		node({ id: "other", kind: "feature", parent: "main", label: "Other goal", intent: "A stray-file.ts goal.", sources: ["s:o"] }),
	] };
	const pages = {
		"s:m": "Keep the main-file.ts line moving.", "s:l": "Continue the line-file.ts work.",
		"s:p": "A parked-idea.ts side note on main-file.ts.", "s:d": "The done-thing.ts idea is settled.",
		"s:f1": "Nothing else here.", "s:fh": "The folded-thing.ts exploration finished.", "s:o": "A stray-file.ts goal.",
	};
	const signals: TurnSignal[] = [
		{ key: "parked-idea.ts", kind: "path", ref: "s:t1", op: "write" },
		{ key: "done-thing.ts", kind: "path", ref: "s:t2", op: "touch" },
		{ key: "folded-thing.ts", kind: "path", ref: "s:t3" },
		{ key: "npm test", kind: "command", ref: "s:t4" },
		{ key: "stray-file.ts", kind: "path", ref: "s:t5", op: "read" },
	];
	const flags = await stageOne(feedStub(pages), checkpointOf(graph), signals);
	assert.deepEqual(flags.map(flag => flag.class), ["rule", "parked", "settled", "folded", "off-goal"]);
	const parked = flags.find(flag => flag.class === "parked")!;
	assert.equal(parked.node, "park1");
	assert.equal(parked.label, "Parked idea");
	assert.deepEqual(parked.matched, ["parked-idea.ts"]);
	assert.deepEqual(parked.sources, ["s:p"]);
});

test("stageOne suppresses off-goal when the turn also continues the line, but never parked work", async () => {
	const graph: WorkGraph = { revision: 1, motherThread: "main", purpose: "main", focus: "line", edges: [], nodes: [
		node({ id: "main", label: "Main purpose", intent: "Keep the main-file.ts line moving.", sources: ["s:m"] }),
		node({ id: "line", kind: "feature", parent: "main", label: "Main line", intent: "Continue the line-file.ts work.", sources: ["s:l"] }),
		// A shared source page carries both the line's token and the parked work's token.
		node({ id: "park1", kind: "theory", parent: "main", state: "parked", label: "Parked idea", intent: "A parked-idea.ts side idea.", sources: ["s:p"] }),
		node({ id: "other", kind: "feature", parent: "main", label: "Other goal", intent: "A stray-file.ts goal.", sources: ["s:o"] }),
	] };
	const pages = { "s:m": "Keep the main-file.ts line moving.", "s:l": "Continue the line-file.ts work.",
		"s:p": "A parked-idea.ts side note on main-file.ts.", "s:o": "A stray-file.ts goal." };
	const off = await stageOne(feedStub(pages), checkpointOf(graph), [{ key: "stray-file.ts", kind: "path", ref: "s:t1" }]);
	assert.deepEqual(off.map(flag => flag.class), ["off-goal"], "a turn wholly outside the current line is off-goal");
	const mixed = await stageOne(feedStub(pages), checkpointOf(graph), [
		{ key: "stray-file.ts", kind: "path", ref: "s:t1" }, { key: "main-file.ts", kind: "path", ref: "s:t2", op: "edit" },
		{ key: "parked-idea.ts", kind: "path", ref: "s:t3", op: "write" },
	]);
	assert.deepEqual(mixed.map(flag => flag.class), ["parked"],
		"mixed activity still continues the line; parked work is never suppressed on a shared page — stage two adjudicates");
});

test("stageOne caps flagged nodes per class", async () => {
	const parked = Array.from({ length: 25 }, (_, i) => node({ id: `p${i}`, kind: "theory", parent: "main", state: "parked",
		label: `Parked ${i}`, intent: "Parked.", sources: [`s:p${i}`] }));
	const graph: WorkGraph = { revision: 1, motherThread: "main", purpose: "main", focus: "line", edges: [], nodes: [
		node({ id: "main", label: "Main", intent: "Keep the main-file.ts line moving.", sources: ["s:m"] }),
		node({ id: "line", kind: "feature", parent: "main", label: "Line", intent: "Continue the line-file.ts work.", sources: ["s:l"] }),
		...parked,
	] };
	const pages: Record<string, string> = { "s:m": "Keep the main-file.ts line moving.", "s:l": "Continue the line-file.ts work." };
	for (let i = 0; i < 25; i++) pages[`s:p${i}`] = `A parked-${i}.ts idea.`;
	const flags = await stageOne(feedStub(pages), checkpointOf(graph),
		parked.map((_, i) => ({ key: `parked-${i}.ts`, kind: "path" as const, ref: `s:t${i}` })));
	// The per-class cap covers the first 24 endeavors — main and line included — so 22 of the 25 parked flag.
	assert.equal(flags.filter(flag => flag.class === "parked").length, 22);
});

test("pathTokens accepts only letter-stemmed paths with letter-starting extensions", () => {
	assert.deepEqual(pathTokens("write src/window.ts, read a/b.TS, skip .env, ../x.ts, /abs/x.ts, a//b.ts, dir/, 123.ts, file.1t, no-dot, x.abcdefghijklm"),
		["src/window.ts", "a/b.TS"]);
});

test("parseWindowVerdict counts only cited offered refs", () => {
	const refs = new Set(["s:u1", "s:op1"]);
	assert.deepEqual(parseWindowVerdict('{"continues":false,"citation":"s:u1"}', refs), { continues: false, citation: "s:u1" });
	assert.deepEqual(parseWindowVerdict('{"continues":true,"citation":"s:u1:b2","reason":"on the line"}', refs),
		{ continues: true, citation: "s:u1:b2", reason: "on the line" }, "a block-suffixed ref strips to its offered base");
	assert.equal(parseWindowVerdict('{"continues":false,"citation":"s:madeup"}', refs), undefined, "a hallucinated ref is indeterminate");
	assert.equal(parseWindowVerdict("not json", refs), undefined);
	assert.equal(parseWindowVerdict('{"continues":"yes","citation":"s:u1"}', refs), undefined);
	assert.equal(parseWindowVerdict('{"continues":true}', refs), undefined);
	assert.equal(parseWindowVerdict('{"citation":"s:u1"}', refs), undefined);
	assert.equal(parseWindowVerdict('[1,2]', refs), undefined);
	assert.equal(parseWindowVerdict('{"continues":true,"citation":"s:u1","reason":7}', refs), undefined);
});

test("renderCorrection orients with the turn, the record, the line, and the last direction", () => {
	const flags: WindowFlag[] = [{ class: "parked", node: "park1", label: "Parked idea", intent: "A parked-idea.ts side idea.",
		matched: ["parked-idea.ts"], sources: ["s:p"] }];
	const direction: WindowDirection = { text: "Continue the main line", ref: "s:u2" };
	const text = renderCorrection({ signals: [{ key: "parked-idea.ts", kind: "path", ref: "s:t1", op: "write" }], flags,
		purpose: "Current line — “Main line”: Continue the recorded main line. [src:s:u1]", lastUserDirection: direction });
	assert.match(text, /Mom — continuity correction after the compaction \(from her saved map; descriptive, not new direction\):\nThis turn:\n- write parked-idea\.ts \[src:s:t1\]/);
	assert.match(text, /It matches work she recorded before the compaction:\n- parked: “Parked idea” — A parked-idea\.ts side idea\. \[src:s:p\]/);
	assert.match(text, /Current line — “Main line”: Continue the recorded main line\. \[src:s:u1\]/);
	assert.match(text, /Last user direction — “Continue the main line” \[src:s:u2\]/);
	assert.match(text, /If the user's direction has changed since the compaction, follow the user\. Otherwise return to the current line above — this is her record, not a new direction\./);
	const bare = renderCorrection({ signals: [], flags, purpose: "Current line — not recorded yet.", lastUserDirection: null });
	assert.match(bare, /This turn:\n- no recorded file or shell activity/);
	assert.doesNotMatch(bare, /Last user direction/);
});

test("windowMessages carries the task, flags, legend, purpose, and reply instructions", () => {
	const flags: WindowFlag[] = [{ class: "parked", node: "park1", label: "Parked idea", intent: "A parked-idea.ts side idea.",
		matched: ["parked-idea.ts"], sources: ["s:p"] }];
	const turnEvents: FeedEvent[] = [{ ref: "s:t1", at: "t", actor: "lead", kind: "file_op", name: "write", text: "parked-idea.ts" }];
	const messages = windowMessages({ flags, turnEvents, purpose: "Current line — “Main line”: Continue the recorded main line. [src:s:u1]",
		lastUserDirection: { text: "Continue the main line", ref: "s:u2" } });
	assert.equal(messages.length, 1);
	assert.equal(messages[0].role, "user");
	const body = JSON.parse(String(messages[0].content));
	assert.equal(body.task, WINDOW_TASK);
	assert.deepEqual(body.flags, flags);
	assert.equal(body.flagClasses.parked, "interrupted work she recorded as parked");
	assert.match(body.turnEvents, /\[src:s:t1\] t lead file_op write\nparked-idea\.ts/);
	assert.equal(body.purpose, "Current line — “Main line”: Continue the recorded main line. [src:s:u1]");
	assert.deepEqual(body.lastUserDirection, { text: "Continue the main line", ref: "s:u2" });
	assert.match(body.reply, /Reply with only JSON/);
});

test("lastDirectionOf skips bare status pings", () => {
	const events: FeedEvent[] = [
		{ ref: "s:u1", at: "t", actor: "lead", kind: "user", text: "Ship the main line." },
		{ ref: "s:u2", at: "t", actor: "lead", kind: "user", text: "??" },
		{ ref: "s:u3", at: "t", actor: "lead", kind: "user", text: "status?" },
	];
	assert.deepEqual(lastDirectionOf({ events }), { text: "Ship the main line.", ref: "s:u1" });
	assert.equal(lastDirectionOf({ events: events.slice(1) }), null, "only pings is no direction");
	assert.equal(lastDirectionOf({ events: [] }), null);
});

test("collectTurnSignals reads file paths and shell commands with a bounded lookup budget", async () => {
	const events: FeedEvent[] = [
		{ ref: "s:f1", at: "t", actor: "lead", kind: "file_op", name: "write", text: "parked-idea.ts" },
		{ ref: "s:s1", at: "t", actor: "lead", kind: "shell_result", status: "exit:0" },
		{ ref: "s:s2", at: "t", actor: "lead", kind: "shell_result", status: "exit:1" },
	];
	const feed = feedStub({ "s:s1": '{"command":"npm test","exitCode":0}', "s:s2": "unreadable prose" });
	assert.deepEqual(await collectTurnSignals(feed, events), [
		{ key: "parked-idea.ts", kind: "path", ref: "s:f1", op: "write" },
		{ key: "npm test", kind: "command", ref: "s:s1" },
	]);
	assert.deepEqual(await collectTurnSignals(feed, events, { count: 48 }),
		[{ key: "parked-idea.ts", kind: "path", ref: "s:f1", op: "write" }], "an exhausted lookup budget skips shell results, never file ops");
});

/** The scripted map: a root, an active focus line, and a parked sibling off the line. */
function parkedCommit(request: any) {
	const body = input(request);
	const previous = body.graph.nodes?.find((candidate: any) => candidate.id === "main"), prior: string[] = previous?.sources ?? [];
	const ref = body.original.ref as string;
	return { tool: { name: "commit_graph", arguments: { focus: "focus",
		upsertNodes: [
			{ id: "main", kind: "try", parent: null, state: "active", label: "Main purpose", intent: previous?.intent ?? "Ship the main line.",
				observed: "Lead continued.", actor: "lead", sources: [...new Set([...prior, ref])] },
			{ id: "focus", kind: "feature", parent: "main", state: "active", label: "Main line", intent: "Continue the recorded main line.",
				observed: "Lead continued.", actor: "lead", sources: [ref] },
			{ id: "parked", kind: "theory", parent: "main", state: "parked", label: "Parked idea", intent: "A parked-idea.ts side idea.",
				observed: "", actor: "lead", sources: [ref] },
		],
		unfinished: [], upsertEdges: [], removeEdges: [], merges: [], folds: [], removeNodes: [], note: null } } };
}

/** The scripted provider: Mom's map carries the parked sibling; the window verdict is scripted. */
const parkedOverride = (continues: boolean) => (request: any) => {
	if (isWindowCheck(request)) {
		const body = input(request);
		return { text: JSON.stringify({ continues, citation: body.flags[0].sources[0] }) };
	}
	if (!isMomRequest(request)) return { text: "Lead continued." };
	return input(request).chapterIds ? replacement(request) : parkedCommit(request);
};

function beforeEvent(branchEntries: any[], firstKeptEntryId: string) {
	return { type: "session_before_compact", branchEntries, reason: "manual", willRetry: false, signal: new AbortController().signal,
		preparation: { firstKeptEntryId, messagesToSummarize: [], turnPrefixMessages: [], isSplitTurn: false, tokensBefore: 100,
			fileOps: { read: [], modified: [] }, settings: { enabled: true, reserveTokens: 1000, keepRecentTokens: 1000 } } } as any;
}

async function compact(h: Awaited<ReturnType<typeof setup>>, summary: string) {
	const manager = h.runtime.session.sessionManager;
	const branch = manager.getBranch();
	const firstKept = branch.findLast((entry: any) => entry.type === "message" && entry.message.role === "assistant")!;
	await h.emitExtension("session_before_compact", beforeEvent(branch, firstKept.id));
	const id = manager.appendCompaction(summary, firstKept.id, 100);
	const compactionEntry = manager.getEntry(id);
	await h.emitExtension("session_compact", { type: "session_compact", compactionEntry, fromExtension: false, reason: "manual", willRetry: false });
}

const windowRecords = async (h: Awaited<ReturnType<typeof setup>>) =>
	(await readSidecar(h)).filter(r => r.type === "injection" && r.data.kind === "window");
const correctionEntries = (h: Awaited<ReturnType<typeof setup>>) =>
	h.runtime.session.sessionManager.getBranch().filter((e: any) => e.customType === WINDOW_CORRECTION);

test("a misaligned settled turn after a mid-run compaction gets exactly one visible correction", { timeout: 60000 }, async () => {
	const h = await setup(true);
	try {
		const notices: string[] = [];
		const context = { ...h.context, ui: { ...h.context.ui, notify: (text: string) => notices.push(text) } };
		h.api.onUnscripted(parkedOverride(false));
		await h.runtime.session.prompt("Ship the main line. Park the parked-idea.ts side idea for later.");
		await h.command("refresh", context);
		await until(() => h.requests().length === 1);
		const gate = deferred();
		const arrival = h.api.script("Continue the main line", { gate });
		const runP = h.runtime.session.prompt("Continue the main line");
		await arrival;
		await compact(h, "The main line continues.");
		h.runtime.session.sessionManager.appendCustomEntry("file_op", { op: "write", path: "parked-idea.ts" });
		gate.resolve();
		await runP;
		await until(async () => (await windowRecords(h)).some(r => r.data.action === "closed"));
		const records = await windowRecords(h);
		assert.deepEqual(records.map(r => r.data.action), ["opened", "checked", "corrected", "closed"], "one window, one check, one correction, closed");
		assert.equal(records[3].data.reason, "correction", "the correction itself closes the window");
		assert.equal(records[3].data.held, false);
		assert.equal(records[1].data.turns, 1);
		assert.equal(records[1].data.checks, 1);
		assert.equal(records[1].data.error, undefined);
		assert.deepEqual(records[1].data.flagged.map((flag: any) => flag.class), ["parked"]);
		const entries = correctionEntries(h) as any[];
		assert.equal(entries.length, 1, "exactly one correction branch entry");
		assert.equal(entries[0].display, true, "the correction is visible to the user");
		const correction = String(entries[0].content);
		assert.equal(records[2].data.content, correction, "the sidecar records the published correction verbatim");
		assert.match(correction, /Mom — continuity correction after the compaction \(from her saved map; descriptive, not new direction\):/);
		assert.match(correction, /This turn:\n- write parked-idea\.ts \[src:/);
		assert.match(correction, /It matches work she recorded before the compaction:\n- parked: “Parked idea” — A parked-idea\.ts side idea\. \[src:/);
		assert.match(correction, /Current line — “Main line”: Continue the recorded main line\. \[src:/);
		assert.match(correction, /Last user direction — “Continue the main line” \[src:/);
		assert.match(correction, /If the user's direction has changed since the compaction, follow the user\. Otherwise return to the current line above — this is her record, not a new direction\./);
		assert.equal(h.windowRequests().length, 1, "one bounded model check");
		await h.command("log", context);
		const log = notices[notices.length - 1]!;
		assert.match(log, /window after compact .* — opened \(watching the first settled turns\)/);
		assert.match(log, /window after compact .* — watched turn 1\/3, flagged: parked “Parked idea” \(parked-idea\.ts\), model check 1\/3/);
		assert.match(log, /window after compact .* — corrected:\nMom — continuity correction after the compaction/);
		assert.match(log, /window after compact .* — closed \(the correction\)$/m);
		await h.runtime.session.prompt("Continue further");
		assert.equal(correctionEntries(h).length, 1, "a later turn adds no second correction");
		assert.equal(h.windowRequests().length, 1, "the closed window spends no further checks");
		await h.runtime.session.reload();
		await h.runtime.session.prompt("Continue after reload");
		assert.equal(correctionEntries(h).length, 1, "the correction is not repeated after reload");
		assert.equal(h.windowRequests().length, 1);
	} finally { await h.close(); }
});

test("the user's next message after a compaction closes the window as a fresh direction, silently", { timeout: 30000 }, async () => {
	const h = await setup(true);
	try {
		const notices: string[] = [];
		const context = { ...h.context, ui: { ...h.context.ui, notify: (text: string) => notices.push(text) } };
		await h.runtime.session.prompt("Ship the main line. Park the parked-idea.ts side idea for later.");
		await h.command("refresh", context);
		await until(() => h.requests().length === 1);
		await compact(h, "The main line continues.");
		await h.command("status", context);
		assert.match(notices[notices.length - 1]!, /watching after compact/);
		await h.runtime.session.prompt("Actually do the parked idea instead.");
		await until(async () => (await windowRecords(h)).some(r => r.data.action === "closed"));
		const records = await windowRecords(h);
		assert.deepEqual(records.map(r => r.data.action), ["opened", "closed"]);
		assert.equal(records[1].data.reason, "user-message");
		assert.equal(records[1].data.held, false, "a user pivot is correct behavior, not a lost continuity");
		assert.equal(records[1].data.turns, 0);
		assert.equal(h.windowRequests().length, 0, "a user pivot needs no model check");
		assert.equal(correctionEntries(h).length, 0, "a user pivot is never corrected");
		await h.command("status", context);
		assert.doesNotMatch(notices[notices.length - 1]!, /watching after compact|continuity held/, "a zero-turn close is silent");
		await h.command("log", context);
		assert.match(notices[notices.length - 1]!, /window after compact .* — opened \(watching the first settled turns\)/);
		assert.match(notices[notices.length - 1]!, /window after compact .* — closed \(the user's next message\)$/m);
	} finally { await h.close(); }
});

test("three flagged turns that each continue the line hold continuity and close the window", { timeout: 60000 }, async () => {
	const h = await setup(true);
	try {
		const notices: string[] = [];
		const context = { ...h.context, ui: { ...h.context.ui, notify: (text: string) => notices.push(text) } };
		h.api.onUnscripted(parkedOverride(true));
		await h.runtime.session.prompt("Ship the main line. Park the parked-idea.ts side idea for later.");
		await h.command("refresh", context);
		await until(() => h.requests().length === 1);
		await compact(h, "The main line continues.");
		const continuation = () => h.pi.sendMessage({ customType: "test-continuation", content: "Continue the line.", display: false },
			{ triggerTurn: true });
		for (const turn of [1, 2, 3]) {
			h.runtime.session.sessionManager.appendCustomEntry("file_op", { op: "write", path: "parked-idea.ts" });
			await continuation();
			await until(async () => (await windowRecords(h)).some(r => r.data.action === "checked" && r.data.turns === turn));
		}
		await until(async () => (await windowRecords(h)).some(r => r.data.action === "closed"));
		const records = await windowRecords(h);
		assert.deepEqual(records.map(r => r.data.action), ["opened", "checked", "checked", "checked", "closed"]);
		assert.deepEqual(records.slice(1, 4).map(r => r.data.checks), [1, 2, 3], "each flagged turn spends one model check");
		assert.deepEqual(records.slice(1, 4).flatMap(r => r.data.flagged.map((flag: any) => flag.class)), ["parked", "parked", "parked"]);
		assert.equal(records[4].data.reason, "turns");
		assert.equal(records[4].data.held, true, "watched turns that stayed on the line end held");
		assert.equal(records[4].data.turns, 3);
		h.runtime.session.sessionManager.appendCustomEntry("file_op", { op: "write", path: "parked-idea.ts" });
		await continuation();
		assert.equal(h.windowRequests().length, 3, "the closed window spends no further checks");
		assert.equal(correctionEntries(h).length, 0, "continuing turns are never corrected");
		await h.command("status", context);
		assert.match(notices[notices.length - 1]!, /continuity held after compact \d\d:\d\d/);
		await h.command("log", context);
		const log = notices[notices.length - 1]!;
		assert.match(log, /window after compact .* — watched turn 1\/3, flagged: parked “Parked idea” \(parked-idea\.ts\), model check 1\/3/);
		assert.match(log, /window after compact .* — watched turn 3\/3, flagged: parked “Parked idea” \(parked-idea\.ts\), model check 3\/3/);
		assert.match(log, /window after compact .* — closed \(three settled turns\), continuity held$/m);
	} finally { await h.close(); }
});

test("a failed compaction audit still opens the window from the last accepted map", { timeout: 30000 }, async () => {
	const h = await setup(true);
	try {
		h.api.onUnscripted(parkedOverride(true));
		await h.runtime.session.prompt("Ship the main line. Park the parked-idea.ts side idea for later.");
		await h.command("refresh");
		await until(() => h.requests().length === 1);
		// The audit now fails; the window check still runs from the surviving checkpoint.
		h.api.onUnscripted((request: any) => {
			if (isWindowCheck(request)) {
				const body = input(request);
				return { text: JSON.stringify({ continues: true, citation: body.flags[0].sources[0] }) };
			}
			if (isMomRequest(request)) return { text: "garbage that is not a tool call" };
			return { text: "Lead continued." };
		});
		await compact(h, "The audit will fail.");
		h.runtime.session.sessionManager.appendCustomEntry("file_op", { op: "write", path: "parked-idea.ts" });
		await h.pi.sendMessage({ customType: "test-continuation", content: "Continue the line.", display: false }, { triggerTurn: true });
		await until(async () => (await windowRecords(h)).some(r => r.data.action === "checked"));
		const records = await windowRecords(h);
		assert.deepEqual(records.map(r => r.data.action), ["opened", "checked"]);
		assert.deepEqual(records[1].data.flagged.map((flag: any) => flag.class), ["parked"], "stage one still flags from the last accepted map");
		assert.equal(h.windowRequests().length, 1, "the check runs even though the audit failed");
		assert.equal(correctionEntries(h).length, 0, "a continuing verdict corrects nothing");
		const notices: string[] = [];
		const context = { ...h.context, ui: { ...h.context.ui, notify: (text: string) => notices.push(text) } };
		await h.command("detail", context);
		assert.equal(typeof JSON.parse(notices[0]).error, "string", "the audit failure is still visible");
	} finally { await h.close(); }
});
