import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { finishCompactionReview, prepareCompactionReview } from "../src/compaction.ts";
import { CHAPTER_STATE_FIELDS, MOM_PROMPT, normalizeEvidence } from "../src/contract.ts";
import type { FeedEvent } from "../src/feed.ts";
import { input, isMomRequest, readSidecar, replacement, setup } from "./fixture.ts";

/** Compaction boundaries are appended by the session manager, exactly as the live extension does. */
function beforeEvent(branchEntries: any[], firstKeptEntryId: string) {
	return { type: "session_before_compact", branchEntries, reason: "manual", willRetry: false, signal: new AbortController().signal,
		preparation: { firstKeptEntryId, messagesToSummarize: [], turnPrefixMessages: [], isSplitTurn: false, tokensBefore: 100,
			fileOps: { read: [], modified: [] }, settings: { enabled: true, reserveTokens: 1000, keepRecentTokens: 1000 } } } as any;
}

const citedRefs = (newEvents: string) => [...newEvents.matchAll(/\[src:([^\]]+)\]/g)].map((match) => match[1]);

test("the update contract carries the fixed chapter-state schema, provisional chapters, and raw-over-summary rules", () => {
	assert.deepEqual([...CHAPTER_STATE_FIELDS], ["goal", "decisions", "artifacts", "dead ends", "open questions"]);
	assert.match(MOM_PROMPT, /chapterState — the fixed chapter schema, goal \/ decisions \/ artifacts \/ dead ends \/ open questions/);
	assert.match(MOM_PROMPT, /UPDATE AS A CHAPTER-STATE DIFF/);
	assert.match(MOM_PROMPT, /Compare consecutive chapter states and the prior graph, then commit only material differences/);
	assert.match(MOM_PROMPT, /one commit_graph transaction carries the whole diff/);
	assert.match(MOM_PROMPT, /trailing chapter of a live batch is provisional/);
	assert.match(MOM_PROMPT, /A bootstrap backlog is the whole session so far, so cover it/);
	assert.match(MOM_PROMPT, /host fixes the root intent to the opening lead request verbatim/);
	assert.match(MOM_PROMPT, /never promote a claim into an observation or a settled state/);
	assert.match(MOM_PROMPT, /never a second ledger — they are written nowhere except the graph, and no record may exist per message, event, or tool result/);
	assert.match(MOM_PROMPT, /the raw events win, and every changed claim must cite its raw source/);
	// 038's narrowing obligation and 049's bounded-backlog chapter chain stay intact.
	assert.match(MOM_PROMPT, /When the user narrows or drops scope, retire what no longer holds in the same transaction/);
	assert.match(MOM_PROMPT, /A narrowing that leaves the node set unchanged is not recorded/);
	assert.match(MOM_PROMPT, /BOOTSTRAP CHAPTER CHAIN/);
});

