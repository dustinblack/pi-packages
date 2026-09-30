import { z } from "zod";
// Versioned adapter capability. ACP load/resume alone does not establish native-ID semantics.
export const NATIVE_SESSION_CAPABILITY = "pi-strings/native-session";
export const NATIVE_SESSION_DESCRIBE = "pi-strings/session/describe";
export const NativeSessionBindingSchema = z.object({
    id: z.string().min(1),
    scope: z.string().min(1),
    cwd: z.string().min(1),
}).strict();
export const NativeSessionDescriptionSchema = NativeSessionBindingSchema.extend({
    executionEnvironment: z.string().min(1),
    attachment: z.enum(["stored-session", "shared-session"]),
    disconnectEffect: z.enum(["stops-local-executor", "remote-work-continues"]),
    concurrentNativeClients: z.enum(["unsupported", "supported", "unknown"]),
    activity: z.enum(["idle", "running", "unknown"]),
}).strict();
export function requireNativeSessionBinding(raw, expected) {
    const actual = NativeSessionBindingSchema.parse(raw);
    if (actual.id !== expected.id || actual.scope !== expected.scope || actual.cwd !== expected.cwd) {
        throw new Error("Native session identity or workspace changed during opening.");
    }
}
