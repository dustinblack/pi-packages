import assert from "node:assert/strict";
import { test } from "node:test";
import { CHECKPOINT } from "../src/checkpoint.ts";
import { setup, replacement, input, isMomRequest, deferred } from "./fixture.ts";

const checkpoints = (h: Awaited<ReturnType<typeof setup>>) => h.runtime.session.sessionManager.getBranch().filter((e: any) => e.type === "custom" && e.customType === CHECKPOINT);

test("fresh Mom contexts checkpoint automatically observed narrative and recover without replay calls", { timeout: 15000 }, async () => {
	const h = await setup();
	let mom = h.createMom();
	try {
		await h.runtime.session.prompt("Preserve the original purpose. Do not delete user files.");
		await mom.open(); await mom.update();
		assert.equal(checkpoints(h).length, 1);
		const first = mom.checkpoint!;
		assert(mom.graph.nodes.every(node => node.sources.length > 0));
		assert.equal(first.version, 4);
		mom.close(); mom = h.createMom(); await mom.open();
		assert.deepEqual(mom.checkpoint, first);
		await mom.update(); assert.equal(h.requests().length, 1, "restore with no narrative delta costs no model call");
		await h.runtime.session.prompt("Also investigate the failing route; return to the original purpose.");
		await mom.update();
		assert.equal(h.requests().length, 2);
		const body = input(h.requests()[1]);
		assert.match(body.userHistory, /Do not delete user files/);
		assert.match(body.userDirections[0].text, /Also investigate the failing route/);
		assert.match(body.newEvents, new RegExp(`\\[src:${body.userDirections[0].ref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]`));
		assert(!body.newEvents.includes("Also investigate the failing route"), "direction text appears once in the model payload");
		assert.equal(h.requests()[1].messages.length, 2, "no growing Mom conversation");
		assert(!h.requests()[1].tools.some((t: any) => ["bash", "edit", "write", "delegate", "tether"].includes(t.function.name)));
		assert.equal(mom.usage.calls, 2);
		assert.deepEqual(h.errors, []); assert.deepEqual(h.api.errors, []);
	} finally { mom.close(); await h.close(); }
});

test("one update can repair two rejected graph transactions before publishing", { timeout: 15000 }, async () => {
	const h = await setup(), mom = h.createMom(); let attempts = 0;
	try {
		await h.runtime.session.prompt("Preserve the original purpose.");
		h.api.onUnscripted((request) => {
			if (!isMomRequest(request)) return { text: "Lead continued." };
			if (attempts++ < 2) {
				const ref = input(request).original.ref;
				return replacement(request, { unfinished: [{ node: "main", label: "Main purpose", disposition: "carried", target: "main", sources: [ref] }] });
			}
			return replacement(request);
		});
		await mom.open(); await mom.update();
		assert.equal(h.requests().length, 3);
		assert.match(JSON.stringify(h.requests()[1].messages), /transaction closes no endeavor.*1\/2 repairs used/);
		assert.match(JSON.stringify(h.requests()[2].messages), /transaction closes no endeavor.*2\/2 repairs used/);
		assert.equal(checkpoints(h).length, 1); assert.equal(mom.error, undefined);
		assert.deepEqual(h.errors, []); assert.deepEqual(h.api.errors, []);
	} finally { mom.close(); await h.close(); }
});

test("fresh contexts keep cache affinity within one branch instance and reset with that instance", { timeout: 15000 }, async () => {
	const h = await setup(); let mom = h.createMom();
	const registry = h.context.modelRegistry, stream = registry.streamSimple.bind(registry), ids: string[] = [];
	registry.streamSimple = (model: any, context: any, options: any) => { ids.push(options.sessionId); return stream(model, context, options); };
	try {
		await h.runtime.session.prompt("Preserve this goal."); await mom.open(); await mom.update();
		await h.runtime.session.prompt("Attach this result to the same goal."); await mom.update();
		assert.equal(ids.length, 2); assert.equal(ids[0], ids[1], "fresh updates share cache affinity without sharing a conversation");
		mom.close(); mom = h.createMom(); await mom.open();
		await h.runtime.session.prompt("Continue on a reopened Mom instance."); await mom.update();
		assert.equal(ids.length, 3); assert.notEqual(ids[2], ids[1], "a new branch instance gets new cache affinity");
		assert(h.requests().every(request => request.messages.length === 2), "each update still has one fresh user context");
	} finally { mom.close(); await h.close(); }
});

