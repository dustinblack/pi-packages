import assert from "node:assert/strict";
import { test } from "node:test";
import { widgetLines } from "../src/panel.ts";

test("cached widget shows freshness and one advisory without source-ID clutter", () => {
	const theme: any = { fg: (_color: string, text: string) => text, bold: (text: string) => text, strikethrough: (text: string) => text };
	assert.deepEqual(widgetLines({ status: "caught up", summary: "# Purpose\nPreserve the return path. [src:session:entry]", note: "Keep user files untouched." }, theme, 100), [
		"", "Mom · caught up", "Preserve the return path.", "↳ Keep user files untouched.",
	]);
});
