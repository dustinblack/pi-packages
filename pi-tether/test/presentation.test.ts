import assert from "node:assert/strict";
import test from "node:test";
import { presentGraph, readText, summaryText } from "../src/presentation.ts";

const node = (id: string, kind = "rule", state = "active", parent: string | null = "main") => ({
	id, kind, state, parent, label: `Label for ${id}`, intent: `Keep ${id} unchanged.`, observed: `Evidence for ${id}.`,
	actor: "user", sources: [`session:${id}`], purposeSource: `session:${id}`,
});

// Small structural analogue of a recorded carry/fold: completed endeavor, an
// unanswered focused hold, other live restrictions, a parked choice, and history.
// No temporary recording or domain-specific wording is needed by these tests.
function carriedGraph() {
	return {
		purpose: "main", focus: "hold", checkpoint: "saved-now", revision: 3,
		original: { ref: "session:request", text: 'Original request: "do everything". Never show this by default.' },
		nodes: [
			{ ...node("main", "try", "settled", null), history: { checkpoint: "saved-before", nodes: ["main", "preparation"], reason: "Preparation ended, restrictions carried.", sources: ["session:fold"], returns: [] } },
			node("approved", "choice", "settled"), node("result", "observation", "settled"),
			{ ...node("protect"), intent: 'Keep "protected.txt" untouched; make no edits or deletions.' },
			{ ...node("wording", "choice", "parked"), intent: "Leave the wording decision parked for the lead.", actor: "lead user" },
			{ ...node("hold"), intent: 'The question remains unanswered: "do not answer yet". Wait for the lead to decide.' },
			{ ...node("readonly"), intent: 'Make no modifications or verification runs: "no tests or commits".' },
			{ ...node("complete"), intent: 'Do not reopen implementation: "it remains complete".' },
		],
		edges: ["approved", "protect", "wording", "hold", "readonly", "complete"].map(from => ({ from, to: "main", relation: "governs", sources: ["session:edge"] })),
		unfinished: [{ node: "hold", disposition: "carried", target: "main", sources: ["session:carry"] }],
		change: { before: 9, after: 8, retired: [{ id: "preparation", sources: ["session:fold"] }] },
	};
}

function freeze(value: any): any {
	if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
	return value;
}

