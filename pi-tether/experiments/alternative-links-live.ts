// Opt-in semantic regression: real Mom, copied evidence, no writes to the source session/cache.
// Usage: tsx experiments/alternative-links-live.ts SESSION THROUGH_ENTRY NEW_OUTPUT_DIR
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { findPackageJSON } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ModelRuntime, SessionManager } from "@earendil-works/pi-coding-agent";
import { DEFAULT_BOOTSTRAP_POLICY } from "../src/bootstrap.ts";
import { Mom, DEFAULT_MODEL } from "../src/mother.ts";
import { SidecarStore } from "../src/sidecar.ts";

const [source, through, output] = process.argv.slice(2);
assert(source && through && output, "Usage: SESSION THROUGH_ENTRY NEW_OUTPUT_DIR");
const lines = (await readFile(source, "utf8")).trim().split("\n");
const end = lines.findIndex(line => JSON.parse(line).id === through);
assert(end > 0, "Replay boundary must exist in the supplied session");
const frozen = lines.slice(0, end + 1).join("\n") + "\n";
await mkdir(output, { recursive: false });
await writeFile(join(output, "input.json"), JSON.stringify({ source, through,
	sha256: createHash("sha256").update(frozen).digest("hex"), model: DEFAULT_MODEL }, null, 2));
const runtime = await ModelRuntime.create();
const sdkApiPackage = findPackageJSON("@earendil-works/pi-ai", import.meta.resolve("@earendil-works/pi-coding-agent"))!;
const { closeOpenAICodexWebSocketSessions } = await import(new URL("./dist/api/openai-codex-responses.js", pathToFileURL(sdkApiPackage)).href);

async function run(kind: "topic-switch" | "competing-approaches", iteration: number) {
	const dir = await mkdtemp(join(tmpdir(), "mom-alternatives-"));
	const cacheSessions = new Set<string>();
	let mom: Mom | undefined;
	try {
		let manager: SessionManager;
		if (kind === "topic-switch") {
			const copy = join(dir, "session.jsonl");
			await writeFile(copy, frozen);
			manager = SessionManager.open(copy);
		} else {
			manager = SessionManager.create(dir, dir);
			manager.appendMessage({ role: "user", timestamp: Date.now(), content: "Choose storage for the same shared task service. Prototype SQLite and PostgreSQL separately, then compare them. These are competing implementations: we will select exactly one after evaluation. Keep both investigations open; neither is chosen or finished yet." });
			manager.appendMessage({ role: "assistant", timestamp: Date.now(), api: "openai-completions", provider: "fixture", model: "fixture", stopReason: "stop",
				content: [{ type: "text", text: "The SQLite prototype and PostgreSQL prototype are separate ongoing investigations for the same service. No selection or completion to report." }],
				usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
		}
		const replies: unknown[] = [];
		const modelRegistry = {
			find: (provider: string, id: string) => runtime.getModel(provider, id),
			complete: async (model: any, context: any, options: any) => {
				assert(replies.length < 2, "Only the production proposal and one repair are allowed");
				cacheSessions.add(options.sessionId);
				const reply = await runtime.complete(model, context, options);
				replies.push({ stopReason: reply.stopReason, usage: reply.usage, operations: reply.content.filter(block => block.type === "toolCall") });
				return reply;
			},
		};
		mom = new Mom({ ctx: { sessionManager: manager, modelRegistry } as any, model: DEFAULT_MODEL,
			bootstrapPolicy: DEFAULT_BOOTSTRAP_POLICY, store: new SidecarStore(() => manager.getSessionFile(), manager.getSessionId()), current: () => true, changed() {} });
		await mom.open();
		const started = Date.now();
		await mom.update();
		const result = { kind, iteration, ms: Date.now() - started, calls: mom.usage.calls, error: mom.error, more: mom.more, graph: mom.graph, replies };
		await writeFile(join(output, `${kind}-${iteration}.json`), JSON.stringify(result, null, 2));
		assert(!mom.error, mom.error);
		assert.equal(mom.more, false);
		assert.equal(result.calls, 1, "healthy semantic update stays one call");
		const alternatives = mom.graph.edges.filter(edge => edge.relation === "alternative_to");
		if (kind === "topic-switch") {
			assert.equal(alternatives.length, 0, "separate footer and deals work must not become alternatives");
			const text = mom.graph.nodes.map(node => `${node.label} ${node.intent} ${node.observed}`).join("\n");
			assert.match(text, /footer/i, "the negative result must not come from losing the footer work");
			assert.match(text, /deal/i, "the negative result must not come from losing the deals work");
		} else {
			const text = (id: string) => { const node = mom!.graph.nodes.find(n => n.id === id)!; return `${node.label} ${node.intent}`; };
			assert(alternatives.some(edge => /sqlite/i.test(text(edge.from)) && /postgres/i.test(text(edge.to)) || /postgres/i.test(text(edge.from)) && /sqlite/i.test(text(edge.to))), "genuine storage alternatives need an edge between the approaches");
		}
		console.log(`PASS ${kind} ${iteration}: ${result.calls} call, ${result.ms}ms, ${alternatives.length} alternative edges`);
	} finally {
		mom?.close();
		for (const id of cacheSessions) closeOpenAICodexWebSocketSessions(id);
		await rm(dir, { recursive: true, force: true });
	}
}
const results = await Promise.allSettled(["topic-switch", "competing-approaches"].map(async kind => {
	for (let i = 1; i <= 3; i++) await run(kind as "topic-switch" | "competing-approaches", i);
}));
for (const result of results) if (result.status === "rejected") throw result.reason;
