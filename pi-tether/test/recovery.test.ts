import assert from "node:assert/strict";
import { test } from "node:test";
import { CHECKPOINT, NOTICE, loadState } from "../src/checkpoint.ts";
import { setup, until, input, replacement, isMomRequest, deferred } from "./fixture.ts";

const snapshots = (h: Awaited<ReturnType<typeof setup>>) => h.runtime.session.sessionManager.getBranch().filter((e: any) => e.customType === CHECKPOINT);

test("retry preserves its original coverage revision and processes a newer correction before notices", { timeout: 15000 }, async () => {
	const h = await setup(true), gate = deferred(); let calls = 0;
	try {
		h.api.onUnscripted((request) => {
			if (!isMomRequest(request)) return { text: "I will delete the file now." };
			calls++;
			if (calls === 1) return { error: 400 };
			if (calls === 2) {
				const body = input(request), trigger = /\[src:([^\]]+)\] [^\n]+ lead assistant/.exec(body.newEvents)![1];
				assert(!body.userDirections.some((event: any) => event.text.includes("Deletion is now authorized")));
				return replacement(request, { note: { text: "Do not delete the file.", obligationRef: body.original.ref, triggerRef: trigger } });
			}
			assert.match(input(request).userDirections.at(-1).text, /Deletion is now authorized/);
			assert(!input(request).newEvents.includes("Deletion is now authorized"));
			return { ...replacement(request), gate };
		});
		// The failed batch must contain both the user hold and the assistant claim.
		await h.command("pause");
		await h.runtime.session.prompt("Do not delete the file.");
		await h.command("resume");
		await until(() => calls === 1);
		await until(() => h.runtime.session.sessionManager.getBranch().some((e: any) => e.customType === "pi-tether.mom-attempt"));
		await h.command("correct Deletion is now authorized for this fixture file.");
		await until(() => calls === 3, "correction captured after staged retry");
		assert.equal(snapshots(h).length, 1);
		assert(!h.runtime.session.sessionManager.getBranch().some((e: any) => e.customType === NOTICE));
		const status = await h.tools.get("mom").execute("status", {}, undefined);
		assert.match(status.content[0].text, /updating|observation pending/);
		gate.resolve(); await until(() => snapshots(h).length === 2);
		assert(!h.runtime.session.sessionManager.getBranch().some((e: any) => e.customType === NOTICE));
	} finally { gate.resolve(); await h.close(); }
});

test("SDK persistence failure cannot become a committed checkpoint on same-process reload", { timeout: 15000 }, async () => {
	const h = await setup(); let mom = h.createMom();
	const manager: any = h.runtime.session.sessionManager;
	const persist = manager._persist;
	try {
		await h.runtime.session.prompt("Preserve the goal."); await mom.open(); await mom.update();
		const before = mom.checkpoint;
		await h.runtime.session.prompt("Keep this newer input pending after a storage failure.");
		manager._persist = () => { throw new Error("Injected SDK persistence failure"); };
		await assert.rejects(() => mom.update(), /Injected SDK persistence failure/);
		assert.equal(mom.checkpoint, before);
		assert.deepEqual(loadState(manager).checkpoint, before, "SDK mutates its branch before attempting disk persistence");
		manager._persist = persist; mom.close();
		mom = h.createMom(); await mom.open();
		assert.deepEqual(mom.checkpoint, before);
		await assert.rejects(() => mom.update(), /Reopen.*disk/);
		const calls = h.requests().length;
		mom.close();
		const canonical = h.sdk.SessionManager.open(h.parent);
		mom = h.createMom({ ctx: { ...h.context, sessionManager: canonical }, append: (type, data) => { canonical.appendCustomEntry(type, data); } });
		await mom.open(); await mom.update();
		assert.equal(h.requests().length, calls + 1);
		assert.match(input(h.requests().at(-1)).userDirections.at(-1).text, /Keep this newer input pending/);
		const cold = h.sdk.SessionManager.open(h.parent);
		assert.equal(loadState(cold).checkpoint?.cut.parent, mom.checkpoint?.cut.parent);
	} finally { manager._persist = persist; mom.close(); await h.close(); }
});
