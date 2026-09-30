// Read-only todo-012 measurement: production screen against preserved todo-008 inputs.
// No Mom/Luna calls, no session or sidecar writes, no raw transcript text in the output.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { SystemOneAdvisor } from "../src/advisor.ts";
import { renderEvents, type FeedEvent } from "../src/feed.ts";
import type { SessionScreenInput, AdvisorScreenRecord } from "../src/advisor.ts";

const PRIVATE = "/private/tmp/todo-008-trajectory";
const RAW = `${PRIVATE}/private-v1-inconclusive/raw-predictions.json`;
const PACKET = `${PRIVATE}/validator-packet.json`;
const GOLD = resolve("pi-tether/experiments/trajectory-acceptance/labels/final-gold.json");
const OUTPUT = resolve("pi-tether/experiments/evidence/todo-012/screen-replay.json");
const URL = "http://192.168.1.52:9999/v1/systemone";
const THRESHOLD = 0.7;
const TIMEOUT_MS = 30000;
const CONCURRENCY = 1;

type Relation = "before" | "boundary" | "after";
interface PacketCase {
	id: string; corpus: string; coverage: string; boundaryEvent: number; boundaryRef: string;
	context: { ref: string; relation: Relation; text: string }[];
}
interface RawCall {
	corpus: string; caseId: string; phase: "pre-boundary" | "boundary" | "deterministic-retry" | "gap-refresh";
	request: { messages: { content: string }[] };
	response: { content: { type: string; name?: string; arguments?: unknown }[] };
}
interface Update {
	corpus: string; caseId: string; phase: RawCall["phase"]; calls: number; error: string | null;
}
interface Window {
	id: string;
	scope: "preserved-update" | "aligned-gold-horizon" | "routine-feed";
	corpus: string;
	caseId: string;
	phase?: string;
	coverage?: string;
	goldLabel?: string;
	proposalMaterial?: boolean;
	movementLabel?: "routine" | "direction";
	input: SessionScreenInput;
}
interface Result {
	id: string;
	scope: Window["scope"];
	corpus: string;
	caseId: string;
	phase?: string;
	coverage?: string;
	goldLabel?: string;
	proposalMaterial?: boolean;
	movementLabel?: "routine" | "direction";
	status: AdvisorScreenRecord["status"];
	needsUpdate?: number;
	wake?: boolean;
	error?: string;
	latencyMs: number;
	usage?: { input: number; output: number };
}

const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function proposalMaterial(args: Record<string, any>, before: Record<string, any>): boolean {
	const groups = ["upsertNodes", "upsertEdges", "removeEdges", "merges", "folds", "removeNodes", "supersessions"];
	if (groups.some(key => Array.isArray(args[key]) && args[key].length)) return true;
	if (args.purpose !== undefined && args.purpose !== before.purpose) return true;
	if (args.focus !== undefined && args.focus !== before.focus) return true;
	if (Array.isArray(args.unfinished) && args.unfinished.length) return true;
	return Boolean(args.note);
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
	const results = new Array<R>(items.length);
	let next = 0;
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (true) {
			const index = next++;
			if (index >= items.length) return;
			results[index] = await work(items[index]);
		}
	}));
	return results;
}

async function screen(advisor: SystemOneAdvisor, item: Window): Promise<Result> {
	await new Promise(resolve => setTimeout(resolve, 50));
	const base = { id: item.id, scope: item.scope, corpus: item.corpus, caseId: item.caseId,
		...(item.phase ? { phase: item.phase } : {}), ...(item.coverage ? { coverage: item.coverage } : {}),
		...(item.goldLabel ? { goldLabel: item.goldLabel } : {}), ...(item.proposalMaterial !== undefined ? { proposalMaterial: item.proposalMaterial } : {}),
		...(item.movementLabel ? { movementLabel: item.movementLabel } : {}) };
	try {
		const value = await advisor.screen(item.input);
		return { ...base, status: value.status, needsUpdate: value.needsUpdate, wake: value.wake,
			latencyMs: value.latencyMs, usage: value.usage };
	} catch (error) {
		return { ...base, status: "unavailable", error: String(error), latencyMs: 0 };
	}
}

