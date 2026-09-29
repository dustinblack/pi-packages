import assert from "node:assert/strict";
import { appendFile, mkdtemp, readFile, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { SidecarStore, sidecarFile, type SidecarIO } from "../src/sidecar.ts";

test("a torn UTF-8 final line is truncated before append and cold reopen stays readable", async () => {
	const dir = await mkdtemp(join(tmpdir(), "mom-sidecar-torn-"));
	const session = join(dir, "session.jsonl"), sessionId = "session-one";
	try {
		await writeFile(session, "{}\n");
		const initial = new SidecarStore(() => session, sessionId);
		await initial.append("attempt", { marker: "durable" });
		const file = sidecarFile(session);
		await appendFile(file, Buffer.concat([Buffer.from('{"v":1,"id":"torn","text":"'), Buffer.from([0xe2, 0x82])]));

		const recovering = new SidecarStore(() => session, sessionId);
		assert.equal((await recovering.load()).length, 1, "the incomplete final record is ignored");
		await recovering.append("control", { enabled: false });

		const raw = await readFile(file);
		assert.equal(raw.at(-1), 0x0a); assert(!raw.includes(Buffer.from('"id":"torn"')));
		const cold = await new SidecarStore(() => session, sessionId).load();
		assert.deepEqual(cold.map(record => record.type), ["attempt", "control"]);
		assert.equal(cold[0].data.marker, "durable"); assert.equal(cold[1].data.enabled, false);
	} finally { await rm(dir, { recursive: true, force: true }); }
});

test("a failed partial append invalidates same-instance caches before the next append", async () => {
	const dir = await mkdtemp(join(tmpdir(), "mom-sidecar-partial-"));
	const session = join(dir, "session.jsonl"), sessionId = "session-partial";
	try {
		await writeFile(session, "{}\n");
		await new SidecarStore(() => session, sessionId).append("attempt", { marker: "existing" });
		let fail = true;
		const io: SidecarIO = {
			read: (file) => readFile(file),
			truncate: (file, bytes) => truncate(file, bytes),
			append: async (file, data) => {
				if (!fail) { await appendFile(file, data); return; }
				fail = false;
				await appendFile(file, Buffer.from(data).subarray(0, Math.floor(Buffer.byteLength(data) / 2)));
				throw new Error("injected partial append");
			},
		};
		const store = new SidecarStore(() => session, sessionId, io);
		await assert.rejects(() => store.append("checkpoint", { marker: "must-not-survive" }), /injected partial append/);
		await store.append("attempt", { marker: "recovered" });

		const cold = await new SidecarStore(() => session, sessionId).load();
		assert.deepEqual(cold.map(record => record.data.marker), ["existing", "recovered"]);
		assert.deepEqual(cold.map(record => record.type), ["attempt", "attempt"]);
	} finally { await rm(dir, { recursive: true, force: true }); }
});

test("corruption in a complete line remains a loud sidecar failure", async () => {
	const dir = await mkdtemp(join(tmpdir(), "mom-sidecar-corrupt-"));
	const session = join(dir, "session.jsonl"), sessionId = "session-two";
	try {
		await writeFile(session, "{}\n");
		const store = new SidecarStore(() => session, sessionId);
		await store.append("attempt", { marker: "durable" });
		await appendFile(sidecarFile(session), "{not-json}\n{\"torn\":");
		await assert.rejects(() => new SidecarStore(() => session, sessionId).load(), /JSON/);
	} finally { await rm(dir, { recursive: true, force: true }); }
});
