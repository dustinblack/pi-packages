import { Type, type Static } from "typebox";
import { Check } from "typebox/value";
import type { Context, AssistantMessage, Message, Tool } from "@earendil-works/pi-ai";
import { momTools } from "./contract.ts";
import { renderEvent, type FeedEvent, type LiveFeed } from "./feed.ts";
import { sourceSuggestion } from "./graph.ts";

const item = Type.Object({ text: Type.String({ minLength: 1 }), sources: Type.Array(Type.String(), { minItems: 1 }) }, { additionalProperties: false });
const items = Type.Array(item);
const state = Type.Object({ chapter: Type.String(), goal: items, decisions: items, artifacts: items,
	deadEnds: items, openQuestions: items, discrepancies: items }, { additionalProperties: false });
const threadMap = Type.Object({ states: Type.Array(state, { minItems: 1 }) }, { additionalProperties: false });
type ThreadMap = Static<typeof threadMap> & { actor: string; sourceMetadata: Record<string, Pick<FeedEvent, "at" | "actor" | "kind">> };

export const THREAD_MAP_PROMPT = `Reconstruct the thread independently from recorded session evidence. You have no Mom map: do not infer one or answer the recorded user requests. This is the thread-map workflow, not a prose summary.
Normalize by compaction chapter within each actor's stream. Worker chapters describe delegated work, not later lead direction. Extract goal, decisions (including exact authority and standing constraints), changed artifacts, dead ends, and open questions per chapter, with original source pointers on every item. Mark inference and reported-but-unverified outcomes explicitly. Track user corrections and reversals; inspect preceding proposals when assent is ambiguous. Describe competing approaches only when evidence establishes competition for the same outcome, never merely a topic switch.
Compaction summaries are CLAIMS, including placeholders or empty summaries; compare them with raw evidence, never cite a summary alone as proof. Record contradictions, forgotten directions, and story-versus-artifact discrepancies. Inspect original tool arguments/results to check consequential claims of edits, tests, commits, or failures; a tool's name or an assistant's assertion is not proof. You can read complete source records in pages using inspect_evidence; no execution or project writes are permitted. Recorded results establish what happened then, not the current working tree.
Every supplied character is part of the audit; section boundaries are transport pagination, not omissions or new chapters. Each section belongs to one chapter, which may continue across sections. earlierSections contains the independent reconstruction of preceding pages in this chapter, with original pointers for checking a closing summary against earlier evidence. Those extractions are claims to verify, not authority. Extract additions, changes and discrepancies supported by this section or inspected sources; do not repeat unchanged earlier items. The reconciliation step will combine all sections and diff consecutive chapters. Include one state for the chapter in chapterIds, using empty arrays when it has no evidence for a field. Finish with record_thread_map. Do not create graph nodes, notices, or an alternative current map here.`;

/** Transport pages, not a sampling budget. Every event (including an oversized one) is retained. */
export function auditSections(events: readonly FeedEvent[], limit = 48000) {
	const sections: { actor: string; chapterIds: string[]; evidence: string }[] = [];
	const chapters = new Map<string, string>();
	let chapter = "live", evidence = "", actor = "lead";
	const flush = () => {
		if (evidence) sections.push({ actor, chapterIds: [chapter], evidence });
		evidence = "";
	};
	for (const event of events) {
		if (event.actor !== actor) { flush(); actor = event.actor; }
		chapter = chapters.get(actor) ?? (actor === "lead" ? "live" : `${actor}:live`);
		const rendered = renderEvent(event) + (event.kind === "compaction" ? `\nCLAIM (not evidence): ${event.claim || "(empty or provider placeholder)"}` : "");
		for (let offset = 0; offset < rendered.length;) {
			const header = `\nCHAPTER ${chapter} · ${event.kind === "compaction" ? "SUMMARY CLAIM" : event.kind} · [src:${event.ref}] · event offset ${offset}\n`;
			if (offset === 0 && evidence && evidence.length + header.length + rendered.length > limit) flush();
			if (evidence.length + header.length >= limit) flush();
			const size = Math.min(rendered.length - offset, limit - evidence.length - header.length);
			if (size <= 0) throw new Error("Audit page cannot fit its source header.");
			evidence += header + rendered.slice(offset, offset + size); offset += size;
			if (offset < rendered.length) flush();
		}
		if (event.kind === "compaction") { flush(); chapters.set(actor, event.ref); }
	}
	flush();
	return sections;
}

