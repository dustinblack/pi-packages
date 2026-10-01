export const LEAD_EXCHANGE_BATCH = 5;
export const AGED_BATCH_SIZE = 2;
export const AGED_BATCH_DELAY_MS = 10 * 60 * 1000;

export type SettlementKind = "lead" | "delegate";

interface LeadSettlement {
	revision: number;
	at: number;
}

/** Tracks only completed lead exchanges; worker settlements never enter this queue. */
export class LeadCadence {
	private readonly pending: LeadSettlement[] = [];

	settled(kind: SettlementKind, revision: number, at: number): void {
		if (kind === "lead") this.pending.push({ revision, at });
	}

	get count(): number { return this.pending.length; }

	/** Absolute one-shot deadline, or undefined until ordinary work is due. */
	deadline(now: number): number | undefined {
		if (this.pending.length < AGED_BATCH_SIZE) return undefined;
		if (this.pending.length >= LEAD_EXCHANGE_BATCH) return now;
		return Math.max(now, this.pending[0].at + AGED_BATCH_DELAY_MS);
	}

	/** Forget only exchanges covered by an accepted durable update. */
	coveredThrough(revision: number): void {
		let count = 0;
		while (count < this.pending.length && this.pending[count].revision <= revision) count++;
		if (count) this.pending.splice(0, count);
	}

	reset(): void { this.pending.length = 0; }
}
