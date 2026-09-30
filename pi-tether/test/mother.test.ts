import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { setup, replacement, input, isMomRequest, deferred, readSidecar } from "./fixture.ts";
import { CORRECTION } from "../src/feed.ts";
import { SidecarStore } from "../src/sidecar.ts";
import { CONTEXT_LIMIT } from "../src/mother.ts";
import { MOM_PROMPT } from "../src/contract.ts";
import type { SessionScreenInput } from "../src/advisor.ts";

const checkpoints = async (h: Awaited<ReturnType<typeof setup>>) => (await readSidecar(h)).filter(r => r.type === "map" && r.data.snapshot);
const stateHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const screenResult = (needsUpdate: number, threshold = 0.7, latencyMs = 4) => ({ status: "screened" as const, model: "kev-test",
	needsUpdate, wake: needsUpdate >= threshold, usage: { input: 24, output: 3 }, latencyMs });

test("fresh Mom contexts checkpoint automatically observed narrative and recover without replay calls", { timeout: 15000 }, async () => {
	const h = await setup();
	let mom = h.createMom();
	try {
		await h.runtime.session.prompt("Preserve the original purpose. Do not delete user files.");
		await mom.open(); await mom.update();
		assert.equal((await checkpoints(h)).length, 1);
		const first = mom.checkpoint!, coldHash = stateHash({ graph: first.graph, cut: first.cut });
		assert(mom.graph.nodes.every(node => node.sources.length > 0));
		mom.close(); mom = h.createMom(); await mom.open();
		assert.deepEqual(mom.checkpoint, first);
		assert.equal(stateHash({ graph: mom.checkpoint?.graph, cut: mom.checkpoint?.cut }), coldHash, "cold reopen restores the identical map and consumed cursor hash");
		await mom.update(); assert.equal(h.requests().length, 1, "restore with no narrative delta costs no model call");
		await h.runtime.session.prompt("Also investigate the failing route; return to the original purpose.");
		await mom.update();
		assert.equal(h.requests().length, 2);
		const body = input(h.requests()[1]);
		assert.equal(body.userHistory, undefined, "the session log is not reconstructed into every update");
		assert.match(body.contextBeforeBatch, /lead assistant/);
		assert.match(body.newEvents, /\[src:[^\]]+\].*lead user/s);
		assert.match(body.newEvents, /Also investigate the failing route/);
		assert.equal(body.userDirections, undefined, "new narrative is evidence, not a message-accounting ledger");
		assert.equal(h.requests()[1].messages.length, 2, "no growing Mom conversation");
		assert(!h.requests()[1].tools.some((t: any) => ["bash", "edit", "write", "delegate", "tether"].includes(t.function.name)));
		assert.equal(mom.usage.calls, 2);
		assert.deepEqual(h.errors, []); assert.deepEqual(h.api.errors, []);
	} finally { mom.close(); await h.close(); }
});

test("without a configured advisor every settled update behaves exactly as before", { timeout: 15000 }, async () => {
	const h = await setup();
	const mom = h.createMom();
	try {
		await h.runtime.session.prompt("Preserve this goal."); await mom.open(); await mom.update();
		assert.equal(h.requests().length, 1);
		assert.equal(mom.detail().screen, undefined, "an unconfigured advisor leaves no screen receipt");
		await h.runtime.session.prompt("Add routine progress to the same goal."); await mom.update();
		assert.equal(h.requests().length, 2, "unconfigured behavior still wakes Mom's model on every settled update");
		assert.equal(mom.detail().screen, undefined);
		assert.deepEqual(h.errors, []); assert.deepEqual(h.api.errors, []);
	} finally { mom.close(); await h.close(); }
});

