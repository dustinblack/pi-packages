import { appendFile, readFile, truncate } from "node:fs/promises";
import { randomUUID } from "node:crypto";

export type SidecarType = "checkpoint" | "progress" | "control" | "notice" | "attempt" | "failure" | "gap";
export interface SidecarRecord { v: 1; id: string; sessionId: string; type: SidecarType; at: number; data: Record<string, any> }

/** Mom's durable state lives in an append-only sidecar beside the session transcript, never inside it. */
export interface MomStore {
	/** This session's durable records, oldest first; empty until the sidecar exists. */
	load(): Promise<SidecarRecord[]>;
	append(type: SidecarType, data: Record<string, any>): Promise<SidecarRecord>;
}

// Pi's session lister scans every *.jsonl file in the session directory; the sidecar must not match.
export const sidecarFile = (sessionFile: string) => sessionFile.replace(/\.jsonl$/, "") + ".mom";

const types: readonly SidecarType[] = ["checkpoint", "progress", "control", "notice", "attempt", "failure", "gap"];

export interface SidecarIO {
	read(file: string): Promise<Buffer>;
	append(file: string, data: string): Promise<void>;
	truncate(file: string, bytes: number): Promise<void>;
}
const nodeIO: SidecarIO = {
	read: (file) => readFile(file),
	append: (file, data) => appendFile(file, data),
	truncate: (file, bytes) => truncate(file, bytes),
};

export class SidecarStore implements MomStore {
	private records?: SidecarRecord[];
	private torn?: { file: string; bytes: number };
	constructor(private readonly sessionFile: () => string | undefined, private readonly sessionId: string,
		private readonly io: SidecarIO = nodeIO) {}

	async load(): Promise<SidecarRecord[]> {
		if (this.records) return this.records;
		this.records = [];
		const session = this.sessionFile();
		if (!session) return this.records; // no session file: no durable state
		const file = sidecarFile(session);
		let bytes: Buffer = Buffer.alloc(0);
		try { bytes = await this.io.read(file); }
		catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
		// Locate the durable prefix in bytes, not decoded characters: a torn write may
		// end in the middle of a UTF-8 sequence. Corrupt complete lines remain loud.
		const newline = bytes.lastIndexOf(0x0a);
		const durableBytes = newline + 1;
		if (durableBytes < bytes.length) this.torn = { file, bytes: durableBytes };
		const text = bytes.subarray(0, durableBytes).toString("utf8");
		for (const line of text.split("\n")) {
			if (!line) continue;
			const record = JSON.parse(line) as SidecarRecord;
			if (record?.v !== 1 || !record || typeof record !== "object" || typeof record.id !== "string" ||
				typeof record.sessionId !== "string" || !types.includes(record.type) ||
				!Number.isFinite(record.at) || !record.data || typeof record.data !== "object") throw new Error(`Corrupt Mom state line in ${file}`);
			if (record.sessionId === this.sessionId) this.records.push(record);
		}
		return this.records;
	}

	async append(type: SidecarType, data: Record<string, any>): Promise<SidecarRecord> {
		const session = this.sessionFile();
		if (!session) throw new Error("Mom needs a persisted session file for her state; in-memory sessions keep none.");
		try {
			await this.load();
			if (this.torn) {
				await this.io.truncate(this.torn.file, this.torn.bytes);
				this.torn = undefined;
			}
			const record: SidecarRecord = { v: 1, id: randomUUID(), sessionId: this.sessionId, type, at: Date.now(), data };
			await this.io.append(sidecarFile(session), JSON.stringify(record) + "\n");
			this.records!.push(record);
			return record;
		} catch (error) {
			// The filesystem may have accepted only a prefix before rejecting. Forget
			// both caches so the next same-instance append re-reads and repairs the file.
			this.records = undefined;
			this.torn = undefined;
			throw error;
		}
	}
}
