import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { directlyGrounded, MOM_PROMPT } from "../src/contract.ts";
import { checkGraph } from "../src/graph.ts";
import { presentGraph, readText } from "../src/presentation.ts";

const path = new URL("./evidence/todo-007-real-luna-purpose-map.json", import.meta.url);
const raw = await readFile(path, "utf8"), artifact = JSON.parse(raw);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
assert.equal(artifact.schema, "todo-007-real-session-cold-catchup-v2");
assert.deepEqual(artifact.model, { provider: "openai-codex", id: "gpt-5.6-luna", reasoning: "low" });
assert.equal(artifact.production.implementation, "Mom");
assert.equal(artifact.production.backgroundCallCeiling, 2);
assert.match(artifact.isolation, /copied before launch/);
assert.equal(artifact.hashes.sourceBeforeSha256, artifact.hashes.sourceAfterSha256);
assert.equal(artifact.hashes.sourceBeforeSha256, artifact.hashes.tempSessionInitialSha256);
assert.notEqual(artifact.hashes.tempSessionAfterSha256, artifact.hashes.sourceAfterSha256);
assert.equal(artifact.hashes.promptSha256, hash(MOM_PROMPT));
assert(artifact.batches.length >= 3, "capture must contain a multi-chapter cold catch-up");
assert(artifact.batches.every((batch: any) => batch.calls >= 1 && batch.calls <= artifact.production.backgroundCallCeiling));
assert(artifact.batches.every((batch: any) => batch.motherThread === artifact.finalGraph.motherThread));
assert.deepEqual(artifact.finalCursor, artifact.batches.at(-1).cursor);
assert.equal(artifact.checks.sourceUnchanged, true);
assert.equal(artifact.checks.tempOnlySidecar, true);
assert.equal(artifact.checks.stableMotherRoot, true);
assert.equal(artifact.checks.currentWork, true);
assert.equal(artifact.checks.sourceBackedEnglishWhy, true);
assert.equal(artifact.checks.interruptedParkedBranch, false);
assert.equal(artifact.checks.consideredAlternative, false);
assert.match(artifact.limitations.join("\n"), /no parked endeavor and no alternative_to/);
checkGraph(artifact.finalGraph);
assert.equal(artifact.finalGraph.motherThread, artifact.finalGraph.purpose);
assert.equal(artifact.finalGraph.nodes.filter((node: any) => node.parent === null).length, 1);
assert.equal(artifact.finalGraphSha256, hash(JSON.stringify(artifact.finalGraph)));
const evidence = new Map(artifact.whyEvidence.map((item: any) => [item.node, item]));
for (const node of artifact.finalGraph.nodes) {
	if (!(["feature", "theory", "postulate", "try", "rule"].includes(node.kind) && ["active", "parked", "proposed"].includes(node.state))) continue;
	const item: any = evidence.get(node.id);
	assert(item && node.sources.includes(item.source), `missing cited Why evidence for ${node.id}`);
	assert.equal(item.intent, node.intent);
	assert(directlyGrounded(node.intent, item.text), `nonliteral Why evidence for ${node.id}`);
}
for (const digest of Object.values(artifact.citedSourceLineSha256)) assert.match(String(digest), /^[a-f0-9]{64}$/);
for (const item of [...artifact.finalGraph.nodes, ...artifact.finalGraph.edges]) for (const source of item.sources) {
	const entryId = source.split(":")[1];
	assert.match(artifact.citedSourceLineSha256[entryId], /^[a-f0-9]{64}$/, `missing source-line hash for ${source}`);
}
for (const batch of artifact.batches) for (const worker of batch.cursor.workers) assert.match(worker.hash, /^[a-f0-9]{64}$/);
const story = readText(presentGraph({ ...artifact.finalGraph, roots: [artifact.finalGraph.motherThread], focusPath: [], boundaryNodes: [], totalNodes: artifact.finalGraph.nodes.length, omittedNodes: 0 }));
assert.equal(artifact.story, story);
assert.match(story, /^Mother thread:/);
assert.match(story, /Why: Dig into Claude Code session/);
assert.match(story, /Why: Never silently delete or overwrite user work/);
assert.match(story, /\[src:01a0e020-/);
assert.doesNotMatch(raw, /(?:sk-[A-Za-z0-9]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|Authorization\s*[:=]|Bearer\s+[A-Za-z0-9._-]{16,}|\/Users\/)/i);
console.log(JSON.stringify({ valid: true, batches: artifact.batches.length, calls: artifact.batches.map((batch: any) => batch.calls), nodes: artifact.finalGraph.nodes.length, graphSha256: artifact.finalGraphSha256 }));
