// Cold catch-up: a long backlog must cost ONE bounded Mom proposal over a chapter-chain
// compression, not one proposal per 24,000-character capture window — while coverage, source
// citations, and checkpoint/cursor safety stay exactly as honest as before.
import assert from "node:assert/strict";
import { join } from "node:path";
import { rmSync } from "node:fs";
import { test } from "node:test";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { provider, sandbox } from "../../pi-delegate/test/fixture.ts";
import { Mom } from "../src/mother.ts";
import { DEFAULT_BOOTSTRAP_POLICY, chapterDigest, segmentChapters, type BootstrapPolicy } from "../src/bootstrap.ts";
import { SidecarStore } from "../src/sidecar.ts";
import { input, isMomRequest, replacement } from "./fixture.ts";

type Lane = Awaited<ReturnType<typeof coldMom>>;

/** Build a long synthetic backlog on one branch: many turns, several compaction boundaries. */
function longSession(dir: string, turns: number, compactionEvery: number) {
	const manager = SessionManager.create(dir, dir);
	const usage = { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
	for (let turn = 0; turn < turns; turn++) {
		manager.appendMessage({ role: "user", content: [{ type: "text", text: `Turn ${turn}: keep the release work moving and record the decision with its source.` }], timestamp: Date.now() });
		manager.appendMessage({ role: "assistant", api: "openai-completions", provider: "fixture", model: "fixture", stopReason: "stop", usage,
			content: [{ type: "text", text: `Assistant reply for turn ${turn}. Tool metadata follows but carries no payload here.` }], timestamp: Date.now() });
		if (turn % compactionEvery === compactionEvery - 1) {
			const firstKept = manager.getBranch().findLast((entry: any) => entry.type === "message" && entry.message?.role === "assistant")!.id;
			manager.appendCompaction(`Chapter closes after turn ${turn}; the release work continues.`, firstKept, 100);
		}
	}
	return manager;
}

async function coldMom(policy: BootstrapPolicy, manager: SessionManager, options: { failFirstMapCursor?: boolean } = {}) {
	const api = await provider(), box = sandbox(api.url);
	process.env.HOME = box.root; process.env.PI_CODING_AGENT_DIR = box.agentDir;
	const sdk = await import("@earendil-works/pi-coding-agent");
	const runtime = await sdk.ModelRuntime.create({ authPath: join(box.agentDir, "auth.json"), modelsPath: join(box.agentDir, "models.json"), allowModelNetwork: false, refreshOnCreate: false });
	const modelRegistry = new sdk.ModelRegistry(runtime);
	const requests: any[] = [];
	api.onUnscripted(request => {
		requests.push(request);
		if (!isMomRequest(request)) return { text: "Lead continued." };
		if (options.failFirstMapCursor && requests.filter(isMomRequest).length > 1) {
			const body = input(request);
			return { tool: { name: "commit_graph", arguments: { revision: body.graph.revision, purpose: body.graph.purpose, focus: body.graph.focus,
				upsertNodes: [], upsertEdges: [], removeEdges: [], merges: [], folds: [], removeNodes: [], supersessions: [], unfinished: [], note: null, resolutions: [] } } };
		}
		return replacement(request);
	});
	const durable = new SidecarStore(() => `${manager.getSessionFile()}.mom`, manager.getSessionId());
	let mapCursorWrites = 0;
	const store: any = options.failFirstMapCursor ? {
		load: () => durable.load(),
		append: async (type: any, data: any) => {
			if (type === "map" && data.base !== undefined && mapCursorWrites++ === 0) throw new Error("Injected mid-drain cursor failure");
			return durable.append(type, data);
		},
	} : durable;
	const mom = new Mom({ ctx: { sessionManager: manager, modelRegistry } as any, model: "fixture/fixture", store, current: () => true, changed() {}, bootstrapPolicy: policy });
	return { api, box, mom, requests,
		async close() { mom.close(); await api.close(); rmSync(box.root, { recursive: true, force: true }); } };
}

const consumedEntries = (manager: SessionManager, cutParent: string | null) => manager.getBranch().findIndex(entry => entry.id === cutParent) + 1;

test("a long cold backlog is caught up by ONE bounded proposal, not one per capture window", { timeout: 60000 }, async () => {
	const dir = `/tmp/mom-bootstrap-${process.pid}-${Date.now()}`;
	const manager = longSession(dir, 1600, 40); // 40 compaction chapters, far beyond one 24k window
	let lane: Lane | undefined;
	try {
		lane = await coldMom(DEFAULT_BOOTSTRAP_POLICY, manager);
		const mom = lane.mom;
		const windows: number[] = [];
		const feed = mom.feed as any, original = feed.capture.bind(feed);
		feed.capture = async (limit?: number, defer?: boolean) => { const result = await original(limit, defer); windows.push(result.events.length); return result; };
		await mom.open();
		await mom.update();
		assert.ok(windows.length > 1, `the harness needed more than one capture window: ${windows.length}`);
		assert.ok(mom.usage.calls <= 2, `bootstrap must cost at most one proposal plus one repair, cost ${mom.usage.calls} calls across ${windows.length} windows`);
		assert.equal(mom.error, undefined, "bootstrap completes without an error");
		// The proposal actually carried the compression, not a raw slice.
		const body = input(lane.requests.filter(isMomRequest).at(-1)!);
		assert.match(body.newEvents, /^BOOTSTRAP CHAPTER CHAIN/);
		// Coverage is exactly the drained evidence: never more, and never claimed silently.
		const branch = manager.getBranch();
		const consumed = consumedEntries(manager, mom.checkpoint!.cut.parent);
		assert(consumed > 0 && consumed <= branch.length, `coverage claims exactly the processed evidence: ${consumed} of ${branch.length}`);
		if (consumed < branch.length) assert.equal(mom.more, true, "unprocessed evidence is reported as still pending");
		for (const node of mom.checkpoint!.graph.nodes) for (const source of node.sources) assert(mom.feed.byRef.has(source), `citation ${source} must resolve`);
		// Cursor safety: cold reopen restores the same checkpoint and consumes nothing new.
		const saved = mom.checkpoint, savedId = mom.checkpointId;
		mom.close();
		let reopened: Lane | undefined;
		try {
			reopened = await coldMom(DEFAULT_BOOTSTRAP_POLICY, manager);
			await reopened.mom.open();
			assert.deepEqual(reopened.mom.checkpoint, saved);
			assert.equal(reopened.mom.checkpointId, savedId);
			// Reopen resumes at the durable cursor: it never replays evidence that the saved
			// checkpoint already consumed. A remaining backlog legitimately continues after reopen.
			const callsBefore = reopened.requests.filter(isMomRequest).length;
			const consumedBefore = consumedEntries(manager, saved!.cut.parent);
			await reopened.mom.update();
			const consumedAfter = consumedEntries(manager, reopened.mom.checkpoint!.cut.parent);
			assert(consumedAfter >= consumedBefore, "reopen never rewinds coverage");
			const resumed = reopened.requests.filter(isMomRequest).length;
			if (resumed > callsBefore) {
				const body = input(reopened.requests.filter(isMomRequest).at(-1)!);
				// Every direction the resumed digest cites must lie at or after the durable cut.
				const cited = [...body.newEvents.matchAll(/\[src:([^\]]+)\]/g)].map(m => m[1]);
				assert(cited.length > 0, "the resumed digest cites evidence");
				const indexOf = (ref: string) => manager.getBranch().findIndex(e => e.id === ref.slice(ref.lastIndexOf(":") + 1).replace(/:b\d+$/, ""));
				for (const ref of cited) {
					const at = indexOf(ref);
					if (at >= 0) assert(at >= consumedBefore - 1, `resumed digest must not cite evidence before the durable cut: ${ref}`);
				}
			}
		} finally { await reopened?.close(); }
	} finally { await lane?.close(); }
});

