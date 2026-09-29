import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { SystemOneAdvisor } from "../src/advisor.ts";
import { emptyGraph } from "../src/graph.ts";

const response = {
	model: "jaredpalmer/kev-4b",
	answers: {
		needs_expand: { type: "noul", noul: 0.11 },
		needs_contract: { type: "noul", noul: 0.82 },
		needs_redirect: { type: "noul", noul: 0.08 },
		needs_reorganize: { type: "noul", noul: 0.16 },
		map_action: { type: "choice", choice: "contract", confidence: 0.73,
			probabilities: { accept: 0.08, expand: 0.05, contract: 0.73, redirect: 0.06, reorganize: 0.08 } },
	},
	usage: { input_tokens: 91, output_tokens: 7 },
};

async function server(reply: (body: any) => { status?: number; body: unknown }) {
	let seen: any;
	const http = createServer((request, result) => {
		let text = "";
		request.setEncoding("utf8");
		request.on("data", chunk => { text += chunk; });
		request.on("end", () => {
			seen = JSON.parse(text);
			const next = reply(seen);
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

test("System One reviews one whole proposed session account with calibrated probabilities", async () => {
	const api = await server(() => ({ body: response }));
	try {
		const advisor = new SystemOneAdvisor({ url: api.url, model: "kev-latest", threshold: 0.7, timeoutMs: 1000 });
		const review = await advisor.review({ current: emptyGraph(), proposed: emptyGraph(), newEvidence: "One bounded session batch", pendingMore: false });
		assert.equal(review.needsReanalysis, 0.82);
		assert.equal(review.action, "contract");
		assert.equal(review.probabilities.contract, 0.73);
		assert.deepEqual(review.usage, { input: 91, output: 7 });
		assert.equal(api.seen().state.newEvidenceToIncorporate, "One bounded session batch");
		assert.deepEqual(Object.keys(api.seen().questions), ["needs_expand", "needs_contract", "needs_redirect", "needs_reorganize", "map_action"]);
		assert.equal(api.seen().model, "kev-latest");
		assert(!JSON.stringify(api.seen()).includes("fragment"));
	} finally { await api.close(); }
});

test("System One rejects unsafe endpoints and malformed answers without network fallback", async () => {
	const unsafe = new SystemOneAdvisor({ url: "https://example.com/v1/systemone" });
	await assert.rejects(() => unsafe.review({ current: emptyGraph(), proposed: emptyGraph(), newEvidence: "", pendingMore: false }), /loopback or private IPv4/);
	const api = await server(() => ({ body: { ...response, answers: { ...response.answers, needs_expand: { type: "noul", noul: 2 } } } }));
	try {
		const malformed = new SystemOneAdvisor({ url: api.url });
		await assert.rejects(() => malformed.review({ current: emptyGraph(), proposed: emptyGraph(), newEvidence: "", pendingMore: false }), /invalid review answers/);
	} finally { await api.close(); }
});
