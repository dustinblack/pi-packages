import assert from "node:assert/strict";
import { test } from "node:test";
import { LEAD_BEHAVIOR_SECTION } from "../src/index.ts";
import { isMomRequest, setup } from "./fixture.ts";

function text(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content.filter((block: any) => block?.type === "text").map((block: any) => block.text).join("\n");
}

function leadSystemPrompt(h: Awaited<ReturnType<typeof setup>>, prompt: string): string {
	const request = h.api.requests.find((candidate: any) => !isMomRequest(candidate) &&
		text(candidate.messages.findLast((message: any) => message.role === "user")?.content) === prompt);
	assert(request, `missing lead request for ${JSON.stringify(prompt)}`);
	return request.messages.filter((message: any) => message.role === "system").map((message: any) => text(message.content)).join("\n");
}

test("Mom adds pivot and scoped-assent instructions only while enabled", { timeout: 20000 }, async () => {
	const h = await setup(true);
	try {
		const enabledPrompt = "Capture the enabled lead instructions.";
		await h.runtime.session.prompt(enabledPrompt);
		const enabledSystem = leadSystemPrompt(h, enabledPrompt);
		assert.match(enabledSystem, /Treat every direction change as an implicit park of interrupted work/);
		assert.match(enabledSystem, /without asking for confirmation, announcing the parking, or slowing the user down/);
		assert.match(enabledSystem, /Surface parked work only at session start or when current work collides with it/);
		assert.match(enabledSystem, /clear, scoped assent such as “yes, note that” or “yes, let's go down that path”/);
		assert.match(enabledSystem, /check the recorded session evidence and follow the latest clear direction/);
		assert.equal(enabledSystem.split(LEAD_BEHAVIOR_SECTION).length - 1, 1, "the named section appears exactly once");

		await h.command("pause");
		const calls = h.requests().length;
		const disabledPrompt = "Capture the disabled lead instructions.";
		await h.runtime.session.prompt(disabledPrompt);
		const disabledSystem = leadSystemPrompt(h, disabledPrompt);
		assert.doesNotMatch(disabledSystem, /implicit park of interrupted work/);
		assert.doesNotMatch(disabledSystem, /clear, scoped assent/);
		assert.equal(h.requests().length, calls, "paused Mom neither injects instructions nor runs inference");
	} finally { await h.close(); }
});
