// Opt-in real-model replay. Usage: tsx experiments/compaction-audit-live.ts SESSION CACHE NEW_OUTPUT_DIR
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { findPackageJSON } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ModelRuntime, SessionManager } from "@earendil-works/pi-coding-agent";
import { auditSections } from "../src/audit.ts";
import { finishCompactionReview, prepareCompactionReview } from "../src/compaction.ts";
import { Mom, DEFAULT_MODEL } from "../src/mother.ts";
import { SidecarStore, sidecarFile } from "../src/sidecar.ts";

const [source, cache, output] = process.argv.slice(2);
assert(source && cache && output, "Usage: SESSION CACHE NEW_OUTPUT_DIR");
const transcript = await readFile(source), saved = await readFile(cache);
await mkdir(output, { recursive: false });
const dir = await mkdtemp(join(tmpdir(), "mom-compaction-audit-"));
const copy = join(dir, "session.jsonl");
await writeFile(copy, transcript); await writeFile(sidecarFile(copy), saved);
const manager = SessionManager.open(copy), runtime = await ModelRuntime.create();
const sdk = findPackageJSON("@earendil-works/pi-ai", import.meta.resolve("@earendil-works/pi-coding-agent"))!;
const { closeOpenAICodexWebSocketSessions } = await import(new URL("./dist/api/openai-codex-responses.js", pathToFileURL(sdk)).href);
const sessions = new Set<string>(), calls: unknown[] = [];
const modelRegistry = {
	find: (provider: string, id: string) => runtime.getModel(provider, id),
	complete: async (model: any, context: any, options: any) => {
		sessions.add(options.sessionId);
		const started = Date.now();
		await writeFile(join(output, `request-${calls.length + 1}.json`), JSON.stringify(context, null, 2));
		const reply = await runtime.complete(model, context, options);
		const call = { ms: Date.now() - started, stopReason: reply.stopReason, error: reply.errorMessage,
			usage: reply.usage, operations: reply.content.filter(block => block.type === "toolCall") };
		calls.push(call);
		await writeFile(join(output, `reply-${calls.length}.json`), JSON.stringify(call, null, 2));
		console.log(`Call ${calls.length}: ${call.ms}ms ${call.operations.map(op => op.name).join(",")} ${reply.stopReason}`);
		return reply;
	},
};
const mom = new Mom({ ctx: { sessionManager: manager, modelRegistry } as any, model: DEFAULT_MODEL,
	store: new SidecarStore(() => copy, manager.getSessionId()), current: () => true, changed() {} });
try {
	await mom.open();
	const before = structuredClone(mom.graph), usage = mom.usage;
	const branchEntries = manager.getBranch(), firstKeptEntryId = branchEntries.at(-1)!.id;
	const pending = prepareCompactionReview({ branchEntries, preparation: { firstKeptEntryId } } as any, manager.getSessionId());
	const id = manager.appendCompaction("Remote compaction applied", firstKeptEntryId, 100);
	const review = finishCompactionReview(pending, { compactionEntry: manager.getEntry(id) } as any);
	const sections = auditSections(review.historyEvents);
	await writeFile(join(output, "input.json"), JSON.stringify({ source, cache, model: DEFAULT_MODEL,
		transcriptSha256: createHash("sha256").update(transcript).digest("hex"), events: review.historyEvents.length,
		sections: sections.length, sectionChars: sections.map(s => s.evidence.length), before }, null, 2));
	console.log(`Auditing ${review.historyEvents.length} events in ${sections.length} complete sections.`);
	const started = Date.now();
	let failure: unknown;
	try { await mom.update(undefined, undefined, 1, false, review); } catch (error) { failure = error; }
	await writeFile(join(output, "result.json"), JSON.stringify({ ms: Date.now() - started, error: mom.error,
		calls: calls.length, input: mom.usage.input - usage.input, output: mom.usage.output - usage.output,
		before, after: mom.graph, coverage: mom.checkpoint?.cut, operations: calls }, null, 2));
	assert.deepEqual((await readFile(source)).subarray(0, transcript.length), transcript, "source transcript prefix unchanged");
	assert.deepEqual(await readFile(cache), saved, "source cache unchanged");
	if (failure) throw failure;
	assert.equal(mom.more, false);
	assert.equal(mom.checkpoint?.cut.parent, id);
	if (before.edges.some(e => e.from === "footer" && e.to === "deals" && e.relation === "alternative_to")) {
		assert(!mom.graph.edges.some(e => e.from === "footer" && e.to === "deals" && e.relation === "alternative_to"), "audit must remove the reported false alternative");
	}
	console.log(`PASS compaction audit: ${calls.length} calls, ${Date.now() - started}ms; source session/cache unchanged.`);
} finally {
	mom.close();
	for (const id of sessions) closeOpenAICodexWebSocketSessions(id);
	await rm(dir, { recursive: true, force: true });
}
