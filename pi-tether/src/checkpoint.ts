import type { Cut, SessionReader } from "./feed.ts";
import type { Notice } from "./contract.ts";
import { isAdvisorRecord, type AdvisorRecord } from "./advisor.ts";
import type { MomStore, SidecarRecord } from "./sidecar.ts";
import { Check } from "typebox/value";
import { checkGraph, Unfinished, type WorkGraph, type UnfinishedItems } from "./graph.ts";

export const NOTICE = "pi-tether.mom-notice";
export interface Usage {
	calls: number;
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	nominalCost: number;
	elapsedMs: number;
}
export const emptyUsage = (): Usage => ({ calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, nominalCost: 0, elapsedMs: 0 });
export interface GraphChange {
	before: number | null; after: number;
	created: { id: string; label: string; sources: string[] }[];
	retired: { id: string; label: string; sources: string[] }[];
}
/** Recorded map changes, not a judgment of whether the interpretation was correct. */
export function graphChange(before: { nodes: readonly { id: string; label: string; sources: string[] }[] } | null, after: { nodes: readonly { id: string; label: string; sources: string[] }[] }): GraphChange {
	const oldIds = new Set(before?.nodes.map(n => n.id)), newIds = new Set(after.nodes.map(n => n.id));
	const record = ({ id, label, sources }: { id: string; label: string; sources: string[] }) => ({ id, label, sources: [...sources] });
	return { before: before?.nodes.length ?? null, after: after.nodes.length,
		created: after.nodes.filter(n => !oldIds.has(n.id)).map(record),
		retired: (before?.nodes ?? []).filter(n => !newIds.has(n.id)).map(record) };
}
export interface Checkpoint { version: 4; sessionId: string; graph: WorkGraph; note: Notice | null; unfinished?: UnfinishedItems; advisor?: AdvisorRecord; cut: Cut; at: number; model: string; usage: Usage; change?: GraphChange }

const record = (x: unknown): x is Record<string, any> => !!x && typeof x === "object" && !Array.isArray(x);
const integer = (x: unknown) => typeof x === "number" && Number.isSafeInteger(x) && x >= 0;
const hash = (x: unknown) => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
const usageLike = (x: unknown): x is Usage => record(x) && Object.keys(emptyUsage()).every(k => typeof x[k] === "number" && Number.isFinite(x[k]) && x[k] >= 0);
const cutLike = (x: unknown): x is Cut => {
	if (!record(x) || (x.parent !== null && typeof x.parent !== "string") || !Array.isArray(x.workers)) return false;
	for (const w of x.workers) {
		if (!record(w) || !["key", "file", "sessionId", "actor", "runId", "cwd"].every((k) => typeof w[k] === "string") ||
			w.key !== w.sessionId || !integer(w.offset) || !integer(w.messages) || !integer(w.forkedMessages) ||
			(w.lastId !== null && typeof w.lastId !== "string") || !hash(w.hash) ||
			(w.device !== null && !integer(w.device)) || (w.inode !== null && !integer(w.inode))) return false;
	}
	return true;
};

export function isCheckpoint(x: unknown): x is Checkpoint {
	if (!record(x) || x.version !== 4 || typeof x.sessionId !== "string" ||
		!Number.isFinite(x.at) || typeof x.model !== "string" || !record(x.cut) || !record(x.usage)) return false;
	try { checkGraph(x.graph); } catch { return false; }
	if (x.unfinished !== undefined && !Check(Unfinished, x.unfinished)) return false;
	if (x.advisor !== undefined && !isAdvisorRecord(x.advisor)) return false;
	if (x.change !== undefined) {
		const c = x.change;
		if (!record(c) || (c.before !== null && !integer(c.before)) || c.after !== x.graph.nodes.length ||
			![c.created, c.retired].every(items => Array.isArray(items) && items.every(n => record(n) && typeof n.id === "string" && typeof n.label === "string" && Array.isArray(n.sources) && n.sources.length && n.sources.every((s: unknown) => typeof s === "string")))) return false;
		if (c.before !== null && c.after !== c.before + c.created.length - c.retired.length) return false;
	}
	if (!cutLike(x.cut)) return false;
	if (x.note !== null && (!record(x.note) || !["text", "obligationRef", "triggerRef"].every((k) => typeof x.note[k] === "string"))) return false;
	return usageLike(x.usage);
}

export interface MomState { checkpoint?: Checkpoint; checkpointId?: string; enabled: boolean; delivered?: string; usage?: Usage }

/** Sidecar checkpoint records valid for the selected branch. */
export function branchCheckpoints(records: readonly SidecarRecord[], branch: ReadonlySet<string>): { id: string; data: Checkpoint }[] {
	const checkpoints: { id: string; data: Checkpoint }[] = [];
	for (const item of records) {
		if (item.type !== "checkpoint") continue;
		if (!isCheckpoint(item.data)) throw new Error("Invalid Mom checkpoint in her sidecar; refusing to silently replace it.");
		if (item.data.cut.parent !== null && !branch.has(item.data.cut.parent)) continue; // an abandoned branch stays invisible
		checkpoints.push({ id: item.id, data: item.data });
	}
	return checkpoints;
}

function foldAttemptUsage(records: readonly SidecarRecord[], at: number): Usage | undefined {
	let usage: Usage | undefined;
	for (const item of records) if (item.type === "attempt" && usageLike(item.data.usage) && item.at >= at) usage = item.data.usage;
	return usage;
}

/** Mom state comes only from her sidecar. The session transcript is evidence, never state storage. */
export async function loadState(store: MomStore, manager: SessionReader): Promise<MomState> {
	const state: MomState = { enabled: true };
	const records = await store.load();
	const branch = new Set(manager.getBranch().map(e => e.id));
	for (const { id, data } of branchCheckpoints(records, branch)) { state.checkpoint = data; state.checkpointId = id; }
	for (const item of records) {
		if (item.type === "progress") {
			if (typeof item.data.checkpoint !== "string" || !cutLike(item.data.cut)) throw new Error("Invalid Mom progress in her sidecar; refusing to outrun an accepted update.");
			if (item.data.checkpoint === state.checkpointId && state.checkpoint &&
				(item.data.cut.parent === null || branch.has(item.data.cut.parent))) {
				state.checkpoint = { ...state.checkpoint, cut: item.data.cut, at: item.at };
			}
		} else if (item.type === "control" && typeof item.data.enabled === "boolean") state.enabled = item.data.enabled;
		else if (item.type === "notice" && typeof item.data.key === "string") state.delivered = item.data.key;
	}
	const usage = foldAttemptUsage(records, state.checkpoint?.at ?? 0);
	if (usage) state.usage = usage;
	return state;
}

export const noticeKey = (note: Notice) => `${note.obligationRef}|${note.triggerRef}`;
export function sumUsage(a: Usage, b: Usage): Usage {
	const sum = emptyUsage();
	for (const key of Object.keys(sum) as (keyof Usage)[]) sum[key] = a[key] + b[key];
	return sum;
}
