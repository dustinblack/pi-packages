/** Reuse the repository's real Pi/HTTP harness; only remote model replies are scripted. */
import { rmSync } from "node:fs";
import { provider, sandbox, harness, deferred } from "../../pi-delegate/test/fixture.ts";
import { Mom } from "../src/mother.ts";
import { SidecarStore } from "../src/sidecar.ts";

/** Fresh sidecar read for assertions; the extension keeps its own instance. */
export const readSidecar = (h: any) => new SidecarStore(() => h.parent as string, h.runtime.session.sessionManager.getSessionId() as string).load();
export { deferred };

export const isMomRequest = (request: any) => request.tools?.some((t: any) => ["commit_graph", "inspect_evidence", "search_history"].includes(t.function?.name));
export function input(request: any) {
	const user = request.messages.findLast((m: any) => m.role === "user");
	return JSON.parse(typeof user.content === "string" ? user.content : user.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n"));
}
export function replacement(request: any, extra: Record<string, unknown> = {}) {
	const body = input(request);
	const ref = /\[src:([^\]]+)\]/.exec(body.newEvents)?.[1] ?? body.original.ref;
	const prior = body.graph.nodes?.find((node: any) => node.id === "main")?.sources ?? [];
	return { tool: { name: "commit_graph", arguments: { revision: body.graph.revision, purpose: "main", focus: "main",
		upsertNodes: [{ id: "main", kind: "try", parent: null, state: "active", label: "Main purpose", intent: "Keep the original purpose.", observed: "Lead continued.", actor: "lead", sources: [...new Set([...prior, ref])] }],
		unfinished: [], upsertEdges: [], removeEdges: [], merges: [], folds: [], removeNodes: [], supersessions: [],
		note: null, ...extra } } };
}
export async function until(predicate: () => unknown, message = "condition", ms = 8000) {
	const end = Date.now() + ms;
	while (!(await predicate())) {
		if (Date.now() > end) throw new Error(`Timed out waiting for ${message}`);
		await new Promise((resolve) => setTimeout(resolve, 15));
	}
}
export async function setup(automatic = false) {
	// Core tests need only Mom; load the UI extension for automatic lifecycle tests.
	const extension = automatic ? (await import("../src/index.ts")).default : undefined;
	const api = await provider(), box = sandbox(api.url);
	const commands = new Map<string, any>(), tools = new Map<string, any>();
	let context: any, activePi: any;
	api.onUnscripted((request) => isMomRequest(request) ? replacement(request) : { text: "Lead continued." });
	const h = await harness(box, undefined, { register: (pi: any) => {
		activePi = pi;
		pi.on("session_start", (_event: any, ctx: any) => { context = ctx; });
		if (extension) extension(new Proxy(pi, { get(target, key) {
			if (key === "getFlag") return (name: string) => name === "mom-model" ? "fixture/fixture" : name === "mom-interval-ms" ? "0" : target.getFlag(name);
			if (key === "registerCommand") return (name: string, value: any) => { commands.set(name, value); target.registerCommand(name, value); };
			if (key === "registerTool") return (value: any) => { tools.set(value.name, value); target.registerTool(value); };
			return target[key];
		} }));
	} });
	return { ...h, api, box, tools,
		get context() { return context; },
		createMom(overrides: Partial<ConstructorParameters<typeof Mom>[0]> = {}) { return new Mom({ ctx: context, model: "fixture/fixture",
			store: new SidecarStore(() => h.parent, context.sessionManager.getSessionId()), current: () => true, changed() {}, ...overrides }); },
		command: (args: string, ctx = context) => commands.get("mom").handler(args, ctx),
		requests: () => api.requests.filter(isMomRequest),
		async close() { await h.runtime.dispose(); await api.close(); rmSync(box.root, { recursive: true, force: true }); },
	};
}
