// useStores — app-only composable for managing ecommerce StoreConnections.
// Mirrors useApiKeys.ts: wraps the org-scoped cloud functions in
// server/cloud/stores.js via the shared useApi() (Parse.Cloud.run) wrapper.

import { ref } from "vue";
import { useApi } from "../shared/useApi";

export interface StoreConnection {
  id: string;
  provider: "shopify" | "woocommerce" | "bigcommerce" | "custom";
  shopDomain: string;
  status: "connected" | "pending" | "error";
  installedAt?: string | null;
  lastEventAt?: string | null;
  settings?: { attributionWindowDays?: number; currency?: string };
  webhookUrl: string;
  createdAt?: string | null;
}

export interface CreatedStoreConnection extends StoreConnection {
  // Returned ONLY by createStoreConnection — shown once for the user to paste.
  webhookSecret: string;
}

export function useStores() {
  const { run, loading, error } = useApi();
  const stores = ref<StoreConnection[]>([]);

  async function list(): Promise<StoreConnection[]> {
    const res = await run<StoreConnection[]>("listStoreConnections");
    stores.value = res || [];
    return stores.value;
  }

  async function create(
    provider: StoreConnection["provider"],
    shopDomain: string,
  ): Promise<CreatedStoreConnection | null> {
    return run<CreatedStoreConnection>("createStoreConnection", { provider, shopDomain });
  }

  async function remove(id: string): Promise<{ id: string; deleted: boolean } | null> {
    return run<{ id: string; deleted: boolean }>("deleteStoreConnection", { id });
  }

  return { stores, loading, error, list, create, remove };
}
