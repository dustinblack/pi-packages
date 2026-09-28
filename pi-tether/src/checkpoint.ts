import type { Cut, SessionReader } from "./feed.ts";
import type { Notice } from "./contract.ts";
import { Check } from "typebox/value";
import { checkGraph, checkThreadGraph, Unfinished, type ThreadGraph, type UnfinishedItems, type WorkGraph } from "./graph.ts";
import { checkFlatGraph, type FlatGraph } from "./legacy-graph.ts";

export const CHECKPOINT = "pi-tether.mom.v4";
export const THREAD_CHECKPOINT = "pi-tether.mom.v3";
export const FLAT_CHECKPOINT = "pi-tether.mom.v2";
export const LEGACY_CHECKPOINT = "pi-tether.mom.v1";
export const NOTICE = "pi-tether.mom-notice";
export const CONTROL = "pi-tether.mom-control";
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
interface CheckpointBase {
	sessionId: string;
	note: Notice | null;
	cut: Cut;
	at: number;
	model: string;
	usage: Usage;
}
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
export interface Checkpoint extends CheckpointBase { version: 4; graph: WorkGraph; change?: GraphChange; unfinished?: UnfinishedItems }
export interface ThreadCheckpoint extends CheckpointBase { version: 3; graph: ThreadGraph; change?: GraphChange; unfinished?: UnfinishedItems }
export interface FlatCheckpoint extends CheckpointBase { version: 2; graph: FlatGraph }
export interface LegacyCheckpoint extends CheckpointBase { version: 1; snapshot: string }
export type SavedCheckpoint = Checkpoint | ThreadCheckpoint | FlatCheckpoint | LegacyCheckpoint;
export const checkpointTypes = [LEGACY_CHECKPOINT, FLAT_CHECKPOINT, THREAD_CHECKPOINT, CHECKPOINT] as const;
// Pi mutates its in-memory tree before persistence. Keep failed IDs across extension reloads;
// never patch Pi's tree or reinterpret an unwritten entry as committed state.
const failedKey = Symbol.for("@ssweens/pi-tether/failed-checkpoints/1");
const processState = globalThis as typeof globalThis & { [failedKey]?: Set<string> };
const failed = processState[failedKey] ??= new Set<string>();
export const PERSISTENCE_BLOCK = "Mom checkpoint persistence failed. Reopen the saved session from disk before updating Mom; the SDK's in-memory branch contains an uncommitted entry.";

export function appendCheckpoint(manager: SessionReader, append: (type: string, data: unknown) => void, checkpoint: Checkpoint): void {
	const before = manager.getLeafId();
	try { append(CHECKPOINT, checkpoint); }
	catch (error) {
		const leaf = manager.getLeafId(), entry = leaf ? manager.getEntry(leaf) : undefined;
		if (leaf !== before && entry?.type === "custom" && entry.customType === CHECKPOINT) failed.add(`${manager.getSessionId()}:${entry.id}`);
		throw error;
	}
}

const record = (x: unknown): x is Record<string, any> => !!x && typeof x === "object" && !Array.isArray(x);
const integer = (x: unknown) => typeof x === "number" && Number.isSafeInteger(x) && x >= 0;
const hash = (x: unknown) => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);

export function isCheckpoint(x: unknown): x is SavedCheckpoint {
	if (!record(x) || ![1, 2, 3, 4].includes(x.version) || typeof x.sessionId !== "string" ||
		!Number.isFinite(x.at) || typeof x.model !== "string" || !record(x.cut) || !record(x.usage)) return false;
	if (x.version === 1) { if (typeof x.snapshot !== "string") return false; }
	else { try { if (x.version === 2) checkFlatGraph(x.graph); else if (x.version === 3) checkThreadGraph(x.graph); else checkGraph(x.graph); } catch { return false; } }
	if (x.version >= 3 && x.unfinished !== undefined && !Check(Unfinished, x.unfinished)) return false;
	if (x.version >= 3 && x.change !== undefined) {
		const c = x.change;
		if (!record(c) || (c.before !== null && !integer(c.before)) || c.after !== x.graph.nodes.length ||
			![c.created, c.retired].every(items => Array.isArray(items) && items.every(n => record(n) && typeof n.id === "string" && typeof n.label === "string" && Array.isArray(n.sources) && n.sources.length && n.sources.every((s: unknown) => typeof s === "string")))) return false;
		if (c.before !== null && c.after !== c.before + c.created.length - c.retired.length) return false;
	}
	if (x.cut.parent !== null && typeof x.cut.parent !== "string") return false;
	if (!hash(x.cut.parentHash) || !Array.isArray(x.cut.workers)) return false;
	for (const w of x.cut.workers) {
		if (!record(w) || !["key", "file", "sessionId", "actor", "runId", "cwd"].every((k) => typeof w[k] === "string") ||
			w.key !== w.sessionId || !integer(w.offset) || !integer(w.messages) || !integer(w.forkedMessages) ||
			(w.lastId !== null && typeof w.lastId !== "string") || !hash(w.hash) ||
			(w.device !== null && !integer(w.device)) || (w.inode !== null && !integer(w.inode))) return false;
	}
	if (x.note !== null && (!record(x.note) || !["text", "obligationRef", "triggerRef"].every((k) => typeof x.note[k] === "string"))) return false;
	return Object.keys(emptyUsage()).every((k) => typeof x.usage[k] === "number" && Number.isFinite(x.usage[k]) && x.usage[k] >= 0);
}

/** A checkpoint from another session (including an inherited fork) is never reinterpreted locally. */
export function loadState(manager: SessionReader): { checkpoint?: SavedCheckpoint; checkpointId?: string; enabled: boolean; delivered?: string; persistenceError?: string } {
	let checkpoint: SavedCheckpoint | undefined;
	let checkpointId: string | undefined;
	let enabled = true;
	let delivered: string | undefined;
	let persistenceError: string | undefined;
	for (const entry of manager.getBranch()) {
		if (failed.has(`${manager.getSessionId()}:${entry.id}`)) { persistenceError = PERSISTENCE_BLOCK; continue; }
		if (entry.type === "custom" && checkpointTypes.some(type => type === entry.customType)) {
			if (!isCheckpoint(entry.data) || entry.customType !== checkpointTypes[entry.data.version - 1]) throw new Error("Invalid Mom checkpoint; refusing to silently replace it.");
			if (entry.data.sessionId === manager.getSessionId()) { checkpoint = entry.data; checkpointId = entry.id; }
		} else if (entry.type === "custom" && entry.customType === CONTROL && record(entry.data) && entry.data.sessionId === manager.getSessionId() && typeof entry.data.enabled === "boolean") enabled = entry.data.enabled;
		else if (entry.type === "custom_message" && entry.customType === NOTICE && record(entry.details) && typeof entry.details.key === "string") delivered = entry.details.key;
	}
	return { checkpoint, checkpointId, enabled, delivered, ...(persistenceError ? { persistenceError } : {}) };
}

export const quarantinedCheckpoint = (manager: SessionReader, id: string) => failed.has(`${manager.getSessionId()}:${id}`);
export const noticeKey = (note: Notice) => `${note.obligationRef}|${note.triggerRef}`;
export function sumUsage(a: Usage, b: Usage): Usage {
	const sum = emptyUsage();
	for (const key of Object.keys(sum) as (keyof Usage)[]) sum[key] = a[key] + b[key];
	return sum;
}
