import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { Mom, DEFAULT_MODEL } from "../../src/mother.ts";
import { emptyGraph, type WorkGraph } from "../../src/graph.ts";
import { renderEvents, type FeedEvent, type Cut } from "../../src/feed.ts";
import type { MomStore, SidecarRecord, SidecarWriteType } from "../../src/sidecar.ts";
import { classifyGraphDiff } from "./classifier.ts";

const PACKET = "/private/tmp/todo-008-trajectory/validator-packet.json";
const BUNDLES = "/private/tmp/todo-008-trajectory";
const MODEL = "openai-codex/gpt-5.6-luna";
const CORPORA = ["pi-packages", "buzz", "ssmp"] as const;
const MAX_CALLS = 40;
const MAX_MS = 20 * 60_000;
const sha = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

interface PacketCase { id: string; corpus: string; coverage: string; boundaryEvent: number; boundaryRef: string; context: { ref: string; relation: string; text: string }[] }
interface Packet { version: number; blind: boolean; cases: PacketCase[] }
interface RawCall { sequence: number; corpus: string; attempt: number; caseId: string; phase: "pre-boundary" | "boundary" | "deterministic-retry" | "gap-refresh"; model: string; settings: Record<string, unknown>; request: unknown; response: unknown; usage: unknown }
const ATTEMPTS: Record<string, number> = { "pi-packages": 2, buzz: 1, ssmp: 1 };

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

/** Minimal chronological SessionReader. Evidence itself is supplied by the immutable extracted feed adapter. */
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
		for (let id = this.leaf; id;) { const entry = this.entries.get(id); result.push(entry); id = entry.parentId; }
		return result.reverse();
	}
}

function installFeedAdapter(mom: Mom, session: ReplaySession) {
	let pending: FeedEvent[] = [];
	const feed = mom.feed as any;
	feed.capture = async (limit = 24000) => {
		if (renderEvents(pending).length > Math.min(24000, limit)) throw new Error("Replay segment exceeds production's 24,000-character feed ceiling.");
		const events = pending; pending = [];
		for (const event of events) { feed.events.push(event); feed.byRef.set(event.ref, event); }
		const parent = session.advance(events.length);
		const cut: Cut = { parent, workers: [] };
		return { events, cut, gaps: [], more: false };
	};
	return (events: FeedEvent[]) => {
		if (pending.length) throw new Error("Replay adapter already has a pending segment.");
		pending = events;
	};
}

function graph(mom: Mom): WorkGraph { return clone(mom.checkpoint?.graph ?? emptyGraph()); }
async function hashFile(path: string) { return sha(await readFile(path)); }
function jsonSafe(value: unknown) { return JSON.parse(JSON.stringify(value, (key, item) => key === "signal" || key === "onPayload" ? undefined : item)); }

