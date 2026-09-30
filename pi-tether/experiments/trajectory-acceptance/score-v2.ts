// V2 blind semantic scoring (todo 008). Phase 1 of 2: seal identities, score every case in a
// fresh context with two independent models, adjudicate field disagreements with a third model
// sealed before first-round results are opened, then lock and hash every output.
// This script NEVER reads gold labels, validator rationales, or v1 prediction fields.
// Raw requests/responses stay private under /private/tmp/todo-008-trajectory/private-v2/.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";

const ROOT = "/private/tmp/todo-008-trajectory";
const PRIVATE = `${ROOT}/private-v2`;
const RESULTS = `${PRIVATE}/results`;
const PACKET = `${ROOT}/semantic-scorer-packet.json`;
const RESULT_SCHEMA = resolve("pi-tether/experiments/trajectory-acceptance/semantic-scorer-result.schema.json");
const SEALED = `${PRIVATE}/sealed-identities.json`;
const RESOLUTIONS = `${PRIVATE}/resolutions.json`;
const LOCKED = `${PRIVATE}/locked.json`;

// Distinct families, subscription providers per the user's direction, none Luna/OpenRouter/gold.
const SCORERS = {
	scorerA: { provider: "openai-codex", model: "gpt-5.6-terra", family: "openai-gpt" },
	scorerB: { provider: "opencode-go", model: "kimi-k3", family: "moonshot-kimi" },
	adjudicator: { provider: "opencode-go", model: "glm-5.3", family: "zhipu-glm" },
} as const;

const MOVEMENTS = ["accept", "expand", "contract", "redirect", "reorganize"] as const;
const GATES = ["unsupported_current_purpose", "revived_rejected_alternative", "lost_unresolved_return"] as const;
const VERDICTS = ["clear", "violation", "unknown"] as const;
const REF = /^[A-Za-z0-9_-]+:[A-Fa-f0-9]{8}$/;
const NODE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const EDGE = /^[A-Za-z][A-Za-z0-9_-]{0,63}\|(returns_to|informs|governs|depends_on|alternative_to)\|[A-Za-z][A-Za-z0-9_-]{0,63}$/;

const sha = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function atomicJson(path: string, value: unknown) {
	await mkdir(dirname(path), { recursive: true, mode: 0o700 }); await chmod(dirname(path), 0o700);
	const temp = `${path}.${process.pid}.tmp`;
	await writeFile(temp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 }); await chmod(temp, 0o600);
	await rename(temp, path); await chmod(path, 0o600);
}

type Field = { movement: string } | { gate: string; verdict: string };
interface CaseResult {
	scorerCaseId: string; slot: string; provider: string; model: string;
	valid: boolean; invalidReason?: string; result?: any; usage?: any; at: string; rawText?: string; stopReason?: string;
}

function validate(value: any, packetSha256: string, caseId: string): string[] {
	const errors: string[] = [];
	if (!value || typeof value !== "object") return ["not a JSON object"];
	if (value.schemaVersion !== 2) errors.push("schemaVersion must be 2");
	if (value.scorerCaseId !== caseId) errors.push(`scorerCaseId must be ${caseId}`);
	if (value.packetSha256 !== packetSha256) errors.push("packetSha256 must equal the dispatched packet hash");
	if (typeof value.provider !== "string" || !value.provider || /openrouter/i.test(value.provider)) errors.push("provider must name the dispatched provider, never OpenRouter");
	if (typeof value.model !== "string" || !value.model || /luna/i.test(value.model)) errors.push("model must name the dispatched model, never Luna");
	const att = value.attestation;
	if (!att || att.freshContext !== true || att.sawOnlyPacket !== true || att.sawNoGoldOrOtherVotes !== true || att.conciseRationalesNotReasoningTrace !== true) errors.push("attestation must set all four fields true");
	const finding = (f: any, name: string, withLabel: boolean) => {
		if (!f || typeof f !== "object") { errors.push(`${name} must be an object`); return; }
		if (withLabel && !(MOVEMENTS as readonly string[]).includes(f.label)) errors.push(`${name}.label must be one of ${MOVEMENTS.join(", ")}`);
		if (!Array.isArray(f.refs) || !f.refs.length || !f.refs.every((r: any) => typeof r === "string" && REF.test(r))) errors.push(`${name}.refs must be non-empty packet evidence refs`);
		if (!Array.isArray(f.nodeIds) || !f.nodeIds.every((n: any) => typeof n === "string" && NODE.test(n))) errors.push(`${name}.nodeIds must be map node ids`);
		if (!Array.isArray(f.edgeIds) || !f.edgeIds.every((e: any) => typeof e === "string" && EDGE.test(e))) errors.push(`${name}.edgeIds must be canonical edge ids`);
		if (typeof f.rationale !== "string" || !f.rationale.length || f.rationale.length > 800) errors.push(`${name}.rationale must be 1..800 characters`);
	};
	finding(value.movement, "movement", true);
	if (!value.criticalGates || typeof value.criticalGates !== "object") errors.push("criticalGates must be an object");
	else {
		for (const gate of GATES) {
			const g = value.criticalGates[gate];
			if (g && !(VERDICTS as readonly string[]).includes(g.verdict)) errors.push(`criticalGates.${gate}.verdict must be clear|violation|unknown`);
			finding(g, `criticalGates.${gate}`, false);
		}
		for (const key of Object.keys(value.criticalGates)) if (!(GATES as readonly string[]).includes(key)) errors.push(`criticalGates has unexpected key ${key}`);
	}
	for (const key of Object.keys(value)) if (!["schemaVersion", "scorerCaseId", "packetSha256", "provider", "model", "attestation", "movement", "criticalGates"].includes(key)) errors.push(`unexpected key ${key}`);
	return errors;
}

