import assert from "node:assert/strict";
import { test } from "node:test";
import { SettingsManager } from "@earendil-works/pi-coding-agent";
import { FOCUS_KEY, MomConversationView } from "../src/panel.ts";

const theme: any = {
	fg: (_color: string, text: string) => text,
	bg: (_color: string, text: string) => text,
	bold: (text: string) => text,
	italic: (text: string) => text,
	strikethrough: (text: string) => text,
	getThinkingBorderColor: () => "",
};

test("Alt+T switches to Mom, asks from her map, and returns without touching lead context or draft", async () => {
	assert.equal(FOCUS_KEY, "alt+t");
	const leadContext = [{ role: "user", content: "Keep this lead context" }, { role: "assistant", content: "Still here" }];
	const before = JSON.stringify(leadContext);
	const leadDraft = "unfinished lead editor draft";
	let closed = false, asked = "", savedMomDraft = "";
	const tui: any = { terminal: { rows: 24, columns: 100 }, requestRender() {}, hasOverlay: () => true };
	const view = new MomConversationView({
		view: () => ({ status: "up to date · last saved now", summary: "", complete: true, work: {
			purpose: "main", motherThread: "main", focus: "main", focusPath: ["main"], outside: [], orientation: "Shipping the dedicated Mom view.", coverageComplete: true,
			endeavors: [{ id: "main", parent: null, kind: "feature", state: "active", label: "Ship dedicated Mom view", intent: "Ship it", observed: "Map-backed work is ready.", sources: [], annotations: [] }],
		} as any }),
		ask: async (question) => { asked = question; return "From the saved map: the dedicated Mom view is the current endeavor."; },
	}, theme, tui, { matches: () => false } as any, SettingsManager.inMemory(), () => { closed = true; }, "", (draft) => { savedMomDraft = draft; });

	for (const char of "What is current?") view.handleInput(char);
	view.handleInput("\r");
	await new Promise(resolve => setTimeout(resolve, 0));
	const screen = view.render(100).join("\n");
	assert.equal(asked, "What is current?");
	assert.match(screen, /Ship dedicated Mom view/);
	assert.match(screen, /From the saved map: the dedicated Mom view is the current endeavor/);
	assert.equal(JSON.stringify(leadContext), before, "Mom Q&A never enters the lead transcript");
	assert.equal(leadDraft, "unfinished lead editor draft", "the lead editor draft is retained outside the overlay");
	view.handleInput("\x1b");
	assert.equal(closed, true);
	view.dispose();
	assert.equal(savedMomDraft, "");
});