test("a no-movement screen accepts the batch as unchanged state with zero Mom model calls", { timeout: 15000 }, async () => {
	const h = await setup(); const screens: SessionScreenInput[] = [];
	const advisor = { model: "kev-test", threshold: 0.7, async screen(value: SessionScreenInput) {
		screens.push(value); return screenResult(0.12);
	} };
	let mom = h.createMom({ advisor });
	try {
		await h.runtime.session.prompt("Preserve this goal."); await mom.open(); await mom.update();
		assert.equal(screens.length, 0, "bootstrap without a saved map never screens");
		assert.equal(h.requests().length, 1);
		const first = mom.checkpoint!, firstId = mom.checkpointId, graphHash = stateHash(first.graph);
		await h.runtime.session.prompt("Routine mechanical progress on the same goal.");
		await mom.update();
		assert.equal(screens.length, 1, "one whole-batch screen per settled update");
		assert.match(screens[0].newEvidence, /Routine mechanical progress/);
		assert.match(screens[0].contextBeforeBatch ?? "", /lead assistant/);
		assert.equal(screens[0].pendingMore, false);
		assert.deepEqual(screens[0].unresolvedProcessRisks, []);
		assert.deepEqual(screens[0].current, first.graph, "the screen sees the saved current map");
		assert.equal(h.requests().length, 1, "a screened-out batch makes zero Mom model calls");
		assert.equal(stateHash(mom.checkpoint!.graph), graphHash, "the graph is retained unchanged");
		assert.equal(mom.checkpointId, firstId, "coverage layers over the same snapshot instead of duplicating it");
		assert.equal(mom.checkpoint!.note, first.note, "the pending notice is retained");
		assert.deepEqual(mom.checkpoint!.unfinished, first.unfinished, "unfinished work is retained");
		const receipt = mom.detail().screen;
		if (!receipt || receipt.status !== "screened") throw new Error("expected a screened receipt");
		assert.equal(receipt.wake, false); assert.equal(receipt.model, "kev-test");
		assert.deepEqual(receipt.usage, { input: 24, output: 3 }); assert.equal(receipt.latencyMs, 4);
		const records = await readSidecar(h);
		const progress = records.filter(r => r.type === "map" && r.data.cut && !r.data.snapshot);
		assert.equal(progress.length, 1, "one compact cursor patch, no new snapshot");
		assert.equal(progress[0].data.base, firstId);
		assert.equal(progress[0].data.screen.status, "screened");
		assert.equal(progress[0].data.screen.wake, false);
		assert.deepEqual(progress[0].data.screen.usage, { input: 24, output: 3 });
		assert.equal(progress[0].data.screen.latencyMs, 4);
		assert.equal(records.filter(r => r.type === "usage").length, 1, "screen usage never enters Mom's model usage stream");
		const acceptedCut = structuredClone(mom.checkpoint!.cut);
		mom.close(); await h.runtime.session.reload(); mom = h.createMom({ advisor }); await mom.open();
		assert.deepEqual(mom.checkpoint?.cut, acceptedCut, "coverage advanced durably across cold reopen");
		assert.equal(stateHash(mom.checkpoint!.graph), graphHash, "the retained graph is cold-stable");
		const coldReceipt = mom.detail().screen;
		if (!coldReceipt || coldReceipt.status !== "screened") throw new Error("the screen receipt must survive cold reopen");
		assert.equal(coldReceipt.wake, false);
		const calls = h.requests().length;
		await mom.update();
		assert.equal(h.requests().length, calls, "durable coverage is not replayed");
		assert.equal(screens.length, 1, "no pending batch means no second screen");
	} finally { mom.close(); await h.close(); }
});

test("a movement screen wakes Mom's model exactly once and keeps its receipt with the map", { timeout: 15000 }, async () => {
	const h = await setup(); let screens = 0;
	const mom = h.createMom({ advisor: { model: "kev-test", threshold: 0.7, async screen() {
		screens++; return screenResult(0.93, 0.7, 11);
	} } });
	try {
		await h.runtime.session.prompt("Preserve this goal."); await mom.open(); await mom.update();
		assert.equal(screens, 0); assert.equal(h.requests().length, 1);
		await h.runtime.session.prompt("Change the goal to a different purpose."); await mom.update();
		assert.equal(screens, 1, "one screen per settled batch");
		assert.equal(h.requests().length, 2, "movement costs exactly one Mom model call");
		const receipt = mom.detail().screen;
		if (!receipt || receipt.status !== "screened") throw new Error("expected a screened receipt");
		assert.equal(receipt.wake, true); assert.equal(receipt.needsUpdate, 0.93);
		const snapshot = (await readSidecar(h)).filter(r => r.type === "map" && r.data.snapshot).at(-1)!;
		assert.equal(snapshot.data.screen.status, "screened");
		assert.equal(snapshot.data.screen.wake, true);
		assert.equal(snapshot.data.screen.latencyMs, 11);
		assert.equal(mom.usage.calls, 2, "the screen never adds or replaces a Mom model call");
		assert.equal((await readSidecar(h)).filter(r => r.type === "usage").length, 2, "Mom's own usage stream is untouched by screening");
	} finally { mom.close(); await h.close(); }
});

test("an unavailable, malformed, or timed-out screen fails open without a fake success", { timeout: 30000 }, async () => {
	for (const reason of ["Mom advisor is offline.", "Mom advisor returned an invalid screen answer.", "TimeoutError: the operation timed out"]) {
		const h = await setup(); let screens = 0;
		const mom = h.createMom({ advisor: { model: "kev-test", threshold: 0.7, async screen() {
			screens++; throw new Error(reason);
		} } });
		try {
			await h.runtime.session.prompt("Preserve this goal."); await mom.open(); await mom.update();
			await h.runtime.session.prompt("Routine progress after the screen failed."); await mom.update();
			assert.equal(screens, 1);
			assert.equal(h.requests().length, 2, "an unavailable screen never blocks a valid update");
			const receipt = mom.detail().screen;
			if (!receipt || receipt.status !== "unavailable") throw new Error(`${reason} must be reported as unavailable, never as screened`);
			assert.ok(receipt.error.includes(reason));
			assert(receipt.latencyMs >= 0);
			const stored = (await readSidecar(h)).filter(r => r.type === "map" && r.data.screen?.status === "unavailable").at(-1);
			assert.equal(stored?.data.screen.status, "unavailable", "the fail-open receipt is durable and diagnosable");
		} finally { mom.close(); await h.close(); }
	}
});

