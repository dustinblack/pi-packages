import { CustomEditor, getSelectListTheme, type KeybindingsManager, type SettingsManager, type Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi, type Component, type Focusable, type TUI } from "@earendil-works/pi-tui";
import type { AnnotationView, EndeavorView, WorkView } from "./presentation.ts";

export const FOCUS_KEY = "alt+t";
export interface PanelView { status: string; summary: string; complete?: boolean; note?: string; error?: string; work?: WorkView; coverage?: { consumed: number; total: number; percent: number } }
export interface MomConversationSource {
	view(): PanelView;
	ask(question: string, signal: AbortSignal): Promise<string | undefined>;
}

const PREVIEW_NEIGHBORS = 6;
const finished = (state: string) => ["settled", "finished", "completed", "done"].includes(state);
const waiting = (state: string) => ["parked", "waiting", "blocked"].includes(state);
const clean = (text: string) => text.replace(/\[src:[^\]]+\]/g, "").replace(/\s+/g, " ").trim();
const clip = (text: string, width: number) => width > 0 ? truncateToWidth(text, width, "…") : "";
const fallback = (summary: string) => clean(summary.split("\n").find(line => line.trim() && !line.startsWith("#")) ?? "");

function annotationLabel(annotation: AnnotationView): string {
	if (["rule", "constraint", "postulate"].includes(annotation.kind)) return "Rule";
	if (["choice", "question", "decision"].includes(annotation.kind)) return "Choice";
	return "Observed";
}

function annotationText(annotation: AnnotationView): string {
	const label = annotationLabel(annotation);
	const text = clean(label === "Observed" ? annotation.observed || annotation.intent || annotation.label : annotation.intent || annotation.label);
	const state = finished(annotation.state) ? " (finished)" : waiting(annotation.state) ? " (waiting)" : "";
	return `${label}${state}: ${text}`;
}

function stateName(state: string): string {
	if (finished(state)) return "done";
	if (state === "active") return "in progress";
	if (state === "abandoned") return "dropped";
	return state;
}

