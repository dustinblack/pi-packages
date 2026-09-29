import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { setup, replacement, input, isMomRequest, deferred, readSidecar } from "./fixture.ts";
import { SidecarStore } from "../src/sidecar.ts";

const checkpoints = async (h: Awaited<ReturnType<typeof setup>>) => (await readSidecar(h)).filter(r => r.type === "map" && r.data.snapshot);
const stateHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const advisorReview = (needsReanalysis: number, action: "accept" | "expand" = "accept") => ({ status: "reviewed" as const, model: "kev-test",
	needsReanalysis, signals: { expand: needsReanalysis, contract: 0.02, redirect: 0.03, reorganize: 0.03 },
	action, probabilities: { accept: action === "accept" ? 0.9 : 0.02, expand: action === "expand" ? 0.9 : 0.02, contract: 0.02, redirect: 0.03, reorganize: 0.03 },
	confidence: 0.9, usage: { input: 20, output: 2 }, latencyMs: 3 });

test("fresh Mom contexts checkpoint automatically observed narrative and recover without replay calls", { timeout: 15000 }, async () => {
	const h = await setup();
	let mom = h.createMom();
	try {
		await h.runtime.session.prompt("Preserve the original purpose. Do not delete user files.");
		await mom.open(); await mom.update();
		assert.equal((await checkpoints(h)).length, 1);
		const first = mom.checkpoint!, coldHash = stateHash({ graph: first.graph, cut: first.cut });
		assert(mom.graph.nodes.every(node => node.sources.length > 0));
		mom.close(); mom = h.createMom(); await mom.open();
		assert.deepEqual(mom.checkpoint, first);
		assert.equal(stateHash({ graph: mom.checkpoint?.graph, cut: mom.checkpoint?.cut }), coldHash, "cold reopen restores the identical map and consumed cursor hash");
		await mom.update(); assert.equal(h.requests().length, 1, "restore with no narrative delta costs no model call");
		await h.runtime.session.prompt("Also investigate the failing route; return to the original purpose.");
		await mom.update();
		assert.equal(h.requests().length, 2);
		const body = input(h.requests()[1]);
		assert.equal(body.userHistory, undefined, "the session log is not reconstructed into every update");
		assert.match(body.contextBeforeBatch, /lead assistant/);
		assert.match(body.newEvents, /\[src:[^\]]+\].*lead user/s);
		assert.match(body.newEvents, /Also investigate the failing route/);
		assert.equal(body.userDirections, undefined, "new narrative is evidence, not a message-accounting ledger");
		assert.equal(h.requests()[1].messages.length, 2, "no growing Mom conversation");
		assert(!h.requests()[1].tools.some((t: any) => ["bash", "edit", "write", "delegate", "tether"].includes(t.function.name)));
		assert.equal(mom.usage.calls, 2);
		assert.deepEqual(h.errors, []); assert.deepEqual(h.api.errors, []);
	} finally { mom.close(); await h.close(); }
});

test("a low session-level review accepts Mom's draft without extra analysis", { timeout: 15000 }, async () => {
	const h = await setup(); let reviews = 0;
	const mom = h.createMom({ advisor: { model: "kev-test", threshold: 0.7, async review(input) {
		reviews++; assert.match(input.newEvidence, /Preserve this goal/); return advisorReview(0.12);
	} } });
	try {
		await h.runtime.session.prompt("Preserve this goal."); await mom.open(); await mom.update();
		assert.equal(reviews, 1); assert.equal(h.requests().length, 1);
		assert.equal(mom.checkpoint?.advisor?.status, "reviewed");
		assert.equal(mom.checkpoint?.advisor?.reexamined, false);
	} finally { mom.close(); await h.close(); }
});

test("a non-accept session-level decision triggers exactly one deeper Mom reconsideration", { timeout: 15000 }, async () => {
	const h = await setup(); let reviews = 0;
	const mom = h.createMom({ advisor: { model: "kev-test", threshold: 0.7, async review() { reviews++; return advisorReview(0.31, "expand"); } } });
	try {
		await h.runtime.session.prompt("Preserve this goal."); await mom.open(); await mom.update();
		assert.equal(reviews, 1); assert.equal(h.requests().length, 2, "advisor can add only one Mom call");
		assert.match(JSON.stringify(h.requests()[1].messages), /probabilistic session-level advisor requested one deeper reconsideration/);
		assert.equal(mom.checkpoint?.advisor?.reexamined, true);
		assert.equal(mom.usage.calls, 2);
	} finally { mom.close(); await h.close(); }
});

