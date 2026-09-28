// Explicit opt-in model experiment. No extensions, project tools, or persistent model conversation.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { Message, Model } from "@earendil-works/pi-ai";
import { randomUUID } from "node:crypto";
import { type Feed } from "./slim-feed.ts";
import { acceptSnapshot, renderUserHistory, SNAPSHOT_PROMPT, snapshotTools, userTurns } from "./mom-snapshot.ts";
import { applyPatch, batchEnds, changeReviewTargets, EvidenceBudget, eventLines, pairedToolCall, MOM_PROMPT, MOM_PROMPT_CHECKLIST, refreshTargets, renderBatch, responseTools, reviewTargets, seedOriginal, type MapItem } from "./mom-map.ts";

const { positionals, values } = parseArgs({ allowPositionals: true, options: {
	checkpoint: { type: "string", multiple: true }, consult: { type: "string" }, "no-review": { type: "boolean" },
	"prompt-variant": { type: "string" }, "review-variant": { type: "string" }, "seed-run": { type: "string" }, "seed-batch": { type: "string" }, "single-update": { type: "boolean" },
	"state-mode": { type: "string" },
} });
const [action, bundle, out] = positionals;
const variant = values["prompt-variant"] ?? "baseline";
if (!['baseline', 'checklist'].includes(variant)) throw new Error(`Unknown prompt variant: ${variant}`);
const stateMode = values["state-mode"] ?? "patch";
if (!["patch", "snapshot"].includes(stateMode)) throw new Error(`Unknown state mode: ${stateMode}`);
const replacement = stateMode === "snapshot";
if (replacement && ["seed-run", "seed-batch", "single-update", "prompt-variant", "review-variant", "no-review"].some((key) => values[key as keyof typeof values] !== undefined)) {
	throw new Error("Snapshot comparison uses full chronological replay, not patch seeds, review selection, or alternate prompts.");
}
const prompt = replacement ? SNAPSHOT_PROMPT : variant === "baseline" ? MOM_PROMPT : MOM_PROMPT_CHECKLIST;
const reviewVariant = values["review-variant"] ?? "oldest";
if (!["oldest", "relevant"].includes(reviewVariant)) throw new Error(`Unknown review variant: ${reviewVariant}`);
if (!!values["seed-run"] !== !!values["seed-batch"] || (values["single-update"] && !values["seed-run"])) throw new Error("--seed-run and --seed-batch are required together; --single-update requires a seed.");
const seedBatch = values["seed-batch"] ? Number(values["seed-batch"]) : 0;
if (values["seed-batch"] && (!Number.isSafeInteger(seedBatch) || seedBatch < 1)) throw new Error("--seed-batch must be a positive integer.");
if (!["plan", "run"].includes(action) || !bundle || (action === "run" && !out)) {
	throw new Error("Usage: tsx experiments/mom-replay.ts plan|run BUNDLE [NEW_OUTPUT_DIRECTORY] [--checkpoint REF ...] [--consult REF] [--state-mode patch|snapshot]");
}
const feed: Feed = JSON.parse(await readFile(join(bundle, "sources.json"), "utf8"));
feed.events = (await readFile(join(bundle, "feed.jsonl"), "utf8")).trim().split("\n").filter(Boolean).map((s) => JSON.parse(s));
if (feed.gaps.length) throw new Error("Replay has source gaps; fix extraction before running the map experiment.");
const eventNumber = (ref: string) => {
	const i = feed.events.findIndex((e) => e.ref === ref);
	if (i < 0) throw new Error(`Checkpoint/consult reference not found: ${ref}`);
	return i + 1;
};
const lines = eventLines(feed);
const directions = replacement ? userTurns(feed.events) : [];
const allEnds = batchEnds(lines, (values.checkpoint ?? []).map(eventNumber));
const consult = values.consult ? eventNumber(values.consult) : undefined;
/** Mom's patch was rejected twice (or never produced). The accepted map is unchanged; the events stay unprocessed. */
class PatchRejected extends Error {}
const modelSpec = { provider: "openai-codex", id: "gpt-5.6-luna", reasoning: "low" as const };
console.log(JSON.stringify({ model: modelSpec, stateMode, variant, reviewVariant, events: lines.length, batchEnds: allEnds, consult, seedBatch, maxEvidencePagesPerBatch: 2, maxModelCalls: 40 }));
if (action === "run") {
	let seed: { end: number; map: MapItem[] } | undefined;
	const touched = new Map<string, number>();
	if (values["seed-run"]) {
		const prior = JSON.parse(await readFile(join(values["seed-run"], "event-index.json"), "utf8")) as { ref: string }[];
		if (prior.length !== feed.events.length || prior.some((e, i) => e.ref !== feed.events[i].ref)) throw new Error("Seed run was generated from a different event sequence.");
		for (let n = 1; n <= seedBatch; n++) {
			const batch = JSON.parse(await readFile(join(values["seed-run"], `batch-${n}.json`), "utf8")) as { end: number; map: MapItem[]; patch: { upsert: MapItem[]; supersede: string[]; confirmed?: string[] } };
			for (const id of [...batch.patch.upsert.map((item) => item.id), ...batch.patch.supersede, ...(batch.patch.confirmed ?? [])]) touched.set(id, n);
			for (const item of batch.map) if (!touched.has(item.id)) touched.set(item.id, n);
			seed = { end: batch.end, map: batch.map };
		}
		if (!seed || !allEnds.includes(seed.end)) throw new Error("Seed batch must end at a normal chronological replay boundary.");
		if (values.consult) throw new Error("Seeded controlled transition does not run a separate consult.");
	}
	const ends = allEnds.filter((end) => end > (seed?.end ?? 0)).slice(0, values["single-update"] ? 1 : undefined);
	if (!ends.length) throw new Error("Seed has no later batch to process.");
	await mkdir(out, { mode: 0o700 });
	const save = (file: string, value: unknown) => writeFile(join(out, file), JSON.stringify(value, null, 2) + "\n", { mode: 0o600, flag: "wx" });
	await save("configuration.json", { modelSpec, bundle, stateMode, agingReview: !replacement && !values["no-review"], variant, reviewVariant, seedRun: values["seed-run"] ?? null,
		seedBatch, singleUpdate: !!values["single-update"], checkpoints: values.checkpoint ?? [], ends, consult, prompt });
	await save("event-index.json", feed.events.map((e, i) => ({ event: i + 1, ref: e.ref, at: e.at, actor: e.actor, kind: e.kind })));
	const runtime = await ModelRuntime.create();
	const model = runtime.getModel(modelSpec.provider, modelSpec.id);
	if (!model) throw new Error(`Configured model unavailable: ${modelSpec.provider}/${modelSpec.id}; no fallback.`);
	if (model.api !== "openai-codex-responses") throw new Error(`Unexpected API ${model.api}; this experiment requires Codex tool-choice enforcement.`);
	const codex = model as Model<"openai-codex-responses">;
	let map: MapItem[] = seed?.map ?? [];
	let snapshot = "";
	const original = seedOriginal([], feed.events)[0];
	let calls = 0;
	let processed = seed?.end ?? 0;
	const inspected = new Set<number>();
	const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, nominalCost: 0 };
	const batches: Record<string, unknown>[] = [];
	let failure: string | undefined;
	const deferrals: { start: number; end: number; error: string }[] = [];
	const started = performance.now();
	async function update(start: number, end: number, consultEvent?: number) {
		const budget = new EvidenceBudget(feed, end);
		const evidence: unknown[] = [];
		async function readEvidence(requests: unknown[]) {
			const results: unknown[] = [];
			for (const request of requests) {
				try { results.push(await budget.read(request)); }
				catch (error) { results.push({ request, error: String(error) }); }
			}
			evidence.push(...results);
			for (const ref of budget.inspected) inspected.add(ref);
			return results;
		}
		const question = consultEvent === undefined ? undefined : `Explain the historical tool failure at @${consultEvent} from the supplied bounded result/invocation evidence. Distinguish the observed error from its cause. If the invocation is missing, truncated, or insufficient, leave deeper attribution unresolved. Do not turn an old failure into a current blocker.`;
		if (consultEvent !== undefined) {
			const invocation = pairedToolCall(feed.events, consultEvent);
			await readEvidence((invocation === undefined ? [consultEvent] : [consultEvent, invocation]).map((event) => ({ event, offset: 0, limit: 4000 })));
			await save("consult-evidence.json", { result: consultEvent, invocation: invocation ?? null, evidence });
		}
		if (!replacement) map = seedOriginal(map, feed.events.slice(0, end));
		const before = map;
		let rejected: { error: string; candidate: unknown } | undefined;
		const batchStart = performance.now();
		const sessionId = randomUUID();
		// Consults answer a question; they do not also carry an aging review.
		const reviewBatch = seedBatch + batches.length + 1;
		const requiredUpdates = replacement ? undefined : { ...refreshTargets(feed, start, end), review: question || values["no-review"] ? [] : reviewVariant === "relevant"
			? changeReviewTargets(map, touched, reviewBatch, feed.events.slice(start, end)) : reviewTargets(map, touched, reviewBatch) };
		const payload = JSON.stringify({ ...(replacement ? { original: original?.refs[0] <= end ? original : null, userHistory: renderUserHistory(directions, start), snapshot } : { map, requiredUpdates }),
			newEvents: renderBatch(feed, lines, start, end), consult: question ?? null, ...(question ? { consultEvidence: evidence } : {}), evidencePagesRemaining: budget.remaining });
		const messages: Message[] = [{ role: "user", content: payload, timestamp: Date.now() }];
		for (let round = 0; round < 4; round++) {
			if (calls >= 40) throw new Error("Experiment model-call budget exhausted.");
			const contextChars = prompt.length + JSON.stringify(messages).length;
			if (contextChars > 90000) throw new Error("Experiment context limit exceeded; no truncation or silent compaction.");
			const call = ++calls;
			await save(`request-${call}.json`, { start, end, round, contextChars, payload, evidence, rejected });
			const callStart = performance.now();
			const tools = replacement ? snapshotTools(end, budget.remaining) : responseTools(end, budget.remaining);
			const reply = await runtime.complete(codex, { systemPrompt: prompt, tools, messages },
				{ reasoningEffort: modelSpec.reasoning, toolChoice: "required", sessionId, maxTokens: 6000, signal: AbortSignal.timeout(120000), maxRetryDelayMs: 1000 });
			const text = reply.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
			const operations = reply.content.filter((c) => c.type === "toolCall");
			for (const key of ["input", "output", "cacheRead", "cacheWrite"] as const) usage[key] += reply.usage[key];
			usage.nominalCost += reply.usage.cost.total;
			await save(`response-${call}.json`, { text, operations, availableOperations: tools.map((t) => t.name),
				provider: reply.provider, model: reply.model, responseModel: reply.responseModel,
				stopReason: reply.stopReason, error: reply.errorMessage, usage: reply.usage, elapsedMs: Math.round(performance.now() - callStart) });
			if (reply.stopReason !== "toolUse" || operations.length !== 1) throw new Error(`Expected exactly one operation; got ${reply.stopReason}, ${operations.length}: ${reply.errorMessage ?? ""}`);
			const operation = operations[0];
			if (!tools.some((t) => t.name === operation.name)) throw new Error(`Unavailable operation ${operation.name}; no action taken.`);
			const candidate = operation.arguments;
			if (operation.name === "inspect_evidence") {
				const requests = (candidate as { lookups: unknown }).lookups;
				if (!Array.isArray(requests) || !requests.length || requests.length > budget.remaining || Object.keys(candidate).length !== 1) throw new Error("Invalid lookup request or evidence budget exceeded; no source read.");
				const results = await readEvidence(requests);
				await save(`evidence-${call}.json`, evidence);
				messages.push(reply, { role: "toolResult", toolCallId: operation.id, toolName: operation.name, isError: false,
					content: [{ type: "text", text: JSON.stringify({ results, evidencePagesRemaining: budget.remaining }) }], timestamp: Date.now() });
				continue;
			}
			let result;
			let nextSnapshot;
			try {
				if (replacement) nextSnapshot = acceptSnapshot(candidate, feed.events.slice(0, end), start, inspected);
				else result = applyPatch(map, candidate, feed.events.slice(0, end), inspected, requiredUpdates);
			}
			catch (error) {
				await save(`rejection-${call}.json`, { error: String(error), candidate });
				if (rejected) throw new PatchRejected(String(error)); // At most one explicit repair per batch, never an unbounded retry loop.
				rejected = { error: String(error), candidate };
				messages.push(reply, { role: "toolResult", toolCallId: operation.id, toolName: operation.name, isError: true,
					content: [{ type: "text", text: replacement
						? `Snapshot rejected; previous snapshot unchanged. ${String(error)} Correct these violations and resubmit the complete snapshot.`
						: `Patch rejected; previous map unchanged. Violations: ${String(error)}. Resubmit the SAME patch with only these corrections; keep every other upsert, supersede, and confirmation unchanged.` }], timestamp: Date.now() });
				continue;
			}
			if (nextSnapshot) snapshot = nextSnapshot.snapshot;
			if (result) {
				map = result.map;
				for (const id of [...result.patch.upsert.map((i) => i.id), ...result.patch.supersede, ...result.patch.confirmed]) touched.set(id, seedBatch + batches.length + 1);
				for (const i of map) if (!touched.has(i.id)) touched.set(i.id, seedBatch + batches.length + 1);
			}
			const record = { start, end, consult: !!question, callsThrough: calls, lookupAttempts: budget.attempts, repairs: rejected ? 1 : 0,
				...(nextSnapshot ? { ...nextSnapshot, snapshotChars: snapshot.length } : { mapChars: JSON.stringify(map).length, items: map.length, patch: result!.patch, map }),
				elapsedMs: Math.round(performance.now() - batchStart) };
			batches.push(record);
			await save(`batch-${batches.length}.json`, record);
			console.log(JSON.stringify({ batch: batches.length, start, end, ...(replacement ? { snapshotChars: snapshot.length } : { items: map.length }), lookupAttempts: budget.attempts, calls }));
			return;
		}
		map = before;
		throw new PatchRejected("No map patch within four calls (two evidence pages, one repair); previous map retained.");
	}
	try {
		// Live-like backlog: a rejected batch leaves the map unchanged and is retried once together with the next batch.
		for (const [i, end] of ends.entries()) {
			try { await update(processed, end); processed = end; }
			catch (error) {
				if (!(error instanceof PatchRejected) || i === ends.length - 1 || deferrals.at(-1)?.end === ends[i - 1]) throw error;
				deferrals.push({ start: processed, end, error: String(error) });
				console.log(JSON.stringify({ deferred: { start: processed, end } }));
			}
		}
		if (consult) await update(processed, processed, consult);
	} catch (error) { failure = String(error); process.exitCode = 1; }
	const summary = { model: modelSpec, stateMode, calls, processed, totalEvents: lines.length, batches: batches.length,
		usage, ...(replacement ? { original, snapshot, userHistory: renderUserHistory(directions, processed) } : { map }), inspected: [...inspected], deferrals, failure: failure ?? null, elapsedMs: Math.round(performance.now() - started),
		limitations: [replacement ? "Snapshot shape and reference ranges are checked; meaning, authority, and retention are not certified." : "Reference and authority checks are structural, not semantic entailment checks.",
			"This is an offline batched replay, not an always-on latency or cost benchmark.",
			"No production extension behavior changed; no source files edited by the model."] };
	await save("summary.json", summary);
	console.log(JSON.stringify({ ...summary, ...(replacement ? { snapshot: `${snapshot.length} chars` } : { map: `${map.length} items` }) }, null, 2));
}
