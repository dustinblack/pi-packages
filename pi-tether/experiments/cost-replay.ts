// Todo 015: live-cadence cost replay. Production Mom over the preserved 008 bundles at
// production wake/cadence rules, comparing per-reply Mom usage against per-reply lead usage.
// Separate from the frozen 008 scoring harness: cost-only artifacts, no scoring inputs touched.
// No raw transcript text is written to any artifact; no session or sidecar outside temp is changed.
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { findPackageJSON } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { Mom, DEFAULT_MODEL } from "../src/mother.ts";
import { emptyGraph, type WorkGraph } from "../src/graph.ts";
import { renderEvents, type Cut, type FeedEvent } from "../src/feed.ts";
import type { MomStore, SidecarRecord, SidecarWriteType } from "../src/sidecar.ts";

const MODEL = "openai-codex/gpt-5.6-luna";
const BUNDLES = "/private/tmp/todo-008-trajectory";
const CORPORA = ["pi-packages", "buzz", "ssmp"] as const;
const OUT = resolve(import.meta.dirname, "evidence/todo-015");
const BATCH_CHARS = 24000; // production feed capture ceiling
const TRANSPORT_FAILURE_LIMIT = 5; // consecutive non-deterministic update failures before aborting

const { values } = parseArgs({ options: {
	dry: { type: "boolean" }, fresh: { type: "boolean" }, corpus: { type: "string", multiple: true },
	interval: { type: "string" }, "max-updates": { type: "string" },
} });
const INTERVAL = Number(values.interval ?? 15000);
const MAX_UPDATES = Number(values["max-updates"] ?? 150);
const SELECTED = values.corpus?.length ? values.corpus : [...CORPORA];
for (const c of SELECTED) if (!(CORPORA as readonly string[]).includes(c)) throw new Error(`Unknown corpus: ${c}`);
if (!Number.isSafeInteger(INTERVAL) || INTERVAL < 0 || !Number.isSafeInteger(MAX_UPDATES) || MAX_UPDATES < 1) throw new Error("Invalid interval/max-updates.");

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const jsonSafe = (value: unknown) => JSON.parse(JSON.stringify(value, (key, item) => key === "signal" || key === "onPayload" ? undefined : item));
const sleep = (ms: number) => new Promise(r => setTimeout(r, Math.max(0, ms)));

type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number; reasoning?: number; totalTokens?: number;
	cost?: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number } };
interface MomReply { seq: number; corpus: string; update: number; at: string; model: string; stopReason: string; usage: Usage }
interface UpdateRow { corpus: string; update: number; batch: number; chunk: number; reason: string; triggerAt: string;
	events: number; chars: number; firstRef: string; lastRef: string; transcriptGapMs: number; waitMs: number;
	wallStart: string; wallEnd: string; calls: number; outcome: "accepted" | "no-op" | "deterministic-failure" | "gap" | "transport-error"; error?: string }
interface LeadReply { corpus: string; stream: string; actor: "lead" | "worker"; id: string; at: string; usage: Usage }