test("advisor failure is recorded but cannot block an otherwise valid Mom update", { timeout: 15000 }, async () => {
	const h = await setup();
	const mom = h.createMom({ advisor: { model: "kev-test", threshold: 0.7, async review() { throw new Error("advisor offline"); } } });
	try {
		await h.runtime.session.prompt("Preserve this goal."); await mom.open(); await mom.update();
		assert.equal(h.requests().length, 1);
		assert.equal(mom.checkpoint?.advisor?.status, "unavailable");
		assert.match(mom.checkpoint?.advisor?.status === "unavailable" ? mom.checkpoint.advisor.error : "", /advisor offline/);
	} finally { mom.close(); await h.close(); }
});

test("a rejected background proposal gets one aggregated repair and background exposes commit_graph only", { timeout: 15000 }, async () => {
	const h = await setup(), mom = h.createMom(); let attempts = 0;
	try {
		await h.runtime.session.prompt("Preserve the original purpose.");
		h.api.onUnscripted((request) => {
			if (!isMomRequest(request)) return { text: "Lead continued." };
			assert.deepEqual(request.tools.map((tool: any) => tool.function.name), ["commit_graph"]);
			if (attempts++ === 0) {
				const ref = input(request).original.ref;
				return replacement(request, { unfinished: [{ node: "main", label: "Main purpose", disposition: "carried", target: "main", sources: [ref] }] });
			}
			assert.match(JSON.stringify(request.messages), /transaction closes no endeavor.*Correct all reported defects.*1 model call remains/s);
			return replacement(request);
		});
		await mom.open(); await mom.update();
		assert.equal(h.requests().length, 2); assert.equal(mom.usage.calls, 2);
		assert.equal((await checkpoints(h)).length, 1); assert.equal(mom.error, undefined);
		assert.deepEqual(h.errors, []); assert.deepEqual(h.api.errors, []);
	} finally { mom.close(); await h.close(); }
});

