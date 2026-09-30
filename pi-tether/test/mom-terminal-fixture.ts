import tether from "../src/index.ts";

/** Actual extension with only its model/interval flags redirected to the loopback proof provider. */
export default function (pi: any) {
	tether(new Proxy(pi, { get(target, key) {
		if (key === "getFlag") return (name: string) => name === "mom-model" ? "fixture/fixture" : name === "mom-interval-ms" ? "0" : target.getFlag(name);
		return target[key];
	} }));
	pi.on("session_start", (_event: any, ctx: any) => ctx.ui.setStatus("mom-proof", "MOM-PROOF-READY"));
}