function extractJson(text: string): any {
	try { return JSON.parse(text); } catch {}
	const start = text.indexOf("{"), end = text.lastIndexOf("}");
	if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
	throw new Error("no JSON object in model output");
}

const SYSTEM_PROMPT = `You are a blind semantic scorer for a session work-map study. You receive exactly one case: recorded evidence through its aligned horizon, a before work map, and an after work map. Use only this packet. Assign exactly one movement label and evaluate exactly three critical gates.

Movement vocabulary:
- accept: explicit assent adopts a previously proposed direction without otherwise changing its scope.
- expand: add compatible durable scope while preserving the governing purpose and existing scope.
- contract: narrow or remove scope, permission, or an alternative while preserving the governing purpose.
- redirect: replace or park the current course in favor of materially different work; the original session purpose remains grounded.
- reorganize: preserve purpose and scope but change structure, sequencing, focus, or the route/point of return.

Status quo rule: status quo preserves all unaffected purpose, scope, obligations, alternatives, and unresolved return points.

Critical gates (verdict clear, violation, or unknown; unknown is never clear):
- unsupported_current_purpose: preserve a current purpose only when supported by evidence available through the aligned horizon.
- revived_rejected_alternative: do not revive an explicitly rejected or superseded alternative.
- lost_unresolved_return: preserve every unresolved return point unless the evidence resolves or replaces it.

Every movement and gate finding must cite evidence refs (form stream:8hex, exactly as given in the packet), relevant before/after map node ids, and canonical edge ids from|relation|to when an edge identifies the finding; empty id arrays are allowed only when the rationale explains why no graph element identifies the finding. Keep each rationale to 1..800 characters; concise rationales, not reasoning traces.

Return exactly one JSON object and nothing else, matching this shape exactly:
{
  "schemaVersion": 2,
  "scorerCaseId": "<the case id given>",
  "packetSha256": "<the packet hash given>",
  "provider": "<your provider id, copied from the dispatch line>",
  "model": "<your model id, copied from the dispatch line>",
  "attestation": { "freshContext": true, "sawOnlyPacket": true, "sawNoGoldOrOtherVotes": true, "conciseRationalesNotReasoningTrace": true },
  "movement": { "label": "<accept|expand|contract|redirect|reorganize>", "refs": ["..."], "nodeIds": ["..."], "edgeIds": ["..."], "rationale": "..." },
  "criticalGates": {
    "unsupported_current_purpose": { "verdict": "<clear|violation|unknown>", "refs": ["..."], "nodeIds": ["..."], "edgeIds": ["..."], "rationale": "..." },
    "revived_rejected_alternative": { "verdict": "<clear|violation|unknown>", "refs": ["..."], "nodeIds": ["..."], "edgeIds": ["..."], "rationale": "..." },
    "lost_unresolved_return": { "verdict": "<clear|violation|unknown>", "refs": ["..."], "nodeIds": ["..."], "edgeIds": ["..."], "rationale": "..." }
  }
}`;

