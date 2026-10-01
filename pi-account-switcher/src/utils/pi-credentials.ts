import type { Credential, CredentialStore } from "@earendil-works/pi-ai";
import { readStoredCredential, type ModelRegistry } from "@earendil-works/pi-coding-agent";

/**
 * Credential operations on the ModelRuntime that backs a ModelRegistry.
 *
 * Pi 0.80+ removed `ModelRegistry.authStorage`. The registry is now a facade
 * over a ModelRuntime, which owns the runtime API-key overrides and the
 * lock-aware auth.json store. TypeScript marks `ModelRegistry.runtime`
 * private, but extensions receive the real registry, so the field exists at
 * runtime. Use the runtime instead of writing auth.json directly. A direct
 * write skips Pi's file lock and leaves the running session's auth snapshot
 * stale.
 */
interface CredentialRuntime {
  setRuntimeApiKey(providerId: string, apiKey: string): Promise<void>;
  removeRuntimeApiKey(providerId: string): Promise<void>;
  /** RuntimeCredentials: runtime overrides layered over the auth.json store. */
  credentials: CredentialStore & { store?: CredentialStore };
}

function credentialRuntime(modelRegistry: ModelRegistry): CredentialRuntime {
  const runtime = (modelRegistry as unknown as { runtime?: Partial<CredentialRuntime> }).runtime;
  if (
    !runtime ||
    typeof runtime.setRuntimeApiKey !== "function" ||
    typeof runtime.removeRuntimeApiKey !== "function" ||
    typeof runtime.credentials?.modify !== "function" ||
    typeof runtime.credentials?.delete !== "function"
  ) {
    throw new Error("pi-account-switcher requires a Pi ModelRegistry backed by ModelRuntime (Pi >=0.99.1).");
  }
  return runtime as CredentialRuntime;
}

/** The auth.json store, without the runtime API-key overrides. */
function storedCredentials(runtime: CredentialRuntime): CredentialStore {
  return runtime.credentials.store ?? runtime.credentials;
}

async function syncProvider(modelRegistry: ModelRegistry, providerId: string): Promise<void> {
  await modelRegistry.refresh({ providers: [providerId], allowNetwork: false });
}

export const piCredentialUtil = {
  setRuntimeApiKey: (modelRegistry: ModelRegistry, providerId: string, apiKey: string): Promise<void> =>
    credentialRuntime(modelRegistry).setRuntimeApiKey(providerId, apiKey),

  removeRuntimeApiKey: (modelRegistry: ModelRegistry, providerId: string): Promise<void> =>
    credentialRuntime(modelRegistry).removeRuntimeApiKey(providerId),

  /** Raw stored credential from auth.json. Configured key values (e.g. `!command`) are not resolved. */
  getStoredCredential: (providerId: string): Credential | undefined => readStoredCredential(providerId),

  /** Persist a credential to auth.json and refresh the provider's auth and model availability. */
  setStoredCredential: async (modelRegistry: ModelRegistry, providerId: string, credential: Credential) => {
    const store = storedCredentials(credentialRuntime(modelRegistry));
    await store.modify(providerId, async () => credential);
    await syncProvider(modelRegistry, providerId);
  },

  /** Remove a credential from auth.json and refresh the provider's auth and model availability. */
  removeStoredCredential: async (modelRegistry: ModelRegistry, providerId: string) => {
    const store = storedCredentials(credentialRuntime(modelRegistry));
    await store.delete(providerId);
    await syncProvider(modelRegistry, providerId);
  },
};