async function run() {
	const raw = JSON.parse(await readFile(RAW, "utf8")) as { rawCalls: RawCall[]; updates: Update[]; cases: { id: string; after: Record<string, any> }[] };
	const packet = JSON.parse(await readFile(PACKET, "utf8")) as { cases: PacketCase[] };
	const gold = JSON.parse(await readFile(GOLD, "utf8")) as { cases: { caseId: string; finalLabel: string }[] };

	const groups = new Map<string, RawCall[]>();
	for (const call of raw.rawCalls) {
		if (!["pre-boundary", "boundary"].includes(call.phase)) continue;
		const key = [call.corpus, call.caseId, call.phase].join("|");
		groups.set(key, [...(groups.get(key) ?? []), call]);
	}
	const updateByKey = new Map(raw.updates.map(update => [[update.corpus, update.caseId, update.phase].join("|"), update]));

	const windows: Window[] = [];
	for (const [key, calls] of groups) {
		const firstBody = JSON.parse(calls[0].request.messages[0].content);
		// Empty-graph bootstrap is a mandatory runtime bypass and is not a screenable wake.
		if (!firstBody.graph?.nodes?.length) continue;
		const lastCall = calls.at(-1)!;
		const operation = lastCall.response.content.find(block => block.type === "toolCall" && block.name === "commit_graph");
		const update = updateByKey.get(key);
		const material = Boolean(operation && update && update.error === null &&
			proposalMaterial(operation.arguments as Record<string, any>, firstBody.graph));
		windows.push({
			id: `update:${key}`, scope: "preserved-update", corpus: calls[0].corpus, caseId: calls[0].caseId, phase: calls[0].phase,
			proposalMaterial: material,
			input: {
				current: firstBody.graph,
				newEvidence: firstBody.newEvents,
				contextBeforeBatch: typeof firstBody.contextBeforeBatch === "string" ? firstBody.contextBeforeBatch : null,
				pendingMore: Boolean(firstBody.pendingMore),
				unresolvedProcessRisks: [],
			},
		});
	}

	for (const item of packet.cases) {
		const current = raw.rawCalls
			.filter(call => call.caseId === item.id && call.phase === "boundary")
			.map(call => JSON.parse(call.request.messages[0].content).graph)[0];
		if (!current?.nodes?.length) throw new Error(`${item.id}: missing preserved before map.`);
		const before = item.context.filter(entry => entry.relation === "before");
		const evidence = item.context.filter(entry => entry.relation !== "before");
		windows.push({
			id: `gold:${item.id}`, scope: "aligned-gold-horizon", corpus: item.corpus, caseId: item.id,
			coverage: item.coverage, goldLabel: gold.cases.find(entry => entry.caseId === item.id)!.finalLabel,
			movementLabel: "direction",
			input: {
				current,
				newEvidence: evidence.map(entry => `[src:${entry.ref}] lead user\n${entry.text}`).join("\n\n"),
				contextBeforeBatch: before.length ? `[src:${before.at(-1)!.ref}] lead assistant\n${before.at(-1)!.text}` : null,
				pendingMore: false,
				unresolvedProcessRisks: [],
			},
		});
	}

	// Routine lead-tool/worker segments between labeled boundaries are the no-direction wake
	// candidates. Their current map is the preserved boundary map (or the v1 after snapshot when
	// available), so this is a counterfactual screening measurement, not a map-quality score.
	if (process.env.INCLUDE_ROUTINE !== "1") {
		// Routine sampling lives in kev-screen-routine-sample.ts; the full-segment variant is opt-in.
	} else {
	const casesById = new Map(raw.cases.map(entry => [entry.id, entry]));
	for (const corpus of ["pi-packages", "buzz", "ssmp"]) {
		const feed = (await readFile(`${PRIVATE}/${corpus}/feed.jsonl`, "utf8")).trim().split("\n").map(line => JSON.parse(line) as FeedEvent);
		const corpusCases = packet.cases.filter(entry => entry.corpus === corpus).sort((a, b) => a.boundaryEvent - b.boundaryEvent);
		for (let i = 0; i < corpusCases.length; i++) {
			const item = corpusCases[i];
			const start = item.boundaryEvent;
			const end = (corpusCases[i + 1]?.boundaryEvent ?? feed.length + 1) - 1;
			const routine = feed.slice(start, end).filter(event => !(event.actor === "lead" && ["user", "user_answer"].includes(event.kind)));
			if (!routine.length) continue;
			const preservedCase = casesById.get(item.id);
			const current = preservedCase?.after ?? raw.rawCalls
				.filter(call => call.caseId === item.id && call.phase === "boundary")
				.map(call => JSON.parse(call.request.messages[0].content).graph)[0];
			if (!current?.nodes?.length) continue;
			const chunks: FeedEvent[][] = [];
			for (const event of routine) {
				const pending = chunks.at(-1) ?? [];
				const rendered = renderEvents([...pending, event]);
				if (pending.length && rendered.length > 8000) chunks.push([event]);
				else chunks.at(-1) ? chunks.at(-1)!.push(event) : chunks.push([event]);
			}
			for (const [index, chunk] of chunks.entries()) {
				windows.push({
					id: `routine:${item.id}:${start}-${end}:${index + 1}/${chunks.length}`, scope: "routine-feed", corpus, caseId: item.id,
					phase: `${start}-${end}:${index + 1}/${chunks.length}`, movementLabel: "routine",
					input: {
						current,
						newEvidence: renderEvents(chunk),
						contextBeforeBatch: null,
						pendingMore: false,
						unresolvedProcessRisks: [],
					},
				});
			}
		}
	}
	}

	windows.sort((a, b) => {
		const order = { "routine-feed": 0, "preserved-update": 1, "aligned-gold-horizon": 2 };
		return order[a.scope] - order[b.scope] || a.id.localeCompare(b.id);
	});
	const advisor = new SystemOneAdvisor({ url: URL, model: "kev-latest", threshold: THRESHOLD, timeoutMs: TIMEOUT_MS });
	const results = await mapWithConcurrency(windows, CONCURRENCY, item => screen(advisor, item));
	const preserved = results.filter(result => result.scope === "preserved-update");
	const goldResults = results.filter(result => result.scope === "aligned-gold-horizon");
	const routine = results.filter(result => result.scope === "routine-feed");
	const skippedPreserved = preserved.filter(result => result.wake === false);
	const skippedGold = goldResults.filter(result => result.wake === false);
	const skippedMaterial = skippedPreserved.filter(result => result.proposalMaterial);
	const skippedRoutine = routine.filter(result => result.wake === false);
	const unavailable = results.filter(result => result.status === "unavailable");
	const output = {
		schemaVersion: 1,
		measuredAt: new Date().toISOString(),
		method: "Production SystemOneAdvisor screen against preserved todo-008 update inputs and preregistered aligned-gold-horizon windows; no Mom/Luna calls.",
		endpoint: URL,
		model: "kev-latest",
		threshold: THRESHOLD,
		timeoutMs: TIMEOUT_MS,
		inputs: { rawPredictionsSha256: sha(raw), packetSha256: sha(packet), goldSha256: sha(gold) },
		summary: {
			preservedUpdateWindows: preserved.length,
			preservedWakesAvoided: skippedPreserved.length,
			preservedWakesKept: preserved.filter(result => result.wake === true).length,
			preservedProposalMaterialWindows: preserved.filter(result => result.proposalMaterial).length,
			preservedProposalMaterialMisses: skippedMaterial.length,
			routineFeedWindows: routine.length,
			routineWakesAvoided: skippedRoutine.length,
			routineWakesKept: routine.filter(result => result.wake === true).length,
			alignedGoldWindows: goldResults.length,
			alignedGoldWakesKept: goldResults.filter(result => result.wake === true).length,
			alignedGoldMovementMisses: skippedGold.length,
			unavailableFailOpen: unavailable.length,
			totalScreenCallsAttempted: results.length,
		},
		results,
	};
	await mkdir(resolve(OUTPUT, ".."), { recursive: true });
	await writeFile(OUTPUT, JSON.stringify(output, null, 2) + "\n");
	console.log(JSON.stringify({ output: OUTPUT, summary: output.summary }, null, 2));
}

await run();