test("the bounded policy is explicit and never claims coverage beyond the digest", { timeout: 60000 }, async () => {
	const dir = `/tmp/mom-bootstrap-policy-${process.pid}-${Date.now()}`;
	const manager = longSession(dir, 1600, 40);
	let lane: Lane | undefined;
	try {
		lane = await coldMom({ ...DEFAULT_BOOTSTRAP_POLICY, maxChapters: 2 }, manager);
		await lane.mom.open();
		await lane.mom.update();
		assert(lane.mom.usage.calls <= 2, "the bounded policy still costs one bounded proposal");
		const consumed = consumedEntries(manager, lane.mom.checkpoint!.cut.parent);
		assert(consumed < manager.getBranch().length, "coverage stops at the policy bound and the rest is still pending");
		assert.equal(lane.mom.more, true, "remaining evidence is reported as still pending, not claimed");
	} finally { await lane?.close(); }
});

test("chapter segmentation and the digest are deterministic and carry pointers", () => {
	const events = [
		{ ref: "s0:a1", at: "", actor: "lead", kind: "user", text: "Ship the release safely." },
		{ ref: "s0:a2", at: "", actor: "lead", kind: "assistant", text: "Working." },
		{ ref: "s0:a3", at: "", actor: "lead", kind: "compaction", claim: "Release chapter closed." },
		{ ref: "s0:a4", at: "", actor: "lead", kind: "user", text: "Now investigate the failing upload." },
	] as any;
	const chapters = segmentChapters(events);
	assert.equal(chapters.length, 2, "a compaction entry closes its chapter");
	assert.equal(chapters[0].directions[0]?.ref, "s0:a1");
	assert.equal(chapters[1].directions[0]?.ref, "s0:a4");
	assert.equal(chapters.at(-1)!.endRef, "s0:a4");
	const digest = chapterDigest(chapters, DEFAULT_BOOTSTRAP_POLICY)!;
	assert.match(digest, /BOOTSTRAP CHAPTER CHAIN/);
	assert.match(digest, /\[src:s0:a1\] Ship the release safely\./);
	assert.match(digest, /\[src:s0:a4\] Now investigate the failing upload\./);
	assert.match(digest, /CLAIM Release chapter closed\./);
});

