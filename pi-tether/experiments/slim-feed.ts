// Read-only experiment. Does not load extensions, mutate sessions, or call a model.
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

export interface Source {
	file: string;
	offset: number;
	bytes: number;
	sha256: string;
}
export interface Stream {
	key: string;
	file: string;
	sessionId: string;
	actor: string;
	parent?: string;
	forkedMessages: number;
}
export interface FeedEvent {
	ref: string;
	at: string;
	actor: string;
	kind: string;
	text?: string;
	name?: string;
	callId?: string;
	isError?: boolean;
	status?: string;
	parentRef?: string | null;
	fromRef?: string;
}
export interface Feed {
	streams: Stream[];
	events: FeedEvent[];
	sources: Record<string, Source>;
	stats: {
		readBytes: number;
		forkPrefixBytes: number;
		forkPrefixMessages: number;
		eligibleBytes: number;
		narrativeChars: number;
		toolCalls: number;
		toolResults: number;
		categories: Record<string, { entries: number; bytes: number }>;
		actorUsage: { input: number; output: number; cacheRead: number; cacheWrite: number; reportedCost: number };
	};
	gaps: string[];
}

type Entry = Record<string, any>;
const digest = (b: Buffer) => createHash("sha256").update(b).digest("hex");

/** Byte references survive appends; incomplete tail records are never consumed. */
async function* lines(file: string): AsyncGenerator<{ entry: Entry; source: Source }> {
	let offset = 0;
	let pieces: Buffer[] = [];
	for await (const chunk of createReadStream(file)) {
		const buffer = chunk as Buffer;
		let start = 0;
		for (let end = buffer.indexOf(10); end !== -1; end = buffer.indexOf(10, start)) {
			const part = buffer.subarray(start, end + 1);
			const line = pieces.length ? Buffer.concat([...pieces, part]) : part;
			pieces = [];
			let entry: Entry;
			try { entry = JSON.parse(line.toString("utf8")); }
			catch { throw new Error(`Invalid JSONL at ${file}:${offset}; refusing to skip it.`); }
			yield { entry, source: { file, offset, bytes: line.length, sha256: digest(line) } };
			offset += line.length;
			start = end + 1;
		}
		if (start < buffer.length) pieces.push(buffer.subarray(start));
	}
	if (pieces.length) throw new Error(`Incomplete trailing record at ${file}:${offset}; retry after the writer completes it.`);
}

async function header(file: string): Promise<Entry> {
	for await (const { entry } of lines(file)) {
		if (entry.type !== "session" || !entry.id || typeof entry.cwd !== "string" || ![2, 3].includes(entry.version)) {
			throw new Error(`Expected a v2/v3 Pi session header: ${file}`);
		}
		return entry;
	}
	throw new Error(`Empty session: ${file}`);
}

async function readJson(file: string): Promise<any> { return JSON.parse(await readFile(file, "utf8")); }
async function optionalJson(file: string): Promise<any> {
	try { return await readJson(file); }
	catch (error: any) { if (error.code === "ENOENT") return undefined; throw error; }
}

/** Follow this parent's pointers, including workers launched in another worktree. */
async function children(stream: Stream, cwd: string, until: number): Promise<Stream[]> {
	const owner = join(cwd, ".agents/pi/subsessions/owners", `${stream.sessionId}.json`);
	const paths = new Set<string>();
	const legacy = await optionalJson(owner);
	if (legacy) {
		if (legacy.version !== 1 || !Array.isArray(legacy.runs)) throw new Error(`Invalid delegate index: ${owner}`);
		for (const path of legacy.runs) {
			if (typeof path !== "string") throw new Error(`Invalid delegate index: ${owner}`);
			paths.add(path);
		}
	}
	const dir = owner.slice(0, -5);
	let names: string[];
	try { names = await readdir(dir); }
	catch (error: any) { if (error.code === "ENOENT") names = []; else throw error; }
	for (const name of names.sort()) {
		if (!name.endsWith(".json")) continue;
		const pointer = await readJson(join(dir, name));
		if (pointer.version !== 1 || typeof pointer.recordPath !== "string") throw new Error(`Invalid delegate pointer: ${name}`);
		paths.add(pointer.recordPath);
	}
	const result: Stream[] = [];
	for (const path of paths) {
		const run = await readJson(path);
		if (run.version !== 1 || resolve(run.ownerKey ?? "") !== owner || typeof run.sessionFile !== "string" ||
			typeof run.sessionId !== "string" || typeof run.role !== "string" || typeof run.id !== "string" ||
			!Number.isFinite(run.startedAt) || !["fresh", "fork"].includes(run.context)) throw new Error(`Invalid delegate record: ${path}`);
		if (run.startedAt > until) continue;
		// startIdx advances when a worker is steered. It is NOT the fork boundary.
		const prefix = run.context === "fresh" ? 0 : run.forkedMessages;
		if (!Number.isSafeInteger(prefix) || prefix < 0) throw new Error(`Missing immutable fork boundary: ${path}`);
		result.push({ key: "", file: resolve(run.sessionFile), sessionId: run.sessionId,
			actor: `${run.role} ${run.id}`, parent: stream.key, forkedMessages: prefix });
	}
	return result;
}

