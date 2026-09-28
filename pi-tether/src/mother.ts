import { randomUUID } from "node:crypto";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Message, Model } from "@earendil-works/pi-ai";
import { appendCheckpoint, checkpointTypes, emptyUsage, graphChange, isCheckpoint, loadState, quarantinedCheckpoint, sumUsage, type Checkpoint, type SavedCheckpoint, type Usage } from "./checkpoint.ts";
import { LiveFeed, isUserDirection, renderEvents, suffix, userHistory, type Cut } from "./feed.ts";
import { acceptGraph, MOM_PROMPT, momTools } from "./contract.ts";
import { emptyGraph, graphSlice, upgradeThreadGraph } from "./graph.ts";
import { flatSlice } from "./legacy-graph.ts";

export const DEFAULT_MODEL = "openai-codex/gpt-5.6-luna";
export const ATTEMPT = "pi-tether.mom-attempt";
export const CONTEXT_LIMIT = 90000;
export interface MomHost {
	ctx: ExtensionContext;
	model: string;
	append(type: string, data: unknown): void;
	current(): boolean;
	changed(): void;
}

/** Fresh model context per update. Mom owns the graph; working agents only read it. */
export class Mom {
	readonly feed: LiveFeed;
	checkpoint?: SavedCheckpoint;
	checkpointId?: string;
	private readonly initialGraph = emptyGraph();
	// Cache affinity across bounded updates, not a persistent conversation. Reset with the branch instance.
	private readonly cacheSessionId = randomUUID();
	get graph() { return this.checkpoint?.version === 4 ? this.checkpoint.graph
		: this.checkpoint?.version === 3 ? upgradeThreadGraph(this.checkpoint.graph) : this.initialGraph; }
	enabled = true;
	delivered?: string;
	usage = emptyUsage();
	error?: string;
	busy = false;
	more = false;
	coveredRevision = -1;
	private persistenceError?: string;
	private disposed = false;
	private controller?: AbortController;
	private committed = 0;
	private staged?: Awaited<ReturnType<LiveFeed["capture"]>> & { revision: number };

	constructor(private host: MomHost) { this.feed = new LiveFeed(host.ctx.sessionManager); }

	async open(): Promise<void> {
		const state = loadState(this.host.ctx.sessionManager);
		this.checkpoint = state.checkpoint;
		this.checkpointId = state.checkpointId;
		this.enabled = state.enabled;
		this.delivered = state.delivered;
		this.error = this.persistenceError = state.persistenceError;
		this.usage = state.checkpoint?.usage ?? emptyUsage();
		for (const entry of this.host.ctx.sessionManager.getBranch()) {
			if (entry.type === "custom" && entry.customType === ATTEMPT) {
				const data = entry.data as { sessionId?: string; usage?: Usage; at?: number };
				if (data?.sessionId === this.host.ctx.sessionManager.getSessionId() && data.usage && (data.at ?? 0) >= (this.checkpoint?.at ?? 0)) this.usage = data.usage;
			}
		}
		await this.feed.restore(this.checkpoint?.cut);
		const savedGraph = this.checkpoint && this.checkpoint.version !== 1 ? this.checkpoint.graph : this.graph;
		for (const item of [...savedGraph.nodes, ...savedGraph.edges]) for (const ref of item.sources) {
			if (!this.feed.byRef.has(ref)) throw new Error(`Checkpoint cites an unknown or unobserved source: ${ref}`);
		}
		this.committed = this.feed.events.length;
	}

	readGraph(options: { nodes?: string[]; depth?: number; checkpoint?: string } = {}) {
		let checkpoint = this.checkpoint, checkpointId = this.checkpointId;
		const manager = this.host.ctx.sessionManager;
		const entries = manager.getBranch().filter(e => e.type === "custom" && checkpointTypes.some(type => type === e.customType)
			&& isCheckpoint(e.data) && e.customType === checkpointTypes[e.data.version - 1]
			&& e.data.sessionId === manager.getSessionId() && !quarantinedCheckpoint(manager, e.id));
		if (options.checkpoint) {
			const entry = entries.find(e => e.id === options.checkpoint);
			if (!entry || entry.type !== "custom" || !isCheckpoint(entry.data)) throw new Error("Graph checkpoint is unavailable on this session's selected branch.");
			checkpoint = entry.data; checkpointId = entry.id;
		}
		const previous = entries[entries.findIndex(e => e.id === checkpointId) - 1];
		const previousGraph = previous?.type === "custom" && isCheckpoint(previous.data) && previous.data.version !== 1 ? previous.data.graph : null;
		const change = checkpoint && checkpoint.version !== 1
			? (checkpoint.version === 3 || checkpoint.version === 4) && checkpoint.change ? checkpoint.change : graphChange(previousGraph, checkpoint.graph) : undefined;
		const original = this.feed.events.find(e => e.actor === "lead" && e.kind === "user");
		const historical = Boolean(options.checkpoint && options.checkpoint !== this.checkpointId);
		// Current v3 reads use the lossless vocabulary upgrade. Explicit historical reads keep old kinds.
		const graph = checkpoint?.version === 4 ? checkpoint.graph : checkpoint?.version === 3
			? historical ? checkpoint.graph : upgradeThreadGraph(checkpoint.graph) : this.initialGraph;
		return { initialized: checkpoint?.version === 3 || checkpoint?.version === 4,
			legacySummary: checkpoint?.version === 1 ? checkpoint.snapshot : undefined,
			format: checkpoint?.version === 1 ? "text-v1" : checkpoint?.version === 2 ? "flat-v2" : checkpoint?.version === 3 && historical ? "threads-v3" : "endeavors-v4",
			savedFormat: checkpoint?.version === 3 ? "threads-v3" : checkpoint?.version === 4 ? "endeavors-v4" : checkpoint?.version === 2 ? "flat-v2" : "text-v1",
			checkpoint: checkpointId, previousCheckpoint: entries[entries.findIndex(e => e.id === checkpointId) - 1]?.id,
			at: checkpoint?.at, change, unfinished: checkpoint?.version === 3 || checkpoint?.version === 4 ? checkpoint.unfinished : undefined, historical,
			original: original ? { ref: original.ref, text: original.text } : null,
			...(checkpoint?.version === 2 ? flatSlice(checkpoint.graph, options.nodes, options.depth)
				: graphSlice(graph, options.nodes, options.depth)) };
	}