test("chapter schema preserves closing state, provisional diagnosis, file dedupe, and bounded fallback", () => {
	const events: any[] = [
		{ ref: "s:u", at: "", actor: "lead", kind: "user", text: "Investigate." },
		{ ref: "s:t1", at: "", actor: "lead", kind: "todo", text: "pend: First state" },
		{ ref: "s:t2", at: "", actor: "lead", kind: "todo", text: "comp: Final state" },
		...Array.from({ length: 14 }, (_, i) => ({ ref: `s:f${i}`, at: "", actor: "lead", kind: "file_op", name: "write", text: `/repo/f${i}.ts` })),
		{ ref: "s:f-again", at: "", actor: "lead", kind: "file_op", name: "write", text: "/repo/f0.ts" },
		{ ref: "s:c", at: "", actor: "lead", kind: "compaction", claim: "OpenAI remote compaction applied for provider." },
		{ ref: "s:a", at: "", actor: "lead", kind: "assistant", text: "No active sidecar has been written today; the archived file is obsolete." },
	];
	const chapters = segmentChapters(events);
	assert.equal(chapters[0].lastTodo?.ref, "s:t2");
	assert.equal(chapters[0].files.length, 14, "paths are deduplicated");
	assert.equal(chapters[0].files[0].operations.get("write"), 2, "operation counts are retained");
	const digest = chapterDigest(chapters, DEFAULT_BOOTSTRAP_POLICY)!;
	assert.match(digest, /TODO@end \[src:s:t2\] comp: Final state/);
	assert.doesNotMatch(digest, /First state/);
	assert.match(digest, /CLAIM\(placeholder — no content\)/);
	assert.match(digest, /file \[src:s:f0\] \/repo\/f0\.ts \(write×2\)/);
	assert.match(digest, /file \[src:s:f13\] \/repo\/f13\.ts \(write×1\)/, "under budget every touched file is listed");
	assert.match(digest, /last assistant text \[src:s:a\] No active sidecar/);
	assert.equal(chapterDigest(chapters, { ...DEFAULT_BOOTSTRAP_POLICY, maxDigestChars: 100 }), undefined);
	const trimmed = chapterDigest(chapters, { ...DEFAULT_BOOTSTRAP_POLICY, maxDigestChars: 4000 })!;
	assert.equal((trimmed.match(/^Chapter /gm) ?? []).length, 2, "detail is trimmed before any chapter is dropped");
});

