/** Mom owns the work graph. Working agents read it; they never maintain it. */
import { homedir } from "node:os";
import { join } from "node:path";
import { SettingsManager, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { ANCHOR, clockTime, collectSideEffects, renderAnchor } from "./anchor.ts";
import { SystemOneAdvisor } from "./advisor.ts";
import { DEFAULT_BOOTSTRAP_POLICY } from "./bootstrap.ts";
import { LeadCadence } from "./cadence.ts";
import { NOTICE, noticeKey, type WindowCloseReason } from "./checkpoint.ts";
import { CORRECTION, isUserDirection, type FeedEvent } from "./feed.ts";
import { finishCompactionReview, prepareCompactionReview, type PendingCompactionReview } from "./compaction.ts";
import { DEFAULT_MODEL, Mom } from "./mother.ts";
import { SidecarStore } from "./sidecar.ts";
import { FOCUS_KEY, MomConversationView, MomPanel, widgetLines, type MomExchange, type PanelView } from "./panel.ts";
import { collectTurnSignals, lastDirectionOf, MAX_WINDOW_CHECKS, MAX_WINDOW_TURNS, offeredRefs, parseWindowVerdict, renderCorrection, stageOne, windowMessages, windowPurpose, WINDOW_CORRECTION, type TurnSignal, type WindowFlag, type WindowVerdict } from "./window.ts";
import { formatElapsed, isStatusPing } from "./status.ts";
import { coverageProgress, presentGraph, readText, summaryText, type WorkView } from "./presentation.ts";

export const DELEGATE_MILESTONE_EVENT = "pi-delegate:milestone.v1";
export const LEAD_BEHAVIOR_SECTION = `Mom observes and maps the work; the lead does not maintain her notes.

- The user changes direction quickly and may not announce a pivot. Treat every direction change as an implicit park of interrupted work. Follow the new direction without asking for confirmation, announcing the parking, or slowing the user down. Mom records the abandoned thread silently. Surface parked work only at session start or when current work collides with it.
- Always notice and respect clear, scoped assent such as “yes, note that” or “yes, let's go down that path” for exactly the point or path it addresses; do not generalize it to nearby proposals. Respect that assent while it is current. If later direction appears to conflict, check the recorded session evidence and follow the latest clear direction without asking the user to reconfirm the pivot.`;
const LEAD_BEHAVIOR_SECTION_KEY = "mom_lead_behavior";
const WIDGET = "pi-tether";
const AGENT_DIR = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");

export default function piTether(pi: ExtensionAPI) {
	pi.registerFlag("mom-model", { description: "Exact provider/model for Mom; never inherits or silently substitutes the lead model", type: "string", default: DEFAULT_MODEL });
	pi.registerFlag("mom-interval-ms", { description: "Minimum spacing between background Mom updates (milliseconds)", type: "string", default: "15000" });
	pi.registerFlag("mom-advisor-url", { description: "Optional LAN System One endpoint that screens settled batches before Mom wakes; empty disables it", type: "string", default: "" });
	pi.registerFlag("mom-advisor-model", { description: "System One model used to screen settled batches", type: "string", default: "kev-latest" });
	pi.registerFlag("mom-advisor-threshold", { description: "Screen probability at or above which Mom's model wakes", type: "string", default: "0.25" });
	pi.registerFlag("mom-advisor-timeout-ms", { description: "Session-level screening timeout in milliseconds", type: "string", default: "1500" });
	pi.registerFlag("mom-bootstrap", { description: "Cold catch-up: one bounded proposal over a compression of the whole backlog, instead of one proposal per capture window", type: "string", default: "1" });
	pi.registerFlag("mom-bootstrap-chapters", { description: "Target chapters (compaction-bounded segments) per cold-catch-up digest batch; the batch may exceed it by the chapters in the crossing window", type: "string", default: "24" });
	pi.registerFlag("mom-bootstrap-chars", { description: "Maximum characters of cold-catch-up compression sent in one proposal", type: "string", default: "48000" });
	let ctx: ExtensionContext | undefined;
	let mom: Mom | undefined;
	let ready: Promise<void> = Promise.resolve();
	let openingError: string | undefined;
	let readError: string | undefined;
	let savedView: { owner: Mom; checkpoint: Mom["checkpoint"]; complete: boolean; work: WorkView; summary: string } | undefined;
	let epoch = 0;
	let widgetEpoch = -1, widgetSignature: string | undefined;
	let revision = 0;
	let coveredRevision = -1;
	let dirty = false;
	let store: SidecarStore | undefined;
	const cadence = new LeadCadence();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let timerAt: number | undefined;
	let flight: Promise<unknown> | undefined;
	// The lead's event boundary after the last window check; the next check reads only the turn since.
	let leadBoundary: number | undefined;
	let lastStarted = 0;
	let pendingCompaction: PendingCompactionReview | undefined;
	let unsubscribe: (() => void) | undefined;
	// Session reload must not overtake a just-published notice's sidecar record.
	let noticePersistence: Promise<void> = Promise.resolve();
	const interval = () => {
		const n = Number(pi.getFlag("mom-interval-ms") ?? 15000);
		return Number.isFinite(n) && n >= 0 ? n : 15000;
	};

	function savedWork(complete: boolean) {
		if (!mom || openingError) return savedView?.owner === mom ? savedView : undefined;
		if (!savedView || savedView.owner !== mom || savedView.checkpoint !== mom.checkpoint || savedView.complete !== complete) {
			const work = presentGraph({ ...mom.readGraph(), coverageComplete: complete, coverage: coverage() });
			savedView = { owner: mom, checkpoint: mom.checkpoint, complete, work, summary: summaryText(work) };
		}
		return savedView;
	}
	// Durable coverage of recorded evidence. Memoized because the widget's live render closure calls
	// view() on every frame; the branch walk is otherwise repeated per frame during catch-up.
	let coverageKey = "", coverageValue: { consumed: number; total: number; percent: number } | undefined;
	function coverage() {
		const branch = ctx?.sessionManager?.getBranch() ?? [];
		const leaf = mom?.checkpoint?.cut.parent ?? null;
		const key = `${leaf ?? "-"}|${branch.length}`;
		if (key !== coverageKey) { coverageKey = key; coverageValue = coverageProgress(branch, leaf); }
		return coverageValue;
	}
	function view(): PanelView {
		const m = mom;
		const blocked = Boolean(openingError || m?.error || m?.feed.gaps.size || m?.failure || m?.gaps.length);
		const error = blocked ? "Mom couldn't update her notes. Showing the last saved view; /mom detail has the reason." : undefined;
		const complete = Boolean(m) && !m!.busy && !blocked && !dirty && !m!.more && coveredRevision === revision;
		const progress = complete ? undefined : coverage();
		const freshness = m?.busy ? "updating" : blocked ? "update stopped"
			: !complete ? `catching up${progress ? ` · ${progress.percent}% read` : ""}` : "up to date";
		const checked = m?.checkpoint ? `last saved ${formatElapsed(Date.now() - m.checkpoint.at)} ago` : "nothing saved yet";
		const anchor = m?.pendingAnchor ? "anchor queued after compact"
			: m?.lastAnchor ? `anchored after compact ${clockTime(m.lastAnchor.at)}` : undefined;
		const window = m?.window ? "watching after compact"
			: m?.lastWindow?.held ? `continuity held after compact ${clockTime(m.lastWindow.at)}` : undefined;
		const status = `${m?.enabled === false ? "paused" : freshness} · ${checked}${anchor ? ` · ${anchor}` : ""}${window ? ` · ${window}` : ""}${ctx && !ctx.isIdle() ? " · agent working" : ""}`;
		const saved = savedWork(complete);
		return { status, complete, work: saved?.work, summary: saved?.summary ?? "", note: complete ? m?.checkpoint?.note?.text : undefined, error, coverage: progress };
	}
	function sync() {
		if (!ctx?.hasUI) return;
		const v = view();
		// setWidget re-registration forces a layout+repaint of the widget area, and terminals clear
		// drag selections on repaint. Register only when rendered content actually changed; keep a
		// live render closure so any incidental frame still draws current values.
		const signature = `${v.status}\u0000${v.complete}\u0000${v.error ?? ""}\u0000${v.note ?? ""}`;
		if (widgetEpoch === epoch && signature === widgetSignature) return;
		widgetEpoch = epoch; widgetSignature = signature;
		ctx.ui.setWidget(WIDGET, (_tui, theme) => ({ render: (width) => widgetLines(view(), theme, width), invalidate() {} }));
	}
	function cached(): string {
		const v = view();
		const u = mom?.usage;
		return `${v.summary || "Mom has not saved a view of this work yet."}\n\n${v.status}${v.error ? `\n${v.error}` : ""}${v.note ? `\n\nNotice: ${v.note}` : ""}${u ? `\n\nMom (session): ${u.calls} model calls · ${u.input + u.cacheRead + u.cacheWrite} input tokens · ${u.output} output tokens · $${u.nominalCost.toFixed(5)} nominal · ${(u.elapsedMs / 1000).toFixed(1)}s cumulative model/update time` : ""}`;
	}
	async function deliver(onNextRequest = false) {
		const m = mom, note = m?.checkpoint?.note;
		const nextRequestNotice = Boolean(onNextRequest && note?.nextRequest);
		if ((onNextRequest && !note?.nextRequest) || (note?.nextRequest && !onNextRequest)) return;
		if (!m || !note || !ctx || !m.enabled || m.busy || m.error || m.failure || m.gaps.length || openingError || m.feed.gaps.size ||
			(!nextRequestNotice && (dirty || m.more || !ctx.isIdle() || ctx.hasPendingMessages() || coveredRevision !== revision))) return;
		const key = noticeKey(note);
		if (m.unresolvedNotices.has(key)) return;
		const destination = store, parent = ctx.sessionManager.getLeafId(), token = epoch;
		if (!destination) return;
		// Reserve durably before publishing. A crash can lose advice, but cannot repeat it.
		noticePersistence = noticePersistence.then(async () => {
			if (token !== epoch || m !== mom || m.unresolvedNotices.has(key)) return;
			await destination.append("notice", { key, action: "delivered", note, parent });
			m.unresolvedNotices.add(key);
			if (token !== epoch || m !== mom) return;
			// No steering, follow-up request, extra lead turn, or internal reference text.
			pi.sendMessage({ customType: NOTICE, content: `Mom: ${note.text}`,
				display: false, details: { key } }, { triggerTurn: false });
		}).catch(error => {
			if (token === epoch && m === mom) { m.error = `Mom could not deliver her advisory: ${String(error)}`; sync(); }
		});
		await noticePersistence;
	}
	/** The post-compaction continuity anchor rides the next lead request; it never waits for or gates on the audit. */
	async function deliverAnchor() {
		const m = mom, pending = m?.pendingAnchor, destination = store;
		if (!m || !pending || !ctx || !m.enabled || openingError || !destination) return;
		const token = epoch;
		try {
			if (!m.checkpoint) {
				m.pendingAnchor = undefined;
				await destination.append("injection", { kind: "anchor", action: "skipped", key: pending.key, compaction: pending.compaction, reason: "Mom had no saved map to anchor from", parent: ctx.sessionManager.getLeafId() });
				sync();
				return;
			}
			const effects = await collectSideEffects(m.feed);
			const content = renderAnchor(m.checkpoint, effects, formatElapsed(Date.now() - m.checkpoint.at));
			// Reserve durably before publishing. A crash can lose the anchor, but cannot repeat it.
			const record = await destination.append("injection", { kind: "anchor", action: "delivered", key: pending.key, compaction: pending.compaction, content, parent: ctx.sessionManager.getLeafId() });
			if (token !== epoch || m !== mom) return;
			m.pendingAnchor = undefined;
			m.lastAnchor = { key: pending.key, compaction: pending.compaction, at: record.at };
			pi.sendMessage({ customType: ANCHOR, content, display: true, details: { key: pending.key } }, { triggerTurn: false });
			sync();
		} catch (error) {
			m.error = `Mom could not deliver her continuity anchor: ${String(error)}`;
			sync();
		}
	}
	/** Serialize one window operation with Mom updates; record order in her sidecar holds across interleaving. */
	async function serialized(work: () => Promise<void>): Promise<void> {
		const token = epoch;
		while (flight) {
			await flight.catch(() => undefined);
			if (token !== epoch) return;
		}
		let workPromise: Promise<void>;
		flight = workPromise = work();
		try { await workPromise; }
		finally {
			if (token === epoch && flight === workPromise) {
				flight = undefined;
				sync();
				schedule();
			}
		}
	}
	/** Close the open window durably; the caller owns serialization with Mom updates. */
	async function closeWindowRecords(m: Mom, reason: WindowCloseReason) {
		const win = m.window, destination = store;
		if (!win || !destination || !ctx) return;
		// A user pivot right after a compact is correct behavior, not misalignment: a zero-turn
		// close is silent; watched turns that stayed on the line end held.
		const held = win.turns > 0;
		try {
			await destination.append("injection", { kind: "window", action: "closed", key: win.key, compaction: win.compaction,
				reason, held, turns: win.turns, parent: ctx.sessionManager.getLeafId() });
			m.lastWindow = { key: win.key, compaction: win.compaction, at: Date.now(), held, reason };
			m.window = undefined;
		} catch (error) {
			m.error = `Mom could not record closing her post-compact window: ${String(error)}`;
		}
		sync();
	}
	/** Close the open window; serialized with updates so record order holds, and never blocking user input. */
	async function closeWindow(reason: WindowCloseReason) {
		await serialized(async () => {
			const m = mom;
			if (m?.window) await closeWindowRecords(m, reason);
		});
	}
	/** The window opens after the compaction audit from the last accepted map; a newer compaction supersedes an open one. */
	async function openWindow(sessionId: string, compactionEntryId: string) {
		await serialized(async () => {
			const m = mom, destination = store;
			if (!m?.enabled || openingError || !destination || !ctx || !m.checkpoint) return;
			if (m.window) await closeWindowRecords(m, "superseded");
			const key = `${sessionId}:${compactionEntryId}`;
			try {
				const record = await destination.append("injection", { kind: "window", action: "opened", key, compaction: key,
					parent: ctx.sessionManager.getLeafId() });
				m.window = { key, compaction: key, at: record.at, turns: 0, checks: 0 };
			} catch (error) {
				m.error = `Mom could not record opening her post-compact window: ${String(error)}`;
			}
			sync();
		});
	}
	/** One settled-turn check inside the open window: stage one is free; stage two is one bounded model call. */
	async function checkWindow() {
		const token = epoch, start = mom;
		if (!start?.window || !start.enabled || openingError) return;
		await ready.catch(() => undefined);
		if (token !== epoch || mom !== start) return;
		await serialized(async () => {
			const m = mom;
			if (!m?.window || !m.enabled || !m.checkpoint || !store || !ctx) return;
			const win = m.window;
			const turns = win.turns + 1;
			const from = leadBoundary ?? m.feed.events.length;
			let turnEvents: FeedEvent[] = [];
			let error: string | undefined;
			try {
				await m.feed.capture(24000, true);
				if (token !== epoch || mom !== m) return;
				leadBoundary = m.feed.events.length;
				turnEvents = m.feed.events.slice(from).filter(event => event.actor === "lead");
				// A user direction after this window's compaction (a mid-turn dialog answer) closes it as the
				// user's next message; a bare status ping is a query, not direction, and keeps the window open.
				const compactAt = m.feed.events.findIndex(event => event.ref === win.compaction);
				const cut = compactAt >= from ? compactAt + 1 : from;
				if (m.feed.events.slice(cut).some(event => isUserDirection(event) && !isStatusPing(event.text ?? ""))) {
					await closeWindowRecords(m, "user-message");
					return;
				}
			} catch (captureError) {
				// A window check that cannot read the turn's evidence still consumes the turn; the window is bounded even when the feed is broken.
				error = `Mom could not read the turn's evidence: ${String(captureError)}`;
			}
			const signals = error ? [] : await collectTurnSignals(m.feed, turnEvents);
			let flags: WindowFlag[] = [];
			if (!error) try { flags = await stageOne(m.feed, m.checkpoint!, signals); }
				catch (flagError) { error = String(flagError); }
			const lastUserDirection = lastDirectionOf(m.feed);
			const canCheck = flags.length > 0 && win.checks < MAX_WINDOW_CHECKS;
			const purpose = windowPurpose(m.checkpoint!);
			let verdict: WindowVerdict | undefined;
			if (canCheck) try {
				const reply = await m.windowCall(windowMessages({ flags, turnEvents, purpose, lastUserDirection }));
				if (reply.stopReason === "error") error = reply.errorMessage ?? "Mom check provider failed.";
				else {
					verdict = parseWindowVerdict(reply.text, offeredRefs({ flags, turnEvents, lastUserDirection }));
					if (!verdict) error = "The check reply was not a cited verdict; no correction.";
				}
			} catch (checkError) { error = String(checkError); }
			const checks = canCheck ? win.checks + 1 : win.checks;
			// Record the check after its call resolves: counts stay honest, and a crash leaks at most one check's budget.
			try {
				await store.append("injection", { kind: "window", action: "checked", key: win.key, compaction: win.compaction,
					turns, checks, ...(flags.length ? { flagged: flags.map(({ class: flagClass, node, label, intent, matched, sources }) =>
						({ class: flagClass, node, label, intent, matched, sources })) } : {}), ...(error ? { error } : {}),
					parent: ctx.sessionManager.getLeafId() });
			} catch (recordError) {
				m.error = `Mom could not record her post-compact check: ${String(recordError)}`;
				sync();
				return;
			}
			if (token !== epoch || mom !== m) return;
			if (verdict && !verdict.continues) {
				const content = renderCorrection({ signals, flags, purpose, lastUserDirection });
				try {
					const corrected = await store.append("injection", { kind: "window", action: "corrected", key: win.key,
						compaction: win.compaction, content, parent: ctx.sessionManager.getLeafId() });
					if (token !== epoch || mom !== m) return;
					// Reserve durably before publishing. A crash can lose the correction, but cannot repeat it.
					// The correction itself closes the window: exactly one per compaction.
					m.lastWindow = { key: win.key, compaction: win.compaction, at: corrected.at, held: false, reason: "correction" };
					m.window = undefined;
					pi.sendMessage({ customType: WINDOW_CORRECTION, content, display: true, details: { key: win.key } }, { triggerTurn: false });
					await store.append("injection", { kind: "window", action: "closed", key: win.key, compaction: win.compaction,
						reason: "correction", held: false, turns, parent: ctx.sessionManager.getLeafId() });
				} catch (correctionError) {
					m.error = `Mom could not record her post-compact correction: ${String(correctionError)}`;
				}
				sync();
				return;
			}
			m.window = { ...win, turns, checks };
			if (turns >= MAX_WINDOW_TURNS) await closeWindowRecords(m, "turns");
			sync();
		});
	}
	async function run(question?: string, signal?: AbortSignal, refresh = false, compactionReview?: ReturnType<typeof finishCompactionReview>): Promise<string | undefined> {
		const requestedEpoch = epoch;
		await ready;
		if (requestedEpoch !== epoch) throw new Error("Mom request superseded by a session/branch change.");
		if (openingError) throw new Error(openingError);
		while (flight) {
			await flight.catch(() => undefined);
			if (requestedEpoch !== epoch) throw new Error("Mom request superseded by a session/branch change.");
			if (!question && !compactionReview) return undefined;
		}
		const mine = mom, token = epoch, observed = revision;
		if (!mine) throw new Error("Mom session is unavailable.");
		if (!mine.enabled) throw new Error("Mom is paused. Use /mom resume.");
		if (timer) clearTimeout(timer);
		timer = undefined; timerAt = undefined;
		dirty = false; lastStarted = Date.now();
		const work = mine.update(question, signal, observed, refresh, compactionReview);
		flight = work;
		try {
			const answer = await work;
			if (token === epoch && mine === mom) {
				if (!mine.more) {
					coveredRevision = mine.coveredRevision;
					cadence.coveredThrough(coveredRevision);
				}
				if (coveredRevision !== revision) dirty = true;
				if (!compactionReview) await deliver();
			}
			return answer && (dirty || mine.more || coveredRevision !== revision)
				? `Mom is still catching up. This answer covers only the activity she has read so far.\n\n${answer}` : answer;
		} finally {
			// A superseded job must never clear a newer session's flight or timer.
			if (token === epoch && mine === mom && flight === work) {
				flight = undefined;
				sync();
				if (!mine.error && !mine.waitingForWorkers && (dirty || mine.more)) {
					if (refresh) void run(undefined, undefined, true).catch(() => sync());
					else schedule();
				}
			}
		}
	}
	function automaticDueAt(now = Date.now()): number | undefined {
		if (!mom?.enabled || openingError) return undefined;
		const due = mom.more ? now : cadence.deadline(now);
		return due === undefined ? undefined : Math.max(due, lastStarted + interval());
	}
	/** A busy session must not lose a batch that is already due. The next settle is not
	 * guaranteed to arrive before the user stops, and this extension has no idle event, so
	 * dropping the deadline strands the batch until they prompt again. Re-check on a bounded
	 * backoff instead; ordinary scheduling stays one-shot, which is why only the miss path
	 * re-arms. */
	const MISS_BACKOFF_MS = 30_000, MAX_MISSES = 120;
	let misses = 0;
	function schedule() {
		if (!mom?.enabled || openingError || flight) return;
		const due = automaticDueAt();
		if (due === undefined) {
			if (timer) clearTimeout(timer);
			timer = undefined; timerAt = undefined; misses = 0;
			return;
		}
		if (timer && timerAt === due) return;
		if (timer) clearTimeout(timer);
		const token = epoch;
		timerAt = due;
		// One one-shot deadline batches settled exchanges; there is no idle polling.
		timer = setTimeout(() => {
			timer = undefined; timerAt = undefined;
			if (token !== epoch) return;
			const nextDue = automaticDueAt();
			if (nextDue === undefined) { misses = 0; return; }
			if (nextDue > Date.now()) { misses = 0; schedule(); return; }
			if (ctx && (!ctx.isIdle() || (ctx.hasPendingMessages?.() ?? false))) {
				if (++misses <= MAX_MISSES) schedule(); else misses = 0;
				return;
			}
			misses = 0;
			void run().catch(() => sync());
		}, misses ? MISS_BACKOFF_MS : Math.max(150, due - Date.now()));
	}
	function wake(kind: "lead" | "delegate" = "delegate") {
		dirty = true; revision++;
		cadence.settled(kind, revision, Date.now());
		sync(); schedule();
	}
	function reset(context: ExtensionContext) {
		epoch++;
		conversationDraft = "";
		conversationExchanges = [];
		if (timer) clearTimeout(timer);
		timer = undefined; timerAt = undefined; flight = undefined;
		leadBoundary = undefined;
		cadence.reset();
		mom?.close();
		unsubscribe?.();
		unsubscribe = pi.events.on(DELEGATE_MILESTONE_EVENT, (data: unknown) => {
			if (!data || typeof data !== "object") return;
			const e = data as Record<string, unknown>;
			if (e.version === 1 && typeof e.runId === "string" && e.kind === "settled") wake("delegate");
		});
		ctx = context; openingError = undefined; readError = undefined; savedView = undefined; lastStarted = 0;
		revision = 0; coveredRevision = -1; dirty = true; pendingCompaction = undefined; cadence.reset();
		const token = epoch, priorNoticePersistence = noticePersistence;
		const advisorUrl = String(pi.getFlag("mom-advisor-url") ?? "").trim();
		const bootstrapChapters = Number(pi.getFlag("mom-bootstrap-chapters") ?? DEFAULT_BOOTSTRAP_POLICY.maxChapters);
		const bootstrapChars = Number(pi.getFlag("mom-bootstrap-chars") ?? DEFAULT_BOOTSTRAP_POLICY.maxDigestChars);
		const instance: Mom = new Mom({ ctx: context, model: String(pi.getFlag("mom-model") ?? DEFAULT_MODEL),
			...(String(pi.getFlag("mom-bootstrap") ?? "1") !== "0" && Number.isSafeInteger(bootstrapChapters) && bootstrapChapters > 0 && Number.isSafeInteger(bootstrapChars) && bootstrapChars > 0
				? { bootstrapPolicy: { ...DEFAULT_BOOTSTRAP_POLICY, maxChapters: bootstrapChapters, maxDigestChars: bootstrapChars } } : {}),
			...(advisorUrl ? { advisor: new SystemOneAdvisor({ url: advisorUrl, model: String(pi.getFlag("mom-advisor-model") ?? "kev-latest"),
				threshold: Number(pi.getFlag("mom-advisor-threshold") ?? 0.25), timeoutMs: Number(pi.getFlag("mom-advisor-timeout-ms") ?? 1500) }) } : {}),
			// Durable state lives beside the session transcript, never inside it.
			store: store = new SidecarStore(() => context.sessionManager.getSessionFile(), context.sessionManager.getSessionId()),
			current: () => token === epoch && mom === instance && context.sessionManager.getSessionId() === ctx?.sessionManager.getSessionId(),
			changed: () => { if (token === epoch) sync(); },
		});
		mom = instance;
		ready = priorNoticePersistence.then(() => instance.open()).then(() => {
			if (token !== epoch) return;
			savedView = undefined;
			// Opening or changing branches only restores and renders durable state. New
			// inference waits for agent_settled, delegate settled, or an explicit request.
			sync();
		}).catch((error) => { if (token === epoch) { openingError = String(error); sync(); } });
		sync();
	}
	function close() {
		epoch++;
		if (timer) clearTimeout(timer);
		timer = undefined; timerAt = undefined; mom?.close(); flight = undefined;
		leadBoundary = undefined;
		cadence.reset();
		unsubscribe?.(); unsubscribe = undefined;
		ctx?.ui.setWidget(WIDGET, undefined);
		mom = undefined; ctx = undefined; savedView = undefined; store = undefined;
	}

	pi.on("session_start", (_event, context) => { reset(context); });
	pi.on("session_tree", (_event, context) => { reset(context); });
	pi.on("session_shutdown", async () => {
		await noticePersistence;
		// A session that closes before its aged deadline would leave Mom with no map at all. Run the
		// batch only when it is already due: shutdown must never start inference the cadence had not
		// already scheduled, so exit gains no latency beyond what it already owed.
		if (mom?.enabled && !openingError && !flight) {
			const due = automaticDueAt();
			if (due !== undefined && due <= Date.now()) await run().catch(() => undefined);
		}
		close();
	});
	pi.on("session_before_compact", (event, context) => {
		pendingCompaction = prepareCompactionReview(event, context.sessionManager.getSessionId());
	});
	pi.on("session_compact_failed", () => { pendingCompaction = undefined; });
	pi.on("session_compact", async (event, context) => {
		ctx = context;
		const pending = pendingCompaction;
		pendingCompaction = undefined;
		if (!pending || !mom?.enabled || openingError) return;
		if (timer) clearTimeout(timer);
		timer = undefined; timerAt = undefined; dirty = true; revision++; sync();
		// Queue the continuity anchor before the audit starts, so a crashed or failing audit never loses it.
		const m = mom, destination = store, anchorKey = `${context.sessionManager.getSessionId()}:${event.compactionEntry.id}`;
		if (m && destination) {
			try {
				const record = await destination.append("injection", { kind: "anchor", action: "pending", key: anchorKey, compaction: anchorKey, parent: context.sessionManager.getLeafId() });
				m.pendingAnchor = { key: anchorKey, compaction: anchorKey, at: record.at };
				sync();
			} catch (error) {
				m.error = `Mom could not record her post-compaction anchor: ${String(error)}`;
				sync();
			}
		}
		try { await run(undefined, undefined, false, finishCompactionReview(pending, event)); }
		catch { sync(); }
		// The window opens after the audit, from the map the audit left; no map, no window.
		await openWindow(context.sessionManager.getSessionId(), event.compactionEntry.id).catch(() => sync());
	});
	pi.on("before_agent_start", async (event) => {
		const token = epoch;
		await ready.catch(() => undefined);
		if (token === epoch) await deliverAnchor();
		if (token === epoch) await deliver(true);
		if (token === epoch && mom?.enabled) event.systemPromptOptions.sections[LEAD_BEHAVIOR_SECTION_KEY] = LEAD_BEHAVIOR_SECTION;
		else delete event.systemPromptOptions.sections[LEAD_BEHAVIOR_SECTION_KEY];
	});
	pi.on("agent_start", () => { sync(); });
	pi.on("agent_settled", (_event, context) => {
		ctx = context; wake("lead"); deliver();
		// Checks run at the settled boundary regardless of running workers: they read lead events only.
		void checkWindow().catch(() => sync());
	});
	pi.on("input", async (event, context) => {
		// The user's next message is a fresh direction and closes the open window; a bare status
		// ping is a query, not direction, and never blocks input.
		if (event.source !== "extension" && !isStatusPing(event.text)) void closeWindow("user-message").catch(() => sync());
		if (event.source !== "extension") await deliver(true);
		if (event.source === "extension" || !isStatusPing(event.text)) return { action: "continue" as const };
		if (!context.hasUI) return { action: "continue" as const };
		context.ui.notify(cached(), "info");
		return { action: "handled" as const };
	});

	let conversationOpen = false;
	let conversationDraft = "";
	let conversationExchanges: MomExchange[] = [];
	async function show(context: ExtensionContext) {
		if (context.mode !== "tui") { context.ui.notify(cached(), "info"); return; }
		await context.ui.custom<void>((tui, theme, _keys, done) => new MomPanel(view, theme, () => Math.max(5, tui.terminal.rows - 6), () => done()));
	}
	async function talk(context: ExtensionContext) {
		if (context.mode !== "tui") { context.ui.notify("Mom conversation view requires interactive mode.", "error"); return; }
		if (conversationOpen) return;
		conversationOpen = true;
		try {
			await context.ui.custom<void>((tui, theme, keys, done) => new MomConversationView(
				{ view, ask: (question, signal) => run(question, signal) }, theme, tui, keys,
				SettingsManager.create(context.cwd, AGENT_DIR), () => done(), conversationDraft,
				(draft) => { conversationDraft = draft; }, conversationExchanges,
			), { overlay: true, overlayOptions: { width: "100%", maxHeight: "100%", anchor: "top-left", margin: 0 } });
		} catch (error) { context.ui.notify(`Cannot open Mom: ${String(error)}`, "error"); }
		finally { conversationOpen = false; }
	}
	pi.registerShortcut(FOCUS_KEY, { description: "Switch to Mom conversation (Esc or Alt+J returns)", handler: async (context) => { await talk(context); } });
	pi.registerTool({ name: "mom", label: "Mom", description: "Find out where you are in the work: the goal, what this is part of, what's unfinished, and where to return after a detour. Default reads return a compact story map: current work, live rules, waiting choices, and folded history. Features, theories, postulates and things being tried form the map; rules, choices and observations are attached to them. Omit arguments or use graph={} for the map; graph.nodes selects full records; source reads original evidence. These reads make no model call. question asks Mom to reason about the history. Read-only: you do not maintain Mom's notes. Choose at most one of graph, source, question.",
		renderCall(args, theme) {
			const action = args.question ? "asking about the work" : args.source ? "reading original evidence" : args.graph?.checkpoint ? "reading earlier work" : args.graph ? "finding our place" : "where we are";
			return new Text(theme.fg("toolTitle", theme.bold("Mom")) + theme.fg("muted", ` · ${action}`), 0, 0);
		},
		renderResult(result, { expanded }, theme) {
			const text = result.content.filter(part => part.type === "text").map(part => part.text).join("\n");
			const details = result.details as { overview?: string; expandable?: boolean } | undefined;
			return new Text(expanded ? text : `${details?.overview ?? text}${details?.expandable ? `\n${theme.fg("dim", "Expand for the selected records and sources.")}` : ""}`, 0, 0);
		},
		parameters: Type.Object({
			question: Type.Optional(Type.String({ description: "A question for Mom's bounded source-backed reasoning; omit for cached reads." })),
			graph: Type.Optional(Type.Object({
				nodes: Type.Optional(Type.Array(Type.String(), { minItems: 1, maxItems: 20, description: "IDs of endeavors or attached notes from a previous read. Omit to see the whole map." })),
				depth: Type.Optional(Type.Integer({ minimum: 0, maximum: 3, description: "How much surrounding work to include (0–3, default 1). Even 0 explains the goal, your place in it, and what is outside the view." })),
				checkpoint: Type.Optional(Type.String({ description: "A saved-view ID from history or previousCheckpoint. Omit for the current view. Old records remain readable without reopening their work." })),
			}, { additionalProperties: false })),
			source: Type.Optional(Type.Object({ ref: Type.String({ minLength: 1 }), offset: Type.Optional(Type.Integer({ minimum: 0 })) }, { additionalProperties: false })),
		}, { additionalProperties: false }),
		async execute(_id, args, signal): Promise<{ content: { type: "text"; text: string }[]; details: unknown }> {
			if ([args.graph, args.source, args.question?.trim()].filter(Boolean).length > 1) throw new Error("Choose one of graph, source, or question.");
			const token = epoch;
			await ready;
			if (token !== epoch) throw new Error("The session changed while Mom was reading. Ask again in the current session.");
			try {
				if (openingError || !mom) throw new Error(openingError ?? "Mom session is unavailable.");
				const reader = mom, state = view();
				if (args.graph || args.source) {
					const data = args.source ? { ...await reader.feed.lookup(args.source.ref, args.source.offset ?? 0), pairedRef: reader.feed.pairedSource(args.source.ref) }
						: { status: state.status, error: state.error, ...reader.readGraph(args.graph), coverageComplete: state.complete, coverage: state.coverage };
					if (token !== epoch || reader !== mom) throw new Error("The session changed while Mom was reading.");
					const work = args.source ? state.work! : presentGraph(data);
					const selected = Boolean(args.graph?.nodes?.length || args.graph?.checkpoint);
					const overview = args.source ? "Original recorded evidence, not new work or permission to act."
						: summaryText(work);
					const text = args.source ? `${overview}\n\n${JSON.stringify(data, null, 2)}` : readText(work, selected);
					return { content: [{ type: "text", text }], details: { at: reader.checkpoint?.at, overview, expandable: Boolean(args.source || selected), data } };
				}
				if (!args.question?.trim()) {
					const text = cached();
					return { content: [{ type: "text", text }], details: { at: reader.checkpoint?.at, overview: text } };
				}
				const answer = await run(args.question, signal);
				return { content: [{ type: "text", text: answer ?? "Mom returned no answer." }], details: { at: reader.checkpoint?.at } };
			} catch (error) {
				readError = String(error);
				throw new Error(`Mom couldn't ${args.question ? "answer that question" : "read that saved view or source"}. Her last saved notes are unchanged. ${args.question ? "Use /mom detail for the reason." : "Use an ID from a previous Mom read; /mom detail shows the reason."}`);
			}
		},
	});
	pi.registerCommand("mom", { description: "Talk to Mom (Alt+J) · overview · status · map|graph [endeavor] [depth] · detail · ask <question> · correct <text> · source <id> [offset] · log · refresh · pause · resume",
		handler: async (args, context) => {
			const [command, ...parts] = args.trim().split(/\s+/);
			const text = parts.join(" ");
			try {
				if (!command) { await talk(context); return; }
				if (command === "overview") { await show(context); return; }
				if (command === "status") { context.ui.notify(cached(), "info"); return; }
				if (command === "detail") {
					await ready;
					context.ui.notify(JSON.stringify({ error: openingError ?? mom?.error, lastReadError: readError,
						missingSources: mom ? [...mom.feed.gaps.values()] : [], ...mom?.detail(), saved: mom?.readGraph() }, null, 2), "info"); return;
				}
				if (command === "pause" || command === "resume") {
					if (!store) throw new Error("Mom session is unavailable.");
					await store.append("control", { enabled: command === "resume" });
					reset(context);
					if (command === "resume") { await ready; void run(undefined, undefined, true).catch(() => sync()); }
					context.ui.notify(`Mom ${command === "pause" ? "paused" : "resumed"}.`, "info"); return;
				}
				if (command === "correct") {
					if (!text) throw new Error("Use /mom correct <your correction>.");
					pi.sendMessage({ customType: CORRECTION, content: args.slice(args.indexOf(command) + command.length).trim(), display: true,
						details: { origin: "user-command" } }, { triggerTurn: false });
					wake("lead");
					if (mom?.enabled) void run(undefined, undefined, true).catch(() => sync());
					return;
				}
				if (command === "graph" || command === "map") {
					await ready;
					if (openingError || !mom) throw new Error(openingError ?? "Mom session is unavailable.");
					context.ui.notify(readText(presentGraph({ ...mom.readGraph({ nodes: parts[0] ? [parts[0]] : undefined, depth: parts[1] ? Number(parts[1]) : undefined }), coverage }), Boolean(parts[0])), "info"); return;
				}
				if (command === "source") {
					await ready;
					if (!parts[0] || !mom) throw new Error("Use /mom source <source-id> [offset].");
					const source = await mom.feed.lookup(parts[0], Number(parts[1] ?? 0));
					context.ui.notify(`Original recorded evidence, not new work:\n${JSON.stringify(source, null, 2)}`, "info"); return;
				}
				if (command === "log") {
					await ready;
					if (openingError || !mom || !store) throw new Error(openingError ?? "Mom session is unavailable.");
					const branch = new Set(context.sessionManager.getBranch().map(e => e.id));
					const lines = (await store.load())
						.filter(r => (r.type === "injection" || r.type === "notice")
							&& (r.data.parent === null || (typeof r.data.parent === "string" && branch.has(r.data.parent))))
						.map(r => {
							const time = clockTime(r.at);
							if (r.type === "notice") return `${time} notice (${r.data.note.riskClass}:${r.data.note.target}) — delivered on the next request: ${r.data.note.text}`;
							const d = r.data;
						if (d.kind === "window") {
							const windowCloseText = (reason: string) => reason === "user-message" ? "the user's next message"
								: reason === "turns" ? "three settled turns" : reason === "correction" ? "the correction" : "a new compaction";
							if (d.action === "opened") return `${time} window after compact ${d.compaction} — opened (watching the first settled turns)`;
							if (d.action === "checked") return `${time} window after compact ${d.compaction} — watched turn ${d.turns}/${MAX_WINDOW_TURNS}`
								+ `${d.flagged ? `, flagged: ${d.flagged.map((flag: any) => `${flag.class} “${flag.label}” (${flag.matched.join(", ")})`).join("; ")}` : ""}`
								+ `${d.checks ? `, model check ${d.checks}/${MAX_WINDOW_CHECKS}` : ""}${d.error ? `, check failed: ${d.error}` : ""}`;
							if (d.action === "corrected") return `${time} window after compact ${d.compaction} — corrected:\n${d.content}`;
							return `${time} window after compact ${d.compaction} — closed (${windowCloseText(d.reason)})${d.held ? ", continuity held" : ""}`;
						}
							if (d.action === "delivered") return `${time} anchor after compact ${d.compaction} — delivered:\n${d.content}`;
							if (d.action === "pending") return `${time} anchor after compact ${d.compaction} — queued (not yet delivered)`;
							return `${time} anchor after compact ${d.compaction} — skipped: ${d.reason}`;
						});
					context.ui.notify(lines.length
						? `Mom injections into the lead conversation (oldest first, from her sidecar):\n${lines.join("\n")}`
						: "Mom has not injected anything into the lead conversation yet.", "info");
					return;
				}
				if (command === "refresh") { await run(undefined, undefined, true); return; }
				if (command === "ask" && text) { const answer = await run(text); context.ui.notify(answer ?? "Mom returned no answer.", "info"); return; }
				throw new Error("Use /mom, overview, status, map, graph, detail, ask, correct, source, log, refresh, pause, or resume.");
			} catch (error) {
				readError = String(error);
				context.ui.notify("Mom couldn't complete that request. Your last saved view is unchanged. Use /mom detail for the reason and /mom for your place in the work.", "error");
			}
		},
	});
}