test("bootstrap, explicit questions, refresh, and user corrections all bypass the screen", { timeout: 30000 }, async () => {
	const h = await setup(); let screens = 0;
	const advisor = { model: "kev-test", threshold: 0.7, async screen() {
		screens++; return screenResult(0.99);
	} };
	let mom = h.createMom({ advisor });
	h.api.onUnscripted((request) => {
		if (!isMomRequest(request)) return { text: "Lead continued." };
		const body = input(request);
		return replacement(request, body.question ? { answer: `The goal stands. [src:${body.original.ref}]` } : {});
	});
	try {
		await h.runtime.session.prompt("Preserve this goal."); await mom.open(); await mom.update();
		assert.equal(screens, 0, "bootstrap without a saved map never screens");
		assert.match(String(await mom.update("Why preserve the goal?")), /goal stands/);
		assert.equal(screens, 0, "an explicit question is never suppressed");
		await h.runtime.session.prompt("Routine progress covered by an explicit refresh.");
		await mom.update(undefined, undefined, 0, true);
		assert.equal(screens, 0, "an explicit refresh is never suppressed");
		await h.runtime.session.prompt("Routine progress behind an explicit user correction.");
		h.runtime.session.sessionManager.appendCustomMessageEntry(CORRECTION, "Keep the original goal after the correction.", true, { origin: "user-command" });
		mom.close(); mom = h.createMom({ advisor }); await mom.open();
		await mom.update();
		assert.equal(screens, 0, "an explicit correction survives reload and is never suppressed");
		await h.runtime.session.prompt("Routine progress on an ordinary settled boundary.");
		await mom.update();
		assert.equal(screens, 1, "only the ordinary settled batch screens");
	} finally { mom.close(); await h.close(); }
});

test("pending failed-update and skipped-gap recovery are never screened", { timeout: 30000 }, async () => {
	const h = await setup(); let screens = 0, reject = true;
	const mom = h.createMom({ advisor: { model: "kev-test", threshold: 0.7, async screen() {
		screens++; return screenResult(0.99);
	} } });
	try {
		await h.runtime.session.prompt("Preserve this goal."); await mom.open(); await mom.update();
		assert.equal(screens, 0, "bootstrap bypass");
		h.api.onUnscripted((request) => {
			if (!isMomRequest(request)) return { text: "Lead continued." };
			const ref = input(request).original.ref;
			return reject ? replacement(request, { unfinished: [{ node: "main", label: "Main purpose", disposition: "carried", target: "main", sources: [ref] }] })
				: replacement(request);
		});
		await h.runtime.session.prompt("This range will fail deterministically.");
		await assert.rejects(() => mom.update(), /closes no endeavor/);
		assert.equal(screens, 1, "the ordinary batch screened before Mom's model ran");
		assert.equal(mom.failure?.failures, 1);
		await h.runtime.session.prompt("Newer evidence forces the pending recovery.");
		const calls = h.requests().length;
		await assert.rejects(() => mom.update(), /closes no endeavor/);
		assert.equal(screens, 1, "a pending failed-update recovery is never screened");
		assert.equal(h.requests().length, calls + 2, "recovery runs without a screen");
		assert.equal(mom.gaps.length, 1);
		reject = false;
		await mom.update(undefined, undefined, 0, true);
		assert.equal(screens, 1, "skipped-gap recovery is never screened");
		assert.equal(mom.gaps.length, 0);
	} finally { mom.close(); await h.close(); }
});

test("an aborted screen stops the update before any Mom call or state write", { timeout: 15000 }, async () => {
	const h = await setup(), arrived = deferred();
	const mom = h.createMom({ advisor: { model: "kev-test", threshold: 0.7, async screen(_value: SessionScreenInput, signal?: AbortSignal) {
		arrived.resolve();
		await new Promise<void>((_done, fail) => {
			const abort = () => fail(new Error("screen aborted"));
			if (signal?.aborted) abort(); else signal?.addEventListener("abort", abort, { once: true });
		});
		return screenResult(0.05);
	} } });
	try {
		await h.runtime.session.prompt("Preserve this goal."); await mom.open(); await mom.update();
		const before = mom.checkpoint, controller = new AbortController();
		await h.runtime.session.prompt("Routine progress under an aborted screen.");
		const work = mom.update(undefined, controller.signal);
		await arrived.promise;
		controller.abort();
		await assert.rejects(() => work, /screen aborted/);
		assert.equal(mom.checkpoint, before, "an aborted screen publishes nothing");
		assert.equal(h.requests().length, 1, "an aborted screen never reaches Mom's model");
		assert.equal((await readSidecar(h)).filter(r => r.type === "map" && r.data.cut && !r.data.snapshot).length, 0);
	} finally { mom.close(); await h.close(); }
});

test("a screen that resolves after the session went stale cannot publish a checkpoint", { timeout: 15000 }, async () => {
	const h = await setup(), gate = deferred<void>(), arrived = deferred(); let current = true;
	const mom = h.createMom({ current: () => current, advisor: { model: "kev-test", threshold: 0.7, async screen() {
		arrived.resolve(); await gate.promise; return screenResult(0.05);
	} } });
	try {
		await h.runtime.session.prompt("Preserve the old branch."); await mom.open(); await mom.update();
		const before = mom.checkpoint;
		await h.runtime.session.prompt("Routine progress on a superseded branch.");
		const work = mom.update();
		await arrived.promise; current = false; gate.resolve();
		await assert.rejects(() => work, /superseded/);
		assert.equal(mom.checkpoint, before, "a stale screen never moves coverage");
		assert.equal((await readSidecar(h)).filter(r => r.type === "map" && r.data.cut && !r.data.snapshot).length, 0);
		assert.equal(h.requests().length, 1, "a stale screen never reaches Mom's model");
	} finally { gate.resolve(); mom.close(); await h.close(); }
});