/** Work nodes and their current state. Rules, choices and observations appear only in the expanded panel. */
function hierarchy(work: WorkView, theme: Theme, width: number, expanded: boolean): string[] {
	const index = new Map(work.endeavors.map(node => [node.id, node]));
	const coverageComplete = work.coverageComplete !== false;
	const focused = index.has(work.focus ?? "") ? work.focus : work.endeavors.find(node => node.annotations.some(a => a.id === work.focus))?.id;
	const path = new Set(work.focusPath.filter(id => index.has(id)));
	for (let current = focused; current && !path.has(current); current = index.get(current)?.parent) path.add(current);
	for (const id of [...path]) {
		const seen = new Set<string>();
		for (let parent = index.get(id)?.parent; parent && !seen.has(parent); parent = index.get(parent)?.parent) { seen.add(parent); path.add(parent); }
	}
	const children = new Map<string | null, EndeavorView[]>();
	for (const node of work.endeavors) {
		const parent = node.parent && index.has(node.parent) ? node.parent : null;
		const siblings = children.get(parent) ?? []; siblings.push(node); children.set(parent, siblings);
	}
	const selected = new Set<string>(expanded ? index.keys() : path);
	if (!expanded) {
		if (work.purpose && index.has(work.purpose)) selected.add(work.purpose);
		const candidates = work.endeavors.filter(node => !selected.has(node.id)).sort((a, b) => {
			const rank = (n: EndeavorView) => n.parent && path.has(n.parent) ? 0 : n.parent === null ? 1 : n.state === "active" ? 2 : waiting(n.state) ? 3 : 4;
			return rank(a) - rank(b);
		});
		for (const node of candidates.slice(0, PREVIEW_NEIGHBORS)) selected.add(node.id);
		for (const id of [...selected]) {
			const seen = new Set<string>();
			for (let parent = index.get(id)?.parent; parent && !seen.has(parent); parent = index.get(parent)?.parent) { seen.add(parent); selected.add(parent); }
		}
	}
	const lines: string[] = [], visited = new Set<string>();
	function progress(node: EndeavorView): string {
		const descendants: EndeavorView[] = [], seen = new Set([node.id]);
		const visit = (id: string) => { for (const child of children.get(id) ?? []) if (!seen.has(child.id)) { seen.add(child.id); descendants.push(child); visit(child.id); } };
		visit(node.id);
		const counted = descendants.length ? descendants : [node];
		return ` · ${counted.filter(n => finished(n.state)).length}/${counted.length} done`;
	}
	function row(node: EndeavorView, prefix: string, root: boolean): string {
		const here = coverageComplete && node.id === focused;
		let marker = here ? " · you are here" : "";
		const safePrefix = clip(prefix, Math.max(0, width - (here ? "you are here".length : 1)));
		const budget = Math.max(0, width - visibleWidth(safePrefix));
		let meta = here && node.state === "active" ? "" : ` · ${stateName(node.state)}`;
		if (node.id === work.motherThread && budget >= visibleWidth(marker + meta) + 32) meta += " · mother thread";
		else if (node.id === work.purpose && budget >= visibleWidth(marker + meta) + 28) meta += " · main line";
		if (root && budget >= visibleWidth(marker + meta) + visibleWidth(progress(node)) + 18) meta += progress(node);
		if (visibleWidth(marker + meta) >= budget) { marker = here ? "you are here" : ""; meta = here ? "" : meta.trim(); }
		const label = clip(clean(node.label), Math.max(0, budget - visibleWidth(marker + meta)));
		let title: string;
		if (here) title = theme.bold(theme.fg("accent", label));
		else if (finished(node.state)) title = theme.fg("success", theme.strikethrough(label));
		else if (node.state === "abandoned") title = theme.fg("error", theme.strikethrough(label));
		else if (node.state === "blocked") title = theme.fg("warning", label);
		else if (waiting(node.state)) title = theme.fg("dim", label);
		else if (path.has(node.id)) title = theme.bold(theme.fg("accent", label));
		else title = theme.fg("muted", label);
		return clip(theme.fg("dim", safePrefix) + title + (marker ? theme.bold(theme.fg("accent", marker)) : "") + theme.fg("dim", meta), width);
	}
	function detail(text: string, prefix: string, color: "muted" | "warning" | "dim", preserveSources = false) {
		const safePrefix = clip(prefix, Math.max(0, width - 1)), available = Math.max(1, width - visibleWidth(safePrefix));
		const content = preserveSources ? text.replace(/\s+/g, " ").trim() : clean(text);
		const body = expanded ? wrapTextWithAnsi(content, available) : [clip(content, available)];
		for (const line of body) lines.push(clip(theme.fg("dim", safePrefix) + theme.fg(color, line), width));
	}
	function visit(parent: string | null, prefix: string) {
		const siblings = (children.get(parent) ?? []).filter(node => selected.has(node.id));
		for (let i = 0; i < siblings.length; i++) {
			const node = siblings[i]; if (visited.has(node.id)) continue; visited.add(node.id);
			const last = i === siblings.length - 1;
			lines.push(row(node, `${prefix}${last ? "└─ " : "├─ "}`, parent === null));
			const continuation = `${prefix}${last ? "   " : "│  "}`;
			if (!expanded) {
				// Current state of unfinished work; finished nodes are already marked done.
				const now = node.observed || node.intent;
				if (now && !finished(node.state)) detail(now, `${continuation}  `, node.state === "blocked" ? "warning" : "muted");
			} else {
				if (node.intent) detail(`Purpose: ${node.intent}`, `${continuation}  `, "muted");
				if (node.observed) detail(`State: ${node.observed}`, `${continuation}  `, "muted");
				if (node.history) detail("Earlier work was folded away; its sources are still available.", `${continuation}  `, "dim");
				if (node.sources.length) detail(`Sources: ${node.sources.map(source => `[src:${source}]`).join(" ")}`, `${continuation}  `, "dim", true);
				const annotations = [...node.annotations].sort((a, b) => Number(finished(a.state)) - Number(finished(b.state)));
				for (const annotation of annotations) {
					detail(annotationText(annotation), `${continuation}  `, annotation.state === "blocked" ? "warning" : waiting(annotation.state) ? "dim" : "muted");
					if (annotation.sources.length) detail(`Sources: ${annotation.sources.map(source => `[src:${source}]`).join(" ")}`, `${continuation}    `, "dim", true);
				}
			}
			visit(node.id, continuation);
		}
	}
	visit(null, "");
	const hidden = work.endeavors.length - visited.size;
	if (hidden) lines.push(clip(theme.fg("dim", ` … ${hidden} more endeavor${hidden === 1 ? "" : "s"} · alt+t to read`), width));
	if (work.outside.length) {
		if (expanded) for (const outside of work.outside) detail(`Outside this view: ${outside}`, " ", "dim");
		else lines.push(clip(theme.fg("dim", " More work is outside this view · alt+t for context"), width));
	}
	return lines;
}

