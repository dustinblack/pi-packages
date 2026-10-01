// Option C audit input extraction (todo 037). Produces a private, transcript-free comparison per
// exposed case: what the gold validators saw (context/decisive refs), what the blind scorers saw
// (the full interval through the aligned horizon), the map delta, and the three labels. Writes only
// refs, ids, and structural facts — never evidence text. Output is PRIVATE; only the classification
// derived from it is committed.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { classifyGraphDiff } from "./classifier.ts";

const ROOT = "/private/tmp/todo-008-trajectory";
const OUT_DIR = `${ROOT}/private-v2/audit`;
const CORPORA = ["pi-packages", "buzz", "ssmp"] as const;

interface FeedEvent { ref: string; actor: string; kind: string }
const feeds = new Map<string, FeedEvent[]>();
const eventIndexOf = new Map<string, number>();
for (const corpus of CORPORA) {
	const events = (await import("node:fs")).readFileSync(`${ROOT}/${corpus}/feed.jsonl`, "utf8").trim().split("\n").map(l => JSON.parse(l) as FeedEvent);
	feeds.set(corpus, events);
	for (const [index, event] of events.entries()) eventIndexOf.set(event.ref, index + 1);
}

const packet = JSON.parse((await import("node:fs")).readFileSync(`${ROOT}/semantic-scorer-packet.json`, "utf8"));
const gold = JSON.parse((await import("node:fs")).readFileSync(resolve("pi-tether/experiments/trajectory-acceptance/labels/final-gold.json"), "utf8"));
const manifest = JSON.parse((await import("node:fs")).readFileSync(resolve("pi-tether/experiments/trajectory-acceptance/aligned-replay-manifest.json"), "utf8"));
const validatorPacket = JSON.parse((await import("node:fs")).readFileSync(`${ROOT}/validator-packet.json`, "utf8"));
const resolutions = JSON.parse((await import("node:fs")).readFileSync(`${ROOT}/private-v2/resolutions.json`, "utf8"));

const toCase = new Map(manifest.cases.map((c: any) => [c.scorerCaseId, c.caseId]));
const corpusOf = new Map(manifest.cases.map((c: any) => [c.caseId, c.corpus]));

interface NodeRow { id: string; kind: string; state: string; label: string; sources: string[]; purposeSource?: string }
function mapDelta(before: any, after: any) {
	const beforeNodes = new Map<string, any>(before.map.nodes.map((n: any) => [n.id, n]));
	const afterNodes = new Map<string, any>(after.map.nodes.map((n: any) => [n.id, n]));
	const added = [...afterNodes.values()].filter((n: any) => !beforeNodes.has(n.id));
	const removed = [...beforeNodes.values()].filter((n: any) => !afterNodes.has(n.id));
	const changed = [...afterNodes.values()].filter((n: any) => {
		const b = beforeNodes.get(n.id); if (!b) return false;
		return b.kind !== n.kind || b.state !== n.state || b.label !== n.label || b.intent !== n.intent ||
			JSON.stringify(b.sources) !== JSON.stringify(n.sources) || (b.purposeSource ?? null) !== (n.purposeSource ?? null) ||
			JSON.stringify(b.history ?? null) !== JSON.stringify(n.history ?? null);
	});
	const edgeKey = (e: any) => `${e.from}|${e.relation}|${e.to}`;
	const beforeEdges = new Map<string, any>(before.map.edges.map((e: any) => [edgeKey(e), e]));
	const afterEdges = new Map<string, any>(after.map.edges.map((e: any) => [edgeKey(e), e]));
	return {
		added: added.map((n: any) => ({ id: n.id, kind: n.kind, state: n.state, sources: n.sources, purposeSource: n.purposeSource ?? null })),
		removed: removed.map((n: any) => ({ id: n.id, kind: n.kind, state: n.state })),
		changed: changed.map((n: any) => ({ id: n.id, fromState: beforeNodes.get(n.id)!.state, toState: n.state, sources: n.sources })),
		edgesAdded: [...afterEdges.keys()].filter(k => !beforeEdges.has(k)),
		edgesRemoved: [...beforeEdges.keys()].filter(k => !afterEdges.has(k)),
	};
}

