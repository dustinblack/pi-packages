import assert from "node:assert/strict";
import { test } from "node:test";
import { ANCHOR, classifyCommand, clockTime, collectSideEffects, commandFromJson, renderAnchor, type AnchorFeed } from "../src/anchor.ts";
import { NOTICE, type Checkpoint } from "../src/checkpoint.ts";
import type { FeedEvent } from "../src/feed.ts";
import type { GraphNode, WorkGraph } from "../src/graph.ts";
import { input, isMomRequest, readSidecar, replacement, setup, until } from "./fixture.ts";

const node = (over: Partial<GraphNode>): GraphNode => ({ id: "n", kind: "try", parent: null, state: "active",
	label: "L", intent: "I", observed: "", actor: "lead", sources: ["s:u1"], ...over });
const checkpointOf = (graph: WorkGraph): Checkpoint => ({ sessionId: "s", graph, note: null,
	cut: { parent: null, workers: [] }, at: Date.now(), model: "fixture/fixture" });

test("renderAnchor keeps the purpose verbatim with citations and clips nothing it quotes", () => {
	const graph: WorkGraph = { revision: 1, motherThread: "main", purpose: "main", focus: "anchor", edges: [], nodes: [
		node({ id: "main", label: "Ship the anchor", intent: "Ship the post-compact anchor for Mom.", sources: ["s:u1"], purposeSource: "s:u1" }),
		node({ id: "anchor", kind: "feature", parent: "main", label: "Anchor rendering", intent: "Render the anchor from the saved map with no model call.", sources: ["s:u2"] }),
		node({ id: "rule1", kind: "rule", parent: "main", label: "No model calls", intent: "Never call a model to render the anchor.", sources: ["s:u3"], purposeSource: "s:u3" }),
		node({ id: "park1", kind: "try", parent: "main", state: "parked", label: "Old idea", intent: "An older idea, now parked.", sources: ["s:u4"] }),
	] };
	const text = renderAnchor(checkpointOf(graph), ['git commit -m "ship" — exit 0'], "2m");
	assert.match(text, /Mom — continuity anchor after the compaction summary \(from her last saved map, saved 2m ago; not the summary; descriptive, not new direction\):/);
	assert.match(text, /Mother thread — “Ship the anchor”: “Ship the post-compact anchor for Mom\.” \[src:s:u1\]/);
	assert.match(text, /Rules in force \(verbatim\):\n- “Never call a model to render the anchor\.” \[src:s:u3\] — under “Ship the anchor”/);
	assert.match(text, /Current — “Anchor rendering”: Render the anchor from the saved map with no model call\./);
	assert.match(text, /Parked — “Old idea”/);
	assert.match(text, /Recent side effects:\n- git commit -m "ship" — exit 0/);
});

test("renderAnchor caps rules and parked labels, orients an annotation focus, and omits empty sections", () => {
	const rules = Array.from({ length: 6 }, (_, i) => node({ id: `r${i}`, kind: "rule", parent: "main", label: `Rule ${i}`, intent: `Rule ${i} verbatim.`, sources: [`s:r${i}`] }));
	const parked = Array.from({ length: 7 }, (_, i) => node({ id: `p${i}`, kind: "theory", parent: "main", state: "parked", label: `Parked ${i}`, intent: "Parked.", sources: [`s:p${i}`] }));
	const graph: WorkGraph = { revision: 1, motherThread: "main", purpose: "main", focus: "r0", edges: [], nodes: [node({ id: "main", label: "Main", intent: "Keep the purpose." }), ...rules, ...parked] };
	const text = renderAnchor(checkpointOf(graph), []);
	assert.equal((text.match(/^- “Rule \d verbatim\.”/gm) ?? []).length, 5, "at most five verbatim rules");
	assert.match(text, /Current — “Main”: Keep the purpose\. \(attention on “Rule 0”\)/);
	assert.equal((text.match(/“Parked \d”/g) ?? []).length, 6, "at most six parked labels");
	assert.doesNotMatch(text, /Recent side effects/);
	const bare = renderAnchor(checkpointOf({ revision: 0, motherThread: "solo", purpose: "solo", focus: "solo", edges: [], nodes: [node({ id: "solo", label: "Only", intent: "One endeavor." })] }), []);
	assert.match(bare, /Mother thread — “Only”: “One endeavor\.” \[src:s:u1\]/);
	assert.doesNotMatch(bare, /Rules in force|Parked|Recent side effects/);
});

test("classifyCommand separates commits, test runs, and ordinary commands", () => {
	assert.equal(classifyCommand('git commit -m "ship"'), "commit");
	assert.equal(classifyCommand("cd ../other && git -C repo commit --allow-empty"), "commit");
	assert.equal(classifyCommand("hg commit -m ship"), "commit");
	assert.equal(classifyCommand("git commit-graph write"), undefined);
	assert.equal(classifyCommand("npm test"), "test");
	assert.equal(classifyCommand("npm run check -- --watch"), "test");
	assert.equal(classifyCommand("npx vitest run"), "test");
	assert.equal(classifyCommand("cargo test"), "test");
	assert.equal(classifyCommand("go test ./..."), "test");
	assert.equal(classifyCommand("pytest -q"), "test");
	assert.equal(classifyCommand("tsx --test src/anchor.test.ts"), "test");
	assert.equal(classifyCommand("npm run typecheck"), undefined);
	assert.equal(classifyCommand("git status"), undefined);
	assert.equal(classifyCommand("echo done"), undefined);
});