test("default carry story prioritizes the unresolved hold, not the finished work or raw records", () => {
	const view = presentGraph(carriedGraph()), result = readText(view);
	assert.equal(result, summaryText(view));
	const lines = result.split("\n");
	assert.equal(lines[0], "Mother thread: Label for main [main] — finished · current");
	assert.match(lines[1]!, /^  Current · in force: \[hold\] Why: The question remains unanswered: do not answer yet.*\[src:session:hold\]/);
	assert.match(result, /Rules in force \(3\):\n    Why: Keep protected.txt untouched/);
	assert.match(result, /Waiting on you \(1\):\n    Leave the wording decision parked for the lead/);
	assert.match(result, /Recorded outcomes \(2\):\n    Label for approved/);
	assert.match(result, /Folded away → history saved-before/);
	assert.doesNotMatch(result, /Recorded details|[{}]|governs|["“”]|Original request|Evidence for/);
	assert.match(result, /Why: (?:The question remains unanswered|Keep protected\.txt untouched).*\[src:session:(?:hold|protect)\]/);
	assert.equal(result.match(/The question remains unanswered/g)?.length, 1);
	assert.equal(result.match(/\[main\]/g)?.length, 1);
	assert.equal(result.match(/\[hold\]/g)?.length, 1);
	assert.doesNotMatch(result, /\[protect\]|\[wording\]|\[result\]|under \[/);
	assert.ok(lines.every(line => line.length <= 250));
	assert.ok(result.length <= 900);
});

test("partial catch-up reads label the last-saved snapshot and suppress current orientation", () => {
	const partial = presentGraph({ ...carriedGraph(), coverageComplete: false });
	const story = readText(partial);
	assert.match(story, /^Mom is still catching up; partial last-saved snapshot only/);
	assert.match(story, /Last saved focus/);
	assert.doesNotMatch(story, /\bCurrent\b|· current/);
	assert.match(partial.orientation, /partial last-saved snapshot/);
	assert.match(partial.orientation, /Last saved focus/);
	assert.doesNotMatch(partial.orientation, /Where you are|current point of attention/);
	const complete = readText(presentGraph({ ...carriedGraph(), coverageComplete: true }));
	assert.match(complete, /Current · in force|· current/);
});

test("explicit details retain every projected field, exact wording, endpoints, sources, and original", () => {
	const raw = carriedGraph(), before = structuredClone(raw);
	freeze(raw);
	const view = presentGraph(raw), projected = structuredClone(view);
	freeze(view);
	const result = readText(view, true);
	const details = JSON.parse(result.split("\n\nRecorded details:\n")[1]!);
	const { orientation: _, ...expected } = view;
	assert.deepEqual(details, expected);
	assert.deepEqual(details.original, raw.original);
	assert.deepEqual(details.endeavors[0]!.history, "history" in raw.nodes[0]! ? raw.nodes[0]!.history : undefined);
	assert.deepEqual(details.unfinished, raw.unfinished);
	assert.equal(details.connections.find(c => c.fromAnnotation === "hold")!.to, "main");
	assert.equal(details.endeavors[0]!.annotations.find(a => a.id === "hold")!.intent, raw.nodes.find(n => n.id === "hold")!.intent);
	assert.match(result, /session:edge/);
	assert.deepEqual(view, projected);
	assert.deepEqual(raw, before);
	assert.match(view.orientation, /original user request/); // widget projection unchanged
});

test("each large group is bounded and visibly counted; focused hold cannot be collapsed", () => {
	const raw = carriedGraph();
	for (let i = 0; i < 9; i++) {
		raw.nodes.push(node(`rule-${i}`), node(`wait-${i}`, "choice", "parked"), node(`done-${i}`, "observation", "settled"));
		raw.nodes.push(node(`work-${i}`, "try"));
	}
	raw.nodes.push({ ...node("long"), intent: "Long restriction ".repeat(100) });
	raw.focus = "long";
	const result = readText(presentGraph(raw)), lines = result.split("\n");
	assert.match(result, /Current · in force: \[long\].*…/);
	assert.match(result, /Rules in force \(13\):[\s\S]*?    … 11 more/);
	assert.match(result, /Waiting on you \(10\):\n(?:    .*\n){2}    … 8 more/);
	assert.match(result, /Recorded outcomes \(11\):\n(?:    .*\n){2}    … 9 more/);
	assert.match(result, /Other endeavors: … 7 more/);
	assert.doesNotMatch(result, /\[rule-8\]|\[wait-8\]|\[done-8\]|\[work-8\]/);
	assert.ok(lines.length <= 30);
	assert.ok(lines.every(line => line.length <= 250));
	assert.ok(result.length < 2300);
	assert.match(readText(presentGraph(raw), true), /rule-8/);
});

test("recorded rule scopes remain exact, including annotation endpoints", () => {
	const raw = carriedGraph();
	raw.edges.find(e => e.from === "protect")!.to = "wording";
	const result = readText(presentGraph(raw));
	assert.match(result, /Why: Keep protected.txt untouched[^\n]*\[src:session:protect\]\n      Applies to: Label for wording/);
	assert.doesNotMatch(result, /governs/);
	assert.equal(presentGraph(raw).connections.find(c => c.fromAnnotation === "protect")!.toAnnotation, "wording");
});

test("the mother thread precedes the focused endeavor and its hold", () => {
	const raw = carriedGraph();
	raw.nodes.push(node("child", "try"));
	raw.nodes.find(n => n.id === "hold")!.parent = "child";
	const result = readText(presentGraph(raw));
	assert.match(result, /^Mother thread: Label for main/);
	assert.match(result, /Endeavor: Label for child \[child\] — in progress · current/);
	assert.ok(result.indexOf("Label for main") < result.indexOf("Label for child"));
	assert.equal(result.match(/\[main\]/g)?.length, 1);
	assert.equal(result.match(/\[child\]/g)?.length, 1);
});

test("selected notes retain one handle and win their bounded group without repeating the endeavor handle", () => {
	const raw = carriedGraph();
	const selected = raw.nodes.find(n => n.id === "complete")!;
	const result = readText(presentGraph({ ...raw, nodes: [selected], boundaryNodes: raw.nodes.filter(n => n !== selected), omittedNodes: 7, totalNodes: 8 }));
	assert.match(result, /Rules in force \(3\):\n    \[complete\] Why: Do not reopen implementation/);
	assert.equal(result.match(/\[complete\]/g)?.length, 1);
	assert.equal(result.match(/\[main\]/g)?.length, 1);
	assert.doesNotMatch(result, /\[protect\]|\[readonly\]/);
});

test("long modifiers and extra scope targets are visibly truncated, never silently generalized", () => {
	const raw = carriedGraph();
	raw.nodes.find(n => n.id === "protect")!.intent = "Keep the shared interface unchanged while reviewing the earlier account and any proposed follow-up, only within the original limited scope.";
	raw.edges = raw.edges.filter(e => e.from !== "protect");
	for (const to of ["approved", "result", "wording"]) raw.edges.push({ from: "protect", to, relation: "governs", sources: ["scope:source"] });
	const view = presentGraph(raw), result = readText(view);
	assert.match(result, /Why: Keep the shared interface unchanged[^\n]*… \[src:session:protect\]\n      Applies to: Label for approved; Label for result; … 1 more/);
	assert.ok(result.split("\n").every(line => line.length <= 250));
	assert.match(readText(view, true), /only within the original limited scope/);
	assert.equal(view.connections.filter(c => c.fromAnnotation === "protect").length, 3);
});

test("selected/historical reads expose boundary and selection without implying current work", () => {
	const raw = carriedGraph();
	const view = presentGraph({ ...raw, historical: true, nodes: [raw.nodes.find(n => n.id === "hold")],
		boundaryNodes: [{ id: "main", kind: "try", parent: null, label: "Saved endeavor", state: "settled" }], omittedNodes: 7, totalNodes: 8 });
	const result = readText(view);
	assert.match(result, /^History · checkpoint=saved-now — earlier saved account, not current work/);
	assert.match(result, /Mother thread: Saved endeavor \[main\] — finished · recorded focus · name\/state only/);
	assert.match(result, /Recorded focus · in force: \[hold\]/);
	assert.match(result, /Selection: 1 records; 7 of 8 outside selection, 6 not loaded/);
	assert.match(result, /Context \(1\): name\/state only/);
	assert.doesNotMatch(result, /· current|Original request/);
	assert.match(result, /Why: The question remains unanswered[^\n]*\[src:session:hold\]/);
	assert.deepEqual(view.selected, ["hold"]);
	assert.deepEqual(view.focusPath, ["main"]);
	assert.equal(view.endeavors[0]!.summaryOnly, true);
});

test("current endeavor focus, missing purpose/focus, and boundary counts stay honest", () => {
	const raw = carriedGraph();
	raw.focus = "main";
	assert.equal(readText(presentGraph(raw)).match(/Label for main/g)?.length, 1);
	const result = readText(presentGraph({ ...raw, nodes: [node("orphan")], purpose: "missing", focus: "missing-focus", edges: [] }));
	assert.match(result, /Endeavor: account outside this view \[missing\]/);
	assert.match(result, /Focus: \[missing-focus\] — outside the loaded view/);
	assert.match(result, /parent not recorded in this view/);
	assert.match(readText(presentGraph({ nodes: [], omittedNodes: 10, totalNodes: 10 })), /No records loaded in this selection/);
});

test("quotation formatting is suppressed without rewriting intents or apostrophes", () => {
	const raw = carriedGraph();
	raw.nodes.find(n => n.id === "hold")!.intent = `Keep 'one' and ‘two’ unchanged; don't change the user's choice or the lead’s wording.`;
	const result = readText(presentGraph(raw));
	assert.match(result, /Keep one and two unchanged; don't change the user's choice or the lead’s wording/);
	assert.doesNotMatch(result, /'one'|‘two’/);
	assert.match(readText(presentGraph(raw), true), /'one' and ‘two’/);
});

test("empty and failed reads do not claim success or leak technical details by default", () => {
	assert.equal(readText(presentGraph(null)), "Mom has not saved an account of this work yet.");
	const view = presentGraph({ ...carriedGraph(), error: { message: "technical failure", trace: ["raw trace"] } });
	assert.match(readText(view), /^Mom could not update this account; last saved view only/);
	assert.doesNotMatch(readText(view), /\bCurrent\b|· current|technical failure|raw trace/);
	assert.match(readText(view, true), /technical failure/);
});
