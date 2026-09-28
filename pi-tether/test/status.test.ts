import assert from "node:assert/strict";
import { test } from "node:test";
import { formatElapsed, isStatusPing } from "../src/status.ts";

test("bare status pings are recognized; real messages are not", () => {
	for (const s of ["??", "?", "status?", "Status", "next?", "whats next?", "what's next", "where are we?", "what are you doing?", "what's going on", "progress?", "  ?? ", "status?."])
		assert.equal(isStatusPing(s), true, s);
	for (const s of ["what is the vertex status??", "Also, the rail is broken", "next, fix the rail", "why did you do that?", "status of 1380?", ""])
		assert.equal(isStatusPing(s), false, s);
});

test("elapsed formatting", () => {
	assert.equal(formatElapsed(4_000), "4s");
	assert.equal(formatElapsed(125_000), "2m 5s");
	assert.equal(formatElapsed(3_900_000), "1h 5m");
});
