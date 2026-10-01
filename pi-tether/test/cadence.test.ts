import assert from "node:assert/strict";
import { test } from "node:test";
import { AGED_BATCH_DELAY_MS, LeadCadence } from "../src/cadence.ts";

test("ordinary updates wait for five lead exchanges or two exchanges aged ten minutes", () => {
	const cadence = new LeadCadence();
	cadence.settled("lead", 1, 1000);
	assert.equal(cadence.deadline(AGED_BATCH_DELAY_MS + 1000), undefined, "one exchange never ages into a wake by itself");
	cadence.settled("lead", 2, 2000);
	assert.equal(cadence.deadline(AGED_BATCH_DELAY_MS + 999), AGED_BATCH_DELAY_MS + 1000, "the deadline uses the oldest pending exchange");
	assert.equal(cadence.deadline(AGED_BATCH_DELAY_MS + 1000), AGED_BATCH_DELAY_MS + 1000, "exactly ten minutes is due");
	assert.equal(cadence.deadline(AGED_BATCH_DELAY_MS + 20_000), AGED_BATCH_DELAY_MS + 20_000, "an already-due batch runs now");
});

test("delegate settlements coalesce without counting as lead exchanges", () => {
	const cadence = new LeadCadence();
	cadence.settled("lead", 1, 0);
	for (let i = 0; i < 20; i++) cadence.settled("delegate", i + 2, i + 1);
	assert.equal(cadence.count, 1);
	assert.equal(cadence.deadline(AGED_BATCH_DELAY_MS), undefined);
	cadence.settled("lead", 22, 1);
	assert.equal(cadence.deadline(AGED_BATCH_DELAY_MS), AGED_BATCH_DELAY_MS, "the lead threshold still starts from the first lead exchange");
});

test("five exchanges are due immediately; accepted revisions consume only covered settlements", () => {
	const cadence = new LeadCadence();
	for (let revision = 1; revision <= 5; revision++) cadence.settled("lead", revision, revision * 10);
	assert.equal(cadence.deadline(50), 50);
	cadence.coveredThrough(4);
	assert.equal(cadence.count, 1);
	assert.equal(cadence.deadline(50), undefined, "a partially covered revision does not meet either gate");
	cadence.settled("lead", 6, 60);
	assert.equal(cadence.deadline(60), 50 + AGED_BATCH_DELAY_MS, "the remaining pair ages from its oldest uncovered exchange");
	cadence.coveredThrough(6);
	assert.equal(cadence.count, 0);
	assert.equal(cadence.deadline(AGED_BATCH_DELAY_MS * 2), undefined);
});
