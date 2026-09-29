import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { MOVEMENTS } from "./classifier.ts";

const sha = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const file = process.argv[2] ?? "pi-tether/experiments/trajectory-acceptance/raw-predictions.json";
const artifact = JSON.parse(await readFile(file, "utf8"));
assert.equal(artifact.schemaVersion, 1);
assert.equal(artifact.blind, true);
assert.equal(artifact.model, "openai-codex/gpt-5.6-luna");
assert.equal(artifact.fallback, "none");
assert.deepEqual(artifact.background, { proposalCalls: 1, maxRepairCalls: 1, retrieval: false });
assert.equal(artifact.status, "complete");
assert.deepEqual(artifact.attempts, { "pi-packages": 2, buzz: 1, ssmp: 1 });
assert.equal(artifact.recoveredAttempt1.attempt.outcome, "aborted");
assert.equal(artifact.recoveredAttempt1.knownCallEvidence.totalAttemptCalls, null);
assert.equal(artifact.recoveredAttempt1.rejection.errors.length, 2);
assert.equal(artifact.cases.length, 15);
assert.equal(artifact.rawCalls.length, artifact.rawCallCount);
assert.ok(artifact.rawCallCount <= 40);
assert.equal(new Set(artifact.cases.map((item: any) => item.id)).size, 15);
for (const item of artifact.cases) {
	assert.ok(MOVEMENTS.includes(item.prediction));
	assert.ok(item.calls >= 1 && item.calls <= 2);
	assert.equal(item.repairs, item.calls - 1);
	assert.equal(item.failure, null);
	for (const key of ["unsupportedCurrentPurpose", "revivedRejectedOrSupersededAlternative", "lostUnresolvedReturn"]) assert.equal(typeof item.criticalObservations[key], "boolean");
}
for (const call of artifact.rawCalls) {
	assert.equal(call.attempt, artifact.attempts[call.corpus]);
	assert.equal(call.model, artifact.model);
	assert.equal(call.settings.reasoningEffort, "low");
	assert.equal(call.settings.toolChoice, "required");
	assert.equal(call.settings.parallelToolCallsForcedFalse, true);
	assert.ok(call.usage && Number.isFinite(call.usage.input) && Number.isFinite(call.usage.output));
}
for (const [path, expected] of Object.entries(artifact.inputs) as [string, string][]) {
	const actualPath = path === "packet" ? "/private/tmp/todo-008-trajectory/validator-packet.json"
		: path.startsWith("pi-tether/") ? path : `/private/tmp/todo-008-trajectory/${path}`;
	assert.equal(sha(await readFile(actualPath)), expected, `${path} hash`);
}
const copy = structuredClone(artifact); delete copy.contentSha256;
assert.equal(sha(JSON.stringify(copy)), artifact.contentSha256);
console.log(`validated ${artifact.cases.length} blind predictions, ${artifact.rawCallCount} raw calls, content ${artifact.contentSha256}`);
