import assert from "node:assert/strict";
import { test } from "node:test";
import { auditSections } from "../src/audit.ts";
import { finishCompactionReview, prepareCompactionReview } from "../src/compaction.ts";
import { renderEvent, type FeedEvent } from "../src/feed.ts";
import { deferred, input, replacement, setup, readSidecar } from "./fixture.ts";

function compaction(manager: any, summary = "All work completed.") {
	const branchEntries = manager.getBranch(), firstKeptEntryId = branchEntries.at(-1).id;
	const pending = prepareCompactionReview({ branchEntries, preparation: { firstKeptEntryId } } as any, manager.getSessionId());
	const id = manager.appendCompaction(summary, firstKeptEntryId, 100);
	return finishCompactionReview(pending, { compactionEntry: manager.getEntry(id) } as any);
}

test("audit pages preserve every character past the old sampling cap and within oversized events", () => {
	const events: FeedEvent[] = [
		{ ref: "s:first", at: "", actor: "lead", kind: "user", text: "Initial standing constraint." },
		{ ref: "s:large", at: "", actor: "lead", kind: "assistant", text: "a".repeat(96013) },
		{ ref: "s:last", at: "", actor: "lead", kind: "user", text: "Late unrecorded prohibition." },
		{ ref: "s:compact", at: "", actor: "lead", kind: "compaction", claim: "A contradictory summary." },
		{ ref: "w:old", at: "", actor: "researcher", kind: "assistant", text: "Earlier delegated research." },
		{ ref: "w:compact", at: "", actor: "researcher", kind: "compaction", claim: "Worker summary." },
		{ ref: "w:next", at: "", actor: "researcher", kind: "assistant", text: "Worker follow-up." },
		{ ref: "s:next", at: "", actor: "lead", kind: "user", text: "New chapter." },
	];
	const sections = auditSections(events);
	assert(sections.length >= 3);
	const restored = sections.map(s => s.evidence.replace(/\nCHAPTER [^\n]+ · event offset \d+\n/g, "")).join("");
	assert.equal(restored, events.map(e => renderEvent(e) + (e.kind === "compaction" ? `\nCLAIM (not evidence): ${e.claim}` : "")).join(""));
	assert.deepEqual(sections.at(-1)!.chapterIds, ["s:compact"]);
	assert.deepEqual(sections.filter(section => section.actor === "researcher").map(section => section.chapterIds), [["researcher:live"], ["w:compact"]]);
	assert(sections.every(section => section.chapterIds.length === 1), "transport pages never span chapter boundaries");
	assert(sections.every(section => section.evidence.length <= 48000));
});

test("oversized summary pages keep their claim label and normal records are not split", () => {
	const summary = { ref: "s:claim", at: "", actor: "lead", kind: "compaction", claim: "claim ".repeat(10000) };
	const pages = auditSections([summary]);
	assert(pages.length > 1);
	assert(pages.every(page => page.evidence.startsWith("\nCHAPTER live · SUMMARY CLAIM · [src:s:claim]")));
	const normal = auditSections([
		{ ref: "s:text", at: "", actor: "lead", kind: "assistant", text: "x".repeat(47000) },
		{ ...summary, claim: "c".repeat(2000) },
	]);
	assert.equal(normal.length, 2);
	assert(normal[1].evidence.includes("c".repeat(2000)), "the closing summary remains intact on its own page");
});

