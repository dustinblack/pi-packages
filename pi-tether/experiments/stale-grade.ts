// Evaluate labeled, temporal stale claims in saved Mom replay maps. Heuristics are auditable, not semantic proof.
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { MapItem } from "./mom-map.ts";

interface Label {
	label: string; bundle: string; introduced: string; replacedBy: string; outdatedClaim: string; exception?: string;
}
interface Batch { end: number; map: MapItem[] }
interface Control { label: string; bundle: string; after: string; source: string; pattern: string; state: MapItem["state"]; finalRequired?: boolean }
const [runDir, labelsFile, controlsFile] = process.argv.slice(2);
if (!runDir || !labelsFile) throw new Error("Usage: tsx experiments/stale-grade.ts RUN_DIR LABELS.json");
const labels: Label[] = JSON.parse(await readFile(labelsFile, "utf8"));
const config: { bundle: string; seedRun?: string | null; seedBatch?: number } = JSON.parse(await readFile(join(runDir, "configuration.json"), "utf8"));
const selected = labels.filter((l) => l.bundle === config.bundle);
if (!selected.length) throw new Error(`No labels for bundle ${config.bundle}`);
const index: { event: number; ref: string }[] = JSON.parse(await readFile(join(runDir, "event-index.json"), "utf8"));
const files = (await readdir(runDir)).filter((f) => /^batch-\d+\.json$/.test(f)).sort((a, b) => Number(a.slice(6, -5)) - Number(b.slice(6, -5)));
const batches: Batch[] = await Promise.all(files.map(async (f) => JSON.parse(await readFile(join(runDir, f), "utf8"))));
if (config.seedRun && config.seedBatch) batches.unshift(JSON.parse(await readFile(join(config.seedRun, `batch-${config.seedBatch}.json`), "utf8")) as Batch);
const summary: { processed: number; totalEvents: number; failure: string | null } = JSON.parse(await readFile(join(runDir, "summary.json"), "utf8"));
const at = (ref: string) => { const e = index.find((i) => i.ref === ref); if (!e) throw new Error(`Unknown label ref ${ref}`); return e.event; };
const active = (item: MapItem) => item.state !== "closed" && item.state !== "superseded";
const results = selected.map((l) => {
	const first = at(l.introduced), replacement = at(l.replacedBy);
	if (first >= replacement) throw new Error(`Invalid ordering: ${l.label}`);
	const pre = batches.find((b) => first <= b.end && b.end < replacement);
	const post = batches.filter((b) => b.end >= replacement);
	const re = new RegExp(l.outdatedClaim, "i"), except = l.exception ? new RegExp(l.exception, "i") : undefined;
	const hits = (b: Batch) => b.map.filter((i) => active(i) && re.test(i.text) && !except?.test(i.text)).map((i) => ({ id: i.id, state: i.state, refs: i.refs, text: i.text }));
	const before = pre && hits(pre), after = post.map((b) => ({ end: b.end, matches: hits(b) }));
	return { label: l.label, introduced: first, replacedBy: replacement,
		before: pre ? { end: pre.end, matches: before, baselinePresent: !!before?.length } : null,
		after, firstAfterRetired: after.length ? after[0].matches.length === 0 : null,
		finalRetired: after.length ? after.at(-1)!.matches.length === 0 : null,
		regressions: after.filter((b) => b.matches.length > 0).length };
});
const scored = results.filter((r) => r.before?.baselinePresent && r.firstAfterRetired !== null);
const controls: Control[] = controlsFile ? JSON.parse(await readFile(controlsFile, "utf8")) : [];
const protections = controls.filter((c) => c.bundle === config.bundle).map((c) => {
	const checkpoint = at(c.after), source = at(c.source), re = new RegExp(c.pattern, "i");
	const matches = (b: Batch) => b.map.filter((i) => active(i) && i.state === c.state && i.refs.includes(source) && re.test(i.text))
		.map((i) => ({ id: i.id, refs: i.refs, text: i.text }));
	const first = batches.find((b) => b.end >= checkpoint);
	const last = batches.at(-1);
	return { label: c.label, checkpoint, finalRequired: c.finalRequired !== false, first: first ? { end: first.end, matches: matches(first) } : null,
		final: last && last.end >= checkpoint ? { end: last.end, matches: matches(last) } : null };
});
console.log(JSON.stringify({ run: runDir, processed: summary.processed, totalEvents: summary.totalEvents,
	failure: summary.failure, baselineAvailable: scored.length, totalLabels: results.length,
	firstAfterRetired: `${scored.filter((r) => r.firstAfterRetired).length}/${scored.length}`,
	finalRetired: `${scored.filter((r) => r.finalRetired).length}/${scored.length}`,
	controlsFirst: `${protections.filter((c) => c.first?.matches.length).length}/${protections.filter((c) => c.first).length}`,
	controlsFinal: `${protections.filter((c) => c.finalRequired && c.final?.matches.length).length}/${protections.filter((c) => c.finalRequired && c.final).length}`,
	labels: results, protections }, null, 2));
