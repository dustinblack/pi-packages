import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { buildFeed, lookup, metrics, renderFeed, type Feed } from "./slim-feed.ts";

const [action, input, target, ...rest] = process.argv.slice(2);
const usage = "Usage: tsx experiments/slim-replay.ts measure SESSION [--until ISO] | export SESSION NEW_DIRECTORY [--until ISO] | lookup BUNDLE REF [OFFSET LIMIT]";
try {
	if (!input) throw new Error(usage);
	if (action === "lookup") {
		if (!target) throw new Error(usage);
		const feed: Feed = JSON.parse(await readFile(join(input, "sources.json"), "utf8"));
		feed.events = (await readFile(join(input, "feed.jsonl"), "utf8")).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
		console.log(JSON.stringify(await lookup(feed, target, rest[0] === undefined ? 0 : Number(rest[0]), rest[1] === undefined ? 4000 : Number(rest[1])), null, 2));
	} else {
		if (!["measure", "export"].includes(action)) throw new Error(usage);
		const options = action === "measure" ? [target, ...rest].filter((s) => s !== undefined) : rest;
		if (options.length && (options.length !== 2 || options[0] !== "--until" || !Number.isFinite(Date.parse(options[1]!)))) throw new Error(usage);
		const until = options.length ? Date.parse(options[1]!) : Infinity;
		const started = performance.now();
		const feed = await buildFeed(input, until);
		const report = { source: resolve(input), until: Number.isFinite(until) ? new Date(until).toISOString() : null,
			...metrics(feed), extractionMs: Math.round(performance.now() - started) };
		if (action === "export") {
			if (!target) throw new Error(usage);
			await mkdir(target, { mode: 0o700 }); // New explicit private directory; never overwrite prior evidence.
			const save = (name: string, data: string) => writeFile(join(target, name), data, { mode: 0o600, flag: "wx" });
			await save("feed.jsonl", feed.events.map((e) => JSON.stringify(e)).join("\n") + "\n");
			await save("feed.txt", renderFeed(feed));
			await save("sources.json", JSON.stringify({ ...feed, events: undefined }));
			await save("metrics.json", JSON.stringify(report, null, 2) + "\n");
			console.log(`Private replay bundle: ${resolve(target)}`);
		}
		console.log(JSON.stringify(report, null, 2));
		if (feed.gaps.length) process.exitCode = 2;
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}
