// Controlled PageIndex-style comparison: literal search versus map source-handle navigation.
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { Message, Model, Tool } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { validateSearchQuery } from "../src/contract.ts";
import { rankSearchDocuments, renderEvent, textBlocks, type FeedEvent } from "../src/feed.ts";
import type { WorkGraph } from "../src/graph.ts";
import { PAGEINDEX_BASE_PROMPT, pageIndexEffectivePrompt, type PageIndexCondition } from "./pageindex-protocol.ts";

type Condition = PageIndexCondition;
interface Question {
	id: string;
	corpus: string;
	question: string;
	sourcePolicy: "exact" | "equivalent";
	expectedRef: string;
	expectedMetadata: { kind: string; name?: string; isError?: boolean };
	expectedPatterns: string[];
}
interface Plan {
	version: 1;
	model: { provider: string; id: string; reasoning: "low" };
	budgets: { modelCalls: number; sourceReads: number; metadataSearches: number; sourceCharsPerRead: number };
	grading: Record<string, unknown>;
	questions: Question[];
}
interface CorpusInput { bundle: string; summary: string }
interface InputManifest { corpora: Record<string, CorpusInput> }
interface Bundle {
	events: FeedEvent[];
	sources: Record<string, { file: string; offset: number; bytes: number; sha256: string }>;
	gaps: unknown[];
}
interface Corpus {
	id: string;
	input: CorpusInput;
	bundle: Bundle;
	events: FeedEvent[];
	graph: WorkGraph;
	committed: number;
	documents: Map<string, string>;
	byRef: Map<string, FeedEvent>;
	paired(ref: string): string | undefined;
}

const object = { additionalProperties: false } as const;
const searchTool: Tool = { name: "search_history", description: "Search recorded narrative, metadata, and original tool text for a short literal phrase. Returns source handles and ranking metadata, never payload text.",
	constrainedSampling: { type: "json_schema", strict: "require" }, parameters: Type.Object({ query: Type.String({ minLength: 1, maxLength: 80 }) }, object) };
const inspectTool: Tool = { name: "inspect_evidence", description: "Read one bounded page from an allowed original source handle. Tool call/result counterparts are supplied together when available.",
	constrainedSampling: { type: "json_schema", strict: "require" }, parameters: Type.Object({ ref: Type.String({ minLength: 1 }), offset: Type.Integer({ minimum: 0 }), limit: Type.Integer({ minimum: 1, maximum: 4000 }) }, object) };
const answerTool: Tool = { name: "answer", description: "Answer the question from inspected original evidence. Cite each supporting original source as [src:SOURCE_ID].",
	constrainedSampling: { type: "json_schema", strict: "require" }, parameters: Type.Object({ text: Type.String({ minLength: 1, maxLength: 6000 }) }, object) };

const { positionals } = parseArgs({ allowPositionals: true });
const [planFile, inputFile, out] = positionals;
if (!planFile || !inputFile || !out) throw new Error("Usage: tsx experiments/pageindex-compare.ts QUESTIONS.json INPUTS.json NEW_OUTPUT_DIR");
const plan = JSON.parse(await readFile(planFile, "utf8")) as Plan;
const manifest = JSON.parse(await readFile(inputFile, "utf8")) as InputManifest;
if (plan.version !== 1 || !Array.isArray(plan.questions) || !plan.questions.length) throw new Error("Invalid question plan.");
if (new Set(plan.questions.map(q => q.id)).size !== plan.questions.length) throw new Error("Duplicate question IDs.");
await mkdir(out, { mode: 0o700 });
const save = (path: string, value: unknown) => writeFile(join(out, path), JSON.stringify(value, null, 2) + "\n", { mode: 0o600, flag: "wx" });
const hashFile = async (path: string) => createHash("sha256").update(await readFile(path)).digest("hex");