test("a failed cursor write after a no-movement screen retains evidence and never runs Mom", { timeout: 15000 }, async () => {
	const h = await setup(); let fail = false; const screens: SessionScreenInput[] = [];
	const durable = () => new SidecarStore(() => h.parent, h.runtime.session.sessionManager.getSessionId());
	const mom = h.createMom({ advisor: { model: "kev-test", threshold: 0.7, async screen(value: SessionScreenInput) {
		screens.push(value); return screenResult(0.12);
	} }, store: {
		load: async () => durable().load(),
		append: async (type, data) => {
			if (fail && type === "map" && data.base !== undefined) throw new Error("Injected cursor failure");
			return durable().append(type, data);
		},
	} });
	try {
		await h.runtime.session.prompt("Preserve this goal."); await mom.open(); await mom.update();
		const before = mom.checkpoint;
		await h.runtime.session.prompt("Routine progress whose cursor write fails."); fail = true;
		await assert.rejects(() => mom.update(), /could not advance her state beside the session.*Injected cursor failure/);
		assert.equal(mom.checkpoint, before, "coverage did not move on a failed write");
		assert.equal(screens.length, 1);
		assert.equal(h.requests().length, 1, "a storage failure is not a classifier failure: Mom's model still makes no call");
		assert.equal((await readSidecar(h)).filter(r => r.type === "map" && r.data.cut && !r.data.snapshot).length, 0);
		fail = false;
		await mom.update();
		assert.equal(h.requests().length, 1, "the retained batch re-screens instead of waking Mom");
		assert.equal(screens.length, 2);
		assert.match(screens[1].newEvidence, /cursor write fails/, "the unconsumed batch is retried intact");
		const progress = (await readSidecar(h)).filter(r => r.type === "map" && r.data.cut && !r.data.snapshot);
		assert.equal(progress.length, 1, "the retried batch lands exactly one cursor record");
		assert.equal(progress[0].data.screen.wake, false);
	} finally { mom.close(); await h.close(); }
});

test("a rejected background proposal gets one aggregated repair and background exposes commit_graph only", { timeout: 15000 }, async () => {
	const h = await setup(), mom = h.createMom(); let attempts = 0;
	try {
		await h.runtime.session.prompt("Preserve the original purpose.");
		h.api.onUnscripted((request) => {
			if (!isMomRequest(request)) return { text: "Lead continued." };
			assert.deepEqual(request.tools.map((tool: any) => tool.function.name), ["commit_graph"]);
			if (attempts++ === 0) {
				const ref = input(request).original.ref;
				return replacement(request, { unfinished: [{ node: "main", label: "Main purpose", disposition: "carried", target: "main", sources: [ref] }] });
			}
			assert.match(JSON.stringify(request.messages), /transaction closes no endeavor.*Correct all reported defects.*1 model call remains/s);
			return replacement(request);
		});
		await mom.open(); await mom.update();
		assert.equal(h.requests().length, 2); assert.equal(mom.usage.calls, 2);
		assert.equal((await checkpoints(h)).length, 1); assert.equal(mom.error, undefined);
		assert.deepEqual(h.errors, []); assert.deepEqual(h.api.errors, []);
	} finally { mom.close(); await h.close(); }
});

test("background failure waits for new material, gaps the second deterministic failure, and refresh catches it up", { timeout: 15000 }, async () => {
	const h = await setup(); let mom = h.createMom(), reject = false;
	try {
		await h.runtime.session.prompt("Preserve the original purpose."); await mom.open(); await mom.update();
		h.api.onUnscripted((request) => {
			if (!isMomRequest(request)) return { text: "Lead continued." };
			if (!reject) return replacement(request);
			const ref = input(request).original.ref;
			return replacement(request, { unfinished: [{ node: "main", label: "Main purpose", disposition: "carried", target: "main", sources: [ref] }] });
		});
		await h.runtime.session.prompt("This range will fail deterministically."); reject = true;
		const before = h.requests().length;
		await assert.rejects(() => mom.update(), /closes no endeavor/);
		assert.equal(h.requests().length, before + 2); assert.equal(mom.failure?.failures, 1); assert.equal(mom.gaps.length, 0);
		await mom.update();
		assert.equal(h.requests().length, before + 2, "no newer boundary means no immediate retry");
		await h.runtime.session.prompt("Newer evidence must remain available after the skipped range.");
		await assert.rejects(() => mom.update(), /closes no endeavor/);
		assert.equal(h.requests().length, before + 4); assert.equal(mom.failure, undefined); assert.equal(mom.gaps.length, 1);
		assert.equal((await readSidecar(h)).filter(record => record.type === "map" && record.data.gap?.action === "open").length, 1);
		assert.equal(mom.detail().skippedEvidence.length, 1); assert.equal(mom.detail().sessionUsage.calls, before + 4);
		reject = false;
		const calls = h.requests().length;
		await mom.update(undefined, undefined, 0, true);
		assert.equal(h.requests().length, calls + 1); assert.equal(mom.gaps.length, 0);
		const refresh = input(h.requests().at(-1));
		assert.match(refresh.newEvents, /This range will fail deterministically/);
		assert.doesNotMatch(refresh.newEvents, /Newer evidence must remain available/, "refresh never mixes unbounded later evidence into a gap retry");
		assert(MOM_PROMPT_LENGTH(h.requests().at(-1)) < CONTEXT_LIMIT);
		const coldHash = stateHash({ graph: mom.graph, cut: mom.checkpoint?.cut });
		mom.close(); await h.runtime.session.reload(); mom = h.createMom(); await mom.open();
		assert.equal(stateHash({ graph: mom.graph, cut: mom.checkpoint?.cut }), coldHash, "resolved gap is cold-stable");
		await mom.update();
		assert.match(input(h.requests().at(-1)).newEvents, /Newer evidence must remain available/, "later evidence retains source order after recovery");
	} finally { mom.close(); await h.close(); }
});

