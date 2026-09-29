import { randomUUID } from "node:crypto";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Message, Model } from "@earendil-works/pi-ai";
import type { MomStore } from "./sidecar.ts";
import type { AdvisorRecord, SessionAdvisor } from "./advisor.ts";
import { branchCheckpoints, emptyUsage, graphChange, loadState, sumUsage, type Checkpoint, type Usage } from "./checkpoint.ts";
import { LiveFeed, renderEvent, renderEvents, suffix, type Cut } from "./feed.ts";
import { acceptGraph, MOM_PROMPT, momTools, validateSearchQuery } from "./contract.ts";
import { emptyGraph, graphSlice } from "./graph.ts";

export const DEFAULT_MODEL = "openai-codex/gpt-5.6-luna";
export const CONTEXT_LIMIT = 90000;
export interface MomHost {
	ctx: ExtensionContext;
	model: string;
	advisor?: SessionAdvisor;
	/** Durable state lives beside the session transcript, never inside it. */
	store: MomStore;
	current(): boolean;
	changed(): void;
}

/** Fresh model context per update. Mom owns the graph; working agents only read it. */
export class Mom {
	readonly feed: LiveFeed;
	checkpoint?: Checkpoint;
	checkpointId?: string;
	private readonly initialGraph = emptyGraph();
	// Cache affinity across bounded updates, not a persistent conversation. Reset with the branch instance.
	private readonly cacheSessionId = randomUUID();
	get graph() { return this.checkpoint?.graph ?? this.initialGraph; }
	enabled = true;
	delivered?: string;
	usage = emptyUsage();
	error?: string;
	busy = false;
	more = false;
	waitingForWorkers = false;
	coveredRevision = -1;
	private disposed = false;
	private controller?: AbortController;
	private committed = 0;
	private checkpoints: { id: string; data: Checkpoint }[] = [];
	private staged?: Awaited<ReturnType<LiveFeed["capture"]>> & { revision: number };

	constructor(private host: MomHost) { this.feed = new LiveFeed(host.ctx.sessionManager); }

	async open(): Promise<void> {
		const state = await loadState(this.host.store, this.host.ctx.sessionManager);
		this.checkpoint = state.checkpoint;
		this.checkpointId = state.checkpointId;
		this.enabled = state.enabled;
		this.delivered = state.delivered;
		this.usage = state.usage ?? state.checkpoint?.usage ?? emptyUsage();
		await this.feed.restore(this.checkpoint?.cut);
		if (this.checkpoint) for (const item of [...this.checkpoint.graph.nodes, ...this.checkpoint.graph.edges]) for (const ref of item.sources) {
			if (!this.feed.byRef.has(ref)) throw new Error(`Checkpoint cites an unknown or unobserved source: ${ref}`);
		}
		this.committed = this.feed.events.length;
		this.checkpoints = branchCheckpoints(await this.host.store.load(), new Set(this.host.ctx.sessionManager.getBranch().map(e => e.id)));
	}

	readGraph(options: { nodes?: string[]; depth?: number; checkpoint?: string } = {}) {
		let checkpoint = this.checkpoint, checkpointId = this.checkpointId;
		if (options.checkpoint) {
			const entry = this.checkpoints.find(c => c.id === options.checkpoint);
			if (!entry) throw new Error("Graph checkpoint is unavailable on this session's selected branch.");
			checkpoint = entry.data; checkpointId = entry.id;
		}
		const all = [...this.checkpoints].sort((a, b) => a.data.at - b.data.at);
		const index = all.findIndex(c => c.id === checkpointId);
		const previous = index > 0 ? all[index - 1] : undefined;
		const original = this.feed.events.find(e => e.actor === "lead" && e.kind === "user");
		const historical = Boolean(options.checkpoint && options.checkpoint !== this.checkpointId);
		return { initialized: Boolean(checkpoint), format: "endeavors-v4",
			checkpoint: checkpointId, previousCheckpoint: previous?.id, at: checkpoint?.at,
			change: checkpoint ? checkpoint.change ?? graphChange(previous?.data.graph ?? null, checkpoint.graph) : undefined,
			unfinished: checkpoint?.unfinished, historical,
			original: original ? { ref: original.ref, text: original.text } : null,
			...(checkpoint ? graphSlice(checkpoint.graph, options.nodes, options.depth) : graphSlice(this.initialGraph, options.nodes, options.depth)) };
	}

	private valid(cut: Cut): void {
		if (this.disposed || !this.host.current()) throw new Error("Mom update superseded by a session/branch change.");
		suffix(this.host.ctx.sessionManager, this.host.ctx.sessionManager.getLeafId(), cut.parent);
	}

