// Cold-start bootstrap. A long backlog must not become one Mom proposal per 24,000-character
// capture window: that window is a per-call context guard, not a schedule. Instead, walk the
// branch locally (no model calls), segment on compaction boundaries into chapters, extract a
// fixed schema per chapter with source pointers, and hand Mom ONE bounded chapter-chain digest.
//
// Design follows the thread-map skill: normalize first, segment on compaction, extract state not
// prose, and treat every compaction summary as a claim rather than truth. The host performs no
// semantic judgment here — it emits recorded facts with pointers; Mom synthesizes the graph.
//
// Cut safety: the digest always describes exactly the evidence the feed drained, and the returned
// cut is the drain's own cut. Coverage is therefore never claimed beyond processed evidence, and
// worker cursors keep matching the drained end.
import type { Cut, FeedEvent } from "./feed.ts";

export interface BootstrapPolicy {
	/** Compaction entries are chapter boundaries; this caps how many chapters enter one drain. */
	maxChapters: number;
	/** Hard bound on digest characters, so one model message stays inside the context guard. */
	maxDigestChars: number;
	/** Safety net on local drain windows. Each window is one 24,000-character capture. */
	maxWindows: number;
}
export const DEFAULT_BOOTSTRAP_POLICY: BootstrapPolicy = { maxChapters: 24, maxDigestChars: 48000, maxWindows: 400 };

export interface ChapterDirection { ref: string; text: string }
export interface Chapter {
	index: number;
	startRef: string;
	endRef: string;
	entries: number;
	narrativeChars: number;
	workersSettled: number;
	firstDirection?: ChapterDirection;
	middleDirections: ChapterDirection[];
	lastDirection?: ChapterDirection;
	omittedDirections: number;
	closingCompactions: number;
}
export interface BootstrapDigest {
	text: string;
	cut: Cut;
	chapters: number;
	coveredThroughRef: string;
	windows: number;
	/** Evidence remained beyond the drain: the caller must keep catching up, not claim it. */
	remainingMore: boolean;
}

const DIRECTIONS_PER_CHAPTER = 6;
const DIRECTION_CHARS = 600;

const isCompaction = (event: FeedEvent) => event.kind === "compaction";
const isDirection = (event: FeedEvent) => event.actor === "lead" && (event.kind === "user" || event.kind === "user_answer");
const flat = (text: string) => text.replace(/\s+/g, " ").trim();
const clamp = (text: string, limit: number) => (text.length <= limit ? text : `${text.slice(0, Math.max(0, limit - 1))}…`);

/** Chapters break on compaction entries; the compaction event closes the chapter it ends. */
export function segmentChapters(events: readonly FeedEvent[]): Chapter[] {
	const chapters: Chapter[] = [];
	let current: Chapter | undefined;
	for (const event of events) {
		if (!current) {
			current = { index: chapters.length + 1, startRef: event.ref, endRef: event.ref, entries: 0,
				narrativeChars: 0, workersSettled: 0, middleDirections: [], omittedDirections: 0, closingCompactions: 0 };
		}
		current.entries++;
		current.narrativeChars += event.text?.length ?? 0;
		if (event.kind === "delegate_receipt" && (event.status === "complete" || event.status === "settled")) current.workersSettled++;
		if (isCompaction(event)) current.closingCompactions++;
		if (isDirection(event) && event.text) {
			const direction = { ref: event.ref, text: event.text };
			if (!current.firstDirection) current.firstDirection = direction;
			else if (current.middleDirections.length < DIRECTIONS_PER_CHAPTER - 2) current.middleDirections.push(direction);
			else current.omittedDirections++;
			current.lastDirection = direction;
		}
		current.endRef = event.ref;
		if (isCompaction(event)) { chapters.push(current); current = undefined; }
	}
	if (current) chapters.push(current);
	return chapters;
}

