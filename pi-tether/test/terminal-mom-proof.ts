import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { provider, sandbox } from "../../pi-delegate/test/fixture.ts";
import { input, isMomRequest, replacement } from "./fixture.ts";

const api = await provider(), box = sandbox(api.url);
const socket = `mom-proof-${process.pid}`;
const cli = join(dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"))), "bundle/cli.js");
const fixture = resolve(import.meta.dirname, "mom-terminal-fixture.ts");
const evidenceDir = resolve(import.meta.dirname, "../experiments/evidence/todo-014");
const tmux = (...args: string[]) => execFileSync("tmux", ["-L", socket, ...args], { encoding: "utf8", timeout: 10000 });
const quote = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`;
const capture = () => tmux("capture-pane", "-p", "-t", "pi");
const key = (...keys: string[]) => tmux("send-keys", "-t", "pi", ...keys);
const text = (value: string) => tmux("send-keys", "-t", "pi", "-l", value);
async function expect(pattern: RegExp) {
	const end = Date.now() + 15000;
	while (Date.now() < end) { const screen = capture(); if (pattern.test(screen)) return screen; await sleep(50); }
	throw new Error(`Terminal missing ${pattern}\n${capture()}`);
}
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
try {
	api.onUnscripted((request) => {
		if (!isMomRequest(request)) return { text: "LEAD-ANSWER-UNCHANGED" };
		const body = input(request);
		return replacement(request, body.question ? { answer: "From the saved map: Ship the dedicated Mom view is the current work." } : {});
	});
	const args = [process.execPath, cli, "--offline", "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-themes", "--no-context-files", "--extension", fixture, "--model", "fixture/fixture", "--thinking", "off", "--tui-mode", "fullscreen", "--session-dir", join(box.root, "parents")];
	const launch = join(box.root, "launch.sh");
	writeFileSync(launch, `#!/bin/sh\ncd ${quote(box.cwd)}\nexec env HOME=${quote(box.root)} PI_CODING_AGENT_DIR=${quote(box.agentDir)} PI_OFFLINE=1 PI_TELEMETRY=0 ${args.map(quote).join(" ")}\n`, { mode: 0o700 });
	tmux("new-session", "-d", "-s", "pi", "-x", "100", "-y", "30", `sh ${quote(launch)}`);
	await expect(/MOM-PROOF-READY/);
	text("Ship the dedicated Mom view"); key("Enter");
	await expect(/LEAD-ANSWER-UNCHANGED/); await expect(/Main purpose.*you are here/);
	text("LEAD-DRAFT-014");
	const session = join(box.root, "parents", readdirSync(join(box.root, "parents")).find(name => name.endsWith(".jsonl"))!);
	const before = readFileSync(session, "utf8");
	key("M-t"); await expect(/Questions and answers stay out of the lead conversation/);
	text("What is current?"); key("Enter");
	const momScreen = await expect(/From the saved map: Ship the dedicated Mom view is the current work/);
	assert.match(momScreen, /Main purpose/);
	key("Escape"); const leadScreen = await expect(/LEAD-DRAFT-014/);
	const after = readFileSync(session, "utf8");
	assert.equal(after, before, "Mom view must not append its question or answer to the lead transcript");
	assert.doesNotMatch(after, /What is current\?|From the saved map/);
	mkdirSync(evidenceDir, { recursive: true });
	writeFileSync(join(evidenceDir, "mom-view.txt"), momScreen.replaceAll(box.root, "<isolated-root>"));
	writeFileSync(join(evidenceDir, "return-to-lead.txt"), leadScreen.replaceAll(box.root, "<isolated-root>"));
	writeFileSync(join(evidenceDir, "context-isolation.json"), JSON.stringify({ beforeSha256: digest(before), afterSha256: digest(after), equal: true, leadDraft: "LEAD-DRAFT-014", provider: "local-loopback" }, null, 2) + "\n");
	assert.deepEqual(api.errors, []);
	console.log(`PASS actual Pi TUI Mom switch/ask/return; transcript ${digest(after)} unchanged; evidence ${evidenceDir}`);
} catch (error) {
	mkdirSync(evidenceDir, { recursive: true });
	try { writeFileSync(join(evidenceDir, "failure.txt"), capture().replaceAll(box.root, "<isolated-root>")); } catch {}
	throw error;
} finally {
	try { tmux("kill-server"); } catch {}
	await api.close();
}