test("commandFromJson unescapes the recorded command and rejects truncated pages", () => {
	assert.equal(commandFromJson('{"role":"bashExecution","command":"git commit -m \\"ship\\"","output":"ok","exitCode":0}'), 'git commit -m "ship"');
	assert.equal(commandFromJson('{"command":"npm run check"'), 'npm run check');
	assert.equal(commandFromJson('{"command":"npm run ch'), undefined);
	assert.equal(commandFromJson('{"output":"no command here"}'), undefined);
});

test("collectSideEffects reads only recent recorded shell results, oldest first", async () => {
	const shell = (ref: string, status: string): FeedEvent => ({ ref, at: "t", actor: "lead", kind: "shell_result", status });
	const filler = (i: number): FeedEvent => ({ ref: `s:x${i}`, at: "t", actor: "lead", kind: "user", text: "filler" });
	const stub = (events: readonly FeedEvent[], pages: Record<string, string>): AnchorFeed =>
		({ events, lookup: async ref => { const text = pages[ref] ?? ""; return { text, totalChars: text.length }; } });
	const pages = {
		"s:1": '{"role":"bashExecution","command":"npm test","output":"fail","exitCode":1}',
		"s:2": '{"role":"bashExecution","command":"git commit -m \\"ship\\"","output":"ok","exitCode":0}',
		"s:3": '{"role":"bashExecution","command":"echo not a side effect","output":"ok","exitCode":0}',
	};
	const events = [shell("s:1", "exit:1"), { ref: "s:u", at: "t", actor: "lead", kind: "user", text: "go" },
		shell("s:2", "exit:0"), { ref: "s:c", at: "t", actor: "lead", kind: "tool_call" }, shell("s:3", "exit:0")];
	assert.deepEqual(await collectSideEffects(stub(events, pages), 2), [
		"npm test — exit:1",
		'git commit -m "ship" — exit:0',
	]);
	const long = `git commit -m ${"x".repeat(200)}`;
	assert.match((await collectSideEffects(stub([shell("s:9", "cancelled")], { "s:9": `{"command":"${long}","exitCode":1}` })))[0], /^.{160}… — cancelled$/);
	const far = [shell("s:0", "exit:0"), ...Array.from({ length: 700 }, (_, i) => filler(i)), shell("s:1", "exit:1")];
	assert.deepEqual(await collectSideEffects(stub(far, { ...pages, "s:0": '{"command":"git commit -m \\"stale\\"","exitCode":0}' })),
		["npm test — exit:1"], "side effects outside the recent window are stale, not missing");
	assert.match(clockTime(Date.now()), /^\d\d:\d\d$/);
});

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

const anchorEntries = (h: Awaited<ReturnType<typeof setup>>) => h.runtime.session.sessionManager.getBranch().filter((e: any) => e.customType === ANCHOR);