export async function run(outputPath: string) {
	if (DEFAULT_MODEL !== MODEL) throw new Error(`Production default changed: ${DEFAULT_MODEL}`);
	const started = Date.now(), partialPath = `${outputPath}.partial`, tempPath = `${outputPath}.tmp`;
	const packet = JSON.parse(await readFile(PACKET, "utf8")) as Packet;
	if (!packet.blind || packet.cases.length !== 15) throw new Error("Expected the sealed 15-case blind packet.");
	const firstFailurePath = resolve("pi-tether/experiments/trajectory-acceptance/attempt-1-failure.json");
	const firstFailure = JSON.parse(await readFile(firstFailurePath, "utf8"));
	const inputs: Record<string, string> = { packet: await hashFile(PACKET), "pi-tether/experiments/trajectory-acceptance/attempt-1-failure.json": await hashFile(firstFailurePath) };
	for (const corpus of CORPORA) for (const name of ["feed.jsonl", "feed.txt", "metrics.json", "sources.json"]) inputs[`${corpus}/${name}`] = await hashFile(`${BUNDLES}/${corpus}/${name}`);
	for (const path of ["src/mother.ts", "src/contract.ts", "src/graph.ts", "src/feed.ts", "src/checkpoint.ts", "experiments/trajectory-acceptance/classifier.ts", "experiments/trajectory-acceptance/replay.ts"])
		inputs[`pi-tether/${path}`] = await hashFile(resolve("pi-tether", path));
	const runtime = await ModelRuntime.create({ allowModelNetwork: false });
	const registry = new ModelRegistry(runtime);
	const selected = registry.find("openai-codex", "gpt-5.6-luna");
	if (!selected || selected.api !== "openai-codex-responses") throw new Error("Exact production Luna model/API unavailable; no fallback is permitted.");
	const rawCalls: RawCall[] = [], cases: any[] = [], transcripts: any[] = [], updates: any[] = [];
	let activeCorpus = "", activeAttempt = 0, activeCase = "", activePhase: RawCall["phase"] = "boundary", liveState: any = null;
	const artifact = (status: string) => ({ schemaVersion: 1, blind: true, status, model: MODEL, fallback: "none", reasoning: "low",
		background: { proposalCalls: 1, maxRepairCalls: 1, retrieval: false }, startedAt: new Date(started).toISOString(),
		checkpointedAt: new Date().toISOString(), elapsedMs: Date.now() - started, inputs,
		selection: "chronological lead user/user_answer evidence through each final selected boundary; no unrelated tail",
		attempts: { "pi-packages": 2, buzz: 1, ssmp: 1 }, recoveredAttempt1: firstFailure,
		rawCallCount: rawCalls.length, rawCalls, updates, transcripts, cases, liveState });
	const checkpoint = async (status: string, final = false) => {
		const value: any = artifact(status); value.contentSha256 = sha(JSON.stringify(value));
		await writeFile(tempPath, JSON.stringify(value, null, 2) + "\n");
		await rename(tempPath, final ? outputPath : partialPath);
		return value;
	};
	const auditedRegistry = {
		find(provider: string, id: string) { return provider === "openai-codex" && id === "gpt-5.6-luna" ? selected : undefined; },
		async complete(model: any, context: any, options: any) {
			if (Date.now() - started > MAX_MS) throw new Error("Replay exceeded 20 minutes before the next Luna call.");
			if (rawCalls.length >= MAX_CALLS) throw new Error("Replay would exceed 40 new Luna calls.");
			const settings = { api: model.api, maxTokens: options.maxTokens, reasoningEffort: options.reasoningEffort, toolChoice: options.toolChoice,
				maxRetryDelayMs: options.maxRetryDelayMs, parallelToolCallsForcedFalse: true };
			const response = await registry.complete(model, context, options);
			rawCalls.push({ sequence: rawCalls.length + 1, corpus: activeCorpus, attempt: activeAttempt, caseId: activeCase, phase: activePhase,
				model: `${model.provider}/${model.id}`, settings, request: jsonSafe(context), response: jsonSafe(response), usage: jsonSafe(response.usage) });
			await checkpoint("model-response");
			return response;
		},
		streamSimple() { throw new Error("No fallback API is permitted."); },
	};

	for (const corpus of CORPORA) {
		activeCorpus = corpus; activeAttempt = ATTEMPTS[corpus]!;
		const feedPath = `${BUNDLES}/${corpus}/feed.jsonl`;
		const lines = (await readFile(feedPath, "utf8")).trim().split("\n");
		const all = lines.map(line => JSON.parse(line) as FeedEvent);
		const corpusCases = packet.cases.filter(item => item.corpus === corpus).sort((a, b) => a.boundaryEvent - b.boundaryEvent);
		const session = new ReplaySession(`todo-008-${corpus}-attempt-${activeAttempt}`, process.cwd());
		const store = new MemoryStore(session.getSessionId());
		const ctx = { sessionManager: session, modelRegistry: auditedRegistry } as any;
		const mom = new Mom({ ctx, model: MODEL, store, current: () => true, changed() {} });
		await mom.open();
		const stage = installFeedAdapter(mom, session);
		const state = () => ({ corpus, attempt: activeAttempt, caseId: activeCase, phase: activePhase, checkpointId: mom.checkpointId ?? null,
			graph: graph(mom), detail: clone(mom.detail()), failure: clone(mom.failure ?? null), gaps: clone(mom.gaps), usage: clone(mom.usage),
			sidecarRecords: clone(store.records), cut: clone(mom.checkpoint?.cut ?? null) });
		const update = async (phase: "pre-boundary" | "boundary") => {
			const invoke = async (kind: RawCall["phase"], refresh = false) => {
				activePhase = kind; const callStart = rawCalls.length; let error: string | null = null;
				try { await mom.update(undefined, undefined, 0, refresh); } catch (caught) { error = String(caught); }
				const calls = rawCalls.length - callStart;
				if (calls > 2) throw new Error(`${activeCase}: ${kind} update exceeded production ceiling.`);
				liveState = state(); updates.push({ corpus, attempt: activeAttempt, caseId: activeCase, phase: kind, refresh, calls,
					repairs: Math.max(0, calls - 1), error, checkpointId: mom.checkpointId ?? null, failure: clone(mom.failure ?? null), gaps: clone(mom.gaps), usageAfter: clone(mom.usage) });
				await checkpoint(error ? "update-failure" : "update-accepted"); return error;
			};
			let error = await invoke(phase);
			if (error && mom.failure) error = await invoke("deterministic-retry");
			if (error && mom.gaps.length) error = await invoke("gap-refresh", true);
			return error;
		};
		let cursor = 0;
		for (const item of corpusCases) {
			const boundary = all[item.boundaryEvent - 1];
			if (!boundary || boundary.ref !== item.boundaryRef) throw new Error(`${item.id}: packet boundary does not match immutable feed event ${item.boundaryEvent}.`);
			if (!(boundary.actor === "lead" && ["user", "user_answer"].includes(boundary.kind))) throw new Error(`${item.id}: boundary is not a lead direction.`);
			const eligible = all.slice(cursor, item.boundaryEvent - 1).filter(event => event.actor === "lead" && ["user", "user_answer"].includes(event.kind));
			activeCase = item.id;
			let preFailure: string | null = null;
			if (eligible.length) { stage(eligible); preFailure = await update("pre-boundary"); }
			const before = graph(mom), beforeCheckpoint = mom.checkpointId ?? null;
			stage([boundary]); const boundaryCallStart = rawCalls.length;
			const boundaryFailure = await update("boundary");
			const callCount = rawCalls.slice(boundaryCallStart).filter(call => call.caseId === item.id && call.phase === "boundary").length;
			const after = graph(mom), failure = preFailure ?? boundaryFailure, classification = failure ? null : classifyGraphDiff(before, after);
			cases.push({ id: item.id, corpus, attempt: activeAttempt, coverage: item.coverage, boundaryEvent: item.boundaryEvent, boundaryRef: item.boundaryRef,
				beforeCheckpoint, afterCheckpoint: mom.checkpointId ?? null, before, after, diff: { beforeRevision: before.revision, afterRevision: after.revision },
				prediction: classification?.label ?? null, classifierReasons: classification?.reasons ?? [], calls: callCount,
				repairs: Math.max(0, callCount - 1), failure, gaps: clone(mom.gaps), usageAfter: clone(mom.usage),
				criticalObservations: { unsupportedCurrentPurpose: null, revivedRejectedOrSupersededAlternative: null, lostUnresolvedReturn: null,
					note: "To be completed from packet obligations and these raw maps before artifact commit." } });
			cursor = item.boundaryEvent; liveState = state(); await checkpoint("case-complete");
		}
		mom.close();
		transcripts.push({ corpus, attempt: activeAttempt, lastProcessedEvent: cursor, finalSelectedBoundary: corpusCases.at(-1)!.boundaryEvent,
			eligibleLeadDirectionsProcessed: mom.feed.events.length, gaps: clone(mom.gaps), usage: clone(mom.usage), sidecarRecords: clone(store.records) });
		liveState = null; await checkpoint("transcript-complete");
	}
	return checkpoint("complete", true);
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const output = resolve(process.argv[2] ?? "pi-tether/experiments/trajectory-acceptance/raw-predictions.json");
	run(output).then(result => console.log(JSON.stringify({ output, calls: result.rawCallCount, sha256: result.contentSha256 }, null, 2))).catch(error => { console.error(error); process.exitCode = 1; });
}