// ---------------------------------------------------------------- production structure copies
class MemoryStore implements MomStore {
	readonly records: SidecarRecord[] = [];
	constructor(private sessionId: string) {}
	async load() { return this.records; }
	async append(type: SidecarWriteType, data: Record<string, any>) {
		const record: SidecarRecord = { id: `checkpoint-${String(this.records.length + 1).padStart(4, "0")}`, sessionId: this.sessionId,
			type: type === "control" ? "map" : type, at: Date.now(), data: clone(type === "control" ? { enabled: data.enabled } : data) };
		this.records.push(record); return record;
	}
}
class ReplaySession {
	private entries = new Map<string, any>();
	private leaf: string | null = null;
	private count = 0;
	constructor(private sessionId: string, private cwd: string) {}
	advance(count: number) {
		for (let i = 0; i < count; i++) {
			const id = `replay-${String(++this.count).padStart(6, "0")}`;
			this.entries.set(id, { id, parentId: this.leaf, type: "custom_message", timestamp: new Date(this.count).toISOString(), customType: "replay.cursor", content: "" });
			this.leaf = id;
		}
		return this.leaf;
	}
	getSessionId() { return this.sessionId; }
	getSessionFile() { return resolve(this.cwd, `${this.sessionId}.jsonl`); }
	getCwd() { return this.cwd; }
	getLeafId() { return this.leaf; }
	getEntry(id: string) { return this.entries.get(id); }
	getBranch() {
		const result: any[] = [];
		for (let id = this.leaf; id;) { const entry = this.entries.get(id); if (!entry) break; result.push(entry); id = entry.parentId; }
		return result.reverse();
	}
}
function installFeedAdapter(mom: Mom, session: ReplaySession) {
	let pending: FeedEvent[] = [];
	const feed = mom.feed as any;
	let captured: FeedEvent[] = [];
	feed.capture = async (limit = BATCH_CHARS) => {
		// Mirror production capture: take as many whole events as fit, leave the remainder pending,
		// and report `more` so the caller continues exactly as a live feed would.
		const cap = Math.min(BATCH_CHARS, limit), taken: FeedEvent[] = [];
		while (pending.length && renderEvents([...taken, pending[0]!]).length <= cap) taken.push(pending.shift()!);
		for (const event of taken) { feed.events.push(event); feed.byRef.set(event.ref, event); }
		const parent = session.advance(taken.length);
		const cut: Cut = { parent, workers: [] };
		captured = taken;
		return { events: taken, cut, gaps: [], more: pending.length > 0 };
	};
	return {
		stage(events: FeedEvent[]) { pending.push(...events); },
		pendingCount: () => pending.length,
		takeCaptured: () => { const taken = captured; captured = []; return taken; },
	};
}
const graph = (mom: Mom): WorkGraph => clone(mom.checkpoint?.graph ?? emptyGraph());

// ---------------------------------------------------------------- wake planner (production rules)
interface PlannedBatch { from: number; to: number; triggerMs: number; reason: string }
/**
 * Production wake rule: settled lead turn (assistant stop), delegate settle (worker-final stop
 * proxy + extracted receipt), or compaction. One update per settle, coalesced so starts are at
 * least `intervalMs` apart in transcript time; compaction reviews run immediately. Trailing
 * events with no settle are dropped, matching a session that never wakes again.
 */
function planBatches(events: FeedEvent[], intervalMs: number): { batches: PlannedBatch[]; droppedTrailing: number } {
	const isSettle = (e: FeedEvent) => (e.kind === "assistant" && e.status === "stop") ||
		(e.kind === "delegate_receipt" && e.status === "complete") || e.kind === "compaction";
	const batches: PlannedBatch[] = [];
	let start = 0, prevTrigger: number | null = null, armed = false;
	const close = (end: number, triggerMs: number, reason: string) => {
		if (end > start) batches.push({ from: start, to: end, triggerMs, reason });
		start = end; prevTrigger = triggerMs; armed = false;
	};
	for (let i = 0; i < events.length; i++) {
		const e = events[i]!, t = Date.parse(e.at);
		if (armed && prevTrigger !== null && t >= prevTrigger + intervalMs) close(i, prevTrigger + intervalMs, "throttle");
		if (isSettle(e)) {
			if (e.kind === "compaction") close(i + 1, t, "compaction");
			else if (prevTrigger === null) close(i + 1, t, "first-settle");
			else if (t < prevTrigger + intervalMs) armed = true;
			else close(i + 1, t, "settle");
		}
	}
	let droppedTrailing = 0;
	if (start < events.length) {
		if (armed && prevTrigger !== null) close(events.length, prevTrigger + intervalMs, "throttle-tail");
		else { droppedTrailing = events.length - start; start = events.length; }
	}
	return { batches, droppedTrailing };
}
function batchRefs(events: FeedEvent[], batch: { from: number; to: number }) {
	return { first: events[batch.from]?.ref ?? "", last: events[batch.to - 1]?.ref ?? "", chars: renderEvents(events.slice(batch.from, batch.to)).length };
}