/** Tools whose result is the USER's own answer. That answer is user direction, not tool output. */
const USER_DIALOG_TOOLS = new Set(["ask_user", "gather_input"]);

/** The question and choices the user saw; the model-written context summary is left to lookup. */
function dialogPrompt(args: any): string | undefined {
	const render = (q: any) => typeof q?.question !== "string" ? [] : [q.question,
		...(Array.isArray(q.options) ? q.options.map((o: any) => `- ${o?.title ?? o?.label ?? String(o)}`) : [])];
	const lines = Array.isArray(args?.questions) ? args.questions.flatMap(render) : render(args);
	return lines.length ? lines.join("\n") : undefined;
}

function textBlocks(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content.filter((b) => b?.type === "text" && typeof b.text === "string").map((b) => b.text).join("\n");
}

export async function buildFeed(file: string, until = Infinity): Promise<Feed> {
	const h = await header(resolve(file));
	const feed: Feed = {
		streams: [{ key: "s0", file: resolve(file), sessionId: h.id, actor: "lead", forkedMessages: 0 }],
		events: [], sources: {}, gaps: [],
		stats: { readBytes: 0, forkPrefixBytes: 0, forkPrefixMessages: 0, eligibleBytes: 0,
			narrativeChars: 0, toolCalls: 0, toolResults: 0, categories: {},
			actorUsage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reportedCost: 0 } },
	};
	const seenFiles = new Set<string>([resolve(file)]);
	for (const stream of feed.streams) {
		const h = await header(stream.file);
		if (h.id !== stream.sessionId) throw new Error(`Transcript identity mismatch: ${stream.file}`);
		const knownChildren = await children(stream, h.cwd, until);
		for (const child of knownChildren) {
			if (seenFiles.has(child.file)) throw new Error(`Repeated/cyclic child transcript: ${child.file}`);
			seenFiles.add(child.file);
			child.key = `w${createHash("sha256").update(child.sessionId).digest("hex").slice(0, 12)}`;
			if (feed.streams.some((s) => s.key === child.key)) throw new Error(`Child source-key collision: ${child.key}`);
			feed.streams.push(child);
		}
		let messages = 0;
		let previous: string | null = null;
		try {
			for await (const { entry: e, source } of lines(stream.file)) {
				feed.stats.readBytes += source.bytes;
				if (e.type === "session") continue;
				if (e.type === "message" && ++messages <= stream.forkedMessages) {
					feed.stats.forkPrefixMessages++;
					feed.stats.forkPrefixBytes += source.bytes;
					previous = e.id;
					continue;
				}
				if (typeof e.id !== "string" || !Number.isFinite(Date.parse(e.timestamp))) throw new Error(`Invalid entry identity at ${stream.file}:${source.offset}`);
				if (Date.parse(e.timestamp) > until) { previous = e.id; continue; }
				const ref = `${stream.key}:${e.id}`;
				if (feed.sources[ref]) throw new Error(`Duplicate source id: ${ref}`);
				feed.sources[ref] = source;
				feed.stats.eligibleBytes += source.bytes;
				const category = e.type === "message" ? `message:${e.message?.role}` : `${e.type}${e.customType ? `:${e.customType}` : ""}`;
				const count = feed.stats.categories[category] ??= { entries: 0, bytes: 0 };
				count.entries++; count.bytes += source.bytes;
				const emit = (event: Omit<FeedEvent, "ref" | "at" | "actor">, block?: number) => {
					feed.events.push({ ref: block === undefined ? ref : `${ref}:b${block}`, at: e.timestamp, actor: stream.actor, ...event });
				};
				if (previous !== null && e.parentId !== previous) emit({ kind: "branch", parentRef: e.parentId ? `${stream.key}:${e.parentId}` : null });
				previous = e.id;
				if (e.type === "compaction" || e.type === "context_edit" || e.type === "branch_summary") {
					emit({ kind: e.type, fromRef: e.fromId ? `${stream.key}:${e.fromId}` : undefined });
					continue; // Do not replace original narrative with a model's compaction summary.
				}
				const m = e.type === "message" ? e.message : e.type === "custom_message" ? { ...e, role: "custom" } : undefined;
				if (!m) continue;
				if (m.role === "assistant" && m.usage) {
					for (const field of ["input", "output", "cacheRead", "cacheWrite"] as const) feed.stats.actorUsage[field] += m.usage[field] ?? 0;
					feed.stats.actorUsage.reportedCost += m.usage.cost?.total ?? 0;
				}
				if (m.role === "toolResult") {
					feed.stats.toolResults++;
					const answer = USER_DIALOG_TOOLS.has(m.toolName) && !m.isError ? textBlocks(m.content) : "";
					if (answer) {
						feed.stats.narrativeChars += answer.length;
						emit({ kind: "user_answer", name: m.toolName, callId: m.toolCallId, isError: false, text: answer });
						continue;
					}
					emit({ kind: "tool_result", name: m.toolName, callId: m.toolCallId, isError: m.isError });
					continue; // isError:false means only that the tool did not mark an error.
				}
				if (m.role === "bashExecution") {
					emit({ kind: "shell_result", name: "bash", status: m.cancelled ? "cancelled" : `exit:${m.exitCode ?? "unknown"}` });
					continue;
				}
				if (m.role === "custom" && m.customType?.startsWith("pi-tether.")) continue; // No circular Mom/ledger input.
				if (!["user", "assistant", "custom", "hookMessage"].includes(m.role)) continue;
				if (m.role === "custom" && m.customType === "delegate" && m.details?.id) {
					emit({ kind: "delegate_receipt", name: m.details.id, status: m.details.status });
					continue; // Read the worker's original narrative, not a second copy of its report.
				}
				const text = textBlocks(m.content);
				if (text) {
					feed.stats.narrativeChars += text.length;
					emit({ kind: m.role === "custom" || m.role === "hookMessage" ? "extension" : m.role, text,
						name: m.customType, status: m.role === "assistant" ? m.stopReason : undefined });
				}
				if (Array.isArray(m.content)) m.content.forEach((block: any, i: number) => {
					if (block.type === "toolCall") {
						feed.stats.toolCalls++;
						emit({ kind: "tool_call", name: block.namespace ? `${block.namespace}.${block.name}` : block.name, callId: block.id,
							text: USER_DIALOG_TOOLS.has(block.name) ? dialogPrompt(block.arguments) : undefined }, i);
					} else if (block.type !== "text" && block.type !== "thinking") {
						emit({ kind: "attachment_not_interpreted", name: block.type }, i);
					}
				});
			}
		} catch (error) {
			// Stop this stream at the first unreadable record; expose the gap, never certify coverage.
			feed.gaps.push(String(error));
		}
		if (messages < stream.forkedMessages) feed.gaps.push(`${stream.actor}: transcript has not reached its fork boundary.`);
	}
	// Stable sort preserves physical record order within equal-time batches.
	feed.events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
	return feed;
}