test("full audit reconciles an uncited old decision after the sampling boundary, then restores without inference", { timeout: 20000 }, async () => {
	const h = await setup(), mom = h.createMom();
	try {
		const manager = h.runtime.session.sessionManager;
		await h.runtime.session.prompt("Maintain the migration.");
		await mom.open(); await mom.update();
		manager.appendMessage({ role: "user", content: "x".repeat(50000), timestamp: Date.now() });
		const hold = manager.appendMessage({ role: "user", content: "Never delete ARCHIVE.txt.", timestamp: Date.now() });
		manager.appendMessage({ role: "user", content: "y".repeat(50000), timestamp: Date.now() });
		manager.appendMessage({ role: "user", content: "Continue investigating.", timestamp: Date.now() });
		const old = compaction(manager, "Migration is unrestricted.");
		assert(old.rawReplacedEvents.length > 50000);
		assert.match(old.rawReplacedEvents, /Never delete ARCHIVE/);
		assert.equal(old.omittedRawEventCount, 0);
		manager.appendMessage({ role: "user", content: "Investigate the renderer next.", timestamp: Date.now() });
		const review = compaction(manager);
		const ref = `${manager.getSessionId()}:${hold}`;
		let found = false, checkedClosingClaim = false;
		h.api.onUnscripted(request => {
			const body = input(request);
			if (body.chapterIds) {
				assert.equal(body.graph, undefined);
				assert.equal(body.contextBeforeBatch, undefined);
				if (body.evidence.includes("Migration is unrestricted.")) {
					assert(!body.evidence.includes("Never delete ARCHIVE.txt."));
					assert.match(JSON.stringify(body.earlierSections), /Never delete ARCHIVE/);
					checkedClosingClaim = true;
				}
				const result: any = replacement(request);
				result.tool.arguments.states[0].artifacts = [{ text: "Recorded artifact description. ".repeat(600), sources: [review.historyEvents[0].ref] }];
				if (body.evidence.includes("Never delete ARCHIVE.txt.")) {
					found = true;
					result.tool.arguments.states[0].decisions = [{ text: "Never delete ARCHIVE.txt.", sources: [ref] }];
				}
				return result;
			}
			assert(found, "the unseen late decision reaches independent reconstruction first");
			assert(JSON.stringify(body.independentThreadMap).length > 90000, "the full comparison is not cut to the ordinary update's context guard");
			assert.match(JSON.stringify(body.independentThreadMap), /Never delete ARCHIVE/);
			assert.equal(body.graph.nodes.length, 1, "saved map has not been modified during reconstruction");
			return replacement(request, { upsertNodes: [{ id: "archive-hold", parent: "main", kind: "rule", state: "active", label: "Preserve archive",
				intent: "Never delete ARCHIVE.txt.", observed: "", actor: "lead", sources: [ref] }] });
		});
		await mom.update(undefined, undefined, 1, false, review);
		assert(checkedClosingClaim, "the closing claim can be checked against the independently reconstructed earlier decision");
		assert.equal(mom.graph.nodes.find(n => n.id === "archive-hold")?.intent, "Never delete ARCHIVE.txt.");
		assert.equal(mom.checkpoint!.cut.parent, manager.getLeafId());
		assert.equal(mom.more, false);
		assert.equal(h.requests().filter(r => input(r).chapterIds).length, 6, "five pages in the first chapter and one in the second, all processed");
		const calls = h.requests().length;
		const restored = h.createMom();
		try {
			await restored.open(); await restored.update();
			assert.deepEqual(restored.graph, mom.graph);
			assert.equal(h.requests().length, calls);
		} finally { restored.close(); }
	} finally { mom.close(); await h.close(); }
});

test("failed independent reconstruction preserves graph and coverage and retries the audit", { timeout: 15000 }, async () => {
	const h = await setup(), mom = h.createMom();
	try {
		await h.runtime.session.prompt("Keep the existing map."); await mom.open(); await mom.update();
		const before = structuredClone(mom.checkpoint);
		const review = compaction(h.runtime.session.sessionManager);
		h.api.onUnscripted(() => ({ tool: { name: "record_thread_map", arguments: { states: [] } } }));
		await assert.rejects(mom.update(undefined, undefined, 1, false, review), /Invalid thread-map/);
		assert.deepEqual(mom.checkpoint, before);
		assert.equal(mom.gaps.length, 0);
		assert.equal((await readSidecar(h)).filter(r => r.type === "map").length, 1);
		h.api.onUnscripted(request => replacement(request));
		await mom.update(undefined, undefined, 2, true);
		assert(input(h.requests().at(-1)).independentThreadMap, "refresh retries the full audit, not an ordinary update");
		assert.notDeepEqual(mom.checkpoint?.cut, before?.cut);
	} finally { mom.close(); await h.close(); }
});