const MOM_PROMPT_LENGTH = (request: any) => MOM_PROMPT.length + JSON.stringify(request.messages).length;

test("oversized durable gaps recover in bounded ordered chunks across cold reload", { timeout: 15000 }, async () => {
	const h = await setup(); let mom = h.createMom();
	try {
		await h.runtime.session.prompt("Preserve the original purpose."); await mom.open(); await mom.update();
		const from = structuredClone(mom.checkpoint!.cut), checkpointId = mom.checkpointId!;
		for (let index = 0; index < 4; index++) {
			await h.runtime.session.prompt(`Gap segment ${index}: ${String(index).repeat(13000)}`);
		}
		const refs: string[] = []; let through = from, more = true;
		while (more) {
			const captured = await mom.feed.capture(24000, true);
			refs.push(...captured.events.map(event => event.ref)); through = captured.cut; more = captured.more;
		}
		assert(refs.length > 4, "fixture includes user and lead events across multiple feed pages");
		const gap = { id: "oversized-gap", key: "oversized-range", from, through, refs, error: "deterministic rejection", failures: 2 };
		const store = new SidecarStore(() => h.parent, h.runtime.session.sessionManager.getSessionId());
		await store.append("map", { base: checkpointId, cut: through, failure: null, gap: { action: "open", ...gap } });
		mom.close(); await h.runtime.session.reload(); mom = h.createMom(); await mom.open();
		assert.deepEqual(mom.gaps[0]?.refs, refs);
		h.api.script("Later material after the skipped range.", { text: "Distinct later assistant material." });
		await h.runtime.session.prompt("Later material after the skipped range."); await mom.update();
		assert.equal(mom.gaps.length, 1, "ordinary catch-up does not discard an older open gap");
		const coverage = structuredClone(mom.checkpoint!.cut);

		h.api.onUnscripted((request) => {
			if (!isMomRequest(request)) return { text: "Lead continued." };
			const body = input(request);
			return { tool: { name: "commit_graph", arguments: { revision: body.graph.revision, purpose: body.graph.purpose, focus: body.graph.focus,
				unfinished: [], upsertNodes: [], upsertEdges: [], removeEdges: [], merges: [], folds: [], removeNodes: [], supersessions: [], note: null } } };
		});
		const before = h.requests().length; await mom.update(undefined, undefined, 0, true);
		const firstRequest = h.requests()[before], firstRefs = [...input(firstRequest).newEvents.matchAll(/\[src:([^\]]+)\]/g)].map(match => match[1]);
		assert(MOM_PROMPT_LENGTH(firstRequest) < CONTEXT_LIMIT, "each refresh request stays below the context ceiling");
		assert.doesNotMatch(input(firstRequest).newEvents, /Later material after the skipped range/);
		assert.doesNotMatch(input(firstRequest).contextBeforeBatch ?? "", /Distinct later assistant material/, "gap context never reaches into later evidence");
		assert(firstRefs.length > 0 && firstRefs.length < refs.length, "the first refresh is a bounded proper prefix");
		assert.deepEqual(firstRefs, refs.slice(0, firstRefs.length), "recovery preserves source order");
		const remaining = refs.slice(firstRefs.length);
		assert.deepEqual(mom.gaps[0]?.refs, remaining, "accepted chunk leaves an explicit in-memory suffix");
		assert.deepEqual((await readSidecar(h)).findLast(record => record.type === "map" && record.data.gap?.action === "open")?.data.gap.refs,
			remaining, "accepted chunk atomically persists the remaining range");

		mom.close(); await h.runtime.session.reload(); mom = h.createMom(); await mom.open();
		assert.deepEqual(mom.gaps[0]?.refs, remaining, "cold restore resumes from the durable suffix");
		while (mom.gaps.length) {
			const calls = h.requests().length; await mom.update(undefined, undefined, 0, true);
			assert.equal(h.requests().length, calls + 1, "each healthy chunk uses one background call");
			assert(MOM_PROMPT_LENGTH(h.requests().at(-1)) < CONTEXT_LIMIT);
		}
		assert.deepEqual(mom.checkpoint?.cut, coverage, "gap recovery never moves the later coverage cursor backward");
		mom.close(); await h.runtime.session.reload(); mom = h.createMom(); await mom.open();
		assert.deepEqual(mom.gaps, []); assert.deepEqual(mom.checkpoint?.cut, coverage, "resolved coverage is cold-stable");
	} finally { mom.close(); await h.close(); }
});

