import { describe, expect, test } from "bun:test";
import { resolveThinking, clampToLadder, mapLabel, LEVEL_ORDER } from "../src/auto-think";
import { containsProseKeyword, detectKeywords, stripCodeAndTags } from "../src/keywords";
import { DEFAULT_ROLES, matchPattern, resolveRole, globToRegExp } from "../src/roles";

const mk = (provider: string, id: string, reasoning = true) => ({ provider, id, reasoning });
const MODELS = [
	mk("groq", "llama-3.3-70b"),
	mk("anthropic", "claude-opus-4-1"),
	mk("openai", "gpt-5.2-nano"),
	mk("google", "gemini-3.1-pro"),
	mk("cerebras", "llama-3.3-70b"),
];

describe("auto-think", () => {
	test("mapLabel maps online and local vocabularies", () => {
		expect(mapLabel(" high ", false)).toBe("high");
		expect(mapLabel("max", false)).toBe("xhigh");
		expect(mapLabel("trivial", true)).toBe("low");
		expect(mapLabel("moderate", true)).toBe("high");
		expect(mapLabel("bogus", false)).toBeUndefined();
	});

	test("clampToLadder picks highest supported <= request", () => {
		expect(clampToLadder("high", LEVEL_ORDER)).toBe("high");
		expect(clampToLadder("xhigh", ["low", "high"])).toBe("high");
		expect(clampToLadder("medium", ["low"])).toBe("low");
		expect(clampToLadder("low", [])).toBeUndefined();
		expect(clampToLadder(undefined, LEVEL_ORDER)).toBeUndefined();
	});

	test("resolveThinking clamps xhigh down when unsupported", () => {
		expect(resolveThinking("xhigh", false, ["low", "high"])).toBe("high");
	});
});

describe("keywords", () => {
	test("stripCodeAndTags removes fences, inline code, and tags but keeps prose", () => {
		const text = "use ultrathink here\n```ts\nultrathink\n```\nand `ultrathink` inline <span>ultrathink</span> done";
		expect(stripCodeAndTags(text)).toBe("use ultrathink here and inline done");
	});

	test("containsProseKeyword respects boundaries", () => {
		expect(containsProseKeyword("please ultrathink this", "ultrathink")).toBe(true);
		expect(containsProseKeyword("ultrathinkable word", "ultrathink")).toBe(false);
		expect(containsProseKeyword("```ultrathink```", "ultrathink")).toBe(false);
		expect(containsProseKeyword("use `ultrathink` here", "ultrathink")).toBe(false);
	});

	test("detectKeywords returns only present keywords", () => {
		expect(detectKeywords("do ultrathink and workflowz now", ["ultrathink", "workflowz"])).toEqual([
			"ultrathink",
			"workflowz",
		]);
		expect(detectKeywords("nothing here", ["ultrathink"])).toEqual([]);
	});
});

describe("roles", () => {
	test("roles resolve to first available matching model", () => {
		const r = resolveRole("smol", MODELS);
		expect(r).toBeDefined();
		expect(r!.model.provider).toBe("groq");
	});

	test("matchPattern distinguishes provider-qualified and bare patterns", () => {
		expect(matchPattern("openai/gpt-5.2-nano", mk("openai", "gpt-5.2-nano"))).toBe(true);
		expect(matchPattern("openai/gpt-5.2-nano", mk("google", "gpt-5.2-nano"))).toBe(false);
		expect(matchPattern("google/*pro*", mk("google", "gemini-3.1-pro"))).toBe(true);
		expect(matchPattern("flash", mk("google", "gemini-flash"))).toBe(false); // substring pattern unsupported w/o globs
		expect(matchPattern("*flash*", mk("google", "gemini-flash"))).toBe(true);
	});

	test("unknown role resolves empty", () => {
		expect(resolveRole("nope", MODELS)).toBeUndefined();
	});

	test("globToRegExp handles literal dots and stars", () => {
		expect(globToRegExp("anthropic/*").test("anthropic/claude-opus-4-1")).toBe(true);
		expect(globToRegExp("anthropic/*opus*").test("anthropic/claude-opus-4-1")).toBe(true);
		expect(globToRegExp("a.b/*").test("axb/x")).toBe(false);
	});
});

import { buildRows, renderSettingsLines, wrapText, type SettingsStyler, FEATURE_DESCRIPTIONS } from "../src/settings-render";
import { DEFAULT_CONFIG } from "../src/config";

