import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, appendFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { LiveFeed, CORRECTION, extractEvents, renderEvents, searchHistory } from "../src/feed.ts";

const stamp = "2026-09-27T00:00:00.000Z";
const user = (text: string): any => ({ role: "user", content: text, timestamp: Date.now() });
const assistant = (content: any[]): any => ({ role: "assistant", content, stopReason: "toolUse", timestamp: Date.now() });
const entry = (id: string, text: string) => ({ type: "message", id, parentId: null, timestamp: stamp, message: { role: "assistant", content: [{ type: "text", text }], stopReason: "stop" } });
const line = (e: any) => JSON.stringify(e) + "\n";
async function workerFixture() {
	const cwd = await realpath(await mkdtemp(join(tmpdir(), "mom-feed-")));
	const manager = SessionManager.inMemory(cwd);
	const root = manager.appendMessage(user("Preserve the original purpose."));
	const ownerKey = join(cwd, ".agents/pi/subsessions/owners", `${manager.getSessionId()}.json`);
	await mkdir(ownerKey.slice(0, -5), { recursive: true });
	const file = join(cwd, "worker.jsonl"), recordPath = join(cwd, "run.json");
	await writeFile(recordPath, JSON.stringify({ version: 1, id: "scout-one", ownerKey, sessionId: "worker-one", sessionFile: file,
		cwd, role: "scout", context: "fork", forkedMessages: 1, startIdx: 900, status: "complete" }));
	await writeFile(join(ownerKey.slice(0, -5), "scout-one.json"), JSON.stringify({ version: 1, recordPath }));
	const header = line({ type: "session", id: "worker-one", version: 3, cwd, timestamp: stamp });
	await writeFile(file, header + line(entry("inherited", "Parent history must not be repeated.")) + line(entry("a", "Observed worker finding.")));
	manager.appendMessage(assistant([{ type: "toolCall", id: "launch", name: "delegate", arguments: { task: "Scout" } }]));
	manager.appendMessage({ role: "toolResult", toolCallId: "launch", toolName: "delegate", content: [{ type: "text", text: "started" }], details: { id: "scout-one", sessionFile: file }, isError: false, timestamp: Date.now() });
	return { cwd, manager, root, file, dispose: () => rm(cwd, { recursive: true, force: true }) };
}

test("the bounded feed keeps dialog direction verbatim while tool payloads and Mom state stay out", () => {
	const s = { key: "s", actor: "lead" };
	const events = [
		...extractEvents(s, { ...entry("a", "Choose the bounded option."), message: { role: "assistant", content: [{ type: "text", text: "Choose the bounded option." }, { type: "toolCall", id: "q", name: "gather_input", arguments: { questions: [{ question: "Which approach?", options: [{ label: "Bounded", description: "No extra work" }] }] } }] } }),
		...extractEvents(s, { ...entry("b", ""), message: { role: "toolResult", toolName: "gather_input", toolCallId: "q", isError: false, content: [{ type: "text", text: "Bounded. Keep recall." }] } }),
		...extractEvents(s, { ...entry("c", ""), message: { role: "toolResult", toolName: "bash", toolCallId: "other", isError: false, content: [{ type: "text", text: "RAW_SECRET_TOOL_PAYLOAD" }] } }),
		...extractEvents(s, { type: "custom_message", id: "d", timestamp: stamp, customType: CORRECTION, content: "Keep  all\nspacing.", details: { origin: "user-command" } }),
	];
	const rendered = renderEvents(events);
	assert.match(rendered, /Which approach\?\n- Bounded\nNo extra work/);
	assert.match(rendered, /Bounded\. Keep recall\./);
	assert.match(rendered, /Keep  all\nspacing\./);
	assert(!JSON.stringify(events).includes("RAW_SECRET_TOOL_PAYLOAD"));
	assert.deepEqual(extractEvents(s, { ...entry("mom", "Mom's view"), message: { role: "custom", customType: "pi-tether.mom-notice", content: "Do not recursively observe this." } }), []);
});

test("output-phrase search finds parent arguments and worker payloads without exposing them in the feed", async () => {
	const f = await workerFixture();
	try {
		const call = f.manager.appendMessage(assistant([{ type: "toolCall", id: "literal", name: "bash", arguments: { command: "echo argument-needle" } }]));
		await appendFile(f.file, line({ ...entry("payload", ""), message: { role: "toolResult", toolName: "bash", toolCallId: "worker-read",
			isError: true, content: [{ type: "text", text: "assertion pass count: 7; payload-needle" }] } }));
		const feed = new LiveFeed(f.manager); await feed.capture();
		assert(!JSON.stringify(feed.events).includes("payload-needle"));
		const result = await feed.search("assertion pass count");
		assert.equal(result.matches[0].ref, "worker-one:payload");
		assert.equal(result.matches[0].payloadMatched, true);
		assert(!JSON.stringify(result.matches).includes("payload-needle"));
		assert.equal((await feed.search("argument-needle")).matches[0].ref, `${f.manager.getSessionId()}:${call}:b0`);
		assert.match((await feed.lookup("worker-one:payload")).text, /assertion pass count: 7/);
		await writeFile(f.file, "replaced source\n");
		assert((await feed.search("payload-needle")).unreadable > 0, "changed sources must not become silent misses");
	} finally { await f.dispose(); }
});

