import assert from "node:assert/strict";
import { test } from "node:test";
import { widgetLines } from "../src/panel.ts";

test("widget shows each work node's state and current progress, not its rules", () => {
	const theme: any = { fg: (_color: string, text: string) => text, bold: (text: string) => text, strikethrough: (text: string) => `~${text}~` };
	const node = (id: string, parent: string | null, state: string, label: string, observed: string, annotations: any[] = []) =>
		({ id, parent, kind: "feature", state, label, intent: "", observed, sources: [], annotations });
	const rule = { id: "r", kind: "rule", state: "active", label: "Never touch KEEP.txt", intent: "Never touch KEEP.txt", observed: "", sources: [] };
	const work: any = { purpose: "main", focus: "fix", focusPath: ["main", "fix"], outside: [], endeavors: [
		node("main", null, "active", "Ship the formatter", "Two of three parts landed.", [rule]),
		node("fix", "main", "active", "Fix negative inputs", "Clamp is in; tests pending."),
		node("old", "main", "settled", "Scout NOTES.md", "Found two proposals."),
		node("wait", "main", "parked", "Decide wording", "Waiting on the user."),
	] };
	const lines = widgetLines({ status: "up to date", summary: "", work }, theme, 120).join("\n");
	assert.doesNotMatch(lines, /KEEP\.txt|Rule/);
	assert.match(lines, /Ship the formatter · in progress/);
	assert.match(lines, /Two of three parts landed\./);
	assert.match(lines, /Fix negative inputs · you are here\n.*Clamp is in; tests pending\./);
	assert.match(lines, /~Scout NOTES\.md~ · done/);
	assert.doesNotMatch(lines, /Found two proposals/, "finished work shows as done without its detail");
	assert.match(lines, /Decide wording · parked\n.*Waiting on the user\./);
});

test("catch-up widget suppresses the you-are-here marker until coverage is complete", () => {
	const theme: any = { fg: (_color: string, text: string) => text, bold: (text: string) => text, strikethrough: (text: string) => text };
	const work: any = { purpose: "main", focus: "main", focusPath: ["main"], outside: [], coverageComplete: false, endeavors: [
		{ id: "main", parent: null, kind: "feature", state: "active", label: "Saved work", intent: "Continue later.", observed: "Last saved state.", sources: [], annotations: [] },
	] };
	const partial = widgetLines({ status: "catching up", complete: false, summary: "", work }, theme, 100).join("\n");
	assert.doesNotMatch(partial, /you are here/);
	work.coverageComplete = true;
	const complete = widgetLines({ status: "up to date", complete: true, summary: "", work }, theme, 100).join("\n");
	assert.match(complete, /you are here/);
});

test("cached widget shows freshness and one advisory without source-ID clutter", () => {
	const theme: any = { fg: (_color: string, text: string) => text, bold: (text: string) => text, strikethrough: (text: string) => text };
	assert.deepEqual(widgetLines({ status: "caught up", summary: "# Purpose\nPreserve the return path. [src:session:entry]", note: "Keep user files untouched." }, theme, 100), [
		"", "Mom · caught up", "Preserve the return path.", "↳ Keep user files untouched.",
	]);
});