const settingsTheme: SettingsStyler = {
	fg: (color, text) => `⟨${color}›${text}`,
	bold: (text) => `[${text}]`,
};

describe("settings-render", () => {
	test("buildRows yields roles entry, persona, then remaining features", () => {
		const rows = buildRows();
		expect(rows[0]?.kind).toBe("roles");
		expect(rows[1]?.kind).toBe("persona");
		expect(rows.filter((r) => r.kind === "feature")).toHaveLength(6);
		expect(buildRows().every((r) => r.description.length > 40)).toBe(true);
	});

	test("every feature has a thorough non-empty description", () => {
		const rows = buildRows();
		for (const r of rows) {
			expect(r.description.trim().length).toBeGreaterThan(60);
		}
		expect(Object.keys(FEATURE_DESCRIPTIONS).length).toBe(7);
	});

	test("renderSettingsLines shows label row, ON/OFF, and a fully-wrapped description", () => {
		const cfg = DEFAULT_CONFIG;
		const { lines, rowStart } = renderSettingsLines(
			{ persona: cfg.persona, features: cfg.features },
			buildRows(),
			1,
			settingsTheme,
			70,
		);
		// Rows: 0 roles, 1 persona, 2 engineering (default ON), 5 autoThinking (OFF).
		expect(rowStart[0]).toBe(6);
		const engLine = lines[rowStart[2]!]!;
		expect(engLine).toContain("⟨success›[ON ]");
		expect(lines.some((l) => l.includes("wrapped"))).toBe(false);
		const content = lines[rowStart[5]!]!; // autoThinking is OFF by default
		expect(content).toContain("⟨dim›off");
	});

	test("wrapText wraps to width without clipping words", () => {
		const wrapped = wrapText("one two three four five six seven eight", 12);
		expect(wrapped.length).toBeGreaterThan(1);
		expect(wrapped.every((w) => [...w].length <= 12)).toBe(true);
	});

	test("scrolled viewport reports contiguous rowStart indices", () => {
		const cfg = DEFAULT_CONFIG;
		const rows = buildRows();
		const { rowStart } = renderSettingsLines(
			{ persona: cfg.persona, features: cfg.features },
			rows,
			0,
			settingsTheme,
			60,
		);
		expect(rowStart).toHaveLength(rows.length);
		for (let i = 1; i < rowStart.length; i++) {
			expect(rowStart[i]!).toBeGreaterThan(rowStart[i - 1]!);
		}
	});
});

import {
	resolveRoleModel,
	roleBindingOf,
	roleThinkingOf,
	modelLabel,
	isRoleEnabled,
	enabledRoleNames,
} from "../src/roles-config";
import {
	buildRoleRows,
	cycleThinking,
	modelAtRow,
	orderedModels,
	renderRoleSelector,
	renderModelPicker,
} from "../src/role-editor-render";
import { type RoleModelConfig } from "../src/config";

const AVAIL: { provider: string; id: string; name?: string }[] = [
	{ provider: "anthropic", id: "claude-opus-4-1", name: "Opus" },
	{ provider: "groq", id: "llama-3.3-70b" },
	{ provider: "openai", id: "gpt-5.2-nano" },
];

describe("roles-config", () => {
	test("explicit binding wins over pattern matching", () => {
		const roles: Record<string, RoleModelConfig> = {
			slow: { model: "groq/llama-3.3-70b", thinking: "low" },
		};
		expect(resolveRoleModel("slow", AVAIL, roles)?.provider).toBe("groq");
		expect(roleThinkingOf("slow", roles)).toBe("low");
	});

	test("missing binding falls back to role default patterns", () => {
		// no config → resolve smol to first available matching its default patterns.
		const roles: Record<string, RoleModelConfig> = {};
		const m = resolveRoleModel("smol", AVAIL, roles);
		expect(m).toBeDefined();
	});

	test("unknown model selector yields undefined, not a wrong model", () => {
		const roles: Record<string, RoleModelConfig> = { slow: { model: "nonexistent/xyz" } };
		expect(resolveRoleModel("slow", AVAIL, roles)).toBeUndefined();
	});

	test("roleBindingOf reports auto when no explicit model", () => {
		expect(roleBindingOf("smol", {}).auto).toBe(true);
		expect(roleBindingOf("smol", { smol: { model: "openai/gpt-5.2-nano" } }).auto).toBe(false);
	});

	test("modelLabel renders provider/id and optional name", () => {
		expect(modelLabel(AVAIL[0]!)).toBe("anthropic/claude-opus-4-1 (Opus)");
		expect(modelLabel(AVAIL[1]!)).toBe("groq/llama-3.3-70b");
	});

	test("roles are enabled by default; enabledRoleNames filters disabled", () => {
		expect(isRoleEnabled("smol", {})).toBe(true);
		expect(isRoleEnabled("slow", { slow: { enabled: false } })).toBe(false);
		const names = enabledRoleNames({ slow: { enabled: false }, commit: { enabled: false }, smol: { model: "openai/gpt-5.2-nano" } });
		expect(names.includes("slow")).toBe(false);
		expect(names.includes("commit")).toBe(false);
		expect(names.includes("smol")).toBe(true);
		expect(names.includes("default")).toBe(true);
	});

	test("buildRoleRows exposes enabled state", () => {
		const rows = buildRoleRows({ slow: { enabled: false } });
		const slow = rows.find((r) => r.role === "slow")!;
		expect(slow.enabled).toBe(false);
		expect(rows[0]!.enabled).toBe(true);
	});
});

