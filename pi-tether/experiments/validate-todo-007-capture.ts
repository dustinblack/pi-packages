import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { directlyGrounded } from "../src/contract.ts";
import { extractEvents } from "../src/feed.ts";
import { checkGraph } from "../src/graph.ts";

const artifactPath = new URL("./evidence/todo-007-real-luna-purpose-map.json", import.meta.url);
const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
const frozenPath = process.env.TODO007_FROZEN_SNAPSHOT;
const sidecarPath = process.env.TODO007_SIDECAR;
const livePath = process.env.TODO007_LIVE_SOURCE;
assert(frozenPath && sidecarPath && livePath, "set TODO007_FROZEN_SNAPSHOT, TODO007_SIDECAR, and TODO007_LIVE_SOURCE to isolated/read-only evidence paths");
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

assert.equal(artifact.schema, "todo-007-real-session-capture-blocked-v3");
assert.equal(artifact.status, "blocked");
assert.deepEqual(artifact.model, { provider: "openai-codex", id: "gpt-5.6-luna", reasoning: "low", fallbackUsed: false });
assert.equal(artifact.production.implementation, "Mom");
assert.equal(artifact.production.backgroundCallCeiling, 2);
assert.equal(artifact.production.backgroundSearchOrReadAllowed, false);

const frozen = await readFile(frozenPath);
const lines = frozen.toString("utf8").split("\n").filter(Boolean);
assert.equal(frozen.byteLength, artifact.snapshot.bytes);
assert.equal(lines.length, artifact.snapshot.lines);
assert.equal(hash(frozen), artifact.snapshot.sha256);
const finalEntry = JSON.parse(lines.at(-1)!);
assert.equal(finalEntry.id, artifact.snapshot.finalEntryId);
assert.equal(artifact.snapshot.finalEligibleRef, `01a0e020-12a4-7474-819f-ad784bb5febd:${finalEntry.id}`);

const live = await readFile(livePath);
assert(live.byteLength >= frozen.byteLength, "live source became shorter than the snapshot");
assert(frozen.equals(live.subarray(0, frozen.byteLength)), "frozen snapshot is no longer an exact byte prefix of live source");
assert.equal(artifact.sourceAfterRun.snapshotIsExactBytePrefix, true);
assert.equal(artifact.sourceAfterRun.wholeLiveFileEqualityClaimed, false);

const sourceEvents = new Map<string, any>();
const sourceLineHashes = new Map<string, string>();
for (const line of lines) {
 const entry = JSON.parse(line);
 if (typeof entry.id !== "string") continue;
 sourceLineHashes.set(entry.id, hash(Buffer.from(line + "\n")));
 for (const event of extractEvents({ key: "01a0e020-12a4-7474-819f-ad784bb5febd", actor: "lead" }, entry)) sourceEvents.set(event.ref, event);
}
assert(sourceEvents.has(artifact.snapshot.finalEligibleRef), "snapshot final ref is not an eligible feed event");
checkGraph(artifact.finalGraph);
assert.equal(artifact.finalGraphSha256, hash(JSON.stringify(artifact.finalGraph)));
assert.equal(artifact.coldReopenGraphSha256, artifact.finalGraphSha256);
assert.equal(artifact.finalGraph.motherThread, artifact.stableMotherThread.value);
assert.equal(artifact.stableMotherThread.allAcceptedSnapshotsStable, true);
for (const item of artifact.whyEvidence) {
 const event = sourceEvents.get(item.purposeSource);
 assert(event?.text, `missing copied original event ${item.purposeSource}`);
 assert.equal(item.sourceEntrySha256, sourceLineHashes.get(item.purposeSource.split(":")[1]));
 assert.equal(item.exactGroundedExcerpt, item.intent);
 assert(directlyGrounded(item.intent, event.text), `nonliteral public Why for ${item.node}`);
 assert.equal(item.tokenBoundaryGroundedInFrozenEntry, true);
 const node = artifact.finalGraph.nodes.find((candidate: any) => candidate.id === item.node);
 assert(node && node.intent === item.intent && node.purposeSource === item.purposeSource);
}

const records = (await readFile(sidecarPath, "utf8")).trim().split("\n").map(line => JSON.parse(line));
assert.deepEqual([...new Set(records.map(record => record.type))].sort(), ["map", "usage"]);
const snapshots = records.filter(record => record.type === "map" && record.data.snapshot);
const reopened = snapshots.at(-1).data.snapshot;
assert.deepEqual(reopened.graph, artifact.finalGraph);
assert.equal(hash(JSON.stringify(reopened.graph)), artifact.coldReopenGraphSha256);
assert.equal(reopened.cut.parent, artifact.coverage.durableCursorParent);
assert.equal(snapshots.length, artifact.totals.acceptedSnapshots);
const usage = records.filter(record => record.type === "usage");
assert.equal(usage.at(-1).data.usage.calls, artifact.totals.modelCalls);
assert.equal(artifact.batches.length, artifact.totals.backgroundBatches);
assert(artifact.batches.every((batch: any) => batch.calls >= 1 && batch.calls <= 2));
assert.equal(artifact.batches.reduce((sum: number, batch: any) => sum + batch.calls, 0), artifact.totals.modelCalls);

assert.equal(artifact.coverage.complete, false);
assert.equal(artifact.coverage.cursorCoversFinalEligibleEvent, false);
assert.equal(artifact.coverage.remainingSnapshotEvidence, true);
assert.notEqual(artifact.coverage.durableCursorParent, artifact.snapshot.finalEntryId);
assert.match(artifact.coverage.blocker, /90,000-character context limit/);
assert(artifact.gaps.some((gap: any) => gap.action === "open"));
assert(artifact.failures.some((failure: any) => /Public Why/.test(failure.error)));
assert.deepEqual(artifact.hierarchy.topLevel, [artifact.finalGraph.motherThread]);
assert.equal(artifact.hierarchy.current, artifact.finalGraph.focus);
assert(artifact.hierarchy.parked.length > 0);
assert.equal(artifact.hierarchy.alternativeCategoryAbsent, true);
assert.deepEqual(artifact.hierarchy.alternatives, []);
assert.equal(artifact.isolation.frozenSnapshotUnchanged, true);
assert.equal(artifact.isolation.freshSidecar, true);
assert.match(artifact.isolation.sourceSidecarFormat, /incompatible legacy/);
assert.equal(artifact.isolation.sourceAdjacentCaptureFilesWritten, false);
assert.deepEqual(artifact.isolation.tempSidecarRecordTypes, ["map", "usage"]);
assert.equal(artifact.sanitization.rawSessionCommitted, false);
assert.equal(artifact.sanitization.privateToolOutputCommitted, false);
const artifactRaw = await readFile(artifactPath, "utf8");
assert.doesNotMatch(artifactRaw, /(?:sk-[A-Za-z0-9]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|Authorization\s*[:=]|Bearer\s+[A-Za-z0-9._-]{16,}|\/Users\/)/i);
console.log(JSON.stringify({ valid: true, status: artifact.status, snapshotLines: lines.length, finalRef: artifact.snapshot.finalEligibleRef,
 batches: artifact.totals.backgroundBatches, calls: artifact.totals.modelCalls, cursor: artifact.coverage.durableCursorParent,
 remainingEvidence: artifact.coverage.remainingSnapshotEvidence, graphSha256: artifact.finalGraphSha256 }));