test("reconstruction reports invented and summary-only sources together before accepting a repair", { timeout: 15000 }, async () => {
	const h = await setup(), mom = h.createMom();
	try {
		await h.runtime.session.prompt("Keep the audit grounded."); await mom.open(); await mom.update();
		const before = structuredClone(mom.checkpoint), review = compaction(h.runtime.session.sessionManager);
		const raw = review.historyEvents.find(event => event.kind === "user")!.ref;
		let attempts = 0;
		h.api.onUnscripted(request => {
			const body = input(request);
			if (!body.chapterIds) {
				assert.equal(attempts, 2);
				assert.deepEqual(body.independentThreadMap[0].states[0].decisions, [{ text: "Keep the audit grounded.", sources: [raw] }]);
				return replacement(request);
			}
			assert.deepEqual(mom.checkpoint, before, "reconstruction never publishes graph or coverage");
			const result = replacement(request);
			if (++attempts === 1) result.tool.arguments.states[0].decisions = [
				{ text: "Unsupported completion.", sources: [review.triggerRef] },
				{ text: "Invented direction.", sources: ["missing-source"] },
			];
			else {
				assert.match(request.messages.at(-1).content, /Summary-only claim on \S+: Unsupported completion/);
				assert.match(request.messages.at(-1).content, /Unknown source: missing-source/);
				result.tool.arguments.states[0].decisions = [{ text: "Keep the audit grounded.", sources: [raw] }];
			}
			return result;
		});
		await mom.update(undefined, undefined, 1, false, review);
		assert.equal(mom.error, undefined);
		assert.equal((await readSidecar(h)).filter(record => record.type === "map").length, 2);
	} finally { mom.close(); await h.close(); }
});

test("a repeated summary-only thread-map claim is dropped without blocking the audit", { timeout: 15000 }, async () => {
	const h = await setup(), mom = h.createMom();
	try {
		await h.runtime.session.prompt("Keep the audit moving."); await mom.open(); await mom.update();
		const before = structuredClone(mom.checkpoint), review = compaction(h.runtime.session.sessionManager);
		let mapAttempts = 0, compared = false;
		h.api.onUnscripted(request => {
			const body = input(request);
			if (body.chapterIds) {
				mapAttempts++;
				const result: any = replacement(request);
				result.tool.arguments.states[0].decisions = [{ text: "Unsupported summary claim.", sources: [review.triggerRef] }];
				return result;
			}
			compared = true;
			assert.equal(body.independentThreadMap[0].states[0].decisions.length, 0, "the unsupported summary claim is omitted, not promoted");
			return replacement(request);
		});
		await mom.update(undefined, undefined, 1, false, review);
		assert.equal(mapAttempts, 2, "the model gets its one deterministic repair before safe omission");
		assert(compared);
		assert.equal(mom.error, undefined);
		assert.notDeepEqual(mom.checkpoint?.cut, before?.cut);
	} finally { mom.close(); await h.close(); }
});

test("reconstruction keeps compliant items when another item repeats an unrepairable citation", { timeout: 15000 }, async () => {
	const h = await setup(), mom = h.createMom();
	try {
		await h.runtime.session.prompt("Keep the audit grounded."); await mom.open(); await mom.update();
		const review = compaction(h.runtime.session.sessionManager);
		const raw = review.historyEvents.find(event => event.kind === "user")!.ref;
		let attempts = 0;
		h.api.onUnscripted(request => {
			if (!input(request).chapterIds) return replacement(request);
			const result = replacement(request);
			// One repair round is spent, and the model repeats the same summary-only citation: the
			//// compliant item must survive instead of the whole chapter being discarded.
			result.tool.arguments.states[0].decisions = [
				{ text: "Unsupported completion.", sources: [review.triggerRef] },
				{ text: "Grounded direction.", sources: [raw] },
			];
			attempts++;
			return result;
		});
		await mom.update(undefined, undefined, 0, false, review);
		assert.equal(attempts, 2, "reconstruction and its one repair round both ran");
		assert.equal(mom.error, undefined, "an unrepairable item is dropped, not fatal");
		const saved = (await readSidecar(h)).filter(record => record.type === "map");
		assert.equal(saved.length, 2, "the map is published");
	} finally { mom.close(); await h.close(); }
});

