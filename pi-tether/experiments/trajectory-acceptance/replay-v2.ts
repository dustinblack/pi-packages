import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { Mom, DEFAULT_MODEL } from "../../src/mother.ts";
import { emptyGraph, type WorkGraph } from "../../src/graph.ts";
import { renderEvents, type FeedEvent, type Cut } from "../../src/feed.ts";
import type { MomStore, SidecarRecord, SidecarWriteType } from "../../src/sidecar.ts";

const ROOT = "/private/tmp/todo-008-trajectory";
const PRIVATE = `${ROOT}/private-v2`;
const V1_RAW = `${ROOT}/private-v1-inconclusive/raw-predictions.json`;
const BLIND_PACKET = `${ROOT}/validator-packet.json`;
const COVERAGE = "pi-tether/experiments/trajectory-acceptance/horizon-coverage.json";
const SCORER_PACKET = `${ROOT}/semantic-scorer-packet.json`;
const SAFE_MANIFEST = "pi-tether/experiments/trajectory-acceptance/aligned-replay-manifest.json";
const MODEL = "openai-codex/gpt-5.6-luna";
const CORPORA = ["pi-packages", "buzz", "ssmp"] as const;
const MAX_CALLS = 30;
const MAX_MS = 12 * 60_000;
const sha = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const mapHash = (map: WorkGraph) => sha(JSON.stringify(map));