// ---------------------------------------------------------------- lead/worker per-reply usage
function leadReplies(corpus: string): { replies: LeadReply[]; actorUsage: Record<string, number> | null } {
	const bundle = `${BUNDLES}/${corpus}`;
	const source = JSON.parse(readFileSync(`${bundle}/sources.json`, "utf8"));
	const metrics = JSON.parse(readFileSync(`${bundle}/metrics.json`, "utf8"));
	const events = readFileSync(`${bundle}/feed.jsonl`, "utf8").trim().split("\n").map(line => JSON.parse(line) as FeedEvent);
	const idsByStream = new Map<string, Set<string>>();
	for (const event of events) {
		const [key, id] = event.ref.split(":");
		if (!key || !id) continue;
		idsByStream.set(key, (idsByStream.get(key) ?? new Set()).add(id));
	}
	const replies: LeadReply[] = [];
	for (const stream of source.streams as { key: string; file: string; actor: string }[]) {
		const ids = idsByStream.get(stream.key);
		if (!ids || !existsSync(stream.file)) continue;
		for (const line of readFileSync(stream.file, "utf8").split("\n")) {
			if (!line) continue;
			let entry: any; try { entry = JSON.parse(line); } catch { continue; }
			const usage = entry?.type === "message" && entry.message?.role === "assistant" ? entry.message.usage : undefined;
			if (!usage || !ids.has(entry.id)) continue;
			replies.push({ corpus, stream: stream.key, actor: stream.actor === "lead" ? "lead" : "worker", id: entry.id, at: entry.timestamp,
				usage: { input: usage.input ?? 0, output: usage.output ?? 0, cacheRead: usage.cacheRead ?? 0, cacheWrite: usage.cacheWrite ?? 0,
					reasoning: usage.reasoning, totalTokens: usage.totalTokens, cost: usage.cost } });
		}
	}
	replies.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
	return { replies, actorUsage: metrics.actorUsage ?? null };
}

// ---------------------------------------------------------------- totals
interface Totals { replies: number; input: number; output: number; cacheRead: number; cacheWrite: number; cost: number; costRows: number }
function totals(rows: { usage: Usage }[]): Totals {
	const t: Totals = { replies: rows.length, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, costRows: 0 };
	for (const row of rows) {
		t.input += row.usage.input || 0; t.output += row.usage.output || 0;
		t.cacheRead += row.usage.cacheRead || 0; t.cacheWrite += row.usage.cacheWrite || 0;
		if (row.usage.cost && typeof row.usage.cost.total === "number") { t.cost += row.usage.cost.total; t.costRows++; }
	}
	return t;
}
const cacheShare = (t: { input: number; cacheRead: number }) => (t.input + t.cacheRead) > 0 ? t.cacheRead / (t.input + t.cacheRead) : null;
/** Sensitivity: what Mom would cost if every cache-read token were billed as fresh input. */
function worstCaseCost(rows: { usage: Usage }[]): number {
	let total = 0;
	for (const row of rows) {
		const u = row.usage; if (!u.cost) continue;
		const rate = u.input > 0 ? u.cost.input / u.input : 0;
		total += u.cost.total + (u.cacheRead || 0) * rate;
	}
	return total;
}

