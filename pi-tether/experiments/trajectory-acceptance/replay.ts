import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
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
const MAX_MS = 25 * 60_000;
const sha = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

interface PacketCase { id: string; corpus: string; coverage: string; boundaryEvent: number; boundaryRef: string; context: { ref: string; relation: string; text: string }[] }
interface Packet { version: number; blind: boolean; cases: PacketCase[] }
interface RawCall { sequence: number; caseId: string; phase: "pre-boundary" | "boundary" | "gap-refresh"; model: string; settings: Record<string, unknown>; request: unknown; response: unknown; usage: unknown }

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
	const started = Date.now();
	const packet = JSON.parse(await readFile(PACKET, "utf8")) as Packet;
	if (!packet.blind || packet.cases.length !== 15) throw new Error("Expected the sealed 15-case blind packet.");
	const runtime = await ModelRuntime.create({ allowModelNetwork: false });
	const registry = new ModelRegistry(runtime);
	const selected = registry.find("openai-codex", "gpt-5.6-luna");
	if (!selected || selected.api !== "openai-codex-responses") throw new Error("Exact production Luna model/API unavailable; no fallback is permitted.");
	const rawCalls: RawCall[] = [], cases: any[] = [], transcripts: any[] = [];
	let activeCase = "", activePhase: RawCall["phase"] = "boundary";
	const auditedRegistry = {
		find(provider: string, id: string) { return provider === "openai-codex" && id === "gpt-5.6-luna" ? selected : undefined; },
		async complete(model: any, context: any, options: any) {
			if (Date.now() - started > MAX_MS) throw new Error("Replay exceeded 25 minutes before the next Luna call.");
			if (rawCalls.length >= MAX_CALLS) throw new Error("Replay would exceed 40 Luna calls.");
			const settings = { api: model.api, maxTokens: options.maxTokens, reasoningEffort: options.reasoningEffort, toolChoice: options.toolChoice,
				maxRetryDelayMs: options.maxRetryDelayMs, parallelToolCallsForcedFalse: true };
			const response = await registry.complete(model, context, options);
			rawCalls.push({ sequence: rawCalls.length + 1, caseId: activeCase, phase: activePhase, model: `${model.provider}/${model.id}`,
				settings, request: jsonSafe(context), response: jsonSafe(response), usage: jsonSafe(response.usage) });
			return response;
		},
		streamSimple() { throw new Error("No fallback API is permitted."); },
	};

	for (const corpus of CORPORA) {
		const feedPath = `${BUNDLES}/${corpus}/feed.jsonl`;
		const lines = (await readFile(feedPath, "utf8")).trim().split("\n");
		const all = lines.map(line => JSON.parse(line) as FeedEvent);
		const corpusCases = packet.cases.filter(item => item.corpus === corpus).sort((a, b) => a.boundaryEvent - b.boundaryEvent);
		const session = new ReplaySession(`todo-008-${corpus}`, process.cwd());
		const store = new MemoryStore(session.getSessionId());
		const ctx = { sessionManager: session, modelRegistry: auditedRegistry } as any;
		const mom = new Mom({ ctx, model: MODEL, store, current: () => true, changed() {} });
		await mom.open();
		const stage = installFeedAdapter(mom, session);
		let cursor = 0;
		for (const item of corpusCases) {
			const boundary = all[item.boundaryEvent - 1];
			if (!boundary || boundary.ref !== item.boundaryRef) throw new Error(`${item.id}: packet boundary does not match immutable feed event ${item.boundaryEvent}.`);
			if (!(boundary.actor === "lead" && ["user", "user_answer"].includes(boundary.kind))) throw new Error(`${item.id}: boundary is not a lead direction.`);
			const eligible = all.slice(cursor, item.boundaryEvent - 1).filter(event => event.actor === "lead" && ["user", "user_answer"].includes(event.kind));
			activeCase = item.id; activePhase = "pre-boundary";
			if (eligible.length) { stage(eligible); const beforeCalls = rawCalls.length; await mom.update(); if (rawCalls.length - beforeCalls > 2) throw new Error(`${item.id}: pre-boundary update exceeded production ceiling.`); }
			const before = graph(mom), beforeCheckpoint = mom.checkpointId ?? null;
			activePhase = "boundary"; stage([boundary]);
			const callStart = rawCalls.length;
			let failure: string | null = null;
			try { await mom.update(); } catch (error) { failure = String(error); }
			const callCount = rawCalls.length - callStart;
			if (callCount > 2) throw new Error(`${item.id}: boundary update exceeded production ceiling.`);
			const after = graph(mom), classification = failure ? null : classifyGraphDiff(before, after);
			cases.push({ id: item.id, corpus, coverage: item.coverage, boundaryEvent: item.boundaryEvent, boundaryRef: item.boundaryRef,
				beforeCheckpoint, afterCheckpoint: mom.checkpointId ?? null, before, after, diff: { beforeRevision: before.revision, afterRevision: after.revision },
				prediction: classification?.label ?? null, classifierReasons: classification?.reasons ?? [], calls: callCount,
				repairs: Math.max(0, callCount - 1), failure, gaps: clone(mom.gaps), usageAfter: clone(mom.usage),
				criticalObservations: { unsupportedCurrentPurpose: null, revivedRejectedOrSupersededAlternative: null, lostUnresolvedReturn: null,
					note: "To be completed from packet obligations and these raw maps before artifact commit." } });
			if (failure) throw new Error(`${item.id}: production update failed; checkpoint retained. ${failure}`);
			cursor = item.boundaryEvent;
		}
		mom.close();
		transcripts.push({ corpus, lastProcessedEvent: cursor, finalSelectedBoundary: corpusCases.at(-1)!.boundaryEvent,
			eligibleLeadDirectionsProcessed: mom.feed.events.length, gaps: clone(mom.gaps), usage: clone(mom.usage), sidecarRecords: clone(store.records) });
	}
	const inputs: Record<string, string> = { packet: await hashFile(PACKET) };
	for (const corpus of CORPORA) for (const name of ["feed.jsonl", "feed.txt", "metrics.json", "sources.json"]) inputs[`${corpus}/${name}`] = await hashFile(`${BUNDLES}/${corpus}/${name}`);
	for (const path of ["src/mother.ts", "src/contract.ts", "src/graph.ts", "src/feed.ts", "src/checkpoint.ts", "experiments/trajectory-acceptance/classifier.ts", "experiments/trajectory-acceptance/replay.ts"])
		inputs[`pi-tether/${path}`] = await hashFile(resolve("pi-tether", path));
	const artifact: any = { schemaVersion: 1, blind: true, model: MODEL, fallback: "none", reasoning: "low", background: { proposalCalls: 1, maxRepairCalls: 1, retrieval: false },
		startedAt: new Date(started).toISOString(), finishedAt: new Date().toISOString(), elapsedMs: Date.now() - started,
		inputs, selection: "chronological lead user/user_answer evidence through each final selected boundary; no unrelated tail", rawCallCount: rawCalls.length,
		rawCalls, transcripts, cases };
	artifact.contentSha256 = sha(JSON.stringify(artifact));
	await writeFile(outputPath, JSON.stringify(artifact, null, 2) + "\n");
	return artifact;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const output = resolve(process.argv[2] ?? "pi-tether/experiments/trajectory-acceptance/raw-predictions.json");
	run(output).then(result => console.log(JSON.stringify({ output, calls: result.rawCallCount, sha256: result.contentSha256 }, null, 2))).catch(error => { console.error(error); process.exitCode = 1; });
}