function chapterBlock(chapter: Chapter, budget: number): string {
	const lines = [`Chapter ${chapter.index} · entries ${chapter.entries} · narrative ${chapter.narrativeChars} chars · workers settled ${chapter.workersSettled} · compactions ${chapter.closingCompactions}`];
	const directionLine = (label: string, direction: ChapterDirection) => `  ${label} [src:${direction.ref}] ${clamp(flat(direction.text), DIRECTION_CHARS)}`;
	if (chapter.firstDirection) lines.push(directionLine("first direction", chapter.firstDirection));
	for (const direction of chapter.middleDirections) lines.push(directionLine("direction", direction));
	if (chapter.omittedDirections) lines.push(`  … ${chapter.omittedDirections} further lead directions in this chapter`);
	if (chapter.lastDirection && chapter.lastDirection !== chapter.firstDirection) lines.push(directionLine("last direction", chapter.lastDirection));
	if (chapter.closingCompactions) lines.push(`  ${chapter.closingCompactions} compaction(s) closed this chapter. Treat the provider summary for each as a CLAIM about this chapter, verified against the recorded directions above when they disagree.`);
	// Trim trailing detail lines rather than whole chapters: the cut must still cover what is emitted.
	while (lines.length > 1 && lines.join("\n").length > budget) lines.splice(-1, 1);
	return lines.join("\n");
}

/** Emits exactly the chapters given, each bounded, so the text can never outgrow the guard. */
export function chapterDigest(chapters: readonly Chapter[], policy: BootstrapPolicy): string | undefined {
	const perChapter = Math.max(2000, Math.floor(policy.maxDigestChars / Math.max(1, chapters.length)));
	const lines = ["BOOTSTRAP CHAPTER CHAIN — recorded evidence compressed by the host with source pointers. No semantic judgment is added; synthesize the work map from these directions.", ""];
	for (const chapter of chapters) {
		const block = chapterBlock(chapter, perChapter);
		if (lines.join("\n").length + block.length + 1 > policy.maxDigestChars) return undefined; // caller keeps the ordinary path
		lines.push(block, "");
	}
	return lines.join("\n");
}

/** A feed shape sufficient for bootstrap: local capture windows plus citation resolution. */
export interface BootstrapFeed {
	capture(limit?: number, deferRunningWorkers?: boolean): Promise<{ events: FeedEvent[]; cut: Cut; more: boolean }>;
	readonly events: readonly FeedEvent[];
	readonly hasRunningWorkers: boolean;
}

/**
 * Drain the backlog locally, then return one bounded digest plus the drain's own cut. Stops at the
 * chapter bound, at the window safety net, or when the transcript is exhausted. Returns undefined
 * when the digest cannot be bounded or the backlog is not a backlog, so the caller keeps the
 * ordinary per-window path.
 */
export async function bootstrapDigest(feed: BootstrapFeed, firstMore: boolean, policy: BootstrapPolicy): Promise<BootstrapDigest | undefined> {
	if (!firstMore) return undefined; // a single window already holds everything: nothing to compress
	if (feed.hasRunningWorkers) return undefined; // live work keeps the ordinary path
	let more: boolean = firstMore, windows = 0, cut: Cut | undefined, chapters = 0;
	while (more && windows < policy.maxWindows) {
		const captured = await feed.capture(24000, true);
		windows++;
		cut = captured.cut;
		more = captured.more;
		if (!captured.events.length) break;
		// Count chapters incrementally from this window's events: re-segmenting the whole backlog
		// per window is quadratic and starves the timing-sensitive tests that run alongside.
		for (const event of captured.events) if (event.kind === "compaction") chapters++;
		if (chapters > policy.maxChapters) break;
	}
	if (!cut || !feed.events.length) return undefined;
	const segments = segmentChapters(feed.events);
	if (!segments.length) return undefined;
	const text = chapterDigest(segments, policy);
	if (!text) return undefined;
	return { text, cut, chapters: segments.length, coveredThroughRef: segments.at(-1)!.endRef, windows, remainingMore: more };
}