test("checkpoint append failure retains the old snapshot/cursor and retries the same unconsumed batch", { timeout: 15000 }, async () => {
	const h = await setup(); let fail = false;
	const mom = h.createMom({ append(type, data) {
		if (fail && type === CHECKPOINT) throw new Error("Injected append failure");
		h.runtime.session.sessionManager.appendCustomEntry(type, data);
	} });
	try {
		await h.runtime.session.prompt("Preserve this goal."); await mom.open(); await mom.update();
		const before = mom.checkpoint;
		await h.runtime.session.prompt("Keep the worker result attached to that goal."); fail = true;
		await assert.rejects(() => mom.update(), /Injected append failure/);
		assert.equal(mom.checkpoint, before); assert.equal(checkpoints(h).length, 1);
		assert.equal(h.requests().length, 2, "storage failure does not cause a model repair call");
		fail = false; await mom.update();
		assert.equal(checkpoints(h).length, 2);
		assert.equal(input(h.requests()[1]).newEvents, input(h.requests()[2]).newEvents);
		assert.deepEqual(input(h.requests()[1]).userDirections, input(h.requests()[2]).userDirections);
		assert.equal(mom.usage.calls, 3, "failed attempt usage is retained");
	} finally { mom.close(); await h.close(); }
});

test("provider failure survives reload without losing the last checkpoint or new input", { timeout: 15000 }, async () => {
	const h = await setup(); let mom = h.createMom();
	try {
		await h.runtime.session.prompt("Keep every user constraint."); await mom.open(); await mom.update();
		const before = mom.checkpoint;
		await h.runtime.session.prompt("The new constraint is no deletion.");
		h.api.onUnscripted((request) => isMomRequest(request) ? { error: 400 } : { text: "Lead continued." });
		await assert.rejects(() => mom.update(), /Fixture provider failure/);
		assert.equal(mom.checkpoint, before); assert.equal(checkpoints(h).length, 1);
		mom.close(); await h.runtime.session.reload(); mom = h.createMom(); await mom.open();
		assert.deepEqual(mom.checkpoint, before); assert.equal(mom.usage.calls, 2);
		h.api.onUnscripted((request) => replacement(request));
		await mom.update();
		assert.match(input(h.requests().at(-1)).userDirections[0].text, /The new constraint is no deletion/);
		assert(!input(h.requests().at(-1)).newEvents.includes("The new constraint is no deletion"));
		assert.equal(checkpoints(h).length, 2); assert.equal(mom.usage.calls, 3);
	} finally { mom.close(); await h.close(); }
});

test("explicit history questions use bounded search and answer without filesystem tools", { timeout: 15000 }, async () => {
	const h = await setup(), mom = h.createMom();
	try {
		await h.runtime.session.prompt("Preserve worker returns because branches must rejoin their parent."); await mom.open(); await mom.update();
		let step = 0;
		h.api.onUnscripted((request) => {
			if (step++ === 0) return { tool: { name: "search_history", arguments: { query: "branches must rejoin" } } };
			assert.match(JSON.stringify(request.messages), /matches/);
			const body = input(request);
			if (step === 2) {
				assert.deepEqual(request.tools.map((t: any) => t.function.name), ["inspect_evidence"], "a successful search cannot be mistaken for inspected evidence");
				return { tool: { name: "inspect_evidence", arguments: { ref: body.original.ref, offset: 0, limit: 4000 } } };
			}
			return replacement(request, { answer: `The user required branches to rejoin their parent. [src:${body.original.ref}]` });
		});
		const answer = await mom.update("Why retain worker returns?");
		assert.match(answer!, /branches to rejoin/);
		assert.equal(h.requests().length, 4);
		assert(h.requests().every((r) => r.tools.every((t: any) => ["commit_graph", "inspect_evidence", "search_history"].includes(t.function.name))));
	} finally { mom.close(); await h.close(); }
});

