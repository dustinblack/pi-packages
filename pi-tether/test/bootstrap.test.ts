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

async function coldMom(policy: BootstrapPolicy, manager: SessionManager) {
	const api = await provider(), box = sandbox(api.url);
	process.env.HOME = box.root; process.env.PI_CODING_AGENT_DIR = box.agentDir;
	const sdk = await import("@earendil-works/pi-coding-agent");
	const runtime = await sdk.ModelRuntime.create({ authPath: join(box.agentDir, "auth.json"), modelsPath: join(box.agentDir, "models.json"), allowModelNetwork: false, refreshOnCreate: false });
	const modelRegistry = new sdk.ModelRegistry(runtime);
	const requests: any[] = [];
	api.onUnscripted(request => { requests.push(request); return isMomRequest(request) ? replacement(request) : { text: "Lead continued." }; });
	const store = new SidecarStore(() => `${manager.getSessionFile()}.mom`, manager.getSessionId());
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
			// Reopen resumes at the durable cursor: it never replays the evidence the drain consumed.
			const callsBefore = reopened.requests.filter(isMomRequest).length;
			await reopened.mom.update();
			const resumed = reopened.requests.filter(isMomRequest).length;
			if (resumed > callsBefore) {
				const body = input(reopened.requests.filter(isMomRequest).at(-1)!);
				assert.doesNotMatch(body.newEvents, /Turn 0:/, "processed evidence is not replayed after reopen");
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
		{ ref: "s0:a3", at: "", actor: "lead", kind: "compaction" },
		{ ref: "s0:a4", at: "", actor: "lead", kind: "user", text: "Now investigate the failing upload." },
	] as any;
	const chapters = segmentChapters(events);
	assert.equal(chapters.length, 2, "a compaction entry closes its chapter");
	assert.equal(chapters[0].firstDirection?.ref, "s0:a1");
	assert.equal(chapters[1].firstDirection?.ref, "s0:a4");
	assert.equal(chapters.at(-1)!.endRef, "s0:a4");
	const digest = chapterDigest(chapters, DEFAULT_BOOTSTRAP_POLICY)!;
	assert.match(digest, /BOOTSTRAP CHAPTER CHAIN/);
	assert.match(digest, /\[src:s0:a1\] Ship the release safely\./);
	assert.match(digest, /\[src:s0:a4\] Now investigate the failing upload\./);
	assert.match(digest, /compaction\(s\) closed this chapter/);
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
