import type { SessionBeforeCompactEvent, SessionCompactEvent } from "@earendil-works/pi-coding-agent";
import { extractEvents, renderEvents, type Entry, type FeedEvent } from "./feed.ts";

export interface PendingCompactionReview {
	sessionId: string;
	firstKeptEntryId: string;
	rawEntries: Entry[];
	rawEvents: FeedEvent[];
}

export interface CompactionReview {
	kind: "compaction_review";
	summary: string;
	firstKeptEntryId: string;
	triggerRef: string;
	triggerEvent: FeedEvent;
	rawReplacedEvents: string;
	rawEntryCount: number;
	rawEventCount: number;
	omittedRawEventCount: number;
}

/** Capture the exact selected-branch entries replaced by this compaction before Pi mutates context. */
export function prepareCompactionReview(event: SessionBeforeCompactEvent, sessionId: string): PendingCompactionReview {
	const entries = event.branchEntries as Entry[];
	const end = entries.findIndex(entry => entry.id === event.preparation.firstKeptEntryId);
	if (end < 0) throw new Error("Compaction's first kept entry is absent from its source branch.");
	let start = 0;
	for (let i = end - 1; i >= 0; i--) if (entries[i].type === "compaction") {
		const previousFirstKept = entries[i].firstKeptEntryId;
		if (typeof previousFirstKept !== "string") throw new Error("Previous compaction is missing its first kept entry.");
		start = entries.findIndex((entry, index) => index <= i && entry.id === previousFirstKept);
		if (start < 0) throw new Error("Previous compaction's first kept entry is absent from its source branch.");
		break;
	}
	const rawEntries = entries.slice(start, end);
	const stream = { key: sessionId, actor: "lead" };
	return { sessionId, firstKeptEntryId: event.preparation.firstKeptEntryId, rawEntries,
		rawEvents: rawEntries.flatMap(entry => extractEvents(stream, entry)) };
}

/** Bind the successful provider result to the immutable raw segment captured by the before hook. */
export function finishCompactionReview(pending: PendingCompactionReview, event: SessionCompactEvent, activeRefs: ReadonlySet<string> = new Set()): CompactionReview {
	if (event.compactionEntry.firstKeptEntryId !== pending.firstKeptEntryId) {
		throw new Error("Compaction result does not match the raw segment captured before compaction.");
	}
	// Keep this background input bounded. Source events still governing the current map
	// are selected first; remaining room samples the actual replaced segment in order.
	const limit = 36000, selected = new Set<FeedEvent>();
	let used = 0;
	const add = (item: FeedEvent) => {
		const rendered = renderEvents([item]);
		if (!selected.has(item) && used + rendered.length <= limit) { selected.add(item); used += rendered.length; }
	};
	for (const item of pending.rawEvents) if (activeRefs.has(item.ref)) add(item);
	for (const item of pending.rawEvents) add(item);
	const raw = pending.rawEvents.filter(item => selected.has(item));
	const triggerRef = `${pending.sessionId}:${event.compactionEntry.id}`;
	return { kind: "compaction_review", summary: event.compactionEntry.summary ?? "", firstKeptEntryId: pending.firstKeptEntryId,
		triggerRef, triggerEvent: { ref: triggerRef, at: event.compactionEntry.timestamp, actor: "lead", kind: "compaction" }, rawReplacedEvents: renderEvents(raw), rawEntryCount: pending.rawEntries.length, rawEventCount: pending.rawEvents.length,
		omittedRawEventCount: pending.rawEvents.length - raw.length };
}