	async update(question?: string, signal?: AbortSignal, revision = 0): Promise<string | undefined> {
		if (this.busy) throw new Error("Mom already has an update in flight.");
		if (this.disposed) throw new Error("Mom session is closed.");
		this.busy = true; this.error = undefined;
		this.controller = new AbortController();
		const started = performance.now();
		let attempt = emptyUsage();
		let advisor: AdvisorRecord | undefined;
		this.host.changed();
		try {
			if (!this.staged) this.staged = { ...await this.feed.capture(24000, true), revision };
			else if (this.waitingForWorkers) {
				const used = renderEvents(this.staged.events).length;
				const next = await this.feed.capture(24000 - used, true);
				this.staged = { events: [...this.staged.events, ...next.events], cut: next.cut,
					gaps: [...new Set([...this.staged.gaps, ...next.gaps])], more: this.staged.more || next.more, revision };
			}
			const batch = this.staged;
			this.valid(batch.cut);
			this.more = batch.more;
			if (!question && this.feed.hasRunningWorkers) {
				// Keep the whole settled lead batch pending. The delegate-settled event retries it
				// with the worker's complete transcript; no inference observes a partial run.
				this.waitingForWorkers = true;
				return undefined;
			}
			this.waitingForWorkers = false;
			if (!batch.events.length && !question) { this.coveredRevision = batch.revision; this.staged = undefined; return undefined; }
			const [provider, ...id] = this.host.model.split("/");
			const model = this.host.ctx.modelRegistry.find(provider, id.join("/"));
			if (!model) throw new Error(`Mom model unavailable: ${this.host.model}. No fallback selected.`);
			const newRefs = new Set(batch.events.map((e) => e.ref));
			const inspected = new Set<string>();
			let readPages = 2, searches = 2;
			let emptySearch: string | undefined;
			let searchRetryOnly = false;
			const original = this.feed.events.find((e) => e.actor === "lead" && e.kind === "user");
			// The map is current state; the session log is history. Include only one boundary
			// event so a short assent can resolve the preceding proposal, then use evidence tools.
			const prior = this.feed.events.slice(0, this.committed).findLast((e) => e.actor === "lead" && Boolean(e.text) && ["assistant", "tool_call"].includes(e.kind));
			const messages: Message[] = [{ role: "user", timestamp: Date.now(), content: JSON.stringify({
				original: original ? { ref: original.ref, text: original.text } : null,
				graph: this.graph, contextBeforeBatch: prior ? renderEvent(prior) : null,
				newEvents: renderEvents(batch.events), gaps: batch.gaps, pendingMore: batch.more,
				question: question ?? null, evidencePagesRemaining: readPages, metadataSearchesRemaining: searches,
			}) }];
			let mustInspect = false;
			const read = async (ref: string, offset: number, limit: number) => {
				try { const result = await this.feed.lookup(ref, offset, limit); inspected.add(ref); return result; }
				catch (error) { return { ref, error: String(error) }; }
			};
			for (let round = 0; round < 5; round++) {
				this.valid(batch.cut);
				if (MOM_PROMPT.length + JSON.stringify(messages).length > CONTEXT_LIMIT) throw new Error("Mom context exceeds 90,000 characters. Last checkpoint retained; no silent truncation.");
				const availableSearches = question && readPages === 0 ? 0 : searches;
				const context = { systemPrompt: MOM_PROMPT, messages, tools: momTools(readPages, availableSearches, mustInspect, searchRetryOnly) };
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
				const callsRemaining = 4 - round;
				if (operation.name === "commit_graph") {
					if (searchRetryOnly) throw new Error("Retry the zero-result search with a shorter literal phrase before any other operation.");
					if (mustInspect) throw new Error("Inspect an original source from the search before answering.");
					let next;
					try { next = acceptGraph(args, this.graph, this.checkpointId, this.feed.byRef, newRefs, inspected, question); }
					catch (error) {
						if (callsRemaining === 0) throw error;
						messages.push(reply, { role: "toolResult", toolCallId: operation.id, toolName: operation.name, isError: true,
							content: [{ type: "text", text: `Graph transaction rejected; last checkpoint unchanged. ${String(error)} Correct only the rejected fields and resubmit. ${callsRemaining} model call${callsRemaining === 1 ? "" : "s"} remain in this update.` }], timestamp: Date.now() });
						continue;
					}
					this.valid(batch.cut);
					if (!question && this.host.advisor && !advisor) {
						const reviewStarted = performance.now();
						try {
							const review = await this.host.advisor.review({ current: this.graph, proposed: next.graph,
								newEvidence: renderEvents(batch.events), pendingMore: batch.more },
								AbortSignal.any([this.controller.signal, ...(signal ? [signal] : [])]));
							const reexamined = review.action !== "accept" || review.needsReanalysis >= this.host.advisor.threshold;
							advisor = { ...review, reexamined };
							if (reexamined) {
								if (callsRemaining === 0) throw new Error("Mom's advisor requested reconsideration, but the five-call update budget is exhausted.");
								messages.push(reply, { role: "toolResult", toolCallId: operation.id, toolName: operation.name, isError: true,
									content: [{ type: "text", text: `Candidate not saved. A probabilistic session-level advisor requested one deeper reconsideration (p=${review.needsReanalysis.toFixed(3)}; likely action=${review.action}; action probabilities=${JSON.stringify(review.probabilities)}). Review the whole account for material expansion, contraction, path change, or reorganization. This is advice, not a gate or per-message checklist. ${callsRemaining} model call${callsRemaining === 1 ? "" : "s"} remain; keep the candidate unchanged if the session evidence still supports it.` }], timestamp: Date.now() });
								continue;
							}
						} catch (error) {
							if (this.controller.signal.aborted || signal?.aborted) throw error;
							advisor = { status: "unavailable", model: this.host.advisor.model, error: String(error),
								latencyMs: Math.round(performance.now() - reviewStarted), reexamined: false };
						}
					}
					this.valid(batch.cut);
					attempt.elapsedMs = Math.round(performance.now() - started);
					const acceptedAt = Date.now(), acceptedUsage = sumUsage(this.usage, attempt);
					// A graph-identical acceptance still advances durable evidence coverage. Keep
					// that compact by layering a cursor record over the latest full checkpoint.
					const material = !this.checkpoint
						|| JSON.stringify(next.graph) !== JSON.stringify(this.graph)
						|| JSON.stringify(next.note) !== JSON.stringify(this.checkpoint.note ?? null)
						|| JSON.stringify(next.unfinished) !== JSON.stringify(this.checkpoint.unfinished ?? []);
					if (material) {
						const checkpoint: Checkpoint = { version: 4, sessionId: this.host.ctx.sessionManager.getSessionId(),
							graph: next.graph, change: graphChange(this.checkpoint?.graph ?? this.initialGraph, next.graph),
							note: next.note, unfinished: next.unfinished, cut: batch.cut, at: acceptedAt, model: this.host.model,
							usage: acceptedUsage, ...(advisor ? { advisor } : {}) };
						let record;
						try { record = await this.host.store.append("checkpoint", checkpoint); }
						catch (error) { throw new Error(`Mom could not write her state beside the session: ${String(error)}`); }
						this.checkpoint = checkpoint; this.checkpointId = record.id;
						this.checkpoints.push({ id: record.id, data: checkpoint });
					} else {
						if (!this.checkpointId) throw new Error("Mom cannot advance evidence coverage without a saved sidecar checkpoint.");
						try { await this.host.store.append("progress", { checkpoint: this.checkpointId, cut: batch.cut }); }
						catch (error) { throw new Error(`Mom could not advance her state beside the session: ${String(error)}`); }
						this.checkpoint = { ...this.checkpoint!, cut: batch.cut, at: acceptedAt, usage: acceptedUsage };
					}
					this.usage = acceptedUsage;
					// Usage is recorded every update, material or not; a failed write never publishes a checkpoint.
					try { await this.host.store.append("attempt", { usage: this.usage }); } catch { /* usage bookkeeping is best-effort */ }
					this.coveredRevision = batch.revision;
					this.committed = this.feed.events.length; this.staged = undefined;
					return next.answer;
				}
				let result: unknown;
				if (operation.name === "inspect_evidence" && readPages > 0 && !searchRetryOnly) {
					if (typeof args.ref !== "string" || typeof args.offset !== "number" || typeof args.limit !== "number" || !Number.isSafeInteger(args.offset) || args.offset < 0 || !Number.isSafeInteger(args.limit) || args.limit < 1 || args.limit > 4000) throw new Error("Invalid evidence request.");
					readPages--;
					const paired = this.feed.pairedSource(args.ref);
					// Either entry point supplies the pair within one page's character budget.
					const companion = paired && !inspected.has(paired) && args.limit > 1 ? await read(paired, 0, Math.floor(args.limit / 2)) : undefined;
					const available = args.limit - (companion && "text" in companion ? companion.text.length : 0);
					const results = [await read(args.ref, args.offset, available)];
					if (companion) results.push(companion);
					mustInspect = false;
					result = { results, evidencePagesRemaining: readPages, metadataSearchesRemaining: searches };
				} else if (operation.name === "search_history" && searches > 0 && !mustInspect && (!question || readPages > 0)) {
					let query: string;
					try { query = validateSearchQuery(args.query, searchRetryOnly ? emptySearch : undefined); }
					catch (error) {
						if (callsRemaining === 0) throw error;
						messages.push(reply, { role: "toolResult", toolCallId: operation.id, toolName: operation.name, isError: true,
							content: [{ type: "text", text: `${String(error)} No metadata search was consumed; ${searches} remain. ${callsRemaining} model call${callsRemaining === 1 ? "" : "s"} remain in this update.${searchRetryOnly ? " Retry now with a shorter literal phrase; no other operation is available." : ""}` }], timestamp: Date.now() });
						continue;
					}
					searches--;
					const found = await this.feed.search(query, AbortSignal.any([this.controller.signal, AbortSignal.timeout(120000), ...(signal ? [signal] : [])]), question ?? query);
					mustInspect = Boolean(question && found.matches.length && readPages > 0);
					if (!found.matches.length && emptySearch === undefined && searches > 0) { emptySearch = query; searchRetryOnly = true; }
					else searchRetryOnly = false;
					result = { ...found, limit: 5, evidencePagesRemaining: readPages, metadataSearchesRemaining: searches,
						shorterLiteralRetryRequired: searchRetryOnly, originalSourceReadRequired: mustInspect };
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
					try { await this.host.store.append("attempt", { usage: this.usage, error: this.error }); }
					catch { /* The original failure remains visible; no checkpoint was published. */ }
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
