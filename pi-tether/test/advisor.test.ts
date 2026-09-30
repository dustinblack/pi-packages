import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { isAdvisorScreenRecord, SystemOneAdvisor } from "../src/advisor.ts";
import { emptyGraph } from "../src/graph.ts";

const response = {
	model: "jaredpalmer/kev-4b",
	answers: { needs_update: { type: "noul", noul: 0.82 } },
	usage: { input_tokens: 91, output_tokens: 7 },
};
const screenInput = () => ({ current: emptyGraph(), newEvidence: "One bounded session batch",
	contextBeforeBatch: "[src:s:a] lead assistant", pendingMore: false, unresolvedProcessRisks: ["uncommitted_work:main"] });

async function server(reply: (body: any) => { status?: number; body: unknown; delayMs?: number }) {
	let seen: any;
	const http = createServer((request, result) => {
		let text = "";
		request.setEncoding("utf8");
		request.on("data", chunk => { text += chunk; });
		request.on("end", async () => {
			seen = JSON.parse(text);
			const next = reply(seen);
			if (next.delayMs) await new Promise(resolve => setTimeout(resolve, next.delayMs));
			result.statusCode = next.status ?? 200;
			result.setHeader("content-type", "application/json");
			result.end(JSON.stringify(next.body));
		});
	});
	await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve));
	const address = http.address();
	if (!address || typeof address === "string") throw new Error("Test server did not bind.");
	return { url: `http://127.0.0.1:${address.port}/v1/systemone`, seen: () => seen,
		close: () => new Promise<void>((resolve, reject) => http.close(error => error ? reject(error) : resolve())) };
}

test("System One answers one whole settled batch with a single binary needs_update noul", async () => {
	const api = await server(() => ({ body: response }));
	try {
		const advisor = new SystemOneAdvisor({ url: api.url, model: "kev-latest", threshold: 0.7, timeoutMs: 1000 });
		const screen = await advisor.screen(screenInput());
		assert.equal(screen.status, "screened");
		assert.equal(screen.needsUpdate, 0.82);
		assert.equal(screen.wake, true, "at or above the threshold Mom's model wakes");
		assert.equal(screen.model, "jaredpalmer/kev-4b");
		assert.deepEqual(screen.usage, { input: 91, output: 7 });
		assert(screen.latencyMs >= 0);
		assert.equal(api.seen().state.newEvidence, "One bounded session batch");
		assert.equal(api.seen().state.contextBeforeBatch, "[src:s:a] lead assistant");
		assert.equal(api.seen().state.pendingMore, false);
		assert.deepEqual(api.seen().state.unresolvedProcessRisks, ["uncommitted_work:main"]);
		assert.deepEqual(api.seen().state.current, emptyGraph());
		assert.deepEqual(Object.keys(api.seen().questions), ["needs_update"]);
		assert.equal(api.seen().questions.needs_update.type, "noul");
		assert.match(api.seen().questions.needs_update.instructions, /materially moved the session/);
		assert.match(api.seen().questions.needs_update.criteria.true, /purpose or scope/);
		assert.match(api.seen().questions.needs_update.criteria.true, /process risk/);
		assert.match(api.seen().questions.needs_update.criteria.false, /routine mechanical progress/);
		assert.equal(api.seen().model, "kev-latest");
		assert(!JSON.stringify(api.seen()).includes("fragment"));
	} finally { await api.close(); }
});

test("a below-threshold screen keeps Mom's model asleep", async () => {
	const api = await server(() => ({ body: { ...response, answers: { needs_update: { type: "noul", noul: 0.42 } } } }));
	try {
		const advisor = new SystemOneAdvisor({ url: api.url, threshold: 0.7, timeoutMs: 1000 });
		const screen = await advisor.screen(screenInput());
		assert.equal(screen.needsUpdate, 0.42);
		assert.equal(screen.wake, false);
		const exact = new SystemOneAdvisor({ url: api.url, threshold: 0.42, timeoutMs: 1000 });
		assert.equal((await exact.screen(screenInput())).wake, true, "the threshold comparison is inclusive");
	} finally { await api.close(); }
});

test("System One rejects unsafe endpoints, malformed answers, and timeouts without network fallback", async () => {
	const unsafe = new SystemOneAdvisor({ url: "https://example.com/v1/systemone" });
	await assert.rejects(() => unsafe.screen(screenInput()), /loopback or private IPv4/);
	const malformedApi = await server(() => ({ body: { ...response, answers: { needs_update: { type: "noul", noul: 2 } } } }));
	try {
		const malformed = new SystemOneAdvisor({ url: malformedApi.url });
		await assert.rejects(() => malformed.screen(screenInput()), /invalid screen answer/);
	} finally { await malformedApi.close(); }
	const brokenJson = await server(() => ({ status: 200, body: undefined }));
	try {
		const advisor = new SystemOneAdvisor({ url: brokenJson.url });
		await assert.rejects(() => advisor.screen(screenInput()), /invalid JSON/);
	} finally { await brokenJson.close(); }
	const slowApi = await server(() => ({ body: response, delayMs: 400 }));
	try {
		const slow = new SystemOneAdvisor({ url: slowApi.url, timeoutMs: 100 });
		await assert.rejects(() => slow.screen(screenInput()));
	} finally { await slowApi.close(); }
});

test("a screen receipt is validated as screened-or-unavailable, never as a fake success", () => {
	assert.equal(isAdvisorScreenRecord({ status: "screened", model: "kev", needsUpdate: 0.4, wake: false,
		usage: { input: 1, output: 2 }, latencyMs: 5 }), true);
	assert.equal(isAdvisorScreenRecord({ status: "unavailable", model: "kev", error: "offline", latencyMs: 5 }), true);
	assert.equal(isAdvisorScreenRecord({ status: "screened", model: "kev", needsUpdate: 2, wake: false,
		usage: { input: 1, output: 2 }, latencyMs: 5 }), false);
	assert.equal(isAdvisorScreenRecord({ status: "screened", model: "kev", needsUpdate: 0.4, wake: "yes" as any,
		usage: { input: 1, output: 2 }, latencyMs: 5 }), false);
	assert.equal(isAdvisorScreenRecord({ status: "screened", model: "kev", needsUpdate: 0.4, wake: true,
		usage: { input: -1, output: 2 }, latencyMs: 5 }), false);
	assert.equal(isAdvisorScreenRecord({ status: "unavailable", model: "kev", latencyMs: 5 }), false);
	assert.equal(isAdvisorScreenRecord({ status: "reviewed", model: "kev", latencyMs: 5, reexamined: false }), false,
		"the retired post-draft review receipt is no longer a valid record");
});

test("the default screen threshold keeps every captured gold movement awake", () => {
	const advisor = new SystemOneAdvisor({ url: "http://127.0.0.1:1/v1/systemone" });
	assert.equal(advisor.threshold, 0.25);
});