test("a short multi-exchange batch is one provisional chapter state with cited refs and one bounded proposal", { timeout: 20000 }, async () => {
	const h = await setup();
	const mom = h.createMom();
	try {
		await h.runtime.session.prompt("Preserve the original purpose. Do not delete KEEP.txt.");
		await mom.open(); await mom.update();
		assert.equal(h.requests().length, 1, "bootstrap is one proposal");
		await h.runtime.session.prompt("Second exchange: continue the migration in place.");
		await h.runtime.session.prompt("Third exchange: report the formatter result back here.");
		await mom.update();
		assert.equal(h.requests().length, 2, "three settled exchanges stay one bounded proposal, not one per exchange");

		const body = input(h.requests()[1]);
		assert.deepEqual(body.chapterState, [...CHAPTER_STATE_FIELDS], "the fixed comparison frame travels with the request");
		assert.equal(body.chapters.length, 1, "one live batch is one provisional grouped state");
		const chapter = body.chapters[0];
		assert.deepEqual(Object.keys(chapter).sort(), ["closedBy", "events", "from", "id", "status", "through"],
			"the host adds structure and pointers only — never one entry per event");
		assert.equal(chapter.status, "provisional");
		assert.equal(chapter.closedBy, null, "a live batch is never a completed chapter");
		assert.equal(chapter.id, "live");
		const refs = citedRefs(body.newEvents);
		assert.equal(refs.length, chapter.events, "every cited event ref is rendered exactly once");
		assert.equal(refs[0], chapter.from, "chapter pointers name the first cited event");
		assert.equal(refs.at(-1), chapter.through, "chapter pointers name the last cited event");
		assert(refs.every((ref) => mom.feed.byRef.has(ref)), "cited refs resolve to observed feed evidence");
		assert.equal((body.newEvents.match(/^CHAPTER /gm) ?? []).length, 1, "the batch renders under one chapter header");
		assert.match(body.newEvents, /^EVIDENCE GROUPED BY COMPACTION CHAPTER/);
		assert.match(body.newEvents, /provisional, not a completed chapter/);
		assert.match(body.newEvents, /Second exchange/);
		assert.match(body.newEvents, /Third exchange/);

		// Compact material diff: many events fold into one account; nothing is written per event.
		assert.equal(mom.graph.nodes.length, 1, "the map has no node per message, event, or tool result");
		assert(chapter.events > mom.graph.nodes.length);
		assert.equal(mom.graph.edges.length, 0);
		const records = await readSidecar(h);
		assert(records.every((record) => ["map", "notice", "usage"].includes(record.type)), "one sidecar ledger family");
		const transcript = await readFile(h.parent, "utf8");
		assert(!transcript.includes('"type":"map"'), "the graph never becomes a second durable ledger in the transcript");
		assert(!transcript.includes("chapterState"), "chapter state is a comparison frame, not persisted state");
		assert.deepEqual(h.errors, []); assert.deepEqual(h.api.errors, []);
	} finally { mom.close(); await h.close(); }
});

test("evidence spanning a compaction boundary keeps stable chapter refs across batches", { timeout: 20000 }, async () => {
	const h = await setup();
	const mom = h.createMom();
	try {
		await h.runtime.session.prompt("Preserve the original purpose. Do not delete KEEP.txt.");
		await mom.open(); await mom.update();
		await h.runtime.session.prompt("Pre-boundary exchange: continue the migration.");
		const manager = h.runtime.session.sessionManager;
		const branch = manager.getBranch();
		const firstKept = branch.findLast((entry: any) => entry.type === "message" && entry.message.role === "assistant")!;
		const compactionRef = `${manager.getSessionId()}:${manager.appendCompaction("Migration continues.", firstKept.id, 100)}`;
		await h.runtime.session.prompt("Post-boundary exchange: the hold is still active.");
		await mom.update();

		const body = input(h.requests()[1]);
		assert.equal(body.chapters.length, 2, "one bounded batch spans the boundary as two chapters");
		const [closed, open] = body.chapters;
		assert.equal(closed.id, "live");
		assert.equal(closed.status, "closed");
		assert.equal(closed.closedBy, compactionRef, "the compaction entry closes the chapter it ends");
		assert.equal(open.id, compactionRef, "the same compaction opens the next chapter with a stable identity");
		assert.equal(open.status, "provisional", "the chapter after the boundary is still accumulating");
		assert.equal(open.closedBy, null);
		const refs = citedRefs(body.newEvents);
		assert.equal(refs.length, closed.events + open.events, "the chapters partition the batch's cited refs");
		assert.equal(refs[closed.events - 1], compactionRef, "the boundary event is the last cited ref of the closed chapter");
		assert.equal(refs[0], closed.from);
		assert.equal(refs.at(-1), open.through);
		assert(refs.every((ref) => mom.feed.byRef.has(ref)));
		assert.equal((body.newEvents.match(/^CHAPTER /gm) ?? []).length, 2);
		assert.match(body.newEvents, /Pre-boundary exchange/);
		assert.match(body.newEvents, /Post-boundary exchange/);
		assert.match(body.newEvents, /lead compaction/, "the raw boundary event stays visible evidence");

		await h.runtime.session.prompt("Later exchange after the boundary.");
		await mom.update();
		const next = input(h.requests()[2]);
		assert.equal(next.chapters.length, 1);
		assert.equal(next.chapters[0].id, compactionRef, "the still-open chapter keeps its identity across updates");
		assert.equal(next.chapters[0].status, "provisional");
		assert.equal(next.chapters[0].closedBy, null);

		// Host normalization is deterministic and boundary-anchored, with no model call involved.
		const synthetic: FeedEvent[] = [
			{ ref: "s:1", at: "", actor: "lead", kind: "user", text: "first" },
			{ ref: "s:c", at: "", actor: "lead", kind: "compaction" },
			{ ref: "s:2", at: "", actor: "lead", kind: "assistant", text: "after" },
		];
		assert.deepEqual(normalizeEvidence(synthetic, null), normalizeEvidence(synthetic, null), "normalization is deterministic");
		const chapters = normalizeEvidence(synthetic, null).chapters;
		assert.deepEqual(chapters.map((item) => item.id), ["live", "s:c"]);
		assert.deepEqual(chapters.map((item) => item.status), ["closed", "provisional"]);
		assert.equal(chapters[0].closedBy, "s:c");
		assert.equal(normalizeEvidence(synthetic.slice(2), "s:c").chapters[0].id, chapters[1].id,
			"a later batch opened by the same boundary reuses the same chapter ref");
		assert.deepEqual(h.errors, []); assert.deepEqual(h.api.errors, []);
	} finally { mom.close(); await h.close(); }
});