for (const entryPoint of ["tool_result", "tool_call"]) test(`metadata search from ${entryPoint} recovers both sides inside the two-page budget`, { timeout: 15000 }, async () => {
	const h = await setup(), mom = h.createMom();
	try {
		await h.runtime.session.prompt("Check the formatter without changing user files.");
		const manager = h.runtime.session.sessionManager;
		const template = (manager.getBranch().find((e: any) => e.type === "message" && e.message.role === "assistant") as any).message;
		// Recorded history fixtures; this test exercises retrieval, not command execution.
		const call = manager.appendMessage({ ...template, content: [{ type: "toolCall", id: "verify", name: "bash", arguments: { command: "node verify.mjs; git status --short" } }], stopReason: "toolUse" });
		const result = manager.appendMessage({ role: "toolResult", toolCallId: "verify", toolName: "bash", isError: true,
			content: [{ type: "text", text: "7 assertions passed. fatal: not a git repository" }], timestamp: Date.now() });
		const callRef = `${manager.getSessionId()}:${call}:b0`, resultRef = `${manager.getSessionId()}:${result}`;
		await mom.open(); await mom.update();
		assert(!JSON.stringify(mom.graph).includes(resultRef), "the tool citation is not retained in the active graph");
		let round = 0;
		h.api.onUnscripted((request) => {
			if (round++ === 0) return { tool: { name: "search_history", arguments: { query: entryPoint === "tool_result" ? "isError=true" : "tool_call bash" } } };
			const content = request.messages.findLast((m: any) => m.role === "tool").content;
			const data = JSON.parse(typeof content === "string" ? content : content.map((b: any) => b.text).join("\n"));
			if (round === 2) {
				const ref = entryPoint === "tool_result" ? resultRef : callRef;
				assert.equal(data.matches[0].ref, ref);
				assert.equal(data.matches[0].kind, entryPoint);
				assert(!JSON.stringify(data).includes("7 assertions passed"), "search must not expose raw output");
				return { tool: { name: "inspect_evidence", arguments: { ref, offset: 0, limit: 4000 } } };
			}
			assert.equal(data.evidencePagesRemaining, 0);
			assert.equal(data.results.length, 2);
			assert.match(data.results.find((r: any) => r.ref === callRef).text, /node verify.mjs; git status/);
			assert.match(data.results.find((r: any) => r.ref === resultRef).text, /7 assertions passed/);
			assert(data.results.reduce((n: number, r: any) => n + r.text.length, 0) <= 4000);
			return replacement(request, { answer: `Assertions passed; Git failed. [src:${callRef}] [src:${resultRef}]` });
		});
		assert.match((await mom.update("What failed in the verification shell call?"))!, /Assertions passed; Git failed/);
		assert.equal(h.requests().length, 4);
		assert.deepEqual(h.api.errors, []);
	} finally { mom.close(); await h.close(); }
});

test("a result completing after session invalidation cannot publish a checkpoint", { timeout: 15000 }, async () => {
	const h = await setup(), gate = deferred(), arrived = deferred(); let current = true;
	const mom = h.createMom({ current: () => current });
	try {
		await h.runtime.session.prompt("Preserve the old branch."); await mom.open();
		h.api.onUnscripted((request) => { arrived.resolve(); return { ...replacement(request), gate }; });
		const work = mom.update(); await arrived.promise; current = false; gate.resolve();
		await assert.rejects(() => work, /superseded/);
		assert.equal(checkpoints(h).length, 0); assert.equal(mom.checkpoint, undefined);
	} finally { gate.resolve(); mom.close(); await h.close(); }
});
