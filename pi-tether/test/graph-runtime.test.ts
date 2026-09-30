import assert from "node:assert/strict";
import { test } from "node:test";
import { loadState } from "../src/checkpoint.ts";
import { SidecarStore } from "../src/sidecar.ts";
import { setup, input, isMomRequest, until, readSidecar } from "./fixture.ts";

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("agents read current neighborhoods, folded history and original sources without inference; cold restore preserves the compacted graph", { timeout: 15000 }, async () => {
	const h = await setup(true);
	const checkpoints = async () => (await readSidecar(h)).filter(r => r.type === "map" && r.data.snapshot);
	const read = async (args: unknown) => {
		const result = await h.tools.get("mom").execute("read", args, undefined);
		assert.match(result.content[0].text, /main|Original recorded evidence/);
		assert(!result.content[0].text.startsWith("{"), "English must precede selected details");
		if ((args as any).graph?.nodes?.length) {
			const publicView = JSON.parse(result.content[0].text.split("Recorded details:\n")[1]);
			assert(Array.isArray(publicView.endeavors)); assert.equal(publicView.nodes, undefined);
			assert(publicView.endeavors.every((n: any) => ["feature", "theory", "postulate", "try"].includes(n.kind)));
		} else if ((args as any).graph) {
			assert(!result.content[0].text.includes("Recorded details:"), "default maps do not dump records");
			assert(!result.content[0].text.includes('"sources":'), "source arrays require explicit selection");
			assert(!result.content[0].text.includes('"relation": "governs"'));
		}
		return result.details.data;
	};
	/** The durable snapshot lands in the sidecar before Mom publishes it in memory and before
	 * her update settles coverage, so a read immediately after until(checkpoints…) can race
	 * the publish window and return the empty "still catching up" view. Poll for the settled
	 * read the test means, then take it through read() with every original assertion. */
	const readCurrent = async (args: unknown) => {
		await until(async () => {
			const probe = await h.tools.get("mom").execute("read", args, undefined);
			return probe.details.data.coverageComplete === true;
		}, "settled current Mom read");
		return read(args);
	};
	try {
		h.api.onUnscripted((request) => {
			if (!isMomRequest(request)) return { text: "Recorded the research result; deferred wording remains open." };
			const body = input(request), ref = /\[src:([^\]]+)\]/.exec(body.newEvents)![1];
			const put = (id: string, kind: string, state: string, parent: string | null = "main") => ({
				id, kind, parent, state, label: id,
				intent: id === "main" ? body.graph.nodes.find((node: any) => node.id === "main")?.intent ?? body.original.text
					: id === "research" ? "Research returned with two findings" : id === "pending" ? "defer wording" : id === "hold" ? "No file edits" : id,
				observed: "Reported in the source.", actor: "lead", sources: [ref],
				purposeSource: id === "main" ? body.graph.nodes.find((node: any) => node.id === "main")?.purposeSource ?? body.original.ref : ref,
			});
			const edge = (from: string, relation: string, to: string) => ({ from, relation, to, sources: [ref] });
			return { tool: { name: "commit_graph", arguments: { revision: body.graph.revision, purpose: "main", focus: body.graph.revision ? "pending" : "research", note: null,
				unfinished: body.graph.revision ? [{ node: "pending", label: "pending", disposition: "carried", target: "main", sources: [ref] }] : [],
				upsertNodes: body.graph.revision ? [{ ...put("main", "try", "active", null), observed: "Research outcomes incorporated; wording remains parked.", sources: [...new Set([...body.graph.nodes.find((n: any) => n.id === "research").sources, ref])] }, { ...put("research", "try", "settled"), sources: [...new Set([...body.graph.nodes.find((n: any) => n.id === "research").sources, ref])] }]
					: [put("main", "try", "active", null), put("research", "try", "active"), put("finding_a", "observation", "settled", "research"), put("finding_b", "observation", "settled", "research"), put("pending", "try", "parked", "research"), put("hold", "rule", "active")],
				upsertEdges: body.graph.revision ? [] : [edge("research", "returns_to", "main"), edge("finding_a", "informs", "main"), edge("finding_a", "informs", "pending"), edge("finding_b", "informs", "research"), edge("hold", "governs", "main")],
				folds: body.graph.revision ? [{ thread: "research", reason: "Research returned; retain its outcome and links.", sources: [ref] }] : [],
				merges: [], removeEdges: [], removeNodes: [], supersessions: [],
			} } };
		});
		// Control capture boundaries, not wall-clock speed: parent and Mom are independent.
		await h.command("pause");
		await h.runtime.session.prompt("Keep the goal. Research returned with two findings; defer wording. No file edits.");
		await h.command("resume");
		await until(async () => (await checkpoints()).length === 1);
		const before = await readCurrent({ graph: {} }), saved = structuredClone(before);
		await h.command("pause");
		await h.runtime.session.prompt("Fold the completed research. Keep the wording obligation and no-edit constraint.");
		await h.command("resume");
		await until(async () => (await checkpoints()).length === 2);
		const calls = h.api.requests.length, current = await readCurrent({ graph: {} });
		assert.equal(current.nodes.length, 3); assert.equal(before.nodes.length, 6);
		assert.equal(current.change.before, 6); assert.equal(current.change.after, 3);
		assert.deepEqual(current.change.created, []);
		assert.deepEqual(current.change.retired.map((n: any) => n.id).sort(), ["finding_a", "finding_b", "research"]);
		assert(current.change.retired.every((n: any) => n.sources.length));
		assert.deepEqual(before, saved, "published graph results must remain immutable");
		assert.equal(current.nodes.find((n: any) => n.id === "pending").state, "parked");
		assert.equal(current.nodes.find((n: any) => n.id === "hold").state, "active");
		assert.equal(current.nodes.find((n: any) => n.id === "pending").parent, "main");
		assert.match(current.original.text, /Keep the goal/);
		const local = await read({ graph: { nodes: ["main"], depth: 0 } });
		assert.equal(local.nodes.length, 1);
		assert(local.boundaryNodes.some((n: any) => n.id === "pending"));
		const history = local.nodes[0].history;
		const old = await read({ graph: { checkpoint: history.checkpoint, nodes: history.nodes, depth: 0 } });
		assert.equal(old.historical, true); assert.equal(old.nodes.length, 5);
		const source = await read({ source: { ref: local.nodes[0].sources.at(-1) } });
		assert.match(source.text, /Fold the completed research/);
		await assert.rejects(() => read({ graph: {}, question: "Why?" }), /Choose one/);
		await assert.rejects(() => read({ graph: { checkpoint: "missing" } }), /couldn't read that saved view or source/);
		await h.runtime.session.reload(); await pause(300);
		const restored = await read({ graph: {} });
		assert.deepEqual(restored.nodes, current.nodes); assert.deepEqual(restored.edges, current.edges);
		assert.equal(restored.checkpoint, current.checkpoint);
		assert.equal(h.api.requests.length, calls, "graph/source/history reads and reload are inference-free");
		const cold = h.sdk.SessionManager.open(h.parent);
		const state = await loadState(new SidecarStore(() => h.parent, cold.getSessionId()), cold);
		assert(state.checkpoint);
		assert.deepEqual(state.checkpoint.graph.nodes, current.nodes);
		assert.deepEqual(state.checkpoint.unfinished, current.unfinished);
		assert.equal(current.unfinished[0].node, "pending");
		assert.equal(current.unfinished[0].disposition, "carried");
		assert.deepEqual(h.errors, []); assert.deepEqual(h.api.errors, []);
	} finally { await h.close(); }
});