test("fresh contexts keep cache affinity within one branch instance and reset with that instance", { timeout: 15000 }, async () => {
	const h = await setup(); let mom = h.createMom();
	const registry = h.context.modelRegistry, stream = registry.streamSimple.bind(registry), ids: string[] = [];
	registry.streamSimple = (model: any, context: any, options: any) => { ids.push(options.sessionId); return stream(model, context, options); };
	try {
		await h.runtime.session.prompt("Preserve this goal."); await mom.open(); await mom.update();
		await h.runtime.session.prompt("Attach this result to the same goal."); await mom.update();
		assert.equal(ids.length, 2); assert.equal(ids[0], ids[1], "fresh updates share cache affinity without sharing a conversation");
		mom.close(); mom = h.createMom(); await mom.open();
		await h.runtime.session.prompt("Continue on a reopened Mom instance."); await mom.update();
		assert.equal(ids.length, 3); assert.notEqual(ids[2], ids[1], "a new branch instance gets new cache affinity");
		assert(h.requests().every(request => request.messages.length === 2), "each update still has one fresh user context");
	} finally { mom.close(); await h.close(); }
});

test("an accepted graph-identical update advances a compact durable cursor and cold reopen does not replay it", { timeout: 15000 }, async () => {
	const h = await setup(); let mom = h.createMom();
	try {
		await h.runtime.session.prompt("Preserve this goal."); await mom.open(); await mom.update();
		const firstId = mom.checkpointId;
		h.api.onUnscripted((request) => {
			if (!isMomRequest(request)) return { text: "Lead produced evidence that does not change the map." };
			const body = input(request);
			return { tool: { name: "commit_graph", arguments: { revision: body.graph.revision,
				purpose: body.graph.purpose, focus: body.graph.focus, note: null, unfinished: [],
				upsertNodes: [], upsertEdges: [], removeEdges: [], merges: [], folds: [], removeNodes: [], supersessions: [] } } };
		});
		await h.runtime.session.prompt("Record this routine continuation without changing the map.");
		await mom.update();
		const records = await readSidecar(h);
		assert.equal(records.filter(r => r.type === "map" && r.data.snapshot).length, 1, "the graph is not duplicated");
		const progress = records.filter(r => r.type === "map" && r.data.cut && !r.data.snapshot);
		assert.equal(progress.length, 1); assert.equal(progress[0].data.base, firstId);
		const acceptedCut = structuredClone(mom.checkpoint!.cut);
		mom.close(); await h.runtime.session.reload(); mom = h.createMom(); await mom.open();
		assert.deepEqual(mom.checkpoint?.cut, acceptedCut);
		const calls = h.requests().length;
		await mom.update();
		assert.equal(h.requests().length, calls, "cold reopen has no accepted evidence to replay");
	} finally { mom.close(); await h.close(); }
});

test("checkpoint append failure retains the old snapshot/cursor and retries the same unconsumed batch", { timeout: 15000 }, async () => {
	const h = await setup(); let fail = false;
	const durable = () => new SidecarStore(() => h.parent, h.runtime.session.sessionManager.getSessionId());
	const mom = h.createMom({ store: {
		load: async () => durable().load(),
		append: async (type, data) => {
			if (fail && type === "map" && data.snapshot) throw new Error("Injected append failure");
			return durable().append(type, data);
		},
	} });
	try {
		await h.runtime.session.prompt("Preserve this goal."); await mom.open(); await mom.update();
		const before = mom.checkpoint;
		await h.runtime.session.prompt("Keep the worker result attached to that goal."); fail = true;
		await assert.rejects(() => mom.update(), /Injected append failure/);
		assert.equal(mom.checkpoint, before); assert.equal((await checkpoints(h)).length, 1);
		assert.equal(mom.gaps.length, 0, "sidecar failure never advances or gaps evidence");
		assert.equal(h.requests().length, 2, "storage failure does not cause a model repair call");
		fail = false; await mom.update();
		assert.equal((await checkpoints(h)).length, 2);
		assert.equal(input(h.requests()[1]).newEvents, input(h.requests()[2]).newEvents);
		assert.equal(mom.usage.calls, 3, "failed attempt usage is retained");
	} finally { mom.close(); await h.close(); }
});

test("a sidecar failure while opening a deterministic gap skips nothing and retains newer evidence", { timeout: 15000 }, async () => {
	const h = await setup(); let failGap = false, reject = false;
	const durable = () => new SidecarStore(() => h.parent, h.runtime.session.sessionManager.getSessionId());
	const mom = h.createMom({ store: {
		load: async () => durable().load(),
		append: async (type, data) => {
			if (failGap && type === "map" && data.gap?.action === "open") throw new Error("Injected gap append failure");
			return durable().append(type, data);
		},
	} });
	try {
		await h.runtime.session.prompt("Preserve this goal."); await mom.open(); await mom.update();
		h.api.onUnscripted((request) => {
			if (!isMomRequest(request)) return { text: "Lead continued." };
			if (!reject) return replacement(request);
			const ref = input(request).original.ref;
			return replacement(request, { unfinished: [{ node: "main", label: "Main purpose", disposition: "carried", target: "main", sources: [ref] }] });
		});
		await h.runtime.session.prompt("Fail this exact range."); reject = true;
		await assert.rejects(() => mom.update(), /closes no endeavor/);
		const before = mom.checkpoint?.cut;
		await h.runtime.session.prompt("Newer evidence survives the failed gap write."); failGap = true;
		await assert.rejects(() => mom.update(), /Injected gap append failure/);
		assert.deepEqual(mom.checkpoint?.cut, before); assert.equal(mom.gaps.length, 0); assert.equal(mom.failure?.failures, 1);
		assert.equal((await readSidecar(h)).some(record => record.type === "map" && record.data.gap?.action === "open"), false);
		failGap = false; reject = false;
		await h.runtime.session.prompt("A later boundary releases the retained range."); await mom.update(); await mom.update();
		assert.match(input(h.requests().at(-1)).newEvents, /Newer evidence survives the failed gap write/);
	} finally { mom.close(); await h.close(); }
});

