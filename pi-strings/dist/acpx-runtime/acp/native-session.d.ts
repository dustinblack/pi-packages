import { z } from "zod";
export declare const NATIVE_SESSION_CAPABILITY = "pi-strings/native-session";
export declare const NATIVE_SESSION_DESCRIBE = "pi-strings/session/describe";
export declare const NativeSessionBindingSchema: z.ZodObject<{
    id: z.ZodString;
    scope: z.ZodString;
    cwd: z.ZodString;
}, z.core.$strict>;
export type NativeSessionBinding = z.infer<typeof NativeSessionBindingSchema>;
export declare const NativeSessionDescriptionSchema: z.ZodObject<{
    id: z.ZodString;
    scope: z.ZodString;
    cwd: z.ZodString;
    executionEnvironment: z.ZodString;
    attachment: z.ZodEnum<{
        "stored-session": "stored-session";
        "shared-session": "shared-session";
    }>;
    disconnectEffect: z.ZodEnum<{
        "stops-local-executor": "stops-local-executor";
        "remote-work-continues": "remote-work-continues";
    }>;
    concurrentNativeClients: z.ZodEnum<{
        unsupported: "unsupported";
        supported: "supported";
        unknown: "unknown";
    }>;
    activity: z.ZodEnum<{
        unknown: "unknown";
        idle: "idle";
        running: "running";
    }>;
}, z.core.$strict>;
export type NativeSessionDescription = z.infer<typeof NativeSessionDescriptionSchema>;
export declare function requireNativeSessionBinding(raw: unknown, expected: NativeSessionBinding): void;
