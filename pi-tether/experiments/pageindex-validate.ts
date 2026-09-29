import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PAGEINDEX_BASE_PROMPT, PAGEINDEX_CONDITION_PROMPTS, pageIndexEffectivePrompt, type PageIndexCondition } from "./pageindex-protocol.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const rel = (path: string) => resolve(repo, path);
const json = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const hash = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => { if (!condition) throw new Error(message); };
const same = (a: unknown, b: unknown, message: string) => assert(JSON.stringify(a) === JSON.stringify(b), message);
const close = (a: number, b: number, message: string) => assert(Math.abs(a - b) < 1e-12, `${message}: ${a} != ${b}`);

const planPath = join(here, "pageindex-questions.json");
const resultsPath = join(here, "pageindex-results.json");
const manifestPath = join(here, "pageindex-artifacts.json");
const reportPath = join(here, "pageindex-report.md");
const harnessPath = join(here, "pageindex-compare.ts");
const evidenceRoot = join(here, "evidence/pageindex-20260929");
const captured = join(evidenceRoot, "captured");
const [plan, results, manifest, protocol, metadata, captureOrder, predeclared, config, harness, report] = await Promise.all([
	json(planPath), json(resultsPath), json(manifestPath), json(join(evidenceRoot, "protocol.json")),
	json(join(evidenceRoot, "inspected-source-metadata.json")), json(join(evidenceRoot, "capture-order.json")),
	json(join(captured, "predeclared-questions.json")), json(join(captured, "configuration.json")),
	readFile(harnessPath, "utf8"), readFile(reportPath, "utf8"),
]);

// Every durable artifact is present and byte-identical to the manifest.
for (const item of manifest.files as { path: string; bytes: number; sha256: string }[]) {
	const bytes = await readFile(rel(item.path));
	assert(bytes.length === item.bytes, `size mismatch: ${item.path}`);
	assert(hash(bytes) === item.sha256, `checksum mismatch: ${item.path}`);
}
assert(!JSON.stringify(manifest).includes("/private/tmp"), "manifest must use durable repo-relative paths");
assert(!JSON.stringify(results).includes("/private/tmp"), "results must use durable repo-relative paths");
assert(!report.includes("/private/tmp"), "report must use durable repo-relative paths");

// The checked-in question contract is exactly what the harness saved before any call.
assert(hash(await readFile(planPath)) === config.planSha256, "captured configuration plan hash differs");
same(config.model, plan.model, "captured model differs from checked-in plan");
same(config.budgets, plan.budgets, "captured budgets differ from checked-in plan");
same(predeclared.questions, plan.questions, "predeclared questions differ from checked-in plan");
same(predeclared.grading, plan.grading, "predeclared grading differs from checked-in plan");
const predeclareAt = harness.indexOf('await save("predeclared-questions.json"');
const runtimeAt = harness.indexOf("ModelRuntime.create()");
assert(predeclareAt >= 0 && runtimeAt > predeclareAt, "harness must save predeclaration before creating the model runtime");
const capturedTimes = new Map<string, number>(captureOrder.files.map((item: any) => [item.file, item.mtimeNs]));
const firstRequestTime = Math.min(...captureOrder.files.filter((item: any) => /-request-\d+\.json$/.test(item.file)).map((item: any) => item.mtimeNs));
assert(capturedTimes.get("configuration.json")! < firstRequestTime && capturedTimes.get("predeclared-questions.json")! < firstRequestTime,
	"captured predeclaration/configuration must precede every request");

// Effective prompts and declared condition differences are durable and match the executed harness.
assert(protocol.basePrompt === PAGEINDEX_BASE_PROMPT, "base prompt snapshot differs");
same(protocol.conditionPrompts, PAGEINDEX_CONDITION_PROMPTS, "condition prompt snapshot differs");
assert(harness.includes("systemPrompt: pageIndexEffectivePrompt(condition)"), "harness no longer uses the snapshotted effective prompt");
assert(/reasoningEffort:\s*"low"/.test(harness), "harness no longer applies the predeclared low reasoning effort");
assert(pageIndexEffectivePrompt("search") !== pageIndexEffectivePrompt("map"), "condition prompts must differ");

const questions = new Map<string, any>(plan.questions.map((question: any) => [question.id, question]));
const metadataByRef = new Map<string, any>(metadata.sources.map((source: any) => [`${source.corpus}\0${source.ref}`, source]));
const capturedNames = await readdir(captured);
const conditions: PageIndexCondition[] = ["search", "map"];
const seenRuns = new Set<string>();
const calculated: Record<PageIndexCondition, any> = {
	search: { passed: 0, total: 0, calls: 0, reads: 0, searches: 0, input: 0, output: 0, cacheRead: 0, nominalCost: 0, elapsedMs: 0 },
	map: { passed: 0, total: 0, calls: 0, reads: 0, searches: 0, input: 0, output: 0, cacheRead: 0, nominalCost: 0, elapsedMs: 0 },
};