async function loadBundle(path: string): Promise<Bundle> {
	const raw = JSON.parse(await readFile(join(path, "sources.json"), "utf8"));
	const text = await readFile(join(path, "feed.jsonl"), "utf8");
	return { ...raw, events: text.trim().split("\n").filter(Boolean).map(line => JSON.parse(line)) };
}
function sourceRecord(bundle: Bundle, ref: string) {
	const exact = bundle.sources[ref];
	const block = exact ? null : /:b(\d+)$/.exec(ref);
	const source = exact ?? bundle.sources[ref.replace(/:b\d+$/, "")];
	if (!source) throw new Error(`Unknown source ${ref}`);
	return { source, block: block ? Number(block[1]) : null };
}
async function rawSource(bundle: Bundle, ref: string) {
	const { source, block } = sourceRecord(bundle, ref);
	const file = await open(source.file, "r"), bytes = Buffer.alloc(source.bytes);
	try {
		let read = 0;
		while (read < bytes.length) {
			const part = await file.read(bytes, read, bytes.length - read, source.offset + read);
			if (!part.bytesRead) throw new Error(`Source shortened: ${ref}`);
			read += part.bytesRead;
		}
	} finally { await file.close(); }
	if (createHash("sha256").update(bytes).digest("hex") !== source.sha256) throw new Error(`Source changed: ${ref}`);
	const entry = JSON.parse(bytes.toString("utf8")), message = entry.message ?? entry;
	const value = block !== null ? message.content[block]
		: ["user", "assistant", "custom"].includes(message.role)
			? { role: message.role, text: textBlocks(message.content), stopReason: message.stopReason, errorMessage: message.errorMessage }
			: message;
	return JSON.stringify(value);
}
async function lookup(corpus: Corpus, ref: string, offset: number, limit: number) {
	if (!corpus.byRef.has(ref)) throw new Error(`Reference is outside the observed prefix: ${ref}`);
	const text = await rawSource(corpus.bundle, ref);
	return { ref, offset, totalChars: text.length, nextOffset: offset + limit < text.length ? offset + limit : null, text: text.slice(offset, offset + limit) };
}
function stream(ref: string) {
	const base = ref.replace(/(:[^:]+):b\d+$/, "$1");
	return base.slice(0, base.lastIndexOf(":"));
}
async function inspectPair(corpus: Corpus, ref: string, offset: number, limit: number) {
	const selected = corpus.byRef.get(ref);
	if (!selected) throw new Error(`Unknown observed source ${ref}`);
	const pairRef = corpus.paired(ref), companion = pairRef && offset === 0 && limit > 1 ? await lookup(corpus, pairRef, 0, Math.floor(limit / 2)) : undefined;
	const available = limit - (companion?.text.length ?? 0);
	return [await lookup(corpus, ref, offset, available), ...(companion ? [companion] : [])];
}
async function buildCorpus(id: string, input: CorpusInput): Promise<Corpus> {
	const bundle = await loadBundle(input.bundle);
	if (bundle.gaps.length) throw new Error(`${id}: bundle has source gaps.`);
	const summary = JSON.parse(await readFile(input.summary, "utf8"));
	const committed = summary.committed;
	if (!Number.isSafeInteger(committed) || committed < 1 || committed > bundle.events.length || !summary.finalGraph) throw new Error(`${id}: invalid summary.`);
	const events = bundle.events.slice(0, committed), byRef = new Map(events.map(event => [event.ref, event]));
	const pairs = new Map<string, string>();
	for (const event of events) if (event.callId) {
		const other = events.find(candidate => candidate.ref !== event.ref && candidate.callId === event.callId && stream(candidate.ref) === stream(event.ref)
			&& ["tool_call", "tool_result", "shell_result"].includes(candidate.kind));
		if (other) pairs.set(event.ref, other.ref);
	}
	const corpus = { id, input, bundle, events, byRef, graph: summary.finalGraph as WorkGraph, committed, documents: new Map<string, string>(), paired: (ref: string) => pairs.get(ref) };
	for (const event of events) {
		let text = renderEvent(event);
		if (["tool_call", "tool_result", "shell_result"].includes(event.kind)) text += `\n${await rawSource(bundle, event.ref)}`;
		corpus.documents.set(event.ref, text);
	}
	return corpus;
}

const corpora = new Map<string, Corpus>();
for (const question of plan.questions) {
	const input = manifest.corpora[question.corpus];
	if (!input) throw new Error(`Missing corpus input ${question.corpus}`);
	if (!corpora.has(question.corpus)) corpora.set(question.corpus, await buildCorpus(question.corpus, input));
	const corpus = corpora.get(question.corpus)!;
	if (!corpus.byRef.has(question.expectedRef)) throw new Error(`${question.id}: expected ref is outside observed prefix.`);
	const event = corpus.byRef.get(question.expectedRef)!;
	for (const [key, value] of Object.entries(question.expectedMetadata)) if ((event as any)[key] !== value) throw new Error(`${question.id}: expected metadata mismatch ${key}.`);
	const text = await rawSource(corpus.bundle, question.expectedRef);
	for (const pattern of question.expectedPatterns) if (!new RegExp(pattern, "i").test(text)) throw new Error(`${question.id}: expected pattern absent: ${pattern}`);
}
const inputEvidence = await Promise.all([...corpora].map(async ([id, corpus]) => ({ id, bundle: corpus.input.bundle, bundleSourcesSha256: await hashFile(join(corpus.input.bundle, "sources.json")),
	bundleFeedSha256: await hashFile(join(corpus.input.bundle, "feed.jsonl")), summary: corpus.input.summary, summarySha256: await hashFile(corpus.input.summary),
	committed: corpus.committed, totalEvents: corpus.bundle.events.length, graphRevision: corpus.graph.revision, graphNodes: corpus.graph.nodes.length })));
