// V2 offline join (todo 008). Runs only after every petition packet, scorer result, adjudication,
// and re-read is immutable and hashed (see locked.json). Reveals the already-registered gold labels
// and computes the unchanged numeric gate. Commits no rationales: results stay private.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const LOCATION = "pi-tether/experiments/trajectory-acceptance";
const OUT = resolve("pi-tether/experiments/trajectory-acceptance/semantic-score.json");
const GOLD = resolve("pi-tether/experiments/trajectory-acceptance/labels/final-gold.json");
const PACKET = resolve("pi-tether/experiments/trajectory-acceptance/aligned-replay-manifest.json");
const RESOLUTIONS = "/private/tmp/todo-008-trajectory/private-v2/resolutions.json";

const goldJson = JSON.parse(readFileSync(GOLD, "utf8")) as {
	phase?: string;
	cases?: { caseId: string; corpus?: string; coverage?: string; finalLabel: string }[];
	classCounts?: Record<string, number>;
	criticalGates?: { scoreThresholds?: { overall?: string; perTranscript?: string } };
};
const packet = JSON.parse(readFileSync(PACKET, "utf8")) as {
	packet?: { sha256: string };
	cases: { caseId: string; scorerCaseId: string; horizon: { event: number; ref: string }; source: string; beforeLineage: string }[];
};
const resolutions = JSON.parse(readFileSync(RESOLUTIONS, "utf8")) as {
	scorerCaseId: string; invalid: string[]; fields: Record<string, { value: string | null; agreement?: string }>;
}[];
const movementLabels = new Set(["accept", "expand", "contract", "redirect", "reorganize"]);
const gates = ["unsupported_current_purpose", "revived_rejected_alternative", "lost_unresolved_return"] as const;
const gateVerdicts = new Set(["clear", "violation", "unknown"]);

function safeResolution(caseId: string) {
	const found = resolutions.find(entry => entry.scorerCaseId === caseId);
	if (found) return found;
	return { invalid: ["missing"], fields: {} as Record<string, { value: string | null; agreement?: string }> };
}

const rows = packet.cases.map(item => {
	const scorerCaseId = item.scorerCaseId;
	const resolution = safeResolution(scorerCaseId);
	const movement = resolution.fields?.movement?.value ?? null;
	const gateVerdicts: Record<string, string | null> = {};
	for (const gate of gates) gateVerdicts[gate] = resolution.fields?.[gate]?.value ?? null;
	const gold = (goldJson.cases ?? []).find(entry => entry.caseId === item.caseId);
	const invalid = resolution.invalid ?? [];
	const hasUnknown = Object.values(gateVerdicts).some(v => v === "unknown" || v === null);
	const hasViolation = Object.values(gateVerdicts).some(v => v === "violation");
	const movementUnclassifiable = movement !== null && !movementLabels.has(movement);
	// A case earns one point only when the final movement equals gold AND the run stays clean:
	// no invalid/missing (acceptance gap), no unknown gates, and no violation.
	const pointEligible = movement !== null && !invalid.length && !hasUnknown && !movementUnclassifiable;
	const point = pointEligible && gold && movement === gold.finalLabel ? 1 : 0;
	return {
		caseId: item.caseId, scorerCaseId, corpus: gold?.corpus ?? null, source: item.source,
		goldLabel: gold?.finalLabel ?? null, finalMovement: movement, agreement: resolution.fields?.movement?.agreement ?? "unresolved",
		gates: gateVerdicts, point,
		acceptanceGap: !pointEligible, invalid, hasUnknown, hasViolation,
		movementUnclassifiable: Boolean(movementUnclassifiable),
	};
});

const overall = rows.reduce((sum, row) => sum + row.point, 0);
const perTranscript = ["pi-packages", "buzz", "ssmp"].map(corpus => {
	const corpusRows = rows.filter(row => row.corpus === corpus);
	return { corpus, points: corpusRows.reduce((n, r) => n + r.point, 0), cases: corpusRows.length };
});
const violations = rows.filter(row => row.hasViolation);
const gaps = rows.filter(row => row.acceptanceGap);
const thresholds = { overall: 12, perTranscript: 4 };
const pass = overall >= thresholds.overall
	&& perTranscript.every(entry => entry.points >= thresholds.perTranscript)
	&& violations.length === 0
	&& gaps.length === 0;

const report = {
	schemaVersion: 2,
	status: pass ? "pass" : "fail",
	computedAt: new Date().toISOString(),
	scoring: {
		protocol: "V2_PROTOCOL.md (preregistered)",
		packetSha256: packet.packet?.sha256 ?? null,
		resolutionsSha256: createHash("sha256").update(readFileSync(RESOLUTIONS)).digest("hex"),
		scorerA: "openai-codex/gpt-5.6-terra", scorerB: "opencode-go/kimi-k3", adjudicator: "opencode-go/glm-5.3",
		note: "Scorer and adjudicator identities are recorded here for disclosure; the sealed pre-dispatch record lives at /private/tmp/todo-008-trajectory/private-v2/sealed-identities.json.",
	},
	thresholds,
	points: { overall, of: rows.length, perTranscript },
	gateViolations: violations.map(row => row.caseId),
	acceptanceGaps: gaps.map(row => ({ caseId: row.caseId, reason: row.invalid.length ? row.invalid.join("+") : row.hasUnknown ? "unknown verdict" : "unresolved movement" })),
	cases: rows,
	artifacts: { gold: "labels/final-gold.json", manifest: "aligned-replay-manifest.json", packet: "/private/tmp/todo-008-trajectory/semantic-scorer-packet.json" },
};
writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({
	status: report.status, overall: `${overall}/${rows.length}`, perTranscript,
	gateViolations: report.gateViolations, acceptanceGaps: report.acceptanceGaps,
	reuse: `v1-reused=${packet.cases.filter(c => c.source === "reused-v1").length}, v2-replayed=${packet.cases.filter(c => c.source === "aligned-v2").length}`,
}, null, 2));
