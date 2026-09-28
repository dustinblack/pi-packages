import assert from "node:assert/strict";
import { test } from "node:test";
import { CHECKPOINT, LEGACY_CHECKPOINT, NOTICE, emptyUsage } from "../src/checkpoint.ts";
import { LiveFeed } from "../src/feed.ts";
import { setup, until, replacement, input, isMomRequest, deferred } from "./fixture.ts";

const snapshots = (h: Awaited<ReturnType<typeof setup>>) => h.runtime.session.sessionManager.getBranch().filter((e: any) => e.type === "custom" && e.customType === CHECKPOINT);
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("normal parent narrative updates Mom without bookkeeping; cached status and idle time are free", { timeout: 15000 }, async () => {
	const h = await setup(true);
	try {
		assert(h.tools.has("mom")); assert(!h.tools.has("tether"));
		await h.runtime.session.prompt("Keep the original goal while I investigate a tangent.");
		const manager = h.runtime.session.sessionManager;
		const lastLead = manager.getBranch().findLast((e: any) => e.type === "message" && e.message.role === "assistant")!;
		await until(() => {
			const branch = manager.getBranch(), cp = snapshots(h).at(-1) as any;
			return cp && branch.findIndex((e) => e.id === cp.data.cut.parent) >= branch.findIndex((e) => e.id === lastLead.id);
		}, "automatic observation through the lead's final message");
		const calls = h.api.requests.length, momCalls = h.requests().length;
		for (let i = 0; i < 3; i++) {
			const status = await h.tools.get("mom").execute("status", {}, undefined);
			assert.match(status.content[0].text, /Keep the original purpose/);
			await h.command("status");
		}
		await pause(400);
		assert.equal(h.api.requests.length, calls, "cached reads and idle time do not call a model");
		assert.equal(h.requests().length, momCalls);
		await h.runtime.session.reload(); await pause(300);
		assert.equal(h.requests().length, momCalls, "reload reconstructs source indexes without inference");
		assert.deepEqual(h.errors, []); assert.deepEqual(h.api.errors, []);
	} finally { await h.close(); }
});

test("pause/resume preserves pending direction and user corrections without an extra lead turn", { timeout: 15000 }, async () => {
	const h = await setup(true);
	try {
		await h.runtime.session.prompt("Keep recall and reminders."); await until(() => snapshots(h).length === 1);
		await h.command("pause");
		await h.runtime.session.prompt("Change only the notification presentation.");
		const parentCalls = h.api.requests.filter((r) => !isMomRequest(r)).length;
		await h.command("correct Keep  recall\nand reminders; only presentation changed.");
		await pause(250); assert.equal(h.requests().length, 1);
		assert.equal(h.api.requests.filter((r) => !isMomRequest(r)).length, parentCalls);
		await h.command("resume"); await until(() => snapshots(h).length === 2);
		assert.match(input(h.requests()[1]).userDirections.at(-1).text, /Keep  recall\nand reminders; only presentation changed/);
		assert(!input(h.requests()[1]).newEvents.includes("only presentation changed"));
		assert.match(input(h.requests()[1]).userHistory, /Keep recall and reminders/);
		assert.deepEqual(h.errors, []);
	} finally { await h.close(); }
});

test("an explicitly selected historical text checkpoint exposes its complete account without node IDs", { timeout: 15000 }, async () => {
	const h = await setup(true);
	try {
		await h.command("pause");
		await h.runtime.session.prompt("Preserve this earlier text account.");
		const manager = h.runtime.session.sessionManager, feed = new LiveFeed(manager);
		await feed.capture();
		const marker = "LEGACY_END_MARKER", snapshot = `${"Earlier complete account. ".repeat(40)}${marker}`;
		const checkpoint = manager.appendCustomEntry(LEGACY_CHECKPOINT, { version: 1, sessionId: manager.getSessionId(), snapshot, note: null,
			cut: feed.cut(), at: Date.now(), model: "fixture/fixture", usage: emptyUsage() });
		await h.runtime.session.reload(); await pause(300);
		const result = await h.tools.get("mom").execute("read", { graph: { checkpoint } }, undefined);
		assert.match(result.content[0].text, /Recorded details:/); assert.match(result.content[0].text, new RegExp(marker));
		assert.equal(result.details.data.legacySummary, snapshot); assert.equal(result.details.expandable, true);
		assert.equal(h.requests().length, 0, "historical reads stay inference-free");
	} finally { await h.close(); }
});

test("a sourced notice is appended once at a breakpoint without generating a lead turn", { timeout: 15000 }, async () => {
	const h = await setup(true);
	try {
		h.api.onUnscripted((request) => {
			if (!isMomRequest(request)) return { text: "I will delete the unowned file now." };
			const body = input(request);
			const trigger = /\[src:([^\]]+)\] [^\n]+ lead assistant/.exec(body.newEvents)?.[1];
			if (!trigger) return replacement(request); // User and assistant can arrive in separate batches.
			return replacement(request, { note: { text: "The user prohibited deleting unowned files.", obligationRef: body.original.ref, triggerRef: trigger } });
		});
		await h.runtime.session.prompt("Do not delete unowned files.");
		await until(() => h.runtime.session.sessionManager.getBranch().some((e: any) => e.customType === NOTICE), "notice delivery");
		const calls = h.api.requests.length;
		assert.equal(h.api.requests.filter((r) => !isMomRequest(r)).length, 1);
		assert.equal(h.runtime.session.isStreaming, false);
		await h.runtime.session.reload(); await pause(300);
		assert.equal(h.api.requests.length, calls);
		assert.equal(h.runtime.session.sessionManager.getBranch().filter((e: any) => e.customType === NOTICE).length, 1);
	} finally { await h.close(); }
});

test("tree navigation cancels stale inference and rebuilds only the selected branch", { timeout: 15000 }, async () => {
	const h = await setup(true), gate = deferred(), arrived = deferred(); let first = true;
	try {
		h.api.onUnscripted((request) => {
			if (!isMomRequest(request)) return { text: "Lead continued." };
			if (first) { first = false; arrived.resolve(); return { ...replacement(request), gate }; }
			return replacement(request);
		});
		await h.runtime.session.prompt("Abandoned branch request."); await arrived.promise;
		const user = h.runtime.session.getUserMessagesForForking()[0]; assert(user);
		await h.runtime.session.navigateTree(user.entryId, { summarize: false });
		await h.runtime.session.prompt("Selected branch request."); gate.resolve();
		await until(() => snapshots(h).length === 1, "new branch checkpoint");
		const body = input(h.requests().at(-1));
		assert.match(body.userDirections[0].text, /Selected branch request/);
		assert(!body.newEvents.includes("Selected branch request"));
		assert(!body.newEvents.includes("Abandoned branch request"));
		assert(!body.userHistory.includes("Abandoned branch request"));
		assert.deepEqual(h.errors, []);
	} finally { gate.resolve(); await h.close(); }
});
