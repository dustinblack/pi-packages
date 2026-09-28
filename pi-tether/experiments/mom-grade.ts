// Deterministic grader for mom-replay output. No model calls. Heuristic "watch" hits are reported for review, never scored.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { MapItem } from "./mom-map.ts";

interface Rubric {
	original: { ref: string; mustInclude: string };
	decisions: { after: string; pattern: string; state: MapItem["state"]; cites?: string }[];
	consult?: { ref: string; pattern: string };
	incorporated?: { worker: string; after: string; forbid: string }[];
	stale?: { label: string; pattern: string; unless?: string }[];
	watch?: { label: string; pattern: string }[];
}
interface IndexEvent { event: number; ref: string; actor: string; kind: string }
interface FeedEvent { ref: string; kind: string; actor: string; status?: string }
interface Batch { end: number; map: MapItem[]; patch: { note: unknown } }

const [runDir, rubricPath, bundle] = process.argv.slice(2);
if (!runDir || !rubricPath || !bundle) throw new Error("Usage: tsx experiments/mom-grade.ts RUN_DIR RUBRIC.json BUNDLE");
const json = async <T>(path: string): Promise<T> => JSON.parse(await readFile(path, "utf8"));
const rubric = await json<Rubric>(rubricPath);
const index = await json<IndexEvent[]>(join(runDir, "event-index.json"));
const feed: FeedEvent[] = (await readFile(join(bundle, "feed.jsonl"), "utf8")).trim().split("\n").map((l) => JSON.parse(l));
if (feed.length !== index.length || feed.some((e, i) => e.ref !== index[i].ref)) throw new Error("Bundle does not match the run's event index.");
const summary = await json<{ map: MapItem[]; calls: number; processed: number; totalEvents: number; failure: string | null;
	usage: { input: number; output: number; cacheRead: number; nominalCost: number }; elapsedMs: number }>(join(runDir, "summary.json"));
const files = (await readdir(runDir)).filter((f) => /^batch-\d+\.json$/.test(f)).sort((a, b) => parseInt(a.slice(6)) - parseInt(b.slice(6)));
const batches = await Promise.all(files.map((f) => json<Batch>(join(runDir, f))));
const rejections = (await readdir(runDir)).filter((f) => f.startsWith("rejection-")).length;
const num = (ref: string) => { const i = index.findIndex((e) => e.ref === ref); if (i < 0) throw new Error(`Rubric ref not in corpus: ${ref}`); return i + 1; };
// First committed map that includes event n.
const at = (n: number) => batches.find((b) => b.end >= n);
const active = (i: MapItem) => i.state !== "superseded" && i.state !== "closed";
const checks: { check: string; pass: boolean | null; detail: string }[] = [];
const add = (check: string, pass: boolean | null, detail: string) => checks.push({ check, pass, detail });

const original = summary.map.find((i) => i.id === "original");
add("original purpose preserved", !!original && original.text.includes(rubric.original.mustInclude) && original.refs.includes(num(rubric.original.ref)),
	original ? original.text.slice(0, 120) : "missing");

for (const d of rubric.decisions) {
	const b = at(num(d.after));
	if (!b) { add(`decision ${d.state} after ${d.after}`, false, "checkpoint not committed"); continue; }
	const re = new RegExp(d.pattern, "i");
	// Any record type: the requirement is that the user's decision is recorded with its source, not its label (buzz run A recorded one as a branch).
	const hits = b.map.filter((i) => !i.kind.endsWith("-purpose") && re.test(i.text) && i.state !== "superseded");
	const ok = hits.some((i) => i.state === d.state && (!d.cites || i.refs.includes(num(d.cites))));
	const early = d.state === "proposed" && hits.some((i) => i.state === "accepted");
	add(`decision ${d.state} after ${d.after}`, ok && !early, hits.map((i) => `${i.id}:${i.state}:[${i.refs}]`).join(" ") || "no matching decision");
}