test("provider failure survives reload without losing the last checkpoint or new input", { timeout: 15000 }, async () => {
	const h = await setup(); let mom = h.createMom();
	try {
		await h.runtime.session.prompt("Keep every user constraint."); await mom.open(); await mom.update();
		const before = mom.checkpoint;
		await h.runtime.session.prompt("The new constraint is no deletion.");
		h.api.onUnscripted((request) => isMomRequest(request) ? { error: 400 } : { text: "Lead continued." });
		await assert.rejects(() => mom.update(), /Fixture provider failure/);
		assert.equal(mom.checkpoint, before); assert.equal((await checkpoints(h)).length, 1);
		assert.equal(mom.failure, undefined); assert.equal(mom.gaps.length, 0, "provider outage is not a deterministic evidence failure");
		mom.close(); await h.runtime.session.reload(); mom = h.createMom(); await mom.open();
		assert.deepEqual(mom.checkpoint, before); assert.equal(mom.usage.calls, 2);
		h.api.onUnscripted((request) => replacement(request));
		await mom.update();
		assert.match(input(h.requests().at(-1)).newEvents, /The new constraint is no deletion/);
		assert.equal((await checkpoints(h)).length, 2); assert.equal(mom.usage.calls, 3);
	} finally { mom.close(); await h.close(); }
});

test("explicit history questions use bounded search and answer without filesystem tools", { timeout: 15000 }, async () => {
	const h = await setup(), mom = h.createMom();
	try {
		await h.runtime.session.prompt("Preserve worker returns because branches must rejoin their parent."); await mom.open(); await mom.update();
		let step = 0;
		h.api.onUnscripted((request) => {
			if (step++ === 0) return { tool: { name: "search_history", arguments: { query: "branches must rejoin" } } };
			assert.match(JSON.stringify(request.messages), /matches/);
			const body = input(request);
			if (step === 2) {
				assert.deepEqual(request.tools.map((t: any) => t.function.name), ["inspect_evidence"], "a successful search cannot be mistaken for inspected evidence");
				return { tool: { name: "inspect_evidence", arguments: { ref: body.original.ref, offset: 0, limit: 4000 } } };
			}
			return replacement(request, { answer: `The user required branches to rejoin their parent. [src:${body.original.ref}]` });
		});
		const answer = await mom.update("Why retain worker returns?");
		assert.match(answer!, /branches to rejoin/);
		assert.equal(h.requests().length, 4);
		assert(h.requests().every((r) => r.tools.every((t: any) => ["commit_graph", "inspect_evidence", "search_history"].includes(t.function.name))));
	} finally { mom.close(); await h.close(); }
});

test("zero-result search keeps retry-only state through an invalid retry and still answers within five calls", { timeout: 15000 }, async () => {
	const h = await setup(), mom = h.createMom();
	try {
		await h.runtime.session.prompt("Preserve the exact marker branches rejoin."); await mom.open(); await mom.update();
		let round = 0;
		h.api.onUnscripted((request) => {
			const body = input(request), step = round++;
			if (step === 0) return { tool: { name: "search_history", arguments: { query: "definitely absent marker" } } };
			if (step === 1) {
				assert.deepEqual(request.tools.map((t: any) => t.function.name), ["search_history"]);
				return { tool: { name: "search_history", arguments: { query: "another equally long marker" } } };
			}
			if (step === 2) {
				assert.deepEqual(request.tools.map((t: any) => t.function.name), ["search_history"]);
				assert.match(JSON.stringify(request.messages), /No metadata search was consumed; 1 remain/);
				assert.match(JSON.stringify(request.messages), /3 model calls remain/);
				return { tool: { name: "search_history", arguments: { query: "branches rejoin" } } };
			}
			if (step === 3) {
				assert.deepEqual(request.tools.map((t: any) => t.function.name), ["inspect_evidence"]);
				return { tool: { name: "inspect_evidence", arguments: { ref: body.original.ref, offset: 0, limit: 4000 } } };
			}
			return replacement(request, { answer: `The exact marker was preserved. [src:${body.original.ref}]` });
		});
		assert.match((await mom.update("What exact marker was preserved?"))!, /exact marker/);
		assert.equal(round, 5); assert.equal(h.requests().length, 6);
	} finally { mom.close(); await h.close(); }
});

test("metadata search and source reads enforce independent two-operation budgets", { timeout: 15000 }, async () => {
	for (const mode of ["search", "read"] as const) {
		const h = await setup(), mom = h.createMom();
		try {
			await h.runtime.session.prompt("Keep the budget marker."); await mom.open(); await mom.update();
			let round = 0;
			h.api.onUnscripted((request) => {
				const ref = input(request).original.ref;
				round++;
				if (mode === "search") return { tool: { name: "search_history", arguments: { query: round === 1 ? "zzzzmissingone" : round === 2 ? "☃" : "x" } } };
				return { tool: { name: "inspect_evidence", arguments: { ref, offset: 0, limit: 100 } } };
			});
			await assert.rejects(() => mom.update("zzzzquery"), /Unavailable Mom operation/);
			assert.equal(round, 3);
		} finally { mom.close(); await h.close(); }
	}
});