test("a contradicted compaction summary cannot ground a record; the cursor moves only on an accepted cited transaction", { timeout: 30000 }, async () => {
	const h = await setup();
	let mom = h.createMom();
	let summaryRef = "", rawRef = "", attempts = 0;
	const transaction = (body: any, upsertNodes: unknown[]) => ({ tool: { name: "commit_graph", arguments: {
		revision: body.graph.revision, purpose: body.graph.purpose, focus: body.graph.focus, upsertNodes,
		unfinished: [], upsertEdges: [], removeEdges: [], merges: [], folds: [], removeNodes: [], supersessions: [], note: null } } });
	h.api.onUnscripted((request) => {
		if (!isMomRequest(request)) return { text: "Lead continued." };
		const body = input(request);
		if (body.compactionReview) {
			// Round one and its repair both trust the provider summary alone.
			if (++attempts <= 2) return transaction(body, [{ id: "dropKeep", kind: "choice", parent: "main", state: "settled",
				label: "Drop KEEP.txt after migration", intent: "Drop KEEP.txt after migration", observed: "Per the compaction summary.", actor: "", sources: [summaryRef] }]);
			// Unreachable in this test: the retained batch retries without a review payload.
		}
		if (body.graph.nodes.length) return transaction(body, [{ id: "keepHold", kind: "rule", parent: "main", state: "active",
			label: "Do not delete KEEP.txt", intent: "Do not delete KEEP.txt.", observed: "The raw exchange survives the compaction.",
			actor: "lead", sources: [rawRef], purposeSource: rawRef }]);
		return replacement(request);
	});
	try {
		await h.runtime.session.prompt("Preserve the original purpose. Do not delete KEEP.txt.");
		await mom.open(); await mom.update();
		const cutBefore = structuredClone(mom.checkpoint!.cut), idBefore = mom.checkpointId;
		assert.equal(h.requests().length, 1);

		await h.runtime.session.prompt("Continue the migration without touching KEEP.txt.");
		const manager = h.runtime.session.sessionManager;
		const branch = manager.getBranch();
		const firstKept = branch.findLast((entry: any) => entry.type === "message" && entry.message.role === "assistant")!;
		const pending = prepareCompactionReview(beforeEvent(branch, firstKept.id), manager.getSessionId());
		const compactionId = manager.appendCompaction("Drop KEEP.txt now that the migration is done.", firstKept.id, 100);
		const review = finishCompactionReview(pending, { compactionEntry: manager.getEntry(compactionId) } as any);
		summaryRef = review.triggerRef;
		rawRef = pending.rawEvents.find((event) => event.text?.includes("Do not delete KEEP.txt"))!.ref;
		assert.match(review.rawReplacedEvents, /Do not delete KEEP\.txt/, "the raw replaced chapter is supplied as authority");

		await assert.rejects(() => mom.update(undefined, undefined, 0, false, review), (error: unknown) => {
			const message = String(error);
			return /rests only on compaction summaries/.test(message) && message.includes(summaryRef)
				&& /a summary is a claim/.test(message);
		}, "a record grounded only in the summary is rejected even though the summary ref is known and citable");
		assert.equal(h.requests().length, 3, "one bounded proposal plus one repair, no extra model pass");

		// Cursor/checkpoint never advance on a rejected proposal.
		assert.deepEqual(mom.checkpoint!.cut, cutBefore, "a rejected proposal leaves coverage untouched");
		assert.equal(mom.checkpointId, idBefore, "no new map snapshot is published");
		assert.equal(mom.failure?.failures, 1);
		const rejected = await readSidecar(h);
		assert.equal(rejected.filter((record) => record.type === "map" && record.data.snapshot).length, 1, "the prior snapshot is retained");
		assert.equal(rejected.filter((record) => record.type === "map" && record.data.cut !== undefined).length, 0, "no cursor record was written");
		assert.equal(rejected.filter((record) => record.type === "map" && record.data.failure !== null && record.data.failure !== undefined).length, 1,
			"the deterministic rejection is recorded as a failure, not as coverage");

		// The review the model saw carries the claim and the raw authority side by side.
		const reviewBody = input(h.requests()[1]);
		assert.equal(reviewBody.compactionReview.summary, "Drop KEEP.txt now that the migration is done.");
		assert.match(reviewBody.compactionReview.rawReplacedEvents, /Do not delete KEEP\.txt/);
		assert(reviewBody.compactionReview.rawEventCount > 0);
		assert.equal(reviewBody.chapters.length, 1);
		assert.equal(reviewBody.chapters[0].status, "closed");
		assert.equal(reviewBody.chapters[0].closedBy, summaryRef, "the chapter names its closing summary claim");

		// The retained batch retries; the raw replaced evidence grounds the accepted record.
		await h.runtime.session.prompt("A later exchange releases the retained batch.");
		await mom.update();
		assert.equal(mom.failure, undefined, "an accepted cited transaction clears the failure");
		assert.notDeepEqual(mom.checkpoint!.cut, cutBefore, "the accepted cited transaction advances the cursor");
		assert.notEqual(mom.checkpointId, idBefore);
		const hold = mom.graph.nodes.find((node) => node.id === "keepHold");
		assert(hold, "the raw-grounded hold lands");
		assert.deepEqual(hold!.sources, [rawRef], "raw replaced evidence, not the summary, grounds the claim");
		assert.equal(hold!.purposeSource, rawRef, "citation grounding stays strict");
		assert.equal(mom.graph.nodes.some((node) => node.id === "dropKeep"), false, "the summary-only claim never lands");
		for (const item of [...mom.graph.nodes, ...mom.graph.edges]) for (const ref of item.sources) {
			assert(mom.feed.byRef.has(ref), `every retained citation resolves: ${ref}`);
		}
		const accepted = await readSidecar(h);
		assert.equal(accepted.filter((record) => record.type === "map" && record.data.snapshot).length, 2, "one snapshot per accepted material transaction");
		assert.equal(accepted.filter((record) => record.type === "map" && record.data.cut !== undefined).length, 0, "material updates never emit a cursor-only patch");
		const transcript = await readFile(h.parent, "utf8");
		assert(!transcript.includes("keepHold"), "accepted graph records live only in the sidecar, never in the transcript");
		assert(!transcript.includes('"type":"map"'), "still one durable graph ledger, beside the session");

		const acceptedCut = structuredClone(mom.checkpoint!.cut);
		mom.close(); mom = h.createMom(); await mom.open();
		assert.deepEqual(mom.checkpoint!.cut, acceptedCut, "accepted coverage is cold-stable");
		assert(mom.graph.nodes.some((node) => node.id === "keepHold"), "the raw-grounded record survives cold reopen");
		assert(!mom.graph.nodes.some((node) => node.id === "dropKeep"));
		assert.deepEqual(h.errors, []); assert.deepEqual(h.api.errors, []);
	} finally { mom.close(); await h.close(); }
});