// ---------------------------------------------------------------- run
const run = async () => {
	if (DEFAULT_MODEL !== MODEL) throw new Error(`Production default changed: ${DEFAULT_MODEL}`);
	mkdirSync(OUT, { recursive: true });
	const repliesPath = resolve(OUT, "mom-replies.jsonl"), updatesPath = resolve(OUT, "updates.jsonl"), leadPath = resolve(OUT, "lead-replies.json");
	if (values.fresh) for (const p of [repliesPath, updatesPath, leadPath, resolve(OUT, "run.partial.json")]) if (existsSync(p)) rmSync(p);

	// Lead/worker per-reply usage first (read-only, no model).
	if (!existsSync(leadPath)) {
		const all: { corpus: string; replies: LeadReply[]; metricsActorUsage: Record<string, number> | null }[] = [];
		for (const corpus of CORPORA) {
			const { replies, actorUsage } = leadReplies(corpus);
			all.push({ corpus, replies, metricsActorUsage: actorUsage });
			console.log(`[lead] ${corpus}: ${replies.filter(r => r.actor === "lead").length} lead replies, ${replies.filter(r => r.actor === "worker").length} worker replies`);
		}
		writeFileSync(leadPath, JSON.stringify(all, null, 2) + "\n");
	}
	if (values.dry) {
		for (const corpus of SELECTED) {
			const events = readFileSync(`${BUNDLES}/${corpus}/feed.jsonl`, "utf8").trim().split("\n").map(l => JSON.parse(l) as FeedEvent);
			const plan = planBatches(events, INTERVAL);
			const sizes = plan.batches.map(b => batchRefs(events, b).chars);
			console.log(`[dry] ${corpus}: events=${events.length} batches=${plan.batches.length} droppedTrailing=${plan.droppedTrailing} maxBatchChars=${Math.max(0, ...sizes)}`);
		}
		return;
	}

	const runtime = await ModelRuntime.create({ allowModelNetwork: false });
	const registry = new ModelRegistry(runtime);
	const selected = registry.find("openai-codex", "gpt-5.6-luna");
	if (!selected || selected.api !== "openai-codex-responses") throw new Error("Exact production Luna model/API unavailable; no fallback permitted.");

	let replySeq = 0, current: { corpus: string; update: number } = { corpus: "", update: 0 };
	const logReply = (reply: MomReply) => { appendFileSync(repliesPath, JSON.stringify(reply) + "\n"); };
	const audited = {
		find(provider: string, id: string) { return provider === "openai-codex" && id === "gpt-5.6-luna" ? selected : undefined; },
		async complete(model: any, context: any, options: any) {
			const response = await registry.complete(model, context, options);
			const u = response.usage ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: { total: 0 } };
			replySeq++;
			if (process.env.COST_DEBUG) for (const block of response.content ?? []) if (block.type === "toolCall")
				console.error(`[debug] reply#${replySeq} ${block.name} ${JSON.stringify(block.arguments).slice(0, 1200)}`);
			logReply({ seq: replySeq, corpus: current.corpus, update: current.update, at: new Date().toISOString(),
				model: `${model.provider}/${model.id}`, stopReason: response.stopReason, usage: jsonSafe(u) });
			return response;
		},
		streamSimple() { throw new Error("No fallback API is permitted."); },
	};

	const partialPath = resolve(OUT, "run.partial.json");
	const pruneCorpus = (path: string, corpus: string) => {
		// A restarted corpus must not double-count rows from its aborted attempt.
		if (!existsSync(path)) return;
		const rows = readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map(l => JSON.parse(l));
		const kept = rows.filter(r => r.corpus !== corpus);
		writeFileSync(path, kept.length ? kept.map(r => JSON.stringify(r)).join("\n") + "\n" : "");
	};
	const savePartial = (state: object) => { const tmp = partialPath + ".tmp"; writeFileSync(tmp, JSON.stringify({ schemaVersion: 1, ...state }, null, 2) + "\n"); renameSync(tmp, partialPath); };
	const completed = new Set<string>(existsSync(partialPath) ? JSON.parse(readFileSync(partialPath, "utf8")).completedCorpora ?? [] : []);
	const started = Date.now();
	let lastStartWall = 0, lastEndWall = 0, updatesThisRun = 0, failures = "";

	const summaryFromFiles = (status: string) => {
		const momRows = existsSync(repliesPath) ? readFileSync(repliesPath, "utf8").trim().split("\n").filter(Boolean).map(l => JSON.parse(l) as MomReply) : [];
		const leadAll = JSON.parse(readFileSync(leadPath, "utf8")) as { corpus: string; replies: LeadReply[]; metricsActorUsage: Record<string, number> | null }[];
		const leadRows = leadAll.flatMap(c => c.replies), leadOnly = leadRows.filter(r => r.actor === "lead"), workerRows = leadRows.filter(r => r.actor === "worker");
		const mom = totals(momRows), lead = totals(leadOnly), combined = totals(leadRows), workers = totals(workerRows);
		const momCost = mom.cost, momWorst = worstCaseCost(momRows);
		const checks = {
			mom_tokens_below_lead: mom.input + mom.output < lead.input + lead.output,
			mom_billable_below_lead: mom.input + mom.output + mom.cacheRead < lead.input + lead.output + lead.cacheRead,
			mom_cost_below_lead: lead.costRows > 0 ? momCost < lead.cost : null,
			mom_worst_case_cost_below_lead: lead.costRows > 0 ? momWorst < lead.cost : null,
			cache_share_reported: cacheShare(mom) !== null && cacheShare(lead) !== null,
		};
		return {
			schemaVersion: 1, status, measuredAt: new Date().toISOString(), elapsedMs: Date.now() - started,
			config: { model: MODEL, intervalMs: INTERVAL, batchChars: BATCH_CHARS, transportFailureLimit: TRANSPORT_FAILURE_LIMIT,
				corpora: SELECTED, maxUpdates: MAX_UPDATES, advisor: "disabled (production default)",
				gitRev: (() => { try { return execSync("git rev-parse --short HEAD", { cwd: resolve(import.meta.dirname, "../.."), encoding: "utf8" }).trim(); } catch { return null; } })() },
			mom: { ...mom, cacheShare: cacheShare(mom), worstCaseUncachedCost: momWorst },
			lead: { ...lead, cacheShare: cacheShare(lead) },
			leadPlusWorkers: { ...combined, cacheShare: cacheShare(combined) },
			workers: { ...workers, cacheShare: cacheShare(workers) },
			checks, pass: checks.mom_tokens_below_lead && checks.mom_billable_below_lead && checks.mom_cost_below_lead !== false && checks.cache_share_reported,
			momReplies: mom.replies, leadReplies: lead.replies, updates: (() => { try { return readFileSync(updatesPath, "utf8").trim().split("\n").filter(Boolean).length; } catch { return 0; } })(),
			completedCorpora: [...completed], failures,
			deviations: [
				"Transcript idle gaps are not slept: cache share is an upper bound; worstCaseUncachedCost is the sensitivity bound.",
				"Compaction review payloads are not replayed (synthetic session has no compaction entries); wake counts match, input is smaller at those boundaries.",
				"Worker settle proxy: worker-final assistant stop (receipts extracted only where present); up to 5 pi-packages delegate settles may be missed.",
				"Trailing events without a settle are dropped, matching production's no-wake-at-session-end behavior.",
				"One update call per settled closure, exactly like production; deterministic rejections follow production's failure-then-gap bookkeeping, and only non-deterministic failures are retried at the next closure.",
				"Advisor/screen disabled (production default); Kev's own cost is separate and local.",
			],
		};
	};

	try {
		for (const corpus of SELECTED) {
			if (completed.has(corpus)) { console.log(`[skip] ${corpus} already complete`); continue; }
			pruneCorpus(repliesPath, corpus); pruneCorpus(updatesPath, corpus);
			const events = readFileSync(`${BUNDLES}/${corpus}/feed.jsonl`, "utf8").trim().split("\n").map(l => JSON.parse(l) as FeedEvent);
			const plan = planBatches(events, INTERVAL);
			const session = new ReplaySession(`todo-015-${corpus}`, process.cwd());
			const store = new MemoryStore(session.getSessionId());
			const ctx = { sessionManager: session, modelRegistry: audited } as any;
			const mom = new Mom({ ctx, model: MODEL, store, current: () => true, changed() {} });
			await mom.open();
			const adapter = installFeedAdapter(mom, session);
			let update = 0, consecutiveTransportFailures = 0, lastCumulative = { calls: 0 };
			for (const [batchIdx, batch] of plan.batches.entries()) {
				// Events arrive for this wake; they stay pending until production's capture takes them.
				// Continuations drain whatever the capture left behind or queued after a failure,
				// mirroring production's dirty/more scheduling.
				adapter.stage(events.slice(batch.from, batch.to));
				for (let continuation = 0; continuation < 8; continuation++) {
					if (updatesThisRun >= MAX_UPDATES) throw new Error(`Update cap ${MAX_UPDATES} reached.`);
					const pendingBefore = adapter.pendingCount();
					const wait = Math.max(lastStartWall + INTERVAL, lastEndWall + 150) - Date.now();
					const waitMs = Math.max(0, wait);
					await sleep(waitMs);
					const wallStart = Date.now(); lastStartWall = wallStart; update++; updatesThisRun++;
					current = { corpus, update };
					// One production wake per call: deterministic rejections record a failure or open a gap
					// inside the call; continuations mirror production's dirty/more scheduling.
					const gapsBefore = mom.gaps.length;
					let error: string | undefined;
					try { await mom.update(); }
					catch (caught) { error = String(caught); }
					const outcome: UpdateRow["outcome"] = !error ? "accepted"
						: mom.failure ? "deterministic-failure"
						: mom.gaps.length > gapsBefore ? "gap"
						: "transport-error";
					const wallEnd = Date.now(); lastEndWall = wallEnd;
					const taken = adapter.takeCaptured();
					const usageRecords = store.records.filter(r => r.type === "usage");
					const cumulative = (usageRecords.at(-1)?.data.usage as any) ?? lastCumulative;
					// A wake with nothing staged makes no model call; it is a no-op, not an acceptance.
					const effectiveOutcome: UpdateRow["outcome"] = outcome === "accepted" && (cumulative.calls ?? 0) - lastCumulative.calls === 0 ? "no-op" : outcome;
					const fallback = batchRefs(events, batch);
					const row: UpdateRow = { corpus, update, batch: batchIdx, chunk: continuation, reason: batch.reason,
						triggerAt: new Date(batch.triggerMs).toISOString(), events: taken.length,
						chars: taken.length ? renderEvents(taken).length : 0,
						firstRef: taken[0]?.ref ?? fallback.first, lastRef: taken.at(-1)?.ref ?? fallback.last,
						transcriptGapMs: batch.triggerMs - (plan.batches[batchIdx - 1]?.triggerMs ?? batch.triggerMs),
						waitMs, wallStart: new Date(wallStart).toISOString(), wallEnd: new Date(wallEnd).toISOString(),
						calls: (cumulative.calls ?? 0) - lastCumulative.calls, outcome: effectiveOutcome, ...(error ? { error } : {}) };
					lastCumulative = { calls: cumulative.calls ?? 0 };
					appendFileSync(updatesPath, JSON.stringify(row) + "\n");
					savePartial({ status: "running", completedCorpora: [...completed], currentCorpus: corpus, currentBatch: batchIdx, updatesThisRun,
						momReplies: replySeq, elapsedMs: Date.now() - started });
					if (outcome === "transport-error") {
						consecutiveTransportFailures++;
						if (consecutiveTransportFailures >= TRANSPORT_FAILURE_LIMIT) throw new Error(`${corpus}: ${TRANSPORT_FAILURE_LIMIT} consecutive transport failures: ${error}`);
					} else consecutiveTransportFailures = 0;
					console.log(`[${corpus}] update ${update}/${plan.batches.length} (${batch.reason}${continuation ? ` +${continuation}` : ""}) events=${row.events} chars=${row.chars} calls=${row.calls} outcome=${effectiveOutcome} pendingLeft=${adapter.pendingCount()} replySeq=${replySeq}`);
					const consumedPending = pendingBefore > 0 && adapter.pendingCount() === 0;
					if (adapter.pendingCount() === 0 && !(effectiveOutcome !== "accepted" && effectiveOutcome !== "no-op" && consumedPending)) break;
					if (continuation === 7) throw new Error(`${corpus}: closure ${batchIdx} did not drain within 8 calls.`);
				}
			}
			mom.close();
			completed.add(corpus);
			savePartial({ status: "running", completedCorpora: [...completed], updatesThisRun, momReplies: replySeq, elapsedMs: Date.now() - started });
			console.log(`[done] ${corpus}: ${update} updates`);
		}
		const summary = summaryFromFiles("complete");
		writeFileSync(resolve(OUT, "run.json"), JSON.stringify(summary, null, 2) + "\n");
		savePartial({ status: "complete", completedCorpora: [...completed], updatesThisRun, momReplies: replySeq, elapsedMs: Date.now() - started });
		console.log(JSON.stringify({ status: summary.status, mom: summary.mom, lead: summary.lead, checks: summary.checks, pass: summary.pass }, null, 2));
		shutdown(0);
	} catch (error) {
		failures = String(error);
		const summary = summaryFromFiles("failed");
		writeFileSync(resolve(OUT, "run.json"), JSON.stringify(summary, null, 2) + "\n");
		savePartial({ status: "failed", completedCorpora: [...completed], updatesThisRun, momReplies: replySeq, error: failures, elapsedMs: Date.now() - started });
		console.error(failures);
		shutdown(1);
	}
};

// The Codex transport keeps websockets alive after the last call; close them explicitly so the
// process can exit instead of hanging (same failure mode seen in the 012 live capture).
const sdkApiPackage = findPackageJSON("@earendil-works/pi-ai", import.meta.resolve("@earendil-works/pi-coding-agent"));
const { closeOpenAICodexWebSocketSessions } = sdkApiPackage
	? await import(new URL("./dist/api/openai-codex-responses.js", pathToFileURL(sdkApiPackage)).href)
	: { closeOpenAICodexWebSocketSessions: () => {} };
const shutdown = (code: number) => {
	try { closeOpenAICodexWebSocketSessions(); } catch { /* best effort */ }
	process.exit(code);
};

await run();