	private valid(cut: Cut): void {
		if (this.disposed || !this.host.current()) throw new Error("Mom update superseded by a session/branch change.");
		suffix(this.host.ctx.sessionManager, this.host.ctx.sessionManager.getLeafId(), cut.parent);
	}

	async update(question?: string, signal?: AbortSignal, revision = 0): Promise<string | undefined> {
		if (this.persistenceError) throw new Error(this.persistenceError);
		if (this.busy) throw new Error("Mom already has an update in flight.");
		if (this.disposed) throw new Error("Mom session is closed.");
		this.busy = true; this.error = undefined;
		this.controller = new AbortController();
		const started = performance.now();
		let attempt = emptyUsage();
		this.host.changed();
		try {
			this.staged ??= { ...await this.feed.capture(), revision };
			const batch = this.staged;
			this.valid(batch.cut);
			this.more = batch.more;
			if (!batch.events.length && !question && (!this.checkpoint || this.checkpoint.version === 3 || this.checkpoint.version === 4)) { this.coveredRevision = batch.revision; this.staged = undefined; return undefined; }
			const [provider, ...id] = this.host.model.split("/");
			const model = this.host.ctx.modelRegistry.find(provider, id.join("/"));
			if (!model) throw new Error(`Mom model unavailable: ${this.host.model}. No fallback selected.`);
			const newRefs = new Set(batch.events.map((e) => e.ref));
			const inspected = new Set<string>();
			let pages = 2;
			const original = this.feed.events.find((e) => e.actor === "lead" && e.kind === "user");
			const messages: Message[] = [{ role: "user", timestamp: Date.now(), content: JSON.stringify({
				original: original ? { ref: original.ref, text: original.text } : null,
				userHistory: userHistory(this.feed.events.slice(0, this.committed)), graph: this.graph,
				...(this.checkpoint?.version === 1 ? { legacySummary: this.checkpoint.snapshot } : {}),
				...(this.checkpoint?.version === 2 ? { legacyGraph: this.checkpoint.graph } : {}),
				userDirections: batch.events.filter(isUserDirection).map(event => ({ ref: event.ref, text: event.text ?? "" })),
				newEvents: renderEvents(batch.events, false), gaps: batch.gaps, pendingMore: batch.more,
				question: question ?? null, evidencePagesRemaining: pages,
			}) }];
			let rejected = 0;
			let mustInspect = false;
			const read = async (ref: string, offset: number, limit: number) => {
				try { const result = await this.feed.lookup(ref, offset, limit); inspected.add(ref); return result; }
				catch (error) { return { ref, error: String(error) }; }
			};
			for (let round = 0; round < 5; round++) {
				this.valid(batch.cut);
				if (MOM_PROMPT.length + JSON.stringify(messages).length > CONTEXT_LIMIT) throw new Error("Mom context exceeds 90,000 characters. Last checkpoint retained; no silent truncation.");
				const context = { systemPrompt: MOM_PROMPT, messages, tools: momTools(pages, mustInspect) };
				const options = { maxTokens: 6000, sessionId: this.cacheSessionId,
					signal: AbortSignal.any([this.controller.signal, AbortSignal.timeout(120000), ...(signal ? [signal] : [])]), maxRetryDelayMs: 1000 };
				const reply = model.api === "openai-codex-responses"
					? await this.host.ctx.modelRegistry.complete(model as Model<"openai-codex-responses">, context, { ...options, reasoningEffort: "low", toolChoice: "required",
						// The SDK defaults to parallel calls; this protocol accepts one operation.
						onPayload: (payload) => { (payload as { parallel_tool_calls: boolean }).parallel_tool_calls = false; },
					})
					: await this.host.ctx.modelRegistry.streamSimple(model, context, { ...options, reasoning: "low" }).result();
				attempt = sumUsage(attempt, { calls: 1, input: reply.usage.input, output: reply.usage.output,
					cacheRead: reply.usage.cacheRead, cacheWrite: reply.usage.cacheWrite, nominalCost: reply.usage.cost.total, elapsedMs: 0 });
				this.valid(batch.cut);
				const operations = reply.content.filter((b) => b.type === "toolCall");
				if (reply.stopReason !== "toolUse" || operations.length !== 1) throw new Error(reply.errorMessage ?? `Mom returned ${reply.stopReason}; expected one operation.`);
				const operation = operations[0];
				const args = operation.arguments;
				if (operation.name === "commit_graph") {
					if (mustInspect) throw new Error("Inspect an original source from the search before answering.");
					let next;
					try { next = acceptGraph(args, this.graph, this.checkpoint?.version === 3 || this.checkpoint?.version === 4 ? this.checkpointId : undefined, this.feed.byRef, newRefs, inspected, question); }
					catch (error) {
						if (rejected >= 2) throw error;
						rejected++;
						messages.push(reply, { role: "toolResult", toolCallId: operation.id, toolName: operation.name, isError: true,
							content: [{ type: "text", text: `Graph transaction rejected; last checkpoint unchanged. ${String(error)} Correct only the rejected fields and resubmit (${rejected}/2 repairs used).` }], timestamp: Date.now() });
						continue;
					}
					this.valid(batch.cut);
					attempt.elapsedMs = Math.round(performance.now() - started);
					const checkpoint: Checkpoint = { version: 4, sessionId: this.host.ctx.sessionManager.getSessionId(),
						graph: next.graph, change: graphChange(this.checkpoint?.version === 1 ? null : this.checkpoint?.graph ?? this.initialGraph, next.graph),
						note: next.note, unfinished: next.unfinished, cut: batch.cut, at: Date.now(), model: this.host.model,
						usage: sumUsage(this.usage, attempt) };
					// Persistence errors are not model-validation errors: never retry the write via another inference.
					try { appendCheckpoint(this.host.ctx.sessionManager, this.host.append, checkpoint); }
					catch (error) { this.persistenceError = loadState(this.host.ctx.sessionManager).persistenceError; throw error; }
					this.checkpoint = checkpoint; this.usage = checkpoint.usage;
					this.checkpointId = this.host.ctx.sessionManager.getLeafId() ?? undefined;
					this.coveredRevision = batch.revision;
					this.committed = this.feed.events.length; this.staged = undefined;
					attempt = emptyUsage();
					return next.answer;
				}
				let result: unknown;
				if (operation.name === "inspect_evidence" && pages > 0) {
					if (typeof args.ref !== "string" || typeof args.offset !== "number" || typeof args.limit !== "number" || !Number.isSafeInteger(args.offset) || args.offset < 0 || !Number.isSafeInteger(args.limit) || args.limit < 1 || args.limit > 4000) throw new Error("Invalid evidence request.");
					pages--;
					const paired = this.feed.pairedSource(args.ref);
					// Either entry point supplies the pair within one page's character budget.
					const companion = paired && !inspected.has(paired) && args.limit > 1 ? await read(paired, 0, Math.floor(args.limit / 2)) : undefined;
					const available = args.limit - (companion && "text" in companion ? companion.text.length : 0);
					const results = [await read(args.ref, args.offset, available)];
					if (companion) results.push(companion);
					mustInspect = false;
					result = { results, evidencePagesRemaining: pages };
				} else if (operation.name === "search_history" && pages > 0 && !mustInspect) {
					pages--;
					if (typeof args.query !== "string" || !args.query.trim() || args.query.length > 200) throw new Error("Search needs a phrase of 1–200 characters.");
					const found = await this.feed.search(args.query, AbortSignal.any([this.controller.signal, AbortSignal.timeout(120000), ...(signal ? [signal] : [])]));
					mustInspect = Boolean(question && found.matches.length && pages > 0);
					result = { ...found, limit: 5, evidencePagesRemaining: pages, originalSourceReadRequired: mustInspect };
				} else throw new Error(`Unavailable Mom operation: ${operation.name}`);
				messages.push(reply, { role: "toolResult", toolCallId: operation.id, toolName: operation.name, isError: false,
					content: [{ type: "text", text: JSON.stringify(result) }], timestamp: Date.now() });
			}
			throw new Error("Mom did not produce an accepted graph transaction within five calls. Last checkpoint retained.");
		} catch (error) {
			if (!this.disposed && this.host.current()) {
				this.error = String(error);
				if (attempt.calls) {
					attempt.elapsedMs = Math.round(performance.now() - started);
					this.usage = sumUsage(this.usage, attempt);
					try { if (!this.persistenceError) this.host.append(ATTEMPT, { sessionId: this.host.ctx.sessionManager.getSessionId(), at: Date.now(), usage: this.usage, error: this.error }); }
					catch { /* The original failure remains visible; no checkpoint/cursor was published. */ }
				}
			}
			throw error;
		} finally {
			this.busy = false;
			this.controller = undefined;
			if (!this.disposed && this.host.current()) this.host.changed();
		}
	}

	close(): void { this.disposed = true; this.controller?.abort(); }
}