describe("role-editor-render", () => {
	test("buildRoleRows lists every bindable role with binding summary", () => {
		const rows = buildRoleRows({ smol: { model: "openai/gpt-5.2-nano", thinking: "low" } });
		expect(rows).toHaveLength(7);
		const smol = rows[0]!;
		expect(smol.binding).toBe("openai/gpt-5.2-nano");
		expect(smol.thinking).toBe("low");
		expect(rows[1]!.auto).toBe(true);
	});

	test("renderRoleSelector emits a header, roles, and a footer rule", () => {
		const { lines, rowStart } = renderRoleSelector({}, 0, settingsTheme, 70);
		expect(rowStart).toHaveLength(7);
		expect(lines[rowStart[0]!]).toContain("smol");
		expect(lines[lines.length - 1]).toContain("─");
	});

	test("renderModelPicker row 0 is auto; bound model is marked; typing filters", () => {
		const base = renderModelPicker(AVAIL, { smol: { model: "openai/gpt-5.2-nano" } }, "smol", 0, "", settingsTheme, 70);
		expect(base.lines.some((l) => l.includes("auto"))).toBe(true);
		expect(base.lines.some((l) => l.includes("openai/gpt-5.2-nano") && l.includes("●"))).toBe(true);
		// Type a filter → only matching provider survives.
		const filtered = orderedModels(AVAIL, undefined, "groq");
		expect(filtered).toHaveLength(1);
		expect(filtered[0]!.id).toBe("llama-3.3-70b");
	});

	test("modelAtRow resolves against the ORDERED list, not the raw array (regression)", () => {
		const broad: { provider: string; id: string }[] = [
			{ provider: "anthropic", id: "claude-opus" },
			{ provider: "google", id: "gemini-pro" },
			{ provider: "xiaomi", id: "mi-ai" },
			{ provider: "openai", id: "gpt-5.2" },
			{ provider: "meta", id: "llama" },
		];
		const picked = modelAtRow(orderedModels(broad, undefined, "xiaomi"), 1);
		expect(picked?.provider).toBe("xiaomi");
		expect(modelAtRow(orderedModels(broad, undefined, ""), 2)?.provider).toBe("google");
		expect(modelAtRow(orderedModels(broad, undefined, ""), 0)).toBeUndefined();
	});

	test("the currently-bound model leads the picker list", () => {
		const broad: { provider: string; id: string }[] = [
			{ provider: "anthropic", id: "claude-opus" },
			{ provider: "google", id: "gemini-pro" },
			{ provider: "xiaomi", id: "mi-ai" },
			{ provider: "openai", id: "gpt-5.2" },
			{ provider: "meta", id: "llama" },
		];
		const ordered = orderedModels(broad, "xiaomi/mi-ai", "");
		expect(ordered[0]?.provider).toBe("xiaomi");
		// still present once, at the head.
		expect(ordered.filter((m) => m.provider === "xiaomi")).toHaveLength(1);
	});

	test("cycleThinking cycles undefined→low→medium→high→xhigh→undefined", () => {
		expect(cycleThinking(undefined)).toBe("low");
		expect(cycleThinking("low")).toBe("medium");
		expect(cycleThinking("high")).toBe("xhigh");
		expect(cycleThinking("xhigh")).toBe(undefined);
	});
});
