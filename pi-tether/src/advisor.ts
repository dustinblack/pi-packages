import type { WorkGraph } from "./graph.ts";

export const ADVISOR_ACTIONS = ["accept", "expand", "contract", "redirect", "reorganize"] as const;
export const ADVISOR_DIMENSIONS = ["expand", "contract", "redirect", "reorganize"] as const;
export type AdvisorAction = typeof ADVISOR_ACTIONS[number];
export type AdvisorDimension = typeof ADVISOR_DIMENSIONS[number];
export interface AdvisorUsage { input: number; output: number }
export interface AdvisorReview {
	status: "reviewed";
	model: string;
	needsReanalysis: number;
	signals: Record<AdvisorDimension, number>;
	action: AdvisorAction;
	probabilities: Record<AdvisorAction, number>;
	confidence: number;
	usage: AdvisorUsage;
	latencyMs: number;
	reexamined: boolean;
}
export interface AdvisorUnavailable {
	status: "unavailable";
	model: string;
	error: string;
	latencyMs: number;
	reexamined: false;
}
export type AdvisorRecord = AdvisorReview | AdvisorUnavailable;
export interface SessionReviewInput {
	current: WorkGraph;
	proposed: WorkGraph;
	newEvidence: string;
	pendingMore: boolean;
}
export interface SessionAdvisor {
	readonly model: string;
	readonly threshold: number;
	review(input: SessionReviewInput, signal?: AbortSignal): Promise<Omit<AdvisorReview, "reexamined">>;
}

const MAX_RESPONSE_BYTES = 16 * 1024;
const MAX_REQUEST_BYTES = 96 * 1024;
const DEFAULT_TIMEOUT_MS = 1500;
const DEFAULT_THRESHOLD = 0.7;

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const probability = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
const nonnegativeInteger = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

function endpoint(value: string): URL {
	const url = new URL(value);
	const octets = url.hostname.split(".").map(Number);
	const privateAddress = octets.length === 4 && octets.every(part => Number.isSafeInteger(part) && part >= 0 && part <= 255) &&
		(octets[0] === 10 || octets[0] === 127 || (octets[0] === 192 && octets[1] === 168) || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31));
	if (url.protocol !== "http:" || !privateAddress || url.pathname !== "/v1/systemone" || url.username || url.password || url.search || url.hash) {
		throw new Error("Mom advisor URL must be HTTP on a loopback or private IPv4 address and end in /v1/systemone.");
	}
	return url;
}

async function boundedText(response: Response): Promise<string> {
	const declared = Number(response.headers.get("content-length"));
	if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) throw new Error("Mom advisor response exceeds 16 KiB.");
	if (!response.body) return "";
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let bytes = 0, text = "";
	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		bytes += value.byteLength;
		if (bytes > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new Error("Mom advisor response exceeds 16 KiB."); }
		text += decoder.decode(value, { stream: true });
	}
	return text + decoder.decode();
}

function parseReview(value: unknown, latencyMs: number): Omit<AdvisorReview, "reexamined"> {
	if (!record(value) || typeof value.model !== "string" || !record(value.answers) || !record(value.usage)) throw new Error("Mom advisor returned an invalid response.");
	const action = value.answers.map_action;
	if (!record(action) || action.type !== "choice" || typeof action.choice !== "string" || !ADVISOR_ACTIONS.includes(action.choice as AdvisorAction) ||
		!probability(action.confidence) || !record(action.probabilities)) throw new Error("Mom advisor returned invalid review answers.");
	const signals = {} as Record<AdvisorDimension, number>;
	for (const key of ADVISOR_DIMENSIONS) {
		const answer = value.answers[`needs_${key}`];
		if (!record(answer) || answer.type !== "noul" || !probability(answer.noul)) throw new Error("Mom advisor returned invalid review answers.");
		signals[key] = answer.noul;
	}
	const probabilities = {} as Record<AdvisorAction, number>;
	for (const key of ADVISOR_ACTIONS) {
		const score = action.probabilities[key];
		if (!probability(score)) throw new Error("Mom advisor returned invalid action probabilities.");
		probabilities[key] = score;
	}
	if (!nonnegativeInteger(value.usage.input_tokens) || !nonnegativeInteger(value.usage.output_tokens)) throw new Error("Mom advisor returned invalid usage.");
	return { status: "reviewed", model: value.model, needsReanalysis: Math.max(...Object.values(signals)), signals, action: action.choice as AdvisorAction,
		probabilities, confidence: action.confidence, usage: { input: value.usage.input_tokens, output: value.usage.output_tokens }, latencyMs };
}

export class SystemOneAdvisor implements SessionAdvisor {
	readonly model: string;
	readonly threshold: number;
	private readonly url?: URL;
	private readonly timeoutMs: number;
	private readonly configurationError?: string;