await save("configuration.json", { planFile, planSha256: await hashFile(planFile), inputFile, model: plan.model, budgets: plan.budgets, conditions: {
	search: "No map. Search metadata/original text, then inspect only returned source handles.",
	map: "No search. Read the supplied map, then inspect only source handles cited by that map."
}, inputEvidence });
await save("predeclared-questions.json", { grading: plan.grading, questions: plan.questions });

const runtime = await ModelRuntime.create();
const model = runtime.getModel(plan.model.provider, plan.model.id);
if (!model) throw new Error(`Model unavailable: ${plan.model.provider}/${plan.model.id}; no fallback.`);
if (model.api !== "openai-codex-responses") throw new Error(`Unexpected model API ${model.api}.`);
const codex = model as Model<"openai-codex-responses">;
let serial = 0;
const allResults: any[] = [];

async function run(question: Question, condition: Condition) {
	const corpus = corpora.get(question.corpus)!;
	const runId = `${question.id}-${condition}`, inspected = new Set<string>(), returned = new Set<string>();
	const mapSources = new Set([...corpus.graph.nodes, ...corpus.graph.edges].flatMap(item => item.sources));
	let reads = plan.budgets.sourceReads, searches = plan.budgets.metadataSearches, calls = 0, answer = "";
	const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, nominalCost: 0, elapsedMs: 0 };
	const messages: Message[] = [{ role: "user", timestamp: Date.now(), content: JSON.stringify({ condition,
		question: question.question, ...(condition === "map" ? { graph: corpus.graph } : {}),
		evidencePagesRemaining: reads, metadataSearchesRemaining: condition === "search" ? searches : 0 }) }];
	const started = performance.now(), sessionId = randomUUID();
	while (calls < plan.budgets.modelCalls) {
		const canAnswer = inspected.size > 0;
		const tools: Tool[] = condition === "search"
			? [...(searches > 0 ? [searchTool] : []), ...(returned.size && reads > 0 ? [inspectTool] : []), ...(canAnswer ? [answerTool] : [])]
			: [...(reads > 0 ? [inspectTool] : []), ...(canAnswer ? [answerTool] : [])];
		if (!tools.length) throw new Error(`${runId}: no operation remains before an answer.`);
		const call = ++calls, global = ++serial, callStarted = performance.now();
		await save(`${runId}-request-${call}.json`, { system: PAGEINDEX_BASE_PROMPT, messages, tools: tools.map(tool => tool.name), remaining: { calls: plan.budgets.modelCalls - call + 1, reads, searches: condition === "search" ? searches : 0 } });
		const reply = await runtime.complete(codex, { systemPrompt: pageIndexEffectivePrompt(condition), messages, tools }, {
			reasoningEffort: "low", toolChoice: "required", maxTokens: 2000, sessionId, signal: AbortSignal.timeout(120000), maxRetryDelayMs: 1000,
			onPayload: payload => { (payload as { parallel_tool_calls: boolean }).parallel_tool_calls = false; },
		});
		for (const key of ["input", "output", "cacheRead", "cacheWrite"] as const) usage[key] += reply.usage[key];
		usage.nominalCost += reply.usage.cost.total;
		const operations = reply.content.filter(item => item.type === "toolCall");
		await save(`${runId}-response-${call}.json`, { global, provider: reply.provider, model: reply.model, stopReason: reply.stopReason, usage: reply.usage,
			elapsedMs: Math.round(performance.now() - callStarted), operations });
		if (reply.stopReason !== "toolUse" || operations.length !== 1) throw new Error(`${runId}: expected one tool call.`);
		const operation = operations[0] as any;
		try {
			let result: unknown;
			if (operation.name === "search_history" && condition === "search" && searches > 0) {
				const query = validateSearchQuery(operation.arguments.query);
				searches--;
				const matches = rankSearchDocuments(corpus.events, corpus.documents, query, question.question, ref => corpus.paired(ref));
				for (const match of matches) { returned.add(match.ref); if (match.pairedRef) returned.add(match.pairedRef); }
				const searchResult = { matches, unreadable: 0, gaps: [] as string[], limit: 5, evidencePagesRemaining: reads, metadataSearchesRemaining: searches };
				result = searchResult;
				await save(`${runId}-search-${call}.json`, { query, ...searchResult });
			} else if (operation.name === "inspect_evidence" && reads > 0) {
				const { ref, offset, limit } = operation.arguments;
				if (typeof ref !== "string" || !Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > plan.budgets.sourceCharsPerRead) throw new Error("Invalid evidence request.");
				const allowed = condition === "search" ? returned : mapSources;
				if (!allowed.has(ref)) throw new Error(condition === "search" ? "Inspect a source returned by search." : "Inspect a source handle cited by the supplied map.");
				reads--;
				const results = await inspectPair(corpus, ref, offset, limit);
				for (const page of results) inspected.add(page.ref);
				result = { results, evidencePagesRemaining: reads, metadataSearchesRemaining: condition === "search" ? searches : 0 };
				await save(`${runId}-evidence-${call}.json`, results);
			} else if (operation.name === "answer" && inspected.size) {
				answer = operation.arguments.text;
				break;
			} else throw new Error(`Unavailable operation ${operation.name}.`);
			messages.push(reply, { role: "toolResult", toolCallId: operation.id, toolName: operation.name, isError: false,
				content: [{ type: "text", text: JSON.stringify(result) }], timestamp: Date.now() });
		} catch (error) {
			messages.push(reply, { role: "toolResult", toolCallId: operation.id, toolName: operation.name, isError: true,
				content: [{ type: "text", text: String(error) }], timestamp: Date.now() });
		}
	}
	usage.elapsedMs = Math.round(performance.now() - started);
	const citations = [...answer.matchAll(/\[src:([^\]\s]+)\]/g)].map(match => match[1]);
	const patternResults = question.expectedPatterns.map(pattern => ({ pattern, answer: new RegExp(pattern, "i").test(answer) }));
	const candidates = [...new Set(citations.filter(ref => inspected.has(ref)))];
	const sourceChecks = [];
	for (const ref of candidates) {
		const event = corpus.byRef.get(ref), text = event ? await rawSource(corpus.bundle, ref) : "";
		const metadata = Boolean(event && Object.entries(question.expectedMetadata).every(([key, value]) => (event as any)[key] === value));
		sourceChecks.push({ ref, inspected: inspected.has(ref), cited: citations.includes(ref), metadata,
			patterns: question.expectedPatterns.map(pattern => ({ pattern, matched: new RegExp(pattern, "i").test(text) })) });
	}
	const sourcePass = question.sourcePolicy === "exact"
		? candidates.includes(question.expectedRef)
		: sourceChecks.some(check => check.metadata && check.patterns.every(item => item.matched));
	const result = { id: question.id, corpus: question.corpus, condition, question: question.question, sourcePolicy: question.sourcePolicy,
		expectedRef: question.expectedRef, answer, citations, inspected: [...inspected], calls, readsUsed: plan.budgets.sourceReads - reads,
		searchesUsed: condition === "search" ? plan.budgets.metadataSearches - searches : 0, usage, patternResults, sourceChecks,
		pass: Boolean(answer) && patternResults.every(item => item.answer) && sourcePass && calls <= plan.budgets.modelCalls };
	await save(`${runId}-result.json`, result);
	allResults.push(result);
}