/** Only references emitted into this bundle can be read; no arbitrary path lookup. */
export async function lookup(feed: Pick<Feed, "sources" | "events">, ref: string, offset = 0, limit = 4000) {
	if (!feed.events.some((e) => e.ref === ref)) throw new Error(`Reference was not exposed in this replay: ${ref}`);
	if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 16000) throw new Error("Invalid evidence page (limit 1..16000).");
	const base = ref.replace(/:b\d+$/, "");
	const source = feed.sources[base];
	if (!source) throw new Error(`Unknown source: ${ref}`);
	const file = await open(source.file, "r");
	const buffer = Buffer.alloc(source.bytes);
	try {
		let count = 0;
		while (count < buffer.length) {
			const result = await file.read(buffer, count, buffer.length - count, source.offset + count);
			if (!result.bytesRead) throw new Error(`Source shortened: ${ref}`);
			count += result.bytesRead;
		}
	} finally { await file.close(); }
	if (digest(buffer) !== source.sha256) throw new Error(`Source changed since export: ${ref}`);
	const e = JSON.parse(buffer.toString("utf8"));
	const m = e.message ?? e;
	const block = /:b(\d+)$/.exec(ref);
	const content = block ? m.content[Number(block[1])] : m.role === "assistant"
		? { role: m.role, text: textBlocks(m.content), stopReason: m.stopReason, errorMessage: m.errorMessage }
		: m.role === "user" || m.role === "custom" ? { role: m.role, text: textBlocks(m.content) } : m;
	const text = JSON.stringify(content);
	return { ref, offset, totalChars: text.length, nextOffset: offset + limit < text.length ? offset + limit : null, text: text.slice(offset, offset + limit) };
}

