// Transitional shim (todo 041 → 053): the ACP runtime and the op_* extension now live in
// pi-delegate. pi-strings keeps loading them from there until todo 053 retires this package.
export { default } from "../../pi-delegate/src/acp/index.ts";