test("a compaction queues one visible anchor and delivers it on the next lead request exactly once", { timeout: 30000 }, async () => {
	const h = await setup(true);
	try {
		const notices: string[] = [];
		const context = { ...h.context, ui: { ...h.context.ui, notify: (text: string) => notices.push(text) } };
		await h.runtime.session.prompt("Ship the post-compact anchor. Keep the mother-thread purpose verbatim.");
		await h.command("refresh", context);
		await until(() => h.requests().length === 1);
		await compact(h, "The anchor work continues.");
		assert.equal(anchorEntries(h).length, 0, "the anchor waits for the next request");
		await h.command("status", context);
		assert.match(notices[notices.length - 1]!, /anchor queued after compact/);
		await h.runtime.session.prompt("Continue");
		const entries = anchorEntries(h) as any[];
		assert.equal(entries.length, 1, "exactly one anchor after the compaction");
		assert.equal(entries[0].display, true, "the anchor is visible to the user");
		const anchor = String(entries[0].content);
		assert.match(anchor, /Mom — continuity anchor after the compaction summary \(from her last saved map, saved .* ago/);
		assert.match(anchor, /Mother thread — “Main purpose”: “Ship the post-compact anchor/);
		assert.match(anchor, /\[src:/);
		assert.match(anchor, /Current — “Main purpose”: Ship the post-compact anchor/);
		assert.doesNotMatch(anchor, /Recent side effects/);
		const continued = h.api.requests.filter((r: any) => !isMomRequest(r)).findLast((r: any) => JSON.stringify(r.messages).includes("continuity anchor"));
		assert(continued, "the first post-compaction lead request contains the anchor");
		const textOf = (m: any) => typeof m.content === "string" ? m.content : (m.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
		const anchorOnWire = continued.messages.findLast((m: any) => m.role === "user" && textOf(m).startsWith("Mom — continuity anchor"));
		assert(anchorOnWire, "the anchor rides the request where the model reads it");
		const promptAt = continued.messages.findLastIndex((m: any) => m.role === "user" && textOf(m) === "Continue");
		assert.equal(continued.messages.indexOf(anchorOnWire), promptAt - 1, "the anchor lands directly before the new user prompt");
		await h.runtime.session.prompt("And again");
		assert.equal(anchorEntries(h).length, 1, "later requests add no second anchor");
		await h.command("status", context);
		assert.match(notices[notices.length - 1]!, /anchored after compact \d\d:\d\d/);
		const injections = (await readSidecar(h)).filter(r => r.type === "injection");
		assert.deepEqual(injections.map(r => r.data.action), ["pending", "delivered"]);
		assert.equal(injections[1].data.content, anchor);
		await h.command("log", context);
		assert.match(notices[notices.length - 1]!, /anchor after compact .* — delivered:\nMom — continuity anchor/);
		await h.runtime.session.reload();
		await h.runtime.session.prompt("Continue after reload");
		assert.equal(anchorEntries(h).length, 1, "delivery is not repeated after reload");
	} finally { await h.close(); }
});

test("a failing compaction audit still anchors from the last accepted map", { timeout: 15000 }, async () => {
	const h = await setup(true);
	try {
		await h.runtime.session.prompt("Ship the post-compact anchor even when the audit fails.");
		await h.command("refresh");
		await until(() => h.requests().length === 1);
		h.api.onUnscripted((request: any) => isMomRequest(request) ? { text: "garbage that is not a tool call" } : { text: "Lead continued." });
		await compact(h, "The audit will fail.");
		await h.runtime.session.prompt("Continue");
		const entries = anchorEntries(h) as any[];
		assert.equal(entries.length, 1, "the anchor still delivers from the last accepted map");
		assert.match(String(entries[0].content), /Mother thread — “Main purpose”: “Ship the post-compact anchor/);
		const injections = (await readSidecar(h)).filter(r => r.type === "injection");
		assert.deepEqual(injections.map(r => r.data.action), ["pending", "delivered"]);
		const notices: string[] = [];
		const context = { ...h.context, ui: { ...h.context.ui, notify: (text: string) => notices.push(text) } };
		await h.command("detail", context);
		assert.equal(typeof JSON.parse(notices[0]).error, "string", "the audit failure is still visible");
	} finally { await h.close(); }
});

test("a compaction with no saved map skips the anchor durably with a reason", { timeout: 15000 }, async () => {
	const h = await setup(true);
	try {
		await h.runtime.session.prompt("Compact before Mom has saved any map.");
		h.api.onUnscripted((request: any) => isMomRequest(request) ? { text: "garbage that is not a tool call" } : { text: "Lead continued." });
		await compact(h, "Nothing saved yet.");
		await h.runtime.session.prompt("Continue");
		assert.equal(anchorEntries(h).length, 0, "no anchor without a saved map");
		const injections = (await readSidecar(h)).filter(r => r.type === "injection");
		assert.deepEqual(injections.map(r => r.data.action), ["pending", "skipped"]);
		assert.equal(injections[1].data.reason, "Mom had no saved map to anchor from");
		const notices: string[] = [];
		const context = { ...h.context, ui: { ...h.context.ui, notify: (text: string) => notices.push(text) } };
		await h.command("log", context);
		assert.match(notices[0], /— skipped: Mom had no saved map to anchor from/);
	} finally { await h.close(); }
});

test("the ledger lists the delivered anchor and process notice in one read", { timeout: 15000 }, async () => {
	const h = await setup(true);
	try {
		const notices: string[] = [];
		const context = { ...h.context, ui: { ...h.context.ui, notify: (text: string) => notices.push(text) } };
		await h.runtime.session.prompt("Record the decision to keep KEEP.txt unchanged before continuing.");
		await h.command("refresh", context);
		await until(() => h.requests().length === 1);
		h.api.onUnscripted((request: any) => {
			if (!isMomRequest(request)) return { text: "Lead continued." };
			const body = input(request);
			if (body.chapterIds) return replacement(request);
			const trigger = body.compactionReview.triggerRef;
			return replacement(request, { note: { text: "Record the KEEP decision now before its instruction is lost.", riskClass: "compaction_decisions", target: "main", riskRefs: [body.original.ref, trigger], actionRefs: [body.original.ref] } });
		});
		await compact(h, "The migration continues.");
		await h.runtime.session.prompt("Continue");
		await until(() => h.runtime.session.sessionManager.getBranch().some((e: any) => e.customType === NOTICE));
		const injections = (await readSidecar(h)).filter(r => r.type === "injection" || r.type === "notice");
		assert.deepEqual(injections.map(r => `${r.type}:${r.data.action}`), ["injection:pending", "notice:delivered", "injection:delivered"], "the notice lands at the input event, the anchor at before_agent_start");
		await h.command("log", context);
		const log = notices[notices.length - 1]!;
		assert.match(log, /anchor after compact .* — delivered:\nMom — continuity anchor/);
		assert.match(log, /notice \(compaction_decisions:main\) — delivered on the next request: Record the KEEP decision now before its instruction is lost\./);
	} finally { await h.close(); }
});