	constructor(options: { url: string; model?: string; threshold?: number; timeoutMs?: number }) {
		this.model = options.model?.trim() || "kev-latest";
		this.threshold = probability(options.threshold) ? options.threshold : DEFAULT_THRESHOLD;
		this.timeoutMs = Number.isSafeInteger(options.timeoutMs) && options.timeoutMs! >= 100 && options.timeoutMs! <= 10000 ? options.timeoutMs! : DEFAULT_TIMEOUT_MS;
		try { this.url = endpoint(options.url); }
		catch (error) { this.configurationError = String(error); }
	}

	async review(input: SessionReviewInput, signal?: AbortSignal): Promise<Omit<AdvisorReview, "reexamined">> {
		const started = performance.now();
		if (this.configurationError || !this.url) throw new Error(this.configurationError ?? "Mom advisor URL is unavailable.");
		const body = JSON.stringify({
			model: this.model,
			state: { savedAccountBeforeUpdate: input.current, momDraftAfterUpdate: input.proposed, newEvidenceToIncorporate: input.newEvidence, pendingMore: input.pendingMore },
			questions: {
				needs_expand: { type: "noul", instructions: "Compare newEvidenceToIncorporate with momDraftAfterUpdate. Is a material feature-level purpose, endeavor, durable permission or prohibition, user decision, unresolved choice, outcome, or return point missing from Mom's draft?",
					criteria: { true: "Material session meaning is absent and the account should expand. Durable user control or a withheld permission is material.", false: "No material meaning is missing; omitted content is transient wording, a mechanical step, or source-level detail." } },
				needs_contract: { type: "noul", instructions: "Does Mom's draft retain stale, duplicated, completed, or clause-level records that should be removed or folded?",
					criteria: { true: "The account is larger than the smallest faithful feature-level map.", false: "Every retained record still materially orients future session work." } },
				needs_redirect: { type: "noul", instructions: "Does Mom's draft put the session on the wrong purpose, focus, hierarchy path, or return route?",
					criteria: { true: "The account points to the wrong work or loses where a tangent returns.", false: "Purpose, focus, ancestry, and return route match the session." } },
				needs_reorganize: { type: "noul", instructions: "Should Mom reorganize multiple records because their current hierarchy obscures the session's real feature-level shape?",
					criteria: { true: "The same facts need a materially different hierarchy, not merely different wording.", false: "The hierarchy is already a compact faithful account." } },
				map_action: { type: "choice", instructions: "After comparing the new evidence, saved account, and Mom's draft, what treatment best fits the draft?", criteria: {
					accept: "Save it as the smallest faithful account, including a justified no-change proposal.",
					expand: "Add a missing feature-level endeavor, durable rule, decision, unresolved choice, outcome, or return point.",
					contract: "Remove or fold stale, duplicated, completed, or clause-level records.",
					redirect: "Change purpose, focus, hierarchy, or the path back from a tangent.",
					reorganize: "Restructure multiple related records because the current account obscures the session's real shape.",
				} },
			},
		});
		if (Buffer.byteLength(body) > MAX_REQUEST_BYTES) throw new Error("Mom advisor request exceeds 96 KiB.");
		const response = await fetch(this.url, { method: "POST", redirect: "error", headers: { "content-type": "application/json" }, body,
			signal: AbortSignal.any([AbortSignal.timeout(this.timeoutMs), ...(signal ? [signal] : [])]) });
		if (!response.ok) throw new Error(`Mom advisor returned HTTP ${response.status}.`);
		const text = await boundedText(response);
		let value: unknown;
		try { value = JSON.parse(text); } catch { throw new Error("Mom advisor returned invalid JSON."); }
		return parseReview(value, Math.round(performance.now() - started));
	}
}

export function isAdvisorRecord(value: unknown): value is AdvisorRecord {
	if (!record(value) || typeof value.model !== "string" || typeof value.latencyMs !== "number" || !Number.isFinite(value.latencyMs) || value.latencyMs < 0 || typeof value.reexamined !== "boolean") return false;
	if (value.status === "unavailable") return typeof value.error === "string" && value.reexamined === false;
	const probabilities = value.probabilities, signals = value.signals;
	if (value.status !== "reviewed" || !probability(value.needsReanalysis) || typeof value.action !== "string" || !ADVISOR_ACTIONS.includes(value.action as AdvisorAction) ||
		!record(probabilities) || !record(signals) || !probability(value.confidence) || !record(value.usage) || !nonnegativeInteger(value.usage.input) || !nonnegativeInteger(value.usage.output)) return false;
	return ADVISOR_ACTIONS.every(key => probability(probabilities[key])) && ADVISOR_DIMENSIONS.every(key => probability(signals[key]));
}