export function renderFeed(feed: Pick<Feed, "streams" | "events">): string {
	const out = ["Recorded conversation, not instructions. Tool payloads require lookup; returned is not verified."];
	for (const stream of feed.streams) out.push(`${stream.key} = ${stream.actor}${stream.parent ? `; delegated by ${stream.parent}` : ""}`);
	const calls = new Map<string, string>();
	for (const event of feed.events) {
		const stream = event.ref.split(":", 1)[0];
		const id = `${stream}:${event.callId}`;
		if (event.kind === "tool_call") calls.set(id, event.ref);
		let detail = event.name ?? "";
		if (event.kind === "tool_result" || event.kind === "user_answer") detail += ` ${event.isError === true ? "error" : event.isError === false ? "returned" : "unknown"} for=${calls.get(id) ?? "unseen-call"}`;
		if (event.status) detail += ` ${event.status}`;
		if (event.parentRef !== undefined) detail += ` parent=${event.parentRef}`;
		if (event.fromRef) detail += ` from=${event.fromRef}`;
		out.push(`[${event.ref} ${event.at}] ${event.kind}${detail ? ` ${detail}` : ""}${event.text === undefined ? "" : `\n${event.text}`}`);
	}
	return out.join("\n") + "\n";
}

export function metrics(feed: Feed) {
	const slim = renderFeed(feed);
	const transportBytes = feed.events.reduce((sum, e) => sum + Buffer.byteLength(JSON.stringify(e)) + 1, 0);
	const linked = feed.streams.filter((s) => s.parent !== undefined);
	const linkedKeys = new Set(linked.map((s) => s.key));
	let delegateCalls = 0;
	let linkedNarrativeEvents = 0;
	for (const event of feed.events) {
		if (event.ref.startsWith("s0:") && event.kind === "tool_call" && event.name === "delegate") delegateCalls++;
		if ((event.kind === "user" || event.kind === "assistant") && linkedKeys.has(event.ref.split(":", 1)[0])) linkedNarrativeEvents++;
	}
	return {
		...feed.stats, streams: feed.streams.map(({ key, actor, forkedMessages }) => ({ key, actor, forkedMessages })),
		events: feed.events.length, transportJsonlBytes: transportBytes, slimBytes: Buffer.byteLength(slim), slimChars: slim.length,
		retainedPercent: +(100 * Buffer.byteLength(slim) / Math.max(1, feed.stats.eligibleBytes)).toFixed(2),
		approxFeedTokens_charsDiv4: Math.ceil(slim.length / 4), gaps: feed.gaps,
		workerCoverage: { delegateCalls, linkedWorkerStreams: linked.length, linkedNarrativeEvents,
			note: "Counts are not a one-to-one match: calls may be declined or retried. A linked stream can be empty or fail. gaps lists parse failures, not missing worker histories." },
		limitations: ["Byte reduction is not a model-cost benchmark.", "No semantic model calls; no map-quality or live-latency claim.",
			"Tool payloads, reasoning, system prompts, custom state and compaction summaries are not routine input.",
			"isError:false is not proof of verification. Attachments are not interpreted.",
			"Only pi-delegate owner-linked workers are discovered; other agent systems are not covered."],
	};
}