/** Cached hierarchy in the same tree, color and header style as pi-omp's todo widget. */
export function widgetLines(view: PanelView, theme: Theme, width: number): string[] {
	const w = Math.max(0, Math.floor(width));
	const lines = ["", clip(theme.bold(theme.fg("accent", "Mom")) + theme.fg("dim", ` · ${view.status}`), w)];
	if (view.work?.endeavors.length) lines.push(...hierarchy(view.work, theme, w, false));
	else lines.push(clip(theme.fg("muted", fallback(view.summary) || "Following your conversation; no saved work yet."), w));
	if (view.error) lines.push(clip(theme.fg("warning", view.error), w));
	else if (view.note) lines.push(clip(theme.fg("accent", `↳ ${clean(view.note)}`), w));
	return lines;
}

/** Full-viewport, sidecar-backed conversation. It owns neither the lead editor nor lead messages. */
export class MomConversationView implements Component, Focusable {
	private editor: CustomEditor;
	private exchanges: { question: string; answer?: string; error?: string }[] = [];
	private controller?: AbortController;
	private asking = false;
	private notice = "";
	private scroll = 0;
	private pageRows = 1;
	private draft: string;

	get focused() { return this.editor.focused; }
	set focused(value: boolean) { this.editor.focused = value; }

	constructor(private source: MomConversationSource, private theme: Theme, private tui: TUI,
		keybindings: KeybindingsManager, settings: SettingsManager, private done: () => void,
		draft = "", private saveDraft: (text: string) => void = () => {}) {
		this.draft = draft;
		this.editor = new CustomEditor(tui, {
			borderColor: theme.fg.bind(theme, "borderAccent"),
			selectList: getSelectListTheme(),
		}, keybindings, { paddingX: settings.getEditorPaddingX(), autocompleteMaxVisible: settings.getAutocompleteMaxVisible() });
		this.editor.setText(draft);
		this.editor.onSubmit = (text) => { void this.ask(text); };
	}

	private async ask(text: string) {
		const question = text.trim();
		if (!question || this.asking) return;
		this.draft = "";
		this.asking = true;
		this.editor.disableSubmit = true;
		this.controller = new AbortController();
		const exchange = { question } as { question: string; answer?: string; error?: string };
		this.exchanges.push(exchange);
		this.notice = "Reading the saved map and its sources…";
		this.scroll = Number.POSITIVE_INFINITY;
		this.tui.requestRender();
		try {
			exchange.answer = await this.source.ask(question, this.controller.signal) ?? "Mom returned no answer.";
			this.notice = "";
		} catch {
			if (this.controller.signal.aborted) exchange.error = "Question cancelled. The saved map is unchanged.";
			else exchange.error = "Mom couldn't answer. Her last saved map is unchanged; /mom detail has the reason.";
			this.notice = "";
		} finally {
			this.asking = false;
			this.editor.disableSubmit = false;
			this.controller = undefined;
			this.scroll = Number.POSITIVE_INFINITY;
			this.tui.requestRender();
		}
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape") || matchesKey(data, FOCUS_KEY)) {
			this.controller?.abort();
			this.done();
			return;
		}
		if (matchesKey(data, "ctrl+x") && this.asking) {
			this.notice = "Cancelling Mom's answer…";
			this.controller?.abort();
		} else if (matchesKey(data, "pageUp")) this.scroll = Math.max(0, (Number.isFinite(this.scroll) ? this.scroll : Number.MAX_SAFE_INTEGER) - this.pageRows);
		else if (matchesKey(data, "pageDown")) this.scroll = Number.isFinite(this.scroll) ? this.scroll + this.pageRows : this.scroll;
		else if (matchesKey(data, "ctrl+end")) this.scroll = Number.POSITIVE_INFINITY;
		else this.editor.handleInput(data);
		this.tui.requestRender();
	}

	private content(width: number): string[] {
		const view = this.source.view();
		const wrap = (text: string) => wrapTextWithAnsi(text, Math.max(1, width)).map(line => clip(line, width));
		const lines = [
			this.theme.bold(this.theme.fg("accent", "Mom")) + this.theme.fg("dim", ` · ${view.status}`),
			this.theme.fg("muted", "Ask about the work here. Questions and answers stay out of the lead conversation."), "",
		];
		if (view.error) lines.push(...wrap(this.theme.fg("warning", view.error)), "");
		if (view.work?.endeavors.length) lines.push(...hierarchy(view.work, this.theme, width, false));
		else lines.push(...wrap(this.theme.fg("muted", fallback(view.summary) || "No saved work yet. Mom can answer after the map has a saved view.")));
		for (const exchange of this.exchanges) {
			lines.push("", ...wrap(this.theme.bold(this.theme.fg("text", `You: ${exchange.question}`))));
			if (exchange.answer) lines.push(...wrap(this.theme.fg("text", `Mom: ${exchange.answer}`)));
			else if (exchange.error) lines.push(...wrap(this.theme.fg("warning", exchange.error)));
			else lines.push(this.theme.fg("dim", "Mom: reading…"));
		}
		return lines.map(line => clip(line, width));
	}

	render(width: number): string[] {
		const w = Math.max(1, Math.floor(width));
		const height = Math.max(5, this.tui.terminal.rows);
		const editor = this.editor.render(w);
		const footer = [
			...(this.notice ? [clip(this.theme.fg("dim", this.notice), w)] : []),
			...editor,
			clip(this.theme.fg("dim", `${this.asking ? "Ctrl+X cancel · " : ""}Enter ask · Esc or Alt+T return to lead · PgUp/PgDn scroll · Ctrl+End latest`), w),
		];
		this.pageRows = Math.max(1, height - footer.length);
		const content = this.content(w);
		const max = Math.max(0, content.length - this.pageRows);
		if (!Number.isFinite(this.scroll) || this.scroll > max) this.scroll = max;
		const visible = content.slice(this.scroll, this.scroll + this.pageRows);
		while (visible.length < this.pageRows) visible.push("");
		return [...visible, ...footer].slice(-height).map(line => line + " ".repeat(Math.max(0, w - visibleWidth(line))));
	}

	invalidate(): void { this.editor.invalidate(); }
	dispose(): void {
		this.controller?.abort();
		this.saveDraft(this.editor.getExpandedText() || this.draft);
	}
}

