// Sampled todo-012 routine-wake measurement. One short feed event per screen window keeps the
// local Kev endpoint from timing out on large tool-metadata batches. Read-only; no Mom calls.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { SystemOneAdvisor } from "../src/advisor.ts";
import { renderEvents, type FeedEvent } from "../src/feed.ts";
import type { SessionScreenInput, AdvisorScreenRecord } from "../src/advisor.ts";

const PRIVATE = "/private/tmp/todo-008-trajectory";
const RAW = `${PRIVATE}/private-v1-inconclusive/raw-predictions.json`;
const PACKET = `${PRIVATE}/validator-packet.json`;
const OUTPUT = resolve("pi-tether/experiments/evidence/todo-012/routine-sample.json");
const URL = "http://192.168.1.52:9999/v1/systemone";
const THRESHOLD = 0.7;
const TIMEOUT_MS = 15000;
const TARGET = 30;

interface PacketCase { id: string; corpus: string; boundaryEvent: number }
interface RawCase { id: string; after: Record<string, any> }
interface Result {
	id: string; corpus: string; caseId: string; eventRef: string; eventKind: string;
	status: AdvisorScreenRecord["status"]; needsUpdate?: number; wake?: boolean; error?: string;
	latencyMs: number; usage?: { input: number; output: number };
}
const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function run() {
	const raw = JSON.parse(await readFile(RAW, "utf8")) as { cases: RawCase[] };
	const packet = JSON.parse(await readFile(PACKET, "utf8")) as { cases: PacketCase[] };
	const windows: { id: string; corpus: string; caseId: string; event: FeedEvent; current: Record<string, any> }[] = [];

	for (const corpus of ["pi-packages", "buzz", "ssmp"]) {
		const feed = (await readFile(`${PRIVATE}/${corpus}/feed.jsonl`, "utf8")).trim().split("\n").map(line => JSON.parse(line) as FeedEvent);
		const cases = packet.cases.filter(entry => entry.corpus === corpus).sort((a, b) => a.boundaryEvent - b.boundaryEvent);
		const routine = feed.map((event, index) => ({ event, index }))
			.filter(({ event }) => !(event.actor === "lead" && ["user", "user_answer"].includes(event.kind)));
		const step = Math.max(1, Math.floor(routine.length / TARGET));
		for (let i = 0; i < routine.length && windows.length < TARGET; i += step) {
			const { event, index } = routine[i];
			const preceding = [...cases].reverse().find(entry => entry.boundaryEvent <= index + 1);
			const current = preceding ? raw.cases.find(entry => entry.id === preceding.id)?.after : undefined;
			if (!current?.nodes?.length) continue;
			windows.push({ id: `routine-sample:${corpus}:${event.ref}`, corpus, caseId: preceding!.id, event, current });
		}
	}

	const advisor = new SystemOneAdvisor({ url: URL, model: "kev-latest", threshold: THRESHOLD, timeoutMs: TIMEOUT_MS });
	const results: Result[] = [];
	for (const item of windows) {
		const input: SessionScreenInput = {
			current: item.current as SessionScreenInput["current"], newEvidence: renderEvents([item.event]), contextBeforeBatch: null,
			pendingMore: false, unresolvedProcessRisks: [],
		};
		const base = { id: item.id, corpus: item.corpus, caseId: item.caseId, eventRef: item.event.ref, eventKind: item.event.kind };
		try {
			const value = await advisor.screen(input);
			results.push({ ...base, status: value.status, needsUpdate: value.needsUpdate, wake: value.wake, latencyMs: value.latencyMs, usage: value.usage });
		} catch (error) {
			results.push({ ...base, status: "unavailable", error: String(error), latencyMs: 0 });
		}
	}
	const screened = results.filter(result => result.status === "screened");
	const output = {
		schemaVersion: 1,
		measuredAt: new Date().toISOString(),
		method: "Sampled one-event routine feed windows through the production SystemOneAdvisor; no Mom/Luna calls.",
		endpoint: URL, model: "kev-latest", threshold: THRESHOLD, timeoutMs: TIMEOUT_MS,
		inputs: { rawPredictionsSha256: sha(raw), packetSha256: sha(packet) },
		summary: {
			windows: results.length,
			wakesAvoided: results.filter(result => result.wake === false).length,
			wakesKept: results.filter(result => result.wake === true).length,
			unavailableFailOpen: results.filter(result => result.status === "unavailable").length,
			screened: screened.length,
		},
		results,
	};
	await mkdir(resolve(OUTPUT, ".."), { recursive: true });
	await writeFile(OUTPUT, JSON.stringify(output, null, 2) + "\n");
	console.log(JSON.stringify({ output: OUTPUT, summary: output.summary }, null, 2));
}

await run();