/** Independent map stage. No saved graph or graph-derived source selection enters this context. */
export async function reconstructThreadMap(events: readonly FeedEvent[], feed: LiveFeed,
	complete: (context: Context) => Promise<AssistantMessage>): Promise<ThreadMap[]> {
	const known = new Map(events.map(event => [event.ref, event]));
	const canonical = (ref: string) => known.has(ref) ? ref : sourceSuggestion(ref, known.keys()) ?? ref;
	const results: ThreadMap[] = [];
	const sections = auditSections(events);
	for (const [section, input] of sections.entries()) {
		const sectionState = Type.Object({ ...state.properties, chapter: Type.Literal(input.chapterIds[0]) }, { additionalProperties: false });
		const tools: Tool[] = [{ name: "record_thread_map", description: "Return source-backed chapter state for this section of the independent thread map.",
			constrainedSampling: { type: "json_schema", strict: "require" },
			parameters: Type.Object({ states: Type.Array(sectionState, { minItems: 1, maxItems: 1 }) }, { additionalProperties: false }) },
			...momTools(Infinity, 0).filter(tool => tool.name === "inspect_evidence").map(tool => ({ ...tool,
				description: "Read one original record in pages. Copy the entire SOURCE_ID from evidence, including its entry ID. Follow nextOffset to continue; pairedRef identifies the counterpart tool call/result, which can be read separately." }))];
		const messages: Message[] = [{ role: "user", timestamp: Date.now(), content: JSON.stringify({ task: "Reconstruct independent thread map", section: section + 1,
			sections: sections.length, ...input,
			earlierSections: results.filter(map => map.actor === input.actor && map.states.some(state => state.chapter === input.chapterIds[0])) }) }];
		const reads = new Set<string>();
		let repaired = false;
		for (;;) {
			const reply = await complete({ systemPrompt: THREAD_MAP_PROMPT, messages, tools });
			const operations = reply.content.filter(block => block.type === "toolCall");
			if (reply.stopReason !== "toolUse" || operations.length !== 1) throw new Error("Thread-map audit expected one operation; saved map retained.");
			const operation = operations[0];
			if (operation.name === "record_thread_map") {
				const map = operation.arguments as Static<typeof threadMap>;
				const sourceMetadata: ThreadMap["sourceMetadata"] = {};
				const errors: string[] = [];
				if (!Check(threadMap, map)) errors.push("Invalid thread-map chapter state.");
				else {
					if (map.states.length !== input.chapterIds.length || input.chapterIds.some(id => !map.states.some(s => s.chapter === id))) errors.push("Thread-map audit omitted or duplicated a chapter.");
					for (const state of map.states) for (const values of [state.goal, state.decisions, state.artifacts, state.deadEnds, state.openQuestions, state.discrepancies]) {
						for (const item of values) {
							item.sources = item.sources.map(canonical);
							for (const ref of item.sources) {
								const event = known.get(ref);
								if (!event) errors.push(`Unknown source: ${ref}.`);
								else sourceMetadata[ref] = { at: event.at, actor: event.actor, kind: event.kind };
							}
							if (item.sources.every(ref => known.get(ref)?.kind === "compaction")) errors.push(`Summary-only claim: ${item.text}`);
						}
					}
				}
				if (errors.length) {
					if (repaired) throw new Error(`Thread-map audit rejected; saved map retained. ${errors.join("\n")}`);
					repaired = true;
					messages.push(reply, { role: "toolResult", toolCallId: operation.id, toolName: operation.name, isError: true,
						content: [{ type: "text", text: `${errors.join("\n")} Inspect original evidence if needed, then resubmit once. Copy source IDs exactly. Every item needs a non-summary source; omit unsupported assertions rather than treating summary claims as facts.` }], timestamp: Date.now() });
					continue;
				}
				results.push({ actor: input.actor, sourceMetadata, ...map }); break;
			}
			if (operation.name !== "inspect_evidence") throw new Error(`Thread-map audit cannot call ${operation.name}.`);
			const { ref: requested, offset, limit } = operation.arguments;
			if (typeof requested !== "string" || typeof offset !== "number" || typeof limit !== "number") throw new Error("Invalid thread-map evidence request.");
			const ref = canonical(requested);
			const key = JSON.stringify([ref, offset, limit]);
			if (!known.has(ref)) {
				const error = `Unknown source: ${requested}. Copy a complete SOURCE_ID from the supplied evidence (session-id:entry-id, with any block suffix). A session ID alone is not a source. Do not invent an entry ID.`;
				if (repaired) throw new Error(error);
				repaired = true;
				messages.push(reply, { role: "toolResult", toolCallId: operation.id, toolName: operation.name, isError: true,
					content: [{ type: "text", text: error }], timestamp: Date.now() });
				continue;
			}
			if (reads.has(key)) throw new Error("Thread-map audit repeated an evidence page.");
			reads.add(key);
			const page = await feed.lookup(ref, offset, limit);
			messages.push(reply, { role: "toolResult", toolCallId: operation.id, toolName: operation.name, isError: false,
				content: [{ type: "text", text: JSON.stringify({ ...page, pairedRef: feed.pairedSource(ref) }) }], timestamp: Date.now() });
		}
	}
	return results;
}