// Worker lifecycle: open while running, closed once the latest event in the prefix is its stop message.
let expected = 0, correct = 0;
const wrong: string[] = [];
for (const b of batches) {
	const last = new Map<string, FeedEvent>();
	for (const e of feed.slice(0, b.end)) { const s = e.ref.split(":", 1)[0]; if (s !== "s0") last.set(s, e); }
	for (const [key, e] of last) {
		expected++;
		const want = e.kind === "assistant" && e.status === "stop" ? "closed" : "open";
		const item = b.map.find((i) => i.id === key);
		if (item?.kind === "branch" && item.state === want) correct++;
		else wrong.push(`@${b.end} ${key}: want ${want}, got ${item ? `${item.kind}/${item.state}` : "missing"}`);
	}
}
add("worker branch lifecycle", expected === 0 ? null : correct === expected, `${correct}/${expected}${wrong.length ? `; ${wrong.slice(0, 4).join("; ")}` : ""}`);

for (const w of rubric.incorporated ?? []) {
	const b = at(num(w.after));
	const item = b?.map.find((i) => i.id === w.worker);
	add(`incorporation noted for ${w.worker} (heuristic)`, !!item && !new RegExp(w.forbid, "i").test(item.text), item ? item.text.slice(-160) : "missing");
}

for (const s of rubric.stale ?? []) {
	const re = new RegExp(s.pattern, "i"), unless = s.unless ? new RegExp(s.unless, "i") : undefined;
	const hits = summary.map.filter((i) => active(i) && re.test(i.text) && !unless?.test(i.text));
	add(`no active stale record: ${s.label} (heuristic)`, hits.length === 0, hits.map((i) => `${i.id}:${i.state}`).join(" ") || "ok");
}

if (rubric.consult) {
	const n = num(rubric.consult.ref);
	const re = new RegExp(rubric.consult.pattern, "i");
	const item = summary.map.find((i) => i.basis === "tool-evidence" && i.refs.includes(n) && re.test(i.text));
	add("consult answered from inspected evidence", !!item, item ? item.text.slice(0, 140) : "no tool-evidence finding citing the consult source");
}

const users = index.filter((e) => (e.kind === "user" || e.kind === "user_answer") && e.actor === "lead" && e.event <= summary.processed).map((e) => e.event);
const cited = new Set(summary.map.flatMap((i) => i.refs));
const missingUsers = users.filter((n) => !cited.has(n));
add("every user message still traceable in final map", users.length > 0 && missingUsers.length === 0, `${users.length - missingUsers.length}/${users.length}${missingUsers.length ? `; missing @${missingUsers.join(",@")}` : ""}`);
add("run completed", summary.failure === null && summary.processed === summary.totalEvents, summary.failure ?? "ok");

const unfinished = summary.map.filter((i) => i.id !== "original" /* host-copied verbatim */ && !/[.!?)"'`\]]$/.test(i.text.trim())).map((i) => i.id);
add("no cut-off records", summary.map.length > 0 && unfinished.length === 0, unfinished.join(", ") || "ok");
const watch = (rubric.watch ?? []).flatMap((w) => summary.map.filter((i) => active(i) && new RegExp(w.pattern, "i").test(i.text))
	.map((i) => ({ label: w.label, id: i.id, state: i.state, text: i.text })));
const scored = checks.filter((c) => c.pass !== null);
console.log(JSON.stringify({
	run: runDir, score: `${scored.filter((c) => c.pass).length}/${scored.length}`, checks,
	shape: { items: summary.map.length, active: summary.map.filter(active).length, mapChars: JSON.stringify(summary.map).length,
		unfinishedProse: unfinished, notes: batches.filter((b) => b.patch.note).length, rejectedPatches: rejections },
	usage: { calls: summary.calls, ...summary.usage, seconds: Math.round(summary.elapsedMs / 100) / 10 },
	reviewWatchHits: watch,
}, null, 2));
