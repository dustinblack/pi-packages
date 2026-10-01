import type { Credential, CredentialStore } from "@earendil-works/pi-ai";
import { ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { piCredentialUtil } from "./pi-credentials";

function memoryStore(): CredentialStore & { data: Map<string, Credential> } {
  const data = new Map<string, Credential>();
  return {
    data,
    read: async (providerId) => data.get(providerId),
    list: async () => [...data].map(([providerId, credential]) => ({ providerId, type: credential.type })),
    modify: async (providerId, fn) => {
      const next = await fn(data.get(providerId));
      if (next) data.set(providerId, next);
      return data.get(providerId);
    },
    delete: async (providerId) => {
      data.delete(providerId);
    },
  };
}

async function createRegistry() {
  const store = memoryStore();
  const runtime = await ModelRuntime.create({ credentials: store, modelsPath: null, refreshOnCreate: false });
  return { store, registry: new ModelRegistry(runtime) };
}

describe("piCredentialUtil against Pi's ModelRegistry", () => {
  it("persists and removes stored credentials through the runtime store", async () => {
    const { store, registry } = await createRegistry();

    await piCredentialUtil.setStoredCredential(registry, "anthropic", { type: "api_key", key: "stored-key" });
    expect(store.data.get("anthropic")).toEqual({ type: "api_key", key: "stored-key" });
    expect(registry.getProviderAuthStatus("anthropic")).toMatchObject({ configured: true, source: "stored" });

    await piCredentialUtil.removeStoredCredential(registry, "anthropic");
    expect(store.data.has("anthropic")).toBe(false);
    expect(registry.getProviderAuthStatus("anthropic").source).not.toBe("stored");
  });

  it("sets runtime API-key overrides without touching the stored credential", async () => {
    const { store, registry } = await createRegistry();
    await piCredentialUtil.setStoredCredential(registry, "anthropic", { type: "api_key", key: "stored-key" });

    await piCredentialUtil.setRuntimeApiKey(registry, "anthropic", "runtime-key");
    expect(registry.getProviderAuthStatus("anthropic")).toMatchObject({ configured: true, source: "runtime" });
    expect(await registry.getApiKeyForProvider("anthropic")).toBe("runtime-key");

    await piCredentialUtil.removeRuntimeApiKey(registry, "anthropic");
    expect(registry.getProviderAuthStatus("anthropic").source).toBe("stored");
    expect(store.data.get("anthropic")).toEqual({ type: "api_key", key: "stored-key" });
  });
});
