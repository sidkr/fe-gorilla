/**
 * useApiKeys — app-side wrapper over the API-key cloud functions.
 *
 * createApiKey returns the RAW key exactly once; the caller must surface it
 * to the user immediately (it's never retrievable again).
 */

import { ref } from "vue";
import { useApi } from "../shared/useApi";

export interface ApiKey {
  objectId: string;
  name: string | null;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | Date | null;
  revokedAt: string | Date | null;
  createdAt: string | Date | null;
}

export interface CreatedApiKey extends ApiKey {
  /** Raw key, shown once. */
  key: string;
}

export function useApiKeys() {
  const { run, loading, error } = useApi();
  const keys = ref<ApiKey[]>([]);

  async function list(): Promise<ApiKey[]> {
    const res = await run<ApiKey[]>("listApiKeys");
    keys.value = res || [];
    return keys.value;
  }

  async function create(name: string, scopes?: string[]): Promise<CreatedApiKey | null> {
    return run<CreatedApiKey>("createApiKey", { name, scopes });
  }

  async function revoke(id: string): Promise<ApiKey | null> {
    return run<ApiKey>("revokeApiKey", { id });
  }

  return { keys, loading, error, list, create, revoke };
}

/**
 * Build a copyable conversion-pixel snippet.
 *
 * The snippet reads the signed `gk_attr` token handed off on the tracked click
 * (see server/routes/tracking.js) from either the current URL or a value the
 * merchant stores at checkout, then fires the conversion pixel with the order
 * details. Money is integer minor units (cents).
 */
export function conversionPixelSnippet(origin?: string): string {
  const base = origin || (typeof window !== "undefined" ? window.location.origin : "https://your-domain.com");
  return `<!-- Gorilla conversion pixel: place on your order-confirmation page -->
<script>
(function () {
  // The signed attribution token is handed off on the tracked click as ?gk_attr=...
  // Persist it at checkout (e.g. in a cookie) and read it back here.
  function getAttr() {
    var m = location.search.match(/[?&]gk_attr=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : "";
  }
  var token = getAttr();
  if (!token) return;
  var params = {
    orderId: "ORDER_ID",   // your unique order id
    value: 0,              // total in MINOR units (e.g. cents)
    currency: "USD"
  };
  var qs = "orderId=" + encodeURIComponent(params.orderId) +
           "&value=" + encodeURIComponent(params.value) +
           "&currency=" + encodeURIComponent(params.currency);
  var img = new Image(1, 1);
  img.src = "${base}/t/p/" + encodeURIComponent(token) + "?" + qs;
})();
<\/script>`;
}