async function scoreCase(registry: ModelRegistry, runtime: ModelRuntime, slot: keyof typeof SCORERS, spec: { provider: string; model: string },
	packetSha256: string, caseEntry: any, mode: "first" | "re-read"): Promise<CaseResult> {
	const model = (registry as any).find(spec.provider, spec.model);
	if (!model) throw new Error(`Model unavailable: ${spec.provider}/${spec.model}`);
	const caseId = caseEntry.scorerCaseId;
	const path = `${RESULTS}/${slot}/${caseId}${mode === "re-read" ? ".reread" : ""}.json`;
	if (existsSync(path)) return JSON.parse(await readFile(path, "utf8")) as CaseResult;
	const userText = `Dispatch: provider=${spec.provider} model=${spec.model}\nPacket sha256: ${packetSha256}\nScorer case id: ${caseId}\n\nCase packet:\n${JSON.stringify(caseEntry)}`;
	const call = async (retry?: string) => {
		const context = { systemPrompt: SYSTEM_PROMPT, messages: [{ role: "user" as const, timestamp: Date.now(), content: retry ? `${userText}\n\nYour previous output failed validation:\n${retry}\nReturn the corrected JSON object only.` : userText }] };
		// opencode-go routes spend their whole budget on reasoning tokens and can return truncated
		// text; disabling reasoning for that provider's calls keeps output visible and fast (measured
		// ~3 s vs multi-minute). First-round OpenCode scorings done before this change remain cached.
		const response = await runtime.complete(model as any, context, { maxTokens: 12000, maxRetryDelayMs: 1000, sessionId: `todo-008-${slot}-${caseId}`, ...(spec.provider === "opencode-go" ? { reasoning: "none" } : {}) } as any);
		const text = (response.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
		return { response, text };
	};
	let last: { response: any; text: string } | undefined;
	let result: any, errors: string[] = [];
	for (let attempt = 0; attempt < 3; attempt++) {
		last = await call(attempt ? errors.join("; ") : undefined);
		try {
			result = extractJson(last.text);
			errors = validate(result, packetSha256, caseId);
			if (!errors.length) break;
		} catch (error) {
			errors = [`not valid JSON: ${String(error)}`];
			if (last.response?.stopReason === "length") errors.push("output was truncated: keep rationales terse and return only the JSON object");
		}
	}
	const record: CaseResult = { scorerCaseId: caseId, slot, provider: spec.provider, model: spec.model,
		valid: !errors.length, ...(errors.length ? { invalidReason: errors.join("; ") } : { result }),
		usage: last ? (last.response.usage ?? null) : null, at: new Date().toISOString(),
		stopReason: last?.response?.stopReason, rawText: last?.text ?? "" };
	await atomicJson(path, record);
	return record;
}

function fieldsOf(result: any): Record<string, string> {
	const out: Record<string, string> = { movement: result.movement.label };
	for (const gate of GATES) out[gate] = result.criticalGates[gate].verdict;
	return out;
}

const run = async () => {
	// 1. Seal identities before any dispatch.
	const packet = JSON.parse(await readFile(PACKET, "utf8"));
	const packetSha256 = sha(await readFile(PACKET));
	const sealed = { sealedAt: new Date().toISOString(), packetSha256, resultSchemaSha256: sha(await readFile(RESULT_SCHEMA)),
		scorers: SCORERS, rule: "identities sealed before first dispatch; adjudicator sealed before any first-round result was opened" };
	if (existsSync(SEALED)) {
		const prior = JSON.parse(await readFile(SEALED, "utf8"));
		if (prior.packetSha256 !== packetSha256) throw new Error("Packet changed since identities were sealed.");
	} else await atomicJson(SEALED, sealed);

	// 2. First round: both scorers, every case, fresh context each.
	const runtime = await ModelRuntime.create({ allowModelNetwork: false });
	const registry = new ModelRegistry(runtime);
	const rounds: CaseResult[] = [];
	for (const caseEntry of packet.cases as any[]) {
		for (const slot of ["scorerA", "scorerB"] as const) {
			const record = await scoreCase(registry, runtime, slot, SCORERS[slot], packetSha256, caseEntry, "first");
			rounds.push(record);
			console.log(`[first] ${slot} ${caseEntry.scorerCaseId} valid=${record.valid}${record.valid ? ` movement=${record.result.movement.label}` : ` (${record.invalidReason})`}`);
			await atomicJson(`${PRIVATE}/scoring-progress.json`, { stage: "first-round", rounds: rounds.length, lastAt: new Date().toISOString() });
		}
	}

	// 3. Field-level agreement; adjudicator (already sealed) sees only the original packet.
	const resolutions: any[] = [];
	for (const caseEntry of packet.cases as any[]) {
		const caseId = caseEntry.scorerCaseId;
		const a = rounds.find(r => r.scorerCaseId === caseId && r.slot === "scorerA")!;
		const b = rounds.find(r => r.scorerCaseId === caseId && r.slot === "scorerB")!;
		const entry: any = { scorerCaseId: caseId, fields: {}, sources: {}, invalid: [] };
		if (!a.valid) entry.invalid.push("scorerA");
		if (!b.valid) entry.invalid.push("scorerB");
		const fa = a.valid ? fieldsOf(a.result) : {}, fb = b.valid ? fieldsOf(b.result) : {};
		const unresolved = new Set<string>();
		for (const field of ["movement", ...GATES]) {
			if (!a.valid || !b.valid) { unresolved.add(field); continue; }
			if (fa[field] === fb[field]) {
				entry.fields[field] = { value: fa[field], agreement: "scorers-match" };
			} else unresolved.add(field);
		}
		if (unresolved.size) {
			const c = await scoreCase(registry, runtime, "adjudicator", SCORERS.adjudicator, packetSha256, caseEntry, "first");
			console.log(`[adjudicate] ${caseId} fields=${[...unresolved].join(",")} valid=${c.valid}`);
			const fc = c.valid ? fieldsOf(c.result) : {};
			if (!c.valid) entry.invalid.push("adjudicator");
			for (const field of unresolved) {
				if (c.valid && a.valid && fc[field] === fa[field]) entry.fields[field] = { value: fa[field], agreement: "A+C", sources: ["scorerA", "adjudicator"] };
				else if (c.valid && b.valid && fc[field] === fb[field]) entry.fields[field] = { value: fb[field], agreement: "B+C", sources: ["scorerB", "adjudicator"] };
				else if (c.valid && a.valid && b.valid && fa[field] !== fb[field] && fa[field] !== fc[field] && fb[field] !== fc[field]) {
					// All three differ: a unanimous re-read of the original packet is the only finalizer.
					const reread = await Promise.all((["scorerA", "scorerB", "adjudicator"] as const).map(slot =>
						scoreCase(registry, runtime, slot, SCORERS[slot], packetSha256, caseEntry, "re-read")));
					const values = reread.map(r => r.valid ? fieldsOf(r.result)[field] : undefined);
					if (values[0] && values.every(v => v === values[0])) entry.fields[field] = { value: values[0], agreement: "unanimous-re-read" };
					else entry.fields[field] = { value: null, agreement: "unresolved", sources: reread.map(r => r.slot) };
					console.log(`[re-read] ${caseId} ${field} → ${entry.fields[field].agreement}`);
				} else if (c.valid) entry.fields[field] = { value: fc[field], agreement: "adjudicator-only", sources: ["adjudicator"] };
				else entry.fields[field] = { value: null, agreement: "unresolved", sources: ["adjudicator"] };
			}
		}
		resolutions.push(entry);
		await atomicJson(`${PRIVATE}/scoring-progress.json`, { stage: "resolution", lastCase: caseId, resolved: resolutions.length });
	}

	// 4. Lock and hash every output before any join with gold.
	const locked = { sealedAt: JSON.parse(await readFile(SEALED, "utf8")).sealedAt, lockedAt: new Date().toISOString(),
		packetSha256, files: {} as Record<string, string> };
	for (const slot of ["scorerA", "scorerB", "adjudicator"]) {
		const dir = `${RESULTS}/${slot}`;
		if (!existsSync(dir)) continue;
		const { readdir } = await import("node:fs/promises");
		for (const name of (await readdir(dir)).sort()) locked.files[`${slot}/${name}`] = sha(await readFile(`${dir}/${name}`));
	}
	locked.files["resolutions.json"] = sha(JSON.stringify(resolutions));
	await atomicJson(RESOLUTIONS, resolutions);
	await atomicJson(LOCKED, locked);
	console.log(JSON.stringify({ packetSha256, cases: packet.cases.length, files: Object.keys(locked.files).length }, null, 2));
};

await run();