test("ephemeral vectorless search ranks conceptual diagnostics without exposing payloads", async () => {
	const f = await workerFixture();
	try {
		const add = (id: string, command: string, output: string) => {
			const call = f.manager.appendMessage(assistant([{ type: "toolCall", id, name: "bash", arguments: { command } }]));
			const result = f.manager.appendMessage({ role: "toolResult", toolCallId: id, toolName: "bash", isError: true,
				content: [{ type: "text", text: output }], timestamp: Date.now() });
			return { call: `${f.manager.getSessionId()}:${call}:b0`, result: `${f.manager.getSessionId()}:${result}` };
		};
		const syntax = add("syntax", "npx tsc --noEmit", "src/index.ts(46,31): error TS1005: ',' expected.");
		add("regex", "rg 'sendMessage(' src", "regex parse error: unclosed group");
		add("arity", "npx tsc --noEmit", "src/other.ts(8,2): error TS2554: Expected 2 arguments, but got 3.");
		const broken = add("links", "check-roadmap-links", "broken link: 2026-07-12-phase7-and-beyond.md -> missing 2026-07-12-boost-review-desk-ssmp.md");
		const python = add("python", "python reproduce.py", "TypeError: sub() takes 2 positional arguments but 3 were given");
		const feed = new LiveFeed(f.manager); await feed.capture();
		const parse = await feed.search("parse error", undefined,
			"What exact TypeScript parse error did the recorded typecheck report, including the error code, expected token, and affected source location?");
		assert.equal(parse.matches[0].ref, syntax.result, "syntax diagnostic wins over newer regex and arity errors");
		assert.equal(parse.matches[0].pairedRef, syntax.call);
		assert.equal(parse.matches[0].kind, "tool_result");
		const links = await feed.search("broken link", undefined, "Which roadmap validation reported a broken link and missing target filename?");
		assert.equal(links.matches[0].ref, broken.result);
		const typeError = await feed.search("TypeError sub", undefined, "What TypeError did sub report for positional arguments?");
		assert.equal(typeError.matches[0].ref, python.result);
		const safe = JSON.stringify([parse.matches, links.matches, typeError.matches]);
		for (const secret of ["src/index.ts(46,31)", "phase7-and-beyond.md", "takes 2 positional arguments"]) assert(!safe.includes(secret));
		assert.match((await feed.lookup(parse.matches[0].ref)).text, /src\/index\.ts\(46,31\)/);
	} finally { await f.dispose(); }
});

test("hex entry IDs beginning b plus digits are not mistaken for content-block suffixes", async () => {
	const f = await workerFixture();
	try {
		await appendFile(f.file, line({ ...entry("b7654321", ""), message: { role: "assistant", content: [{ type: "toolCall", id: "pair", name: "bash", arguments: { command: "echo exact-payload" } }] } }) +
			line({ ...entry("b1234567", ""), message: { role: "toolResult", toolName: "bash", toolCallId: "pair", isError: false, content: [{ type: "text", text: "exact-payload returned" }] } }));
		const feed = new LiveFeed(f.manager); await feed.capture();
		const call = "worker-one:b7654321:b0", result = "worker-one:b1234567";
		for (const reader of [feed, new LiveFeed(f.manager)]) {
			if (reader !== feed) await reader.restore(feed.cut());
			assert.equal(reader.pairedSource(result), call); assert.equal(reader.pairedSource(call), result);
			assert.match((await reader.lookup(result)).text, /exact-payload returned/);
			assert.match((await reader.lookup(call)).text, /echo exact-payload/);
			const search = await reader.search("exact-payload");
			assert.equal(search.unreadable, 0); assert.equal(search.matches.length, 1);
			assert.equal(search.matches[0].ref, result); assert.equal(search.matches[0].pairedRef, call);
		}
	} finally { await f.dispose(); }
});

test("history search keeps newer parent evidence ahead of older worker matches after restore", async () => {
	const f = await workerFixture();
	try {
		for (let i = 0; i < 5; i++) await appendFile(f.file, line({ ...entry(`error-${i}`, ""), message: {
			role: "toolResult", toolName: "bash", toolCallId: `worker-${i}`, isError: true, content: [{ type: "text", text: "older failure" }],
		} }));
		const feed = new LiveFeed(f.manager); await feed.capture();
		const id = f.manager.appendMessage({ role: "toolResult", toolName: "bash", toolCallId: "parent-check", isError: true,
			content: [{ type: "text", text: "new verification failure" }], timestamp: Date.now() });
		await feed.capture();
		const live = searchHistory(feed.events, "isError=true");
		assert.equal(live[0].ref, `${f.manager.getSessionId()}:${id}`);
		const cold = new LiveFeed(f.manager); await cold.restore(feed.cut());
		assert.deepEqual(searchHistory(cold.events, "isError=true"), live);
	} finally { await f.dispose(); }
});

