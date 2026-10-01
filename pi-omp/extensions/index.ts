import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadConfig, isFeatureEnabled, type PiOmpConfig } from "../src/config";
import { installPersona } from "./personality";
import { installEngineering } from "./engineering";
import { installKeywords } from "./keywords";
import { installRoles } from "./roles";
import { installAutoThinking } from "./autothinking";
import { installAutoLearn } from "./autolearn";
import { installCommit } from "./commit";
import { installSettings } from "./settings";

export default async function (pi: ExtensionAPI): Promise<void> {
	const config = await loadConfig(process.cwd());
	wire(pi, config);
}

/**
 * Pulled out so it can be re-run after a settings save without re-reading the
 * factory (kept simple: index re-loads config on the next process/reload).
 */
export function wire(pi: ExtensionAPI, cfg: PiOmpConfig): void {
	if (isFeatureEnabled(cfg, "persona")) installPersona(pi, cfg);
	if (isFeatureEnabled(cfg, "engineering")) installEngineering(pi, cfg);
	if (isFeatureEnabled(cfg, "keywords")) installKeywords(pi, cfg);
	if (isFeatureEnabled(cfg, "roles")) installRoles(pi, cfg);
	if (isFeatureEnabled(cfg, "autoThinking")) installAutoThinking(pi, cfg);
	if (isFeatureEnabled(cfg, "autoLearn")) installAutoLearn(pi, cfg);
	if (isFeatureEnabled(cfg, "commit")) installCommit(pi, cfg);
	installSettings(pi); // settings view is always available so features can be re-enabled
}