/** Scrollable version of the same cached hierarchy, not a separately maintained map. */
export class MomPanel implements Component {
	private width = -1;
	private text = "";
	private lines: string[] = [];
	private offset = 0;
	constructor(private source: () => PanelView, private theme: Theme, private height: () => number, private done: () => void) {}

	handleInput(data: string): void {
		if (matchesKey(data, "escape") || matchesKey(data, FOCUS_KEY)) { this.done(); return; }
		if (matchesKey(data, "up")) this.offset--;
		else if (matchesKey(data, "down")) this.offset++;
		else if (matchesKey(data, "pageUp")) this.offset -= this.height();
		else if (matchesKey(data, "pageDown")) this.offset += this.height();
		else if (matchesKey(data, "home")) this.offset = 0;
		else if (matchesKey(data, "end")) this.offset = this.lines.length;
		this.offset = Math.max(0, Math.min(this.offset, Math.max(0, this.lines.length - this.height() + 2)));
	}

	render(width: number): string[] {
		const view = this.source(), w = Math.max(0, Math.floor(width)), text = JSON.stringify(view);
		if (w !== this.width || text !== this.text) {
			const wrap = (value: string) => w > 0 ? wrapTextWithAnsi(value, w).map(line => clip(line, w)) : [""];
			this.lines = [clip(this.theme.bold(this.theme.fg("accent", "Mom")) + this.theme.fg("dim", ` · ${view.status}`), w), "",
				...wrap(view.work?.orientation || fallback(view.summary) || "Following your conversation; no saved work yet."), ""];
			if (view.error) this.lines.push(...wrap(this.theme.fg("warning", view.error)), "");
			if (view.work?.endeavors.length) this.lines.push(...hierarchy(view.work, this.theme, w, true));
			if (view.note) this.lines.push("", ...wrap(this.theme.fg("accent", `Mom's note: ${clean(view.note)}`)));
			this.width = w; this.text = text;
		}
		const height = Math.max(3, this.height());
		this.offset = Math.max(0, Math.min(this.offset, Math.max(0, this.lines.length - height + 2)));
		return [...this.lines.slice(this.offset, this.offset + height - 2), "",
			clip(this.theme.fg("dim", "↑↓ scroll · esc close · /mom correct <text> · /mom detail for sources"), w)];
	}
	invalidate(): void { this.width = -1; }
}