test("an invalid long search is repairable and consumes a model call but no search", { timeout: 15000 }, async () => {
	const h = await setup(), mom = h.createMom();
	try {
		await h.runtime.session.prompt("Keep this marker."); await mom.open(); await mom.update();
		let round = 0;
		h.api.onUnscripted((request) => {
			const body = input(request), step = round++;
			if (step === 0) return { tool: { name: "search_history", arguments: { query: "x".repeat(81) } } };
			if (step === 1) {
				assert.match(JSON.stringify(request.messages), /No metadata search was consumed; 2 remain/);
				assert.match(JSON.stringify(request.messages), /4 model calls remain/);
				return { tool: { name: "search_history", arguments: { query: "Keep this marker" } } };
			}
			if (step === 2) return { tool: { name: "inspect_evidence", arguments: { ref: body.original.ref, offset: 0, limit: 4000 } } };
			return replacement(request, { answer: `The marker is recorded. [src:${body.original.ref}]` });
		});
		assert.match((await mom.update("Where is the marker?"))!, /marker is recorded/);
		assert.equal(round, 4);
	} finally { mom.close(); await h.close(); }
});

for (const entryPoint of ["tool_result", "tool_call"]) test(`metadata search from ${entryPoint} recovers both sides inside the two-page budget`, { timeout: 15000 }, async () => {
	const h = await setup(), mom = h.createMom();
	try {
		await h.runtime.session.prompt("Check the formatter without changing user files.");
		const manager = h.runtime.session.sessionManager;
		const template = (manager.getBranch().find((e: any) => e.type === "message" && e.message.role === "assistant") as any).message;
		// Recorded history fixtures; this test exercises retrieval, not command execution.
		const call = manager.appendMessage({ ...template, content: [{ type: "toolCall", id: "verify", name: "bash", arguments: { command: "node verify.mjs; git status --short" } }], stopReason: "toolUse" });
		const result = manager.appendMessage({ role: "toolResult", toolCallId: "verify", toolName: "bash", isError: true,
			content: [{ type: "text", text: "7 assertions passed. fatal: not a git repository" }], timestamp: Date.now() });
		const callRef = `${manager.getSessionId()}:${call}:b0`, resultRef = `${manager.getSessionId()}:${result}`;
		await mom.open(); await mom.update();
		assert(!JSON.stringify(mom.graph).includes(resultRef), "the tool citation is not retained in the active graph");
		let round = 0;
		h.api.onUnscripted((request) => {
			if (round++ === 0) return { tool: { name: "search_history", arguments: { query: entryPoint === "tool_result" ? "isError=true" : "tool_call bash" } } };
			const content = request.messages.findLast((m: any) => m.role === "tool").content;
			const data = JSON.parse(typeof content === "string" ? content : content.map((b: any) => b.text).join("\n"));
			if (round === 2) {
				assert.equal(data.matches[0].ref, resultRef, "tool pairs deduplicate toward the observed result");
				assert.equal(data.matches[0].pairedRef, callRef);
				assert.equal(data.matches[0].kind, "tool_result");
				assert(!JSON.stringify(data).includes("7 assertions passed"), "search must not expose raw output");
				return { tool: { name: "inspect_evidence", arguments: { ref: resultRef, offset: 0, limit: 4000 } } };
			}
			assert.equal(data.evidencePagesRemaining, 1, "metadata search does not consume source-read pages");
			assert.equal(data.results.length, 2);
			assert.match(data.results.find((r: any) => r.ref === callRef).text, /node verify.mjs; git status/);
			assert.match(data.results.find((r: any) => r.ref === resultRef).text, /7 assertions passed/);
			assert(data.results.reduce((n: number, r: any) => n + r.text.length, 0) <= 4000);
			return replacement(request, { answer: `Assertions passed; Git failed. [src:${callRef}] [src:${resultRef}]` });
		});
		assert.match((await mom.update("What failed in the verification shell call?"))!, /Assertions passed; Git failed/);
		assert.equal(h.requests().length, 4);
		assert.deepEqual(h.api.errors, []);
	} finally { mom.close(); await h.close(); }
});

test("a result completing after session invalidation cannot publish a checkpoint", { timeout: 15000 }, async () => {
	const h = await setup(), gate = deferred(), arrived = deferred(); let current = true;
	const mom = h.createMom({ current: () => current });
	try {
		await h.runtime.session.prompt("Preserve the old branch."); await mom.open();
		h.api.onUnscripted((request) => { arrived.resolve(); return { ...replacement(request), gate }; });
		const work = mom.update(); await arrived.promise; current = false; gate.resolve();
		await assert.rejects(() => work, /superseded/);
		assert.equal((await checkpoints(h)).length, 0); assert.equal(mom.checkpoint, undefined);
		assert.equal(mom.failure, undefined); assert.equal(mom.gaps.length, 0, "session invalidation never skips evidence");
	} finally { gate.resolve(); mom.close(); await h.close(); }
});