test("a budgeted chapter drops old directions and files before its frontier, and says what it omitted", () => {
	const events: any[] = [
		...Array.from({ length: 12 }, (_, i) => ({ ref: `s:u${i}`, at: "", actor: "lead", kind: "user", text: `Direction number ${i} ${"x".repeat(150)}` })),
		...Array.from({ length: 6 }, (_, i) => ({ ref: `s:f${i}`, at: "", actor: "lead", kind: "file_op", name: "edit", text: `/repo/file-${i}.ts` })),
		{ ref: "s:a0", at: "", actor: "lead", kind: "assistant", text: "Earlier assistant note." },
		{ ref: "s:a1", at: "", actor: "lead", kind: "assistant", text: "Final diagnosis: nothing is written." },
	];
	const [chapter] = segmentChapters(events);
	const digest = chapterDigest([chapter], { ...DEFAULT_BOOTSTRAP_POLICY, maxDigestChars: 1700 })!;
	assert.match(digest, /first direction \[src:s:u0\]/);
	assert.match(digest, /last direction \[src:s:u11\]/);
	assert.match(digest, /last assistant text \[src:s:a1\] Final diagnosis/);
	assert.match(digest, /direction \[src:s:u10\]/, "the most recent middle direction survives before older ones");
	assert.doesNotMatch(digest, /\[src:s:u1\]/, "the oldest middle direction is dropped first");
	assert.match(digest, /recent assistant text \[src:s:a0\] Earlier assistant note/, "the frontier chapter keeps its recent assistant texts");
	assert.match(digest, /… \d+ lead directions, \d+ files touched omitted for budget/);
	assert.ok(digest.length <= 1700, `digest ${digest.length} chars stays within budget`);
});

test("chapter budget is fair-shared by demand: a small chapter keeps its block, the heavy one takes the surplus", () => {
	const small: any[] = [{ ref: "a:u", at: "", actor: "lead", kind: "user", text: "Small." }, { ref: "a:c", at: "", actor: "lead", kind: "compaction", claim: "done" }];
	const big: any[] = Array.from({ length: 40 }, (_, i) => ({ ref: `b:u${i}`, at: "", actor: "lead", kind: "user", text: `Big direction ${i} ${"y".repeat(400)}` }));
	const chapters = segmentChapters([...small, ...big]);
	const digest = chapterDigest(chapters, { ...DEFAULT_BOOTSTRAP_POLICY, maxDigestChars: 12000 })!;
	const [, bigBlock] = digest.split(/^Chapter 2 /m);
	assert.ok(bigBlock.length > 6000, `the heavy chapter receives most of the budget (${bigBlock.length} chars)`);
	assert.match(digest, /CLAIM done/);
});

test("a single-window backlog keeps the ordinary path: no compression, no bootstrap", { timeout: 60000 }, async () => {
	const dir = `/tmp/mom-bootstrap-small-${process.pid}-${Date.now()}`;
	const manager = SessionManager.create(dir, dir);
	manager.appendMessage({ role: "user", content: [{ type: "text", text: "Keep the release safe." }], timestamp: Date.now() });
	manager.appendMessage({ role: "assistant", api: "openai-completions", provider: "fixture", model: "fixture", stopReason: "stop", usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, content: [{ type: "text", text: "Noted." }], timestamp: Date.now() });
	let lane: Lane | undefined;
	try {
		lane = await coldMom(DEFAULT_BOOTSTRAP_POLICY, manager);
		await lane.mom.open();
		await lane.mom.update();
		assert.equal(lane.mom.error, undefined);
		assert.equal(lane.mom.checkpoint?.graph.nodes.length, 1);
		const body = input(lane.requests.filter(isMomRequest).at(-1)!);
		assert.doesNotMatch(body.newEvents, /^BOOTSTRAP CHAPTER CHAIN/, "a backlog that fits one window is never compressed");
		assert.equal(lane.mom.usage.calls, 1, "the ordinary path is unchanged");
	} finally { await lane?.close(); }
});