test("audit repairs an unknown source and reads beyond two pages, including shortened source IDs", { timeout: 15000 }, async () => {
	const h = await setup(), mom = h.createMom();
	try {
		await h.runtime.session.prompt("Check the recorded test outcome."); await mom.open(); await mom.update();
		const manager = h.runtime.session.sessionManager;
		const id = manager.appendMessage({ role: "toolResult", toolCallId: "test", toolName: "bash", isError: false,
			content: [{ type: "text", text: "o".repeat(12000) + "FINAL: 7 failed" }], timestamp: Date.now() });
		const review = compaction(manager);
		const ref = `${manager.getSessionId()}:${id}`;
		let pages = 0, readText = "", nextOffset: number | null = 0;
		let requestedInvalid = false, lookupRejected = false;
		h.api.onUnscripted(request => {
			const body = input(request);
			if (body.chapterIds) {
				if (!requestedInvalid) {
					requestedInvalid = true;
					return { tool: { name: "inspect_evidence", arguments: { ref: manager.getSessionId(), offset: 0, limit: 4000 } } };
				}
				const last = request.messages.at(-1);
				if (last.role === "tool" && last.content.startsWith("Unknown source:")) lookupRejected = true;
				else if (last.role === "tool") {
					const page = JSON.parse(last.content);
					assert.equal(page.ref, ref);
					readText += page.text; nextOffset = page.nextOffset; pages++;
				}
				if (nextOffset !== null) return { tool: { name: "inspect_evidence", arguments: { ref: id, offset: nextOffset, limit: 4000 } } };
				const result: any = replacement(request);
				result.tool.arguments.states[0].artifacts = [{ text: "Recorded tests failed, not passed.", sources: [id] }];
				return result;
			}
			assert.deepEqual(body.independentThreadMap[0].states[0].artifacts[0].sources, [ref]);
			assert.deepEqual(body.independentThreadMap[0].sourceMetadata[ref], {
				at: manager.getEntry(id)!.timestamp, actor: "lead", kind: "tool_result",
			}, "comparison receives original source chronology and kind, not model-generated timestamps");
			return replacement(request);
		});
		await mom.update(undefined, undefined, 1, false, review);
		assert(lookupRejected, "a session-only ID is rejected, not guessed or treated as evidence");
		assert.equal(pages, 4);
		assert.match(readText, /FINAL: 7 failed/);
		assert.equal(mom.error, undefined);
	} finally { mom.close(); await h.close(); }
});

test("session invalidation during reconstruction cannot publish or begin comparison", { timeout: 15000 }, async () => {
	const h = await setup(), mom = h.createMom();
	try {
		await h.runtime.session.prompt("Preserve the old map."); await mom.open(); await mom.update();
		const before = mom.checkpoint;
		const review = compaction(h.runtime.session.sessionManager), started = deferred(), release = deferred();
		h.api.onUnscripted(request => { started.resolve(); return { ...replacement(request), gate: release }; });
		const update = mom.update(undefined, undefined, 1, false, review);
		const rejected = assert.rejects(update, /abort|superseded/i);
		await started.promise; mom.close(); release.resolve(); await rejected;
		assert.equal(mom.checkpoint, before);
		assert.equal(h.requests().length, 2, "no graph comparison after invalidation");
	} finally { mom.close(); await h.close(); }
});