for (const question of plan.questions) for (const condition of ["search", "map"] as const) await run(question, condition);
const conditions = Object.fromEntries((["search", "map"] as const).map(condition => {
	const rows = allResults.filter(result => result.condition === condition);
	return [condition, { passed: rows.filter(result => result.pass).length, total: rows.length,
		calls: rows.reduce((sum, result) => sum + result.calls, 0), reads: rows.reduce((sum, result) => sum + result.readsUsed, 0),
		searches: rows.reduce((sum, result) => sum + result.searchesUsed, 0), input: rows.reduce((sum, result) => sum + result.usage.input, 0),
		output: rows.reduce((sum, result) => sum + result.usage.output, 0), cacheRead: rows.reduce((sum, result) => sum + result.usage.cacheRead, 0),
		nominalCost: rows.reduce((sum, result) => sum + result.usage.nominalCost, 0), elapsedMs: rows.reduce((sum, result) => sum + result.usage.elapsedMs, 0) }];
}));
const winner = conditions.map.passed > conditions.search.passed ? "map" : conditions.search.passed > conditions.map.passed ? "search" : "tie";
await save("summary.json", { planSha256: await hashFile(planFile), model: plan.model, budgets: plan.budgets, inputEvidence, conditions, winner, results: allResults });
console.log(JSON.stringify({ conditions, winner, results: allResults.map(({ id, condition, pass, calls, readsUsed, searchesUsed, citations }) => ({ id, condition, pass, calls, readsUsed, searchesUsed, citations })) }, null, 2));