test("background failure waits for new material, gaps the second deterministic failure, and refresh catches it up", { timeout: 15000 }, async () => {
	const h = await setup(), mom = h.createMom(); let reject = false;
	try {
		await h.runtime.session.prompt("Preserve the original purpose."); await mom.open(); await mom.update();
		h.api.onUnscripted((request) => {
			if (!isMomRequest(request)) return { text: "Lead continued." };
			if (!reject) return replacement(request);
			const ref = input(request).original.ref;
			return replacement(request, { unfinished: [{ node: "main", label: "Main purpose", disposition: "carried", target: "main", sources: [ref] }] });
		});
		await h.runtime.session.prompt("This range will fail deterministically."); reject = true;
		const before = h.requests().length;
		await assert.rejects(() => mom.update(), /closes no endeavor/);
		assert.equal(h.requests().length, before + 2); assert.equal(mom.failure?.failures, 1); assert.equal(mom.gaps.length, 0);
		await mom.update();
		assert.equal(h.requests().length, before + 2, "no newer boundary means no immediate retry");
		await h.runtime.session.prompt("Newer evidence must remain available after the skipped range.");
		await assert.rejects(() => mom.update(), /closes no endeavor/);
		assert.equal(h.requests().length, before + 4); assert.equal(mom.failure, undefined); assert.equal(mom.gaps.length, 1);
		assert.equal((await readSidecar(h)).filter(record => record.type === "map" && record.data.gap?.action === "open").length, 1);
		assert.equal(mom.detail().skippedEvidence.length, 1); assert.equal(mom.detail().sessionUsage.calls, before + 4);
		reject = false; await mom.update();
		assert.match(input(h.requests().at(-1)).newEvents, /Newer evidence must remain available/);
		const calls = h.requests().length;
		await mom.update(undefined, undefined, 0, true);
		assert.equal(h.requests().length, calls + 1); assert.equal(mom.gaps.length, 0);
		assert.match(input(h.requests().at(-1)).newEvents, /This range will fail deterministically/);
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

test("an accepted graph-identical update advances a compact durable cursor and cold reopen does not replay it", { timeout: 15000 }, async () => {
	const h = await setup(); let mom = h.createMom();
	try {
		await h.runtime.session.prompt("Preserve this goal."); await mom.open(); await mom.update();
		const firstId = mom.checkpointId;
		h.api.onUnscripted((request) => {
			if (!isMomRequest(request)) return { text: "Lead produced evidence that does not change the map." };
			const body = input(request);
			return { tool: { name: "commit_graph", arguments: { revision: body.graph.revision,
				purpose: body.graph.purpose, focus: body.graph.focus, note: null, unfinished: [],
				upsertNodes: [], upsertEdges: [], removeEdges: [], merges: [], folds: [], removeNodes: [], supersessions: [] } } };
		});
		await h.runtime.session.prompt("Record this routine continuation without changing the map.");
		await mom.update();
		const records = await readSidecar(h);
		assert.equal(records.filter(r => r.type === "map" && r.data.snapshot).length, 1, "the graph is not duplicated");
		const progress = records.filter(r => r.type === "map" && r.data.cut && !r.data.snapshot);
		assert.equal(progress.length, 1); assert.equal(progress[0].data.base, firstId);
		const acceptedCut = structuredClone(mom.checkpoint!.cut);
		mom.close(); await h.runtime.session.reload(); mom = h.createMom(); await mom.open();
		assert.deepEqual(mom.checkpoint?.cut, acceptedCut);
		const calls = h.requests().length;
		await mom.update();
		assert.equal(h.requests().length, calls, "cold reopen has no accepted evidence to replay");
	} finally { mom.close(); await h.close(); }
});

test("checkpoint append failure retains the old snapshot/cursor and retries the same unconsumed batch", { timeout: 15000 }, async () => {
	const h = await setup(); let fail = false;
	const durable = () => new SidecarStore(() => h.parent, h.runtime.session.sessionManager.getSessionId());
	const mom = h.createMom({ store: {
		load: async () => durable().load(),
		append: async (type, data) => {
			if (fail && type === "map" && data.snapshot) throw new Error("Injected append failure");
			return durable().append(type, data);
		},
	} });
	try {
		await h.runtime.session.prompt("Preserve this goal."); await mom.open(); await mom.update();
		const before = mom.checkpoint;
		await h.runtime.session.prompt("Keep the worker result attached to that goal."); fail = true;
		await assert.rejects(() => mom.update(), /Injected append failure/);
		assert.equal(mom.checkpoint, before); assert.equal((await checkpoints(h)).length, 1);
		assert.equal(mom.gaps.length, 0, "sidecar failure never advances or gaps evidence");
		assert.equal(h.requests().length, 2, "storage failure does not cause a model repair call");
		fail = false; await mom.update();
		assert.equal((await checkpoints(h)).length, 2);
		assert.equal(input(h.requests()[1]).newEvents, input(h.requests()[2]).newEvents);
		assert.equal(mom.usage.calls, 3, "failed attempt usage is retained");
	} finally { mom.close(); await h.close(); }
});

test("a sidecar failure while opening a deterministic gap skips nothing and retains newer evidence", { timeout: 15000 }, async () => {
	const h = await setup(); let failGap = false, reject = false;
	const durable = () => new SidecarStore(() => h.parent, h.runtime.session.sessionManager.getSessionId());
	const mom = h.createMom({ store: {
		load: async () => durable().load(),
		append: async (type, data) => {
			if (failGap && type === "map" && data.gap?.action === "open") throw new Error("Injected gap append failure");
			return durable().append(type, data);
		},
	} });
	try {
		await h.runtime.session.prompt("Preserve this goal."); await mom.open(); await mom.update();
		h.api.onUnscripted((request) => {
			if (!isMomRequest(request)) return { text: "Lead continued." };
			if (!reject) return replacement(request);
			const ref = input(request).original.ref;
			return replacement(request, { unfinished: [{ node: "main", label: "Main purpose", disposition: "carried", target: "main", sources: [ref] }] });
		});
		await h.runtime.session.prompt("Fail this exact range."); reject = true;
		await assert.rejects(() => mom.update(), /closes no endeavor/);
		const before = mom.checkpoint?.cut;
		await h.runtime.session.prompt("Newer evidence survives the failed gap write."); failGap = true;
		await assert.rejects(() => mom.update(), /Injected gap append failure/);
		assert.deepEqual(mom.checkpoint?.cut, before); assert.equal(mom.gaps.length, 0); assert.equal(mom.failure?.failures, 1);
		assert.equal((await readSidecar(h)).some(record => record.type === "map" && record.data.gap?.action === "open"), false);
		failGap = false; reject = false;
		await h.runtime.session.prompt("A later boundary releases the retained range."); await mom.update(); await mom.update();
		assert.match(input(h.requests().at(-1)).newEvents, /Newer evidence survives the failed gap write/);
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
		assert.equal(mom.checkpoint, before); assert.equal((await checkpoints(h)).length, 1);
		assert.equal(mom.failure, undefined); assert.equal(mom.gaps.length, 0, "provider outage is not a deterministic evidence failure");
		mom.close(); await h.runtime.session.reload(); mom = h.createMom(); await mom.open();
		assert.deepEqual(mom.checkpoint, before); assert.equal(mom.usage.calls, 2);
		h.api.onUnscripted((request) => replacement(request));
		await mom.update();
		assert.match(input(h.requests().at(-1)).newEvents, /The new constraint is no deletion/);
		assert.equal((await checkpoints(h)).length, 2); assert.equal(mom.usage.calls, 3);
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

test("zero-result search keeps retry-only state through an invalid retry and still answers within five calls", { timeout: 15000 }, async () => {
	const h = await setup(), mom = h.createMom();
	try {
		await h.runtime.session.prompt("Preserve the exact marker branches rejoin."); await mom.open(); await mom.update();
		let round = 0;
		h.api.onUnscripted((request) => {
			const body = input(request), step = round++;
			if (step === 0) return { tool: { name: "search_history", arguments: { query: "definitely absent marker" } } };
			if (step === 1) {
				assert.deepEqual(request.tools.map((t: any) => t.function.name), ["search_history"]);
				return { tool: { name: "search_history", arguments: { query: "another equally long marker" } } };
			}
			if (step === 2) {
				assert.deepEqual(request.tools.map((t: any) => t.function.name), ["search_history"]);
				assert.match(JSON.stringify(request.messages), /No metadata search was consumed; 1 remain/);
				assert.match(JSON.stringify(request.messages), /3 model calls remain/);
				return { tool: { name: "search_history", arguments: { query: "branches rejoin" } } };
			}
			if (step === 3) {
				assert.deepEqual(request.tools.map((t: any) => t.function.name), ["inspect_evidence"]);
				return { tool: { name: "inspect_evidence", arguments: { ref: body.original.ref, offset: 0, limit: 4000 } } };
			}
			return replacement(request, { answer: `The exact marker was preserved. [src:${body.original.ref}]` });
		});
		assert.match((await mom.update("What exact marker was preserved?"))!, /exact marker/);
		assert.equal(round, 5); assert.equal(h.requests().length, 6);
	} finally { mom.close(); await h.close(); }
});

test("metadata search and source reads enforce independent two-operation budgets", { timeout: 15000 }, async () => {
	for (const mode of ["search", "read"] as const) {
		const h = await setup(), mom = h.createMom();
		try {
			await h.runtime.session.prompt("Keep the budget marker."); await mom.open(); await mom.update();
			let round = 0;
			h.api.onUnscripted((request) => {
				const ref = input(request).original.ref;
				round++;
				if (mode === "search") return { tool: { name: "search_history", arguments: { query: round === 1 ? "zzzzmissingone" : round === 2 ? "☃" : "x" } } };
				return { tool: { name: "inspect_evidence", arguments: { ref, offset: 0, limit: 100 } } };
			});
			await assert.rejects(() => mom.update("zzzzquery"), /Unavailable Mom operation/);
			assert.equal(round, 3);
		} finally { mom.close(); await h.close(); }
	}
});

test("an invalid long search is repairable and consumes a model call but no search", { timeout: 15000 }, async () => {
	const h = await setup(), mom = h.createMom();
	try {
		await h.runtime.session.prompt("Keep this marker."); await mom.open(); await mom.update();
		let round = 0;
		h.api.onUnscripted((request) => {
			const body = input(request), step = round++;
			if (step === 0) return { tool: { name: "search_history", arguments: { query: "x".repeat(81) } } };
			if (step === 1) {
				assert.match(JSON.stringify(request.messages), /No metadata search was consumed; 2 remain/);
				assert.match(JSON.stringify(request.messages), /4 model calls remain/);
				return { tool: { name: "search_history", arguments: { query: "Keep this marker" } } };
			}
			if (step === 2) return { tool: { name: "inspect_evidence", arguments: { ref: body.original.ref, offset: 0, limit: 4000 } } };
			return replacement(request, { answer: `The marker is recorded. [src:${body.original.ref}]` });
		});
		assert.match((await mom.update("Where is the marker?"))!, /marker is recorded/);
		assert.equal(round, 4);
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
				assert.equal(data.matches[0].ref, resultRef, "tool pairs deduplicate toward the observed result");
				assert.equal(data.matches[0].pairedRef, callRef);
				assert.equal(data.matches[0].kind, "tool_result");
				assert(!JSON.stringify(data).includes("7 assertions passed"), "search must not expose raw output");
				return { tool: { name: "inspect_evidence", arguments: { ref: resultRef, offset: 0, limit: 4000 } } };
			}
			assert.equal(data.evidencePagesRemaining, 1, "metadata search does not consume source-read pages");
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
		assert.equal((await checkpoints(h)).length, 0); assert.equal(mom.checkpoint, undefined);
		assert.equal(mom.failure, undefined); assert.equal(mom.gaps.length, 0, "session invalidation never skips evidence");
	} finally { gate.resolve(); mom.close(); await h.close(); }
});