for (const result of results.results as any[]) {
	const question = questions.get(result.id);
	assert(question, `unknown result question ${result.id}`);
	assert(result.corpus === question.corpus && result.expectedRef === question.expectedRef && result.sourcePolicy === question.sourcePolicy,
		`${result.id}: result corpus/source policy differs from predeclaration`);
	const condition = result.condition as PageIndexCondition;
	assert(conditions.includes(condition), `unknown condition ${condition}`);
	const stem = `${result.id}-${condition}`;
	assert(!seenRuns.has(stem), `duplicate result ${stem}`);
	seenRuns.add(stem);
	const requestNames = capturedNames.filter(name => name.startsWith(`${stem}-request-`)).sort((a, b) => Number(a.match(/-(\d+)\.json$/)![1]) - Number(b.match(/-(\d+)\.json$/)![1]));
	const responseNames = capturedNames.filter(name => name.startsWith(`${stem}-response-`)).sort((a, b) => Number(a.match(/-(\d+)\.json$/)![1]) - Number(b.match(/-(\d+)\.json$/)![1]));
	assert(requestNames.length === result.calls && responseNames.length === result.calls, `${stem}: call files do not match count`);
	const requests = await Promise.all(requestNames.map(name => json(join(captured, name))));
	const responses = await Promise.all(responseNames.map(name => json(join(captured, name))));
	for (let i = 0; i < requests.length; i++) {
		assert(requests[i].system === PAGEINDEX_BASE_PROMPT, `${stem}: base prompt differs at call ${i + 1}`);
		assert(responses[i].provider === plan.model.provider && responses[i].model === plan.model.id, `${stem}: model differs at call ${i + 1}`);
		assert(responses[i].operations.length === 1, `${stem}: call ${i + 1} needs one operation`);
	}
	const firstInput = JSON.parse(requests[0].messages[0].content);
	assert(firstInput.condition === condition && firstInput.question === question.question, `${stem}: first input differs`);
	assert(firstInput.evidencePagesRemaining === plan.budgets.sourceReads, `${stem}: read budget differs`);
	if (condition === "search") {
		assert(firstInput.graph === undefined, `${stem}: search condition received a graph`);
		assert(firstInput.metadataSearchesRemaining === plan.budgets.metadataSearches, `${stem}: search budget differs`);
		assert(requests[0].tools.length === 1 && requests[0].tools[0] === "search_history", `${stem}: search must begin with search_history only`);
	} else {
		assert(firstInput.graph && firstInput.metadataSearchesRemaining === 0, `${stem}: map condition needs graph and no search budget`);
		assert(requests.every(request => !request.tools.includes("search_history")), `${stem}: map condition exposed search`);
	}

	const responseUsage = responses.reduce((sum, response) => ({ input: sum.input + response.usage.input, output: sum.output + response.usage.output,
		cacheRead: sum.cacheRead + response.usage.cacheRead, cacheWrite: sum.cacheWrite + response.usage.cacheWrite,
		nominalCost: sum.nominalCost + response.usage.cost.total }), { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, nominalCost: 0 });
	for (const key of ["input", "output", "cacheRead", "cacheWrite"] as const) assert(responseUsage[key] === result.usage[key], `${stem}: ${key} total differs`);
	close(responseUsage.nominalCost, result.usage.nominalCost, `${stem}: nominal cost differs`);

	const evidenceNames = capturedNames.filter(name => name.startsWith(`${stem}-evidence-`));
	const evidencePages = (await Promise.all(evidenceNames.map(name => json(join(captured, name))))).flat();
	const evidenceByRef = new Map<string, string>();
	for (const page of evidencePages) evidenceByRef.set(page.ref, `${evidenceByRef.get(page.ref) ?? ""}${page.text}`);
	same([...evidenceByRef.keys()].sort(), [...result.inspected].sort(), `${stem}: inspected refs differ from durable evidence pages`);
	const operations = responses.map(response => response.operations[0]);
	const inspectRefs = operations.filter(operation => operation.name === "inspect_evidence").map(operation => operation.arguments.ref);
	for (const ref of inspectRefs) assert(evidenceByRef.has(ref), `${stem}: inspect ${ref} lacks durable page`);
	if (condition === "search") {
		const searchNames = capturedNames.filter(name => name.startsWith(`${stem}-search-`));
		const searchRecords = await Promise.all(searchNames.map(name => json(join(captured, name))));
		const returned = new Set(searchRecords.flatMap(record => record.matches.flatMap((match: any) => [match.ref, match.pairedRef].filter(Boolean))));
		for (const ref of inspectRefs) assert(returned.has(ref), `${stem}: inspected ref was not returned by search: ${ref}`);
	} else {
		const graphSources = new Set([...firstInput.graph.nodes, ...firstInput.graph.edges].flatMap((item: any) => item.sources));
		for (const ref of inspectRefs) assert(graphSources.has(ref), `${stem}: inspected ref was not cited by map: ${ref}`);
	}
	const answerOps = operations.filter(operation => operation.name === "answer");
	assert(answerOps.length === 1 && answerOps[0].arguments.text === result.answer, `${stem}: final answer differs`);
	const citations = [...result.answer.matchAll(/\[src:([^\]\s]+)\]/g)].map((match: RegExpMatchArray) => match[1]);
	same(citations, result.citations, `${stem}: citations differ`);
	assert(citations.every((ref: string) => evidenceByRef.has(ref)), `${stem}: answer cites uninspected source`);
	const answerPatterns = question.expectedPatterns.map((pattern: string) => new RegExp(pattern, "i").test(result.answer));
	assert(answerPatterns.every((matched: boolean, index: number) => matched === result.patternResults[index].answer), `${stem}: answer pattern grading differs`);
	let sourcePass = false;
	if (question.sourcePolicy === "exact") sourcePass = citations.includes(question.expectedRef) && evidenceByRef.has(question.expectedRef);
	else for (const ref of citations) {
		const source = metadataByRef.get(`${question.corpus}\0${ref}`), text = evidenceByRef.get(ref) ?? "";
		const metadataPass = source && Object.entries(question.expectedMetadata).every(([key, value]) => source[key] === value);
		if (metadataPass && question.expectedPatterns.every((pattern: string) => new RegExp(pattern, "i").test(text))) sourcePass = true;
	}
	const pass = Boolean(result.answer) && answerPatterns.every(Boolean) && sourcePass && result.calls <= plan.budgets.modelCalls;
	assert(pass === result.pass, `${stem}: final pass grading differs`);

	const expected = await json(join(evidenceRoot, `expected/${result.id}.json`));
	assert(expected.ref === question.expectedRef, `${stem}: durable expected source ref differs`);
	for (const pattern of question.expectedPatterns) assert(new RegExp(pattern, "i").test(expected.text), `${stem}: expected source lacks ${pattern}`);

	const total = calculated[condition];
	total.total++; total.passed += Number(pass); total.calls += result.calls; total.reads += result.readsUsed; total.searches += result.searchesUsed;
	total.input += result.usage.input; total.output += result.usage.output; total.cacheRead += result.usage.cacheRead;
	total.nominalCost += result.usage.nominalCost; total.elapsedMs += result.usage.elapsedMs;
}
for (const question of plan.questions) for (const condition of conditions) assert(seenRuns.has(`${question.id}-${condition}`), `missing ${question.id}-${condition}`);
for (const condition of conditions) {
	const actual = results.conditions[condition], expected = calculated[condition];
	for (const key of ["passed", "total", "calls", "reads", "searches", "input", "output", "cacheRead", "elapsedMs"] as const) assert(actual[key] === expected[key], `${condition}: aggregate ${key} differs`);
	close(actual.nominalCost, expected.nominalCost, `${condition}: aggregate cost differs`);
}
const winner = calculated.map.passed > calculated.search.passed ? "map" : calculated.search.passed > calculated.map.passed ? "search" : "tie";
assert(results.winner === winner, "winner differs from recalculated accuracy");

// A conservative credential scan covers all committed raw evidence and top-level experiment artifacts.
const secretPatterns = [
	/sk-[A-Za-z0-9_-]{20,}/, /Bearer\s+[A-Za-z0-9._-]{20,}/i, /AKIA[0-9A-Z]{16}/,
	/-----BEGIN (?:RSA |OPENSSH |EC |)PRIVATE KEY-----/, /gh[pousr]_[A-Za-z0-9]{20,}/, /xox[baprs]-[A-Za-z0-9-]{10,}/,
];
for (const item of manifest.files as { path: string }[]) {
	const text = await readFile(rel(item.path), "utf8");
	for (const pattern of secretPatterns) assert(!pattern.test(text), `credential-like value in ${item.path}: ${pattern}`);
}
assert(manifest.securityScan.status === "pass" && manifest.securityScan.matchCount === 0, "manifest security scan is not clean");
console.log(JSON.stringify({ valid: true, questions: questions.size, results: results.results.length, calls: { search: calculated.search.calls, map: calculated.map.calls },
	accuracy: { search: `${calculated.search.passed}/${calculated.search.total}`, map: `${calculated.map.passed}/${calculated.map.total}` },
	artifacts: manifest.files.length, winner }, null, 2));
