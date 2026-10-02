import assert from "node:assert/strict";
import { test } from "node:test";
import piRecap from "../src/index.ts";

const text = (value) => [{ type: "text", text: value }];
const user = (value, timestamp) => ({ role: "user", content: text(value), timestamp });
const assistant = (value, timestamp, stopReason = "stop") => ({
	role: "assistant", content: text(value), timestamp, stopReason,
});

function fixture(responseText) {
	const raw = "<tool_call><function=delegate>" + "raw transcript ".repeat(1500) + "</function></tool_call>";
	const messages = [
		user("We are building the integrated search pipeline.", 1),
		{ role: "bashExecution", command: "delegate", output: raw, timestamp: 2 },
		{ ...assistant("※ recap: commissioning three lanes", 3, "toolUse"), content: [
			...text("※ recap: commissioning three lanes"),
			{ type: "toolCall", id: "d1", name: "delegate", arguments: { task: "lane1_integration" } },
		] },
		{ role: "toolResult", content: text(raw), toolCallId: "d1", toolName: "delegate", timestamp: 4 },
		user("The assistant leaked raw calls: " + raw + " Please summarize the outcome.", 5),
		assistant("※ recap: <tool_call><function=delegate>another raw call</function></tool_call>", 6),
		assistant("Three lanes and a coherence review are running.", 7),
	];
	const entries = messages.map((message, i) => ({
		type: "message", id: String(i), parentId: i ? String(i - 1) : null, message,
	}));
	entries.push({ type: "custom_message", id: String(entries.length), parentId: String(entries.length - 1), customType: "debug", content: raw, timestamp: 8 });
	const commands = new Map();
	const widgets = [];
	const notices = [];
	const requests = [];
	piRecap({
		on() {},
		appendEntry() {},
		registerCommand(name, command) { commands.set(name, command); },
	});
	const ctx = {
		model: { provider: "fixture", id: "fixture" },
		sessionManager: { getBranch: () => entries, getLeafId: () => String(entries.length - 1) },
		modelRegistry: {
			complete(_model, context, options) {
				requests.push({ context, options });
				return Promise.resolve({ stopReason: "stop", content: text(responseText) });
			},
			getApiKeyAndHeaders: () => Promise.resolve({ ok: true, apiKey: "fixture" }),
		},
		ui: {
			setWidget(_name, content) {
				widgets.push(typeof content === "function" ? content(null, null).render(80) : content);
			},
			notify(message, kind) { notices.push({ message, kind }); },
		},
	};
	return { run: () => commands.get("recap").handler("test", ctx), widgets, notices, requests };
}

test("/recap test sends bounded conversational outcomes, never tool traffic", async () => {
	const run = fixture("Building the integrated search pipeline. Next, verify the three lanes.");
	await run.run();
	assert.equal(run.requests.length, 1, JSON.stringify(run.notices));
	const { context, options } = run.requests[0];
	assert.ok(options.maxTokens <= 192);
	const excerpt = JSON.stringify(context.messages);
	assert.ok(excerpt.length < 8000, `excerpt had ${excerpt.length} characters`);
	assert.match(excerpt, /integrated search pipeline/);
	assert.match(excerpt, /Please summarize the outcome/);
	assert.match(excerpt, /Three lanes and a coherence review are running/);
	assert.doesNotMatch(excerpt, /tool_call|function=delegate|raw transcript|commissioning three lanes|another raw call|lane1_integration|Assistant tool calls/);
	assert.match(run.widgets.at(-1)?.[0] ?? "", /Next, verify the three lanes/);
});

test("/recap test keeps overly long or raw model output out of the widget", async () => {
	const long = fixture("Planning work now. " + "More irrelevant detail ".repeat(100));
	await long.run();
	const lines = long.widgets.at(-1) ?? [];
	const shown = lines.join("\n");
	assert.ok(shown.startsWith("※ recap: Planning work now."), shown);
	assert.ok(lines.length <= 2, shown);
	assert.ok(lines.every((line) => [...line].length <= 80), shown);
	assert.doesNotMatch(shown, /<tool_call>/);

	const raw = fixture("<tool_call><function=delegate>raw call</function></tool_call>");
	await raw.run();
	assert.ok(raw.widgets.every((widget) => !widget?.[0]?.includes("<tool_call>")));
	assert.match(raw.notices.at(-1)?.message ?? "", /tool markup/i);
});