test("a 40-chapter backlog drains across passes in a bounded proposal count, never per window", { timeout: 90000 }, async () => {
	const dir = `/tmp/mom-bootstrap-multipass-${process.pid}-${Date.now()}`;
	const manager = longSession(dir, 3200, 80); // 40 compaction chapters, well past one window
	let lane: Lane | undefined;
	try {
		// maxChapters 12 forces a multi-pass drain: no single digest may swallow 40 chapters.
		lane = await coldMom({ ...DEFAULT_BOOTSTRAP_POLICY, maxChapters: 12 }, manager);
		const mom = lane.mom;
		const windows: number[] = [];
		const feed = mom.feed as any, original = feed.capture.bind(feed);
		feed.capture = async (limit?: number, defer?: boolean) => { const result = await original(limit, defer); windows.push(result.events.length); return result; };
		await mom.open();
		// Drain to completion, exactly as the extension loop does, counting real proposals.
		const passes: { digest: boolean; cut: string | null; consumed: number; more: boolean }[] = [];
		for (let guard = 0; guard < 12; guard++) {
			const before = lane.requests.filter(isMomRequest).length;
			await mom.update();
			const made = lane.requests.filter(isMomRequest).slice(before);
			for (const request of made) {
				const body = input(request);
				passes.push({ digest: body.newEvents.startsWith("BOOTSTRAP CHAPTER CHAIN"),
					cut: mom.checkpoint!.cut.parent, consumed: consumedEntries(manager, mom.checkpoint!.cut.parent), more: mom.more });
			}
			if (!mom.more && !mom.error) break; // drained
		}
		assert.ok(passes.length > 1, "the backlog must drain across multiple passes");
		assert.ok(windows.length > passes.length, `windows (${windows.length}) must far exceed proposals (${passes.length})`);
		// Every bounded-backlog pass uses the digest; only a final remainder that fits inside a
		// single window may legitimately take the ordinary path.
		const ordinary = passes.filter(p => !p.digest);
		assert.ok(ordinary.length <= 1, `only a single-window tail may skip the digest, got ${ordinary.length}`);
		assert.ok(passes.slice(0, -1).every(p => p.digest), "every pass that carries a backlog uses the chapter digest, including continuation after a checkpoint exists");
		assert.ok(passes.length <= 4, `a 40-chapter backlog must drain in at most 4 proposals, took ${passes.length}`);
		assert(passes.slice(0, -1).every(p => p.more), "every non-final pass reports more=true");
		assert.equal(passes.at(-1)!.more, false, "the final pass drains the backlog");
		// Exact cut/cursor safety: each cut is a real branch entry, strictly advancing, never ahead.
		const branch = manager.getBranch();
		for (const pass of passes) {
			assert(pass.cut !== null && branch.some(entry => entry.id === pass.cut), "each cut is a real session entry id");
			assert(pass.consumed > 0 && pass.consumed <= branch.length, "coverage never exceeds processed evidence");
		}
		for (let i = 1; i < passes.length; i++) assert(passes[i].consumed > passes[i - 1].consumed, "the cursor advances monotonically across passes");
		assert.equal(passes.at(-1)!.consumed, branch.length, "the last pass claims exactly the processed evidence");
		for (const node of mom.checkpoint!.graph.nodes) for (const source of node.sources) assert(mom.feed.byRef.has(source), `citation ${source} must resolve`);
	} finally { await lane?.close(); }
});