test("bounded parent batches retain exact cursors, restore without duplicates, and reject branch reuse", async () => {
	const manager = SessionManager.inMemory("/tmp");
	const a = manager.appendMessage(user("a".repeat(13000)));
	const b = manager.appendMessage(user("b".repeat(13000)));
	const feed = new LiveFeed(manager);
	const first = await feed.capture();
	assert.equal(first.events.length, 1); assert(first.more); assert.equal(first.cut.parent, a);
	const restored = new LiveFeed(manager); await restored.restore(first.cut);
	const second = await restored.capture();
	assert.equal(second.events.length, 1); assert(!second.more); assert.equal(second.cut.parent, b);
	assert.equal(restored.events.length, 2);
	assert.equal((await restored.capture()).events.length, 0);
	manager.branch(a); manager.appendMessage(user("A different branch."));
	await assert.rejects(() => new LiveFeed(manager).restore(second.cut), /selected branch/);
});

test("worker launch ownership, immutable fork boundary, partial tails, reload and late returns", async () => {
	const f = await workerFixture();
	try {
		const feed = new LiveFeed(f.manager), first = await feed.capture();
		assert.deepEqual(first.gaps, []);
		assert.equal(first.events.filter((e) => e.actor.startsWith("scout")).length, 1);
		assert(!JSON.stringify(first.events).includes("Parent history must"));
		const pending = JSON.stringify(entry("b", "Late worker return."));
		await appendFile(f.file, pending.slice(0, 20));
		assert.equal((await feed.capture()).events.length, 0);
		assert.equal(feed.cut().workers[0].offset, first.cut.workers[0].offset);
		await appendFile(f.file, pending.slice(20) + "\n");
		const restored = new LiveFeed(f.manager); await restored.restore(first.cut);
		assert(!restored.byRef.has("worker-one:b"));
		const late = await restored.capture();
		assert.equal(late.events.length, 1); assert.equal(late.events[0].ref, "worker-one:b");
		assert.match((await restored.lookup("worker-one:b")).text, /Late worker return/);
		f.manager.branch(f.root); f.manager.appendMessage(user("Unrelated branch."));
		const other = await new LiveFeed(f.manager).capture();
		assert.equal(other.cut.workers.length, 0, "an owner pointer alone does not admit a sibling's worker");
	} finally { await f.dispose(); }
});

test("restore and lookup tolerate pi's in-memory entry mutation and a disk reload after a checkpoint", async () => {
	const cwd = await realpath(await mkdtemp(join(tmpdir(), "mom-mutation-")));
	try {
		const manager = SessionManager.create(cwd, join(cwd, "sessions"));
		manager.appendMessage(user("Preserve the original purpose."));
		const cited = manager.appendMessage({ role: "toolResult", toolCallId: "t1", toolName: "bash", isError: false,
			content: [{ type: "text", text: "mutation-proof output" }], timestamp: Date.now() });
		manager.appendMessage(assistant([{ type: "toolCall", id: "t1", name: "bash", arguments: { command: "echo mutation-proof" } }]));
		const feed = new LiveFeed(manager);
		await feed.capture();
		const ref = `${manager.getSessionId()}:${cited}`;
		assert.match((await feed.lookup(ref)).text, /mutation-proof output/);
		// Pi legitimately mutates its in-memory tree (context edits, compaction) after a checkpoint.
		const entry = manager.getEntry(cited)! as { message: Record<string, unknown> };
		entry.message = { ...entry.message, mutatedAtRuntime: true };
		const cut = feed.cut();
		const restored = new LiveFeed(manager);
		await restored.restore(cut);
		assert.match((await restored.lookup(ref)).text, /mutation-proof output/);
		// The durable axis: reopening the session file from disk restores without a re-serialization gate.
		const file = manager.getSessionFile()!;
		const cold = new LiveFeed(SessionManager.open(file));
		await cold.restore(cut);
		assert.match((await cold.lookup(ref)).text, /mutation-proof output/);
		assert.equal((await cold.capture()).events.length, 0);
	} finally { await rm(cwd, { recursive: true, force: true }); }
});

test("source mutation and missing linked worker are explicit failures, not empty success", async () => {
	const f = await workerFixture();
	try {
		const feed = new LiveFeed(f.manager), batch = await feed.capture();
		await writeFile(f.file, line({ type: "session", id: "worker-one", version: 3, cwd: f.cwd, timestamp: stamp }) + line(entry("inherited", "Parent history must not be repeated.")) + line(entry("a", "Modified worker finding.")));
		await assert.rejects(() => feed.lookup("worker-one:a"), /changed/);
		await assert.rejects(() => new LiveFeed(f.manager).restore(batch.cut), /changed/);
		await rm(f.file);
		const missing = await new LiveFeed(f.manager).capture();
		assert.equal(missing.gaps.length, 1); assert.match(missing.gaps[0], /ENOENT/);
	} finally { await f.dispose(); }
});