interface CoverageCase {
	caseId: string; corpus: string; boundary: { event: number; ref: string };
	decisiveRefs: { event: number; ref: string }[];
	alignedHorizon: { event: number; ref: string };
	beforeSnapshot: { snapshotId: string; mapSha256: string };
	coverage: { status: "covered"; snapshotId: string; mapSha256: string; consumedThroughRef: string }
		| { status: "needs-additional-production-replay"; reason: string };
}
interface BlindCase { id: string; corpus: string; boundaryEvent: number; boundaryRef: string }
interface RawCall { sequence: number; corpus: string; caseId: string; phase: string; model: string; settings: Record<string, unknown>; request: unknown; response: unknown; usage: unknown }
interface Snapshot { snapshotId: string; mapSha256: string; consumedThroughRef: string; map: WorkGraph }

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
function jsonSafe(value: unknown) { return JSON.parse(JSON.stringify(value, (key, item) => key === "signal" || key === "onPayload" ? undefined : item)); }
async function hashFile(path: string) { return sha(await readFile(path)); }
async function atomicJson(path: string, value: unknown) {
	await mkdir(dirname(path), { recursive: true, mode: 0o700 });
	await chmod(dirname(path), 0o700);
	const temp = `${path}.${process.pid}.tmp`;
	await writeFile(temp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
	await chmod(temp, 0o600); await rename(temp, path); await chmod(path, 0o600);
}
function leadDirections(all: FeedEvent[], start: number, end: number) {
	return all.slice(start, end).filter(event => event.actor === "lead" && (event.kind === "user" || event.kind === "user_answer"));
}
function consumedBefore(all: FeedEvent[], boundaryEvent: number) {
	const event = leadDirections(all, 0, boundaryEvent - 1).at(-1);
	if (!event) throw new Error(`No lead direction precedes boundary event ${boundaryEvent}.`);
	return event.ref;
}
function v1CoveredGraph(v1: any, corpus: string, snapshotId: string): WorkGraph {
	// Deliberately access only transcript sidecar map snapshots. V1 prediction/result fields are never read.
	const transcript = v1.transcripts.find((item: any) => item.corpus === corpus);
	const record = transcript?.sidecarRecords.find((item: any) => item.id === snapshotId && item.type === "map");
	if (!record?.data?.snapshot?.graph) throw new Error(`Covered v1 map snapshot unavailable: ${corpus}/${snapshotId}`);
	return clone(record.data.snapshot.graph);
}
function v1Before(v1: any, caseId: string): { snapshotId: string; map: WorkGraph } {
	// Deliberately select only the mechanically registered before-map fields.
	const item = v1.cases.find((candidate: any) => candidate.id === caseId);
	if (!item || typeof item.beforeCheckpoint !== "string" || !item.before) throw new Error(`V1 before snapshot unavailable: ${caseId}`);
	return { snapshotId: item.beforeCheckpoint, map: clone(item.before) };
}
function sanitizeMap(map: WorkGraph): WorkGraph {
	return { revision: map.revision, motherThread: map.motherThread, purpose: map.purpose, focus: map.focus,
		nodes: map.nodes.map(node => ({ id: node.id, kind: node.kind, parent: node.parent, state: node.state, label: node.label,
			intent: node.intent, observed: node.observed, actor: node.actor, sources: [...node.sources],
			...(node.purposeSource ? { purposeSource: node.purposeSource } : {}), ...(node.history ? { history: clone(node.history) } : {}) })),
		edges: map.edges.map(edge => ({ ...edge, sources: [...edge.sources] })) };
}

export async function run() {
	if (DEFAULT_MODEL !== MODEL) throw new Error(`Production default changed: ${DEFAULT_MODEL}`);
	const started = Date.now();
	await mkdir(PRIVATE, { recursive: true, mode: 0o700 }); await chmod(PRIVATE, 0o700);
	const coverage = JSON.parse(await readFile(COVERAGE, "utf8")) as { schemaVersion: number; cases: CoverageCase[] };
	const blind = JSON.parse(await readFile(BLIND_PACKET, "utf8")) as { blind: boolean; cases: BlindCase[] };
	// Parsing is necessary to extract registered maps; no V1 prediction, classifier, critical-observation, or score field is accessed.
	const v1 = JSON.parse(await readFile(V1_RAW, "utf8"));
	if (coverage.schemaVersion !== 2 || coverage.cases.length !== 15 || !blind.blind || blind.cases.length !== 15) throw new Error("Expected the registered 15-case v2 inputs.");
	const preRunSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
	const inputs: Record<string, string> = { coverage: await hashFile(COVERAGE), blindPacket: await hashFile(BLIND_PACKET), privateV1Raw: await hashFile(V1_RAW) };
	for (const corpus of CORPORA) inputs[`${corpus}/feed.jsonl`] = await hashFile(`${ROOT}/${corpus}/feed.jsonl`);
	for (const path of ["src/mother.ts", "src/contract.ts", "src/graph.ts", "src/feed.ts", "src/checkpoint.ts", "experiments/trajectory-acceptance/replay-v2.ts"])
		inputs[`pi-tether/${path}`] = await hashFile(resolve("pi-tether", path));

	const runtime = await ModelRuntime.create({ allowModelNetwork: false });
	const registry = new ModelRegistry(runtime);
	const selected = registry.find("openai-codex", "gpt-5.6-luna");
	if (!selected || selected.api !== "openai-codex-responses") throw new Error("Exact production Luna model/API unavailable; no fallback is permitted.");
	const rawCalls: RawCall[] = [], updates: any[] = [], transcriptRuns: any[] = [];
	const snapshots = new Map<string, { before: Snapshot; after?: Snapshot; source: "reused-v1" | "aligned-v2" }>();
	let activeCorpus = "", activeCase = "", activePhase = "aligned-horizon";
	const artifact = (status: string, error?: string) => ({ schemaVersion: 2, blind: true, status, ...(error ? { error } : {}), preRunSha,
		model: MODEL, fallback: "none", reasoning: "low", limits: { maxCalls: MAX_CALLS, maxElapsedMs: MAX_MS, maxCallsPerUpdate: 2, retrieval: false },
		startedAt: new Date(started).toISOString(), checkpointedAt: new Date().toISOString(), elapsedMs: Date.now() - started, inputs,
		rawCallCount: rawCalls.length, repairCount: updates.reduce((n, item) => n + item.repairs, 0), gapRefreshCount: updates.filter(item => item.refresh).length,
		rawCalls, updates, transcriptRuns, snapshots: Object.fromEntries(snapshots) });
	const checkpoint = async (status: string, error?: string) => atomicJson(`${PRIVATE}/replay-checkpoint.json`, artifact(status, error));
	const auditedRegistry = {
		find(provider: string, id: string) { return provider === "openai-codex" && id === "gpt-5.6-luna" ? selected : undefined; },
		async complete(model: any, context: any, options: any) {
			if (Date.now() - started >= MAX_MS) throw new Error("Replay reached the 12-minute cap before the next Luna call.");
			if (rawCalls.length >= MAX_CALLS) throw new Error("Replay would exceed 30 new Luna calls.");
			const settings = { api: model.api, maxTokens: options.maxTokens, reasoningEffort: options.reasoningEffort, toolChoice: options.toolChoice,
				maxRetryDelayMs: options.maxRetryDelayMs, parallelToolCallsForcedFalse: true };
			const request = jsonSafe(context);
			const response = await registry.complete(model, context, options);
			const call: RawCall = { sequence: rawCalls.length + 1, corpus: activeCorpus, caseId: activeCase, phase: activePhase,
				model: `${model.provider}/${model.id}`, settings, request, response: jsonSafe(response), usage: jsonSafe(response.usage) };
			rawCalls.push(call); await atomicJson(`${PRIVATE}/calls/${String(call.sequence).padStart(3, "0")}.json`, call); await checkpoint("model-response");
			return response;
		},
		streamSimple() { throw new Error("No fallback API is permitted."); },
	};

	// Reuse every registered before map and the five mechanically covered after maps without reading any V1 prediction field.
	for (const item of coverage.cases) {
		const all = (await readFile(`${ROOT}/${item.corpus}/feed.jsonl`, "utf8")).trim().split("\n").map(line => JSON.parse(line) as FeedEvent);
		const before = v1Before(v1, item.caseId);
		if (before.snapshotId !== item.beforeSnapshot.snapshotId || mapHash(before.map) !== item.beforeSnapshot.mapSha256) throw new Error(`${item.caseId}: registered before-map mismatch.`);
		const beforeSnapshot: Snapshot = { snapshotId: before.snapshotId, mapSha256: mapHash(before.map), consumedThroughRef: consumedBefore(all, item.boundary.event), map: before.map };
		const entry: { before: Snapshot; after?: Snapshot; source: "reused-v1" | "aligned-v2" } = { before: beforeSnapshot, source: "aligned-v2" };
		if (item.coverage.status === "covered") {
			const after = v1CoveredGraph(v1, item.corpus, item.coverage.snapshotId);
			if (mapHash(after) !== item.coverage.mapSha256 || item.coverage.consumedThroughRef !== item.alignedHorizon.ref) throw new Error(`${item.caseId}: registered covered-map mismatch.`);
			entry.after = { snapshotId: item.coverage.snapshotId, mapSha256: mapHash(after), consumedThroughRef: item.alignedHorizon.ref, map: after };
			entry.source = "reused-v1";
		}
		snapshots.set(item.caseId, entry);
	}
	await checkpoint("v1-snapshots-extracted");

	for (const corpus of CORPORA) {
		activeCorpus = corpus;
		const all = (await readFile(`${ROOT}/${corpus}/feed.jsonl`, "utf8")).trim().split("\n").map(line => JSON.parse(line) as FeedEvent);
		const needed = coverage.cases.filter(item => item.corpus === corpus && item.coverage.status === "needs-additional-production-replay")
			.sort((a, b) => a.alignedHorizon.event - b.alignedHorizon.event);
		const session = new ReplaySession(`todo-008-v2-${corpus}`, process.cwd());
		const store = new MemoryStore(session.getSessionId());
		const mom = new Mom({ ctx: { sessionManager: session, modelRegistry: auditedRegistry } as any, model: MODEL, store, current: () => true, changed() {} });
		await mom.open(); const stage = installFeedAdapter(mom, session);
		let cursor = 0;
		for (const item of needed) {
			activeCase = item.caseId;
			const horizon = all[item.alignedHorizon.event - 1];
			if (!horizon || horizon.ref !== item.alignedHorizon.ref || horizon.actor !== "lead" || !["user", "user_answer"].includes(horizon.kind)) throw new Error(`${item.caseId}: aligned horizon does not match a lead direction.`);
			const events = leadDirections(all, cursor, item.alignedHorizon.event);
			if (!events.length || events.at(-1)!.ref !== item.alignedHorizon.ref) throw new Error(`${item.caseId}: staged evidence does not end at aligned horizon.`);
			stage(events);
			const invoke = async (phase: string, refresh = false) => {
				activePhase = phase; const callStart = rawCalls.length; let error: string | null = null;
				try { await mom.update(undefined, undefined, 0, refresh); } catch (caught) { error = String(caught); }
				const calls = rawCalls.length - callStart;
				if (calls > 2) throw new Error(`${item.caseId}: update exceeded the production two-call ceiling.`);
				updates.push({ corpus, caseId: item.caseId, phase, refresh, calls, repairs: Math.max(0, calls - 1), error,
					checkpointId: mom.checkpointId ?? null, gaps: clone(mom.gaps), failure: clone(mom.failure ?? null), usageAfter: clone(mom.usage) });
				await checkpoint(error ? "update-failure" : "update-accepted", error ?? undefined); return error;
			};
			let error = await invoke("aligned-horizon");
			if (error && mom.failure) error = await invoke("deterministic-retry");
			if (error && mom.gaps.length) error = await invoke("gap-refresh", true);
			if (error || mom.failure || mom.gaps.length) throw new Error(`${item.caseId}: aligned update did not finish cleanly: ${error ?? "gap/failure remains"}`);
			const map = graph(mom), record = store.records.findLast(candidate => candidate.type === "map");
			if (!record) throw new Error(`${item.caseId}: accepted update wrote no map/cursor record.`);
			const after: Snapshot = { snapshotId: `v2-${corpus}-${record.id}`, mapSha256: mapHash(map), consumedThroughRef: item.alignedHorizon.ref, map };
			snapshots.get(item.caseId)!.after = after;
			await atomicJson(`${PRIVATE}/snapshots/${item.caseId}-after.json`, after); await checkpoint("case-complete");
			cursor = item.alignedHorizon.event;
		}
		mom.close();
		transcriptRuns.push({ corpus, replayCount: 1, stoppedAtEvent: cursor, stoppedAtRef: needed.at(-1)!.alignedHorizon.ref,
			calls: rawCalls.filter(call => call.corpus === corpus).length, updates: updates.filter(update => update.corpus === corpus).length,
			gaps: clone(mom.gaps), usage: clone(mom.usage) });
		await checkpoint("transcript-complete");
	}

	for (const [caseId, pair] of snapshots) {
		if (!pair.after) throw new Error(`${caseId}: missing aligned after snapshot.`);
		await atomicJson(`${PRIVATE}/snapshots/${caseId}-before.json`, pair.before);
		if (pair.source === "reused-v1") await atomicJson(`${PRIVATE}/snapshots/${caseId}-after.json`, pair.after);
	}
	const movementDefinitions = {
		accept: "explicit assent adopts a previously proposed direction without otherwise changing its scope",
		expand: "add compatible durable scope while preserving the governing purpose and existing scope",
		contract: "narrow or remove scope, permission, or an alternative while preserving the governing purpose",
		redirect: "replace or park the current course in favor of materially different work; the original session purpose remains grounded",
		reorganize: "preserve purpose and scope but change structure, sequencing, focus, or the route/point of return",
	};
	const scorerCases = coverage.cases.map((item, index) => {
		const all = requireFeed(item.corpus);
		const evidence = leadDirections(all, 0, item.alignedHorizon.event).map((event, eventIndex) => ({ event: all.indexOf(event) + 1, ref: event.ref, actor: event.actor, kind: event.kind, text: event.text }));
		if (evidence.at(-1)?.ref !== item.alignedHorizon.ref) throw new Error(`${item.caseId}: packet evidence does not end at horizon.`);
		const pair = snapshots.get(item.caseId)!;
		const known = new Set(evidence.map(event => event.ref));
		for (const map of [pair.before.map, pair.after!.map]) for (const element of [...map.nodes, ...map.edges]) for (const ref of element.sources) {
			if (!known.has(ref)) throw new Error(`${item.caseId}: graph source ${ref} is unavailable in packet evidence.`);
		}
		const obligationRefs = item.decisiveRefs.filter(pointer => pointer.event <= item.alignedHorizon.event).map(pointer => pointer.ref);
		return { schemaVersion: 2, scorerCaseId: `case-${String(index + 1).padStart(3, "0")}`, evidence,
			horizon: item.alignedHorizon, before: { ...pair.before, map: sanitizeMap(pair.before.map) }, after: { ...pair.after!, map: sanitizeMap(pair.after!.map) },
			criticalObligations: [
				{ type: "unsupported_current_purpose", rule: "preserve a current purpose only when supported by evidence available through the aligned horizon", evidenceRefs: obligationRefs },
				{ type: "revived_rejected_alternative", rule: "do not revive an explicitly rejected or superseded alternative", evidenceRefs: obligationRefs },
				{ type: "lost_unresolved_return", rule: "preserve every unresolved return point unless the evidence resolves or replaces it", evidenceRefs: obligationRefs },
			] };
	});
	const scorerPacket = { schemaVersion: 2, blind: true, movementDefinitions,
		statusQuoRule: "preserve all unaffected purpose, scope, obligations, alternatives, and unresolved return points", cases: scorerCases };
	await atomicJson(SCORER_PACKET, scorerPacket);
	const packetSha256 = await hashFile(SCORER_PACKET);
	const v1Hashes: Record<string, string> = {};
	for (const name of ["raw-predictions.json", "raw-replay-status.json", "score.json", "SCORE.md", "SHA256SUMS"]) v1Hashes[name] = await hashFile(`${ROOT}/private-v1-inconclusive/${name}`);
	const safeManifest = { schemaVersion: 2, status: "complete", blind: true, preRunSha, privateRoot: PRIVATE, model: MODEL, fallback: "none", reasoning: "low",
		settings: { api: selected.api, maxTokens: 6000, toolChoice: "required", parallelToolCalls: false, retrieval: false, maxCallsPerUpdate: 2 },
		limits: { maxCalls: MAX_CALLS, maxElapsedMs: MAX_MS }, inputs, v1InconclusiveHashes: v1Hashes,
		packet: { path: SCORER_PACKET, sha256: packetSha256, schema: "semantic-scorer-packet.schema.json", cases: scorerCases.length },
		totals: { cases: snapshots.size, reusedCases: [...snapshots.values()].filter(pair => pair.source === "reused-v1").length,
			replayedCases: [...snapshots.values()].filter(pair => pair.source === "aligned-v2").length, transcriptReplays: transcriptRuns.length,
			newCalls: rawCalls.length, repairs: updates.reduce((n, item) => n + item.repairs, 0), gapRefreshes: updates.filter(item => item.refresh).length,
			unresolvedGaps: transcriptRuns.reduce((n, item) => n + item.gaps.length, 0) },
		cases: coverage.cases.map((item, index) => { const pair = snapshots.get(item.caseId)!; return { caseId: item.caseId,
			scorerCaseId: `case-${String(index + 1).padStart(3, "0")}`, horizon: item.alignedHorizon, source: pair.source,
			before: { snapshotId: pair.before.snapshotId, mapSha256: pair.before.mapSha256, consumedThroughRef: pair.before.consumedThroughRef },
			after: { snapshotId: pair.after!.snapshotId, mapSha256: pair.after!.mapSha256, consumedThroughRef: pair.after!.consumedThroughRef } }; }) };
	await atomicJson(SAFE_MANIFEST, safeManifest);
	await checkpoint("complete");
	return safeManifest;

	function requireFeed(corpus: string): FeedEvent[] {
		const cached = feedCache.get(corpus); if (cached) return cached;
		throw new Error(`Feed was not cached: ${corpus}`);
	}
}

// Packet construction is synchronous over these immutable, already-hashed bundle files.
const feedCache = new Map<string, FeedEvent[]>();
for (const corpus of CORPORA) {
	const text = await readFile(`${ROOT}/${corpus}/feed.jsonl`, "utf8");
	feedCache.set(corpus, text.trim().split("\n").map(line => JSON.parse(line) as FeedEvent));
}

if (import.meta.url === `file://${process.argv[1]}`) {
	run().then(result => console.log(JSON.stringify({ manifest: SAFE_MANIFEST, packet: result.packet.path, packetSha256: result.packet.sha256,
		calls: result.totals.newCalls, repairs: result.totals.repairs, gaps: result.totals.unresolvedGaps }, null, 2)))
		.catch(async error => { try { await atomicJson(`${PRIVATE}/fatal.json`, { at: new Date().toISOString(), error: String(error) }); } catch {} console.error(error); process.exitCode = 1; });
}