test("a failed mid-drain cursor write retains the prior cut and retry advances without skipping", { timeout: 90000 }, async () => {
	const dir = `/tmp/mom-bootstrap-midfail-${process.pid}-${Date.now()}`;
	const manager = longSession(dir, 3200, 80);
	let lane: Lane | undefined;
	try {
		lane = await coldMom({ ...DEFAULT_BOOTSTRAP_POLICY, maxChapters: 12 }, manager, { failFirstMapCursor: true });
		const mom = lane.mom;
		await mom.open();
		await mom.update(); // first pass accepted
		const first = mom.checkpoint, savedCursor = mom.checkpoint!.cut.parent;
		let writeFailed = false;
		try { await mom.update(); } catch { writeFailed = true; }
		assert(writeFailed, "the injected cursor write fails after the proposal");
		assert.strictEqual(mom.checkpoint, first, "a failed durable write keeps the prior checkpoint in memory");
		assert.equal(mom.checkpoint!.cut.parent, savedCursor, "a failed write does not advance the durable cut");
		await mom.update(); // retry the still-unconsumed batch
		assert(mom.checkpoint!.cut.parent !== savedCursor, "the retry advances after the injected failure clears");
		const branch = manager.getBranch();
		const consumed = consumedEntries(manager, mom.checkpoint!.cut.parent);
		assert(consumed > 0 && consumed <= branch.length, "coverage never exceeds processed evidence");
		for (const node of mom.checkpoint!.graph.nodes) for (const source of node.sources) assert(mom.feed.byRef.has(source), `citation ${source} must resolve`);
	} finally { await lane?.close(); }
});

test("continuation digests only fresh evidence and the chapter target is honest about overshoot", { timeout: 90000 }, async () => {
	const dir = `/tmp/mom-bootstrap-fresh-${process.pid}-${Date.now()}`;
	const manager = longSession(dir, 3200, 80); // 40 chapters
	let lane: Lane | undefined;
	try {
		lane = await coldMom({ ...DEFAULT_BOOTSTRAP_POLICY, maxChapters: 12 }, manager);
		const mom = lane.mom;
		await mom.open();
		const branch = manager.getBranch();
		const consumed = () => branch.findIndex(e => e.id === mom.checkpoint!.cut.parent) + 1;
		await mom.update(); // pass 1
		const cutAfterPass1 = consumed();
		const pass1 = lane.requests.filter(isMomRequest).length;
		assert(mom.more, "the backlog is not exhausted");
		await mom.update(); // pass 2: must digest ONLY what pass 1 left
		const pass2 = lane.requests.filter(isMomRequest).length;
		assert.equal(pass2, pass1 + 1, "the continuation is exactly one proposal");
		const body = input(lane.requests.filter(isMomRequest).at(-1)!);
		const cited = [...body.newEvents.matchAll(/\[src:([^\]]+)\]/g)].map(m => m[1]);
		assert(cited.length > 0, "the continuation digest cites evidence");
		const chaptersInPass2 = (body.newEvents.match(/Chapter \d+/g) ?? []).length;
		assert(chaptersInPass2 > 0, "the continuation digest describes fresh chapters");
		// Freshness: no cited ref may lie before the pass-1 cut.
		const refIndex = (ref: string) => branch.findIndex(e => e.id === ref.slice(ref.lastIndexOf(":") + 1).replace(/:b\d+$/, ""));
		for (const ref of cited) {
			const at = refIndex(ref);
			if (at >= 0) assert(at >= cutAfterPass1 - 1, `continuation replayed consumed evidence: ${ref}`);
		}
		// Target honesty: emitted chapters never exceed the target by more than the crossing window's
		// own chapters, and the overshoot is reported rather than hidden.
		assert(chaptersInPass2 <= 12 + 4, `target 12 must not be exceeded by an unbounded amount (got ${chaptersInPass2})`);
		assert(mom.error === undefined, "the continuation completes");
	} finally { await lane?.close(); }
});