const rows: any[] = [];
for (const c of packet.cases) {
	const caseId = toCase.get(c.scorerCaseId)!, corpus = corpusOf.get(caseId)!;
	const goldCase = gold.cases.find((x: any) => x.caseId === caseId);
	const goldPacketCase = validatorPacket.cases.find((x: any) => x.id === caseId);
	const boundaryEvent = goldPacketCase?.boundaryEvent ?? eventIndexOf.get(goldPacketCase.boundaryRef);
	const goldContext = (goldPacketCase?.context ?? []).map((entry: any) => ({ ref: entry.ref, relation: entry.relation, event: eventIndexOf.get(entry.ref) ?? null }));
	const goldRefs = new Set<string>([...goldContext.map((g: any) => g.ref), ...(goldCase?.decisiveRefs ?? []).map((d: any) => d.ref)]);
	const blindEvidence = (c.evidence ?? []).map((e: any) => ({ ref: e.ref, event: e.event }));
	const blindRefs = new Set(blindEvidence.map((e: any) => e.ref));
	const unseenByGold = blindEvidence.filter((e: any) => !goldRefs.has(e.ref));
	const structural = classifyGraphDiff(
		{ revision: c.before.map.revision, motherThread: c.before.map.motherThread, purpose: c.before.map.purpose, focus: c.before.map.focus, nodes: c.before.map.nodes, edges: c.before.map.edges },
		{ revision: c.after.map.revision, motherThread: c.after.map.motherThread, purpose: c.after.map.purpose, focus: c.after.map.focus, nodes: c.after.map.nodes, edges: c.after.map.edges });
	const resolution = resolutions.find((r: any) => r.scorerCaseId === c.scorerCaseId);
	const delta = mapDelta(c.before, c.after);
	const afterBoundaryNodes = delta.added.filter((n: any) => n.sources.some((s: string) => (eventIndexOf.get(s) ?? 0) > boundaryEvent));
	rows.push({
		caseId, scorerCaseId: c.scorerCaseId, corpus, source: manifest.cases.find((m: any) => m.caseId === caseId).source,
		horizon: c.horizon, boundaryEvent, boundaryRef: goldPacketCase?.boundaryRef,
		goldContext, goldLabel: goldCase?.finalLabel, goldDecisiveRefs: (goldCase?.decisiveRefs ?? []).map((d: any) => d.ref),
		blindEvidenceCount: blindEvidence.length, blindUnseenByGold: unseenByGold,
		blindEvidenceWindow: blindEvidence.length ? { first: blindEvidence[0].event, last: blindEvidence.at(-1).event } : null,
		blindLabel: resolution?.fields?.movement?.value ?? null, blindAgreement: resolution?.fields?.movement?.agreement ?? "unresolved",
		structuralLabel: structural.label, structuralReasons: structural.reasons,
		mapDelta: delta,
		afterBoundaryAddedNodes: afterBoundaryNodes.map((n: any) => n.id),
		mapSourcesAfterBoundaryNotSeenByGold: [...new Set(delta.added.flatMap((n: any) => n.sources).filter((s: string) =>
			(eventIndexOf.get(s) ?? 0) > boundaryEvent && !goldRefs.has(s)))],
		gateVerdicts: Object.fromEntries(Object.entries(resolution?.fields ?? {})
			.filter(([k]) => k !== "movement").map(([k, v]: any) => [k, v.value])),
	});
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/case-audit-input.json`, JSON.stringify(rows, null, 2) + "\n");
console.log(`cases: ${rows.length}`);
for (const r of rows) {
	console.log([
		r.caseId.padEnd(16), String(r.goldLabel).padEnd(11), String(r.blindLabel).padEnd(11), String(r.structuralLabel).padEnd(11),
		`bEv=${r.boundaryEvent}`, `blind=${r.blindEvidenceWindow?.first}-${r.blindEvidenceWindow?.last}(${r.blindEvidenceCount})`,
		`gold=${r.goldContext.length}ctx`, `unseen=${r.blindUnseenByGold.length}`,
		`+${r.mapDelta.added.length}/-${r.mapDelta.removed.length}/~${r.mapDelta.changed.length}`,
		`afterBoundaryNodes=${r.afterBoundaryAddedNodes.length}`,
	].join(" "));
}
