/** Reuse the repository's real Pi/HTTP harness; only remote model replies are scripted. */
import { rmSync } from "node:fs";
import { provider, sandbox, harness, deferred } from "../../pi-delegate/test/fixture.ts";
import { Mom } from "../src/mother.ts";
import { SidecarStore } from "../src/sidecar.ts";

/** Fresh sidecar read for assertions; the extension keeps its own instance. */
export const readSidecar = (h: any) => new SidecarStore(() => h.parent as string, h.runtime.session.sessionManager.getSessionId() as string).load();
export { deferred };

export const isMomRequest = (request: any) => request.tools?.some((t: any) => ["commit_graph", "record_thread_map", "inspect_evidence", "search_history"].includes(t.function?.name));
export function input(request: any) {
	const user = request.messages.findLast((m: any) => m.role === "user");
	return JSON.parse(typeof user.content === "string" ? user.content : user.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n"));
}
export function replacement(request: any, extra: Record<string, unknown> = {}) {
	const body = input(request);
	if (body.chapterIds) return { tool: { name: "record_thread_map", arguments: { states: body.chapterIds.map((chapter: string) => ({ chapter,
		goal: [], decisions: [], artifacts: [], deadEnds: [], openQuestions: [], discrepancies: [] })) } } };
	const ref = /\[src:([^\]]+)\]/.exec(body.newEvents)?.[1] ?? body.original.ref;
	const previous = body.graph.nodes?.find((node: any) => node.id === "main"), prior = previous?.sources ?? [];
	return { tool: { name: "commit_graph", arguments: { focus: "main",
		upsertNodes: [{ id: "main", kind: "try", parent: null, state: "active", label: "Main purpose", intent: previous?.intent ?? body.original.text.slice(0, 1200), observed: "Lead continued.", actor: "lead", sources: [...new Set([...prior, ref])] }],
		unfinished: [], upsertEdges: [], removeEdges: [], merges: [], folds: [], removeNodes: [],
		note: null, ...extra } } };
}
export async function until(predicate: () => unknown, message = "condition", ms = 8000) {
	const end = Date.now() + ms;
	while (!(await predicate())) {
		if (Date.now() > end) throw new Error(`Timed out waiting for ${message}`);
		await new Promise((resolve) => setTimeout(resolve, 15));
	}
}
export async function setup(automatic = false, flagOverrides: Record<string, string> = {}) {
	// Core tests need only Mom; load the UI extension for automatic lifecycle tests.
	const extension = automatic ? (await import("../src/index.ts")).default : undefined;
	const api = await provider(), box = sandbox(api.url);
	const commands = new Map<string, any>(), tools = new Map<string, any>(), handlers = new Map<string, any[]>(), piEventHandlers = new Map<string, any[]>();
	let context: any, activePi: any;
	api.onUnscripted((request) => isMomRequest(request) ? replacement(request) : { text: "Lead continued." });
	const h = await harness(box, undefined, { register: (pi: any) => {
		activePi = pi;
		pi.on("session_start", (_event: any, ctx: any) => { context = ctx; });
		if (extension) extension(new Proxy(pi, { get(target, key) {
			if (key === "events") {
				const eventBus = target.events;
				return new Proxy(eventBus, { get(_events, eventKey) {
					if (eventKey === "on") return (name: string, value: any) => { piEventHandlers.set(name, [...(piEventHandlers.get(name) ?? []), value]); return eventBus.on(name, value); };
					return Reflect.get(eventBus, eventKey, eventBus);
				} });
			}
			if (key === "on") return (name: string, value: any) => { handlers.set(name, [...(handlers.get(name) ?? []), value]); return target.on(name, value); };
			if (key === "getFlag") return (name: string) => Object.prototype.hasOwnProperty.call(flagOverrides, name) ? flagOverrides[name]
				: name === "mom-model" ? "fixture/fixture" : name === "mom-interval-ms" ? "0" : target.getFlag(name);
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
		emitExtension: async (name: string, event: any, ctx = context) => { for (const handler of handlers.get(name) ?? []) await handler(event, ctx); },
		emitPiEvent: async (name: string, event: any) => { for (const handler of piEventHandlers.get(name) ?? []) await handler(event); },
		requests: () => api.requests.filter(isMomRequest),
		async close() { await h.runtime.dispose(); await api.close(); rmSync(box.root, { recursive: true, force: true }); },
	};
}
