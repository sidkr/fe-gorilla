<template>
  <div class="settings-page">
    <h1 class="settings-title">Integrations</h1>
    <p class="settings-sub">
      Connect your store so orders are attributed back to campaigns. We verify
      every webhook with a signing secret you paste into your store admin.
    </p>

    <!-- Connect a store -->
    <form class="card" @submit.prevent="onCreate">
      <h2 class="section-title">Connect a store</h2>
      <div class="connect-row">
        <label class="field">
          <span class="field-label">Platform</span>
          <select v-model="provider" class="input">
            <option v-for="p in PROVIDERS" :key="p.value" :value="p.value">
              {{ p.label }}
            </option>
          </select>
        </label>
        <label class="field grow">
          <span class="field-label">Store domain</span>
          <input
            v-model="shopDomain"
            class="input"
            type="text"
            placeholder="your-store.myshopify.com"
            autocomplete="off"
          />
        </label>
        <Button type="submit" :disabled="loading || !shopDomain.trim()">
          {{ loading ? "Connecting…" : "Connect" }}
        </Button>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
    </form>

    <!-- Freshly created connection: webhook URL + secret (shown once) -->
    <div v-if="justCreated" class="card raw-card">
      <h2 class="section-title">Finish setup in your store admin</h2>
      <p class="muted">
        Add a webhook in your store pointing to the URL below, and paste this
        secret as the signing secret.
        <strong>The secret is shown only once.</strong>
      </p>
      <div class="kv">
        <span class="kv-label">Webhook URL</span>
        <code class="kv-value">{{ justCreated.webhookUrl }}</code>
        <Button type="button" @click="copy(justCreated.webhookUrl)">
          {{ copied === justCreated.webhookUrl ? "Copied" : "Copy" }}
        </Button>
      </div>
      <div class="kv">
        <span class="kv-label">Signing secret</span>
        <code class="kv-value">{{ justCreated.webhookSecret }}</code>
        <Button type="button" @click="copy(justCreated.webhookSecret)">
          {{ copied === justCreated.webhookSecret ? "Copied" : "Copy" }}
        </Button>
      </div>
    </div>

    <!-- Connected stores -->
    <div class="card">
      <h2 class="section-title">Connected stores</h2>
      <p v-if="initialLoad" class="muted">Loading…</p>
      <p v-else-if="!stores.length" class="muted">No stores connected yet.</p>
      <ul v-else class="store-list">
        <li v-for="s in stores" :key="s.id" class="store-row">
          <div class="store-meta">
            <span
              class="pill"
              :class="s.status === 'connected' ? 'pill-active' : 'pill-pending'"
            >{{ s.status }}</span>
            <span class="store-domain">{{ s.shopDomain }}</span>
            <span class="store-provider">{{ s.provider }}</span>
          </div>
          <div class="store-actions">
            <span class="store-used">Last event: {{ fmt(s.lastEventAt) }}</span>
            <Button type="button" class="danger" @click="onDelete(s.id)">Disconnect</Button>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: "app", middleware: "auth-required" });

import { ref, onMounted } from "vue";
import { useStores, type CreatedStoreConnection, type StoreConnection } from "../../../composables/app/useStores";

useHead({ title: "Integrations" });

const { stores, loading, error, list, create, remove } = useStores();

const PROVIDERS = [
  { value: "shopify", label: "Shopify" },
  { value: "woocommerce", label: "WooCommerce" },
] as const;

const provider = ref<StoreConnection["provider"]>("shopify");
const shopDomain = ref("");
const initialLoad = ref(true);
const justCreated = ref<CreatedStoreConnection | null>(null);
const copied = ref<string | null>(null);

function fmt(d?: string | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString();
  } catch {
    return String(d);
  }
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    copied.value = text;
    setTimeout(() => {
      if (copied.value === text) copied.value = null;
    }, 2000);
  } catch {
    /* clipboard unavailable */
  }
}

async function onCreate() {
  if (!shopDomain.value.trim()) return;
  const created = await create(provider.value, shopDomain.value.trim());
  if (created) {
    justCreated.value = created;
    shopDomain.value = "";
    await list();
  }
}

async function onDelete(id: string) {
  if (!confirm("Disconnect this store? Future orders will stop being attributed.")) return;
  await remove(id);
  if (justCreated.value?.id === id) justCreated.value = null;
  await list();
}

onMounted(async () => {
  await list();
  initialLoad.value = false;
});
</script>

<style scoped>
.settings-page { max-width: var(--container-narrow, 720px); }
.settings-title { font-size: var(--font-size-2xl, 1.5rem); font-weight: var(--font-weight-bold, 700); color: var(--color-text, var(--color-ink)); }
.settings-sub { color: var(--color-text-muted, var(--color-ink-soft)); margin-bottom: var(--space-6); }

.card { display: flex; flex-direction: column; gap: var(--space-4); background: var(--color-surface); border: 1px solid var(--color-border, var(--color-rule)); border-radius: var(--radius-lg); padding: var(--space-6); margin-bottom: var(--space-6); }
.section-title { font-size: var(--font-size-lg, 1.125rem); font-weight: var(--font-weight-bold, 700); color: var(--color-text, var(--color-ink)); margin: 0; }
.muted { color: var(--color-text-muted, var(--color-ink-soft)); font-size: var(--font-size-sm, 0.875rem); margin: 0; }
.error { color: var(--color-danger, #c0392b); font-size: var(--font-size-sm, 0.875rem); margin: 0; }

.connect-row { display: flex; gap: var(--space-3); align-items: flex-end; flex-wrap: wrap; }
.field { display: flex; flex-direction: column; gap: var(--space-2); }
.field.grow { flex: 1; min-width: 14rem; }
.field-label { font-size: var(--font-size-sm, 0.875rem); font-weight: var(--font-weight-medium, 600); color: var(--color-text, var(--color-ink)); }
.input { padding: var(--space-3); border: 1px solid var(--color-border, var(--color-rule)); border-radius: var(--radius-md); font-size: var(--font-size-base, 1rem); background: var(--color-bg, var(--color-surface)); color: var(--color-text, var(--color-ink)); }

.raw-card { border-color: var(--color-pop, var(--color-primary)); }
.kv { display: flex; align-items: center; gap: var(--space-3); }
.kv-label { flex: 0 0 8rem; color: var(--color-text-muted, var(--color-ink-soft)); font-size: var(--font-size-sm, 0.875rem); }
.kv-value { flex: 1; padding: var(--space-3); background: var(--color-bg, var(--color-surface)); border: 1px solid var(--color-border, var(--color-rule)); border-radius: var(--radius-md); font-family: var(--font-mono, monospace); font-size: var(--font-size-sm, 0.875rem); word-break: break-all; color: var(--color-text, var(--color-ink)); }

.store-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: var(--space-3); }
.store-row { display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); padding: var(--space-3); border: 1px solid var(--color-border, var(--color-rule)); border-radius: var(--radius-md); flex-wrap: wrap; }
.store-meta { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
.store-domain { font-weight: var(--font-weight-medium, 600); color: var(--color-text, var(--color-ink)); }
.store-provider { font-size: var(--font-size-xs, 0.75rem); color: var(--color-text-muted, var(--color-ink-soft)); text-transform: capitalize; }
.pill { font-size: var(--font-size-xs, 0.75rem); text-transform: capitalize; padding: 0.1rem 0.5rem; border-radius: var(--radius-pill, 999px); }
.pill-active { color: var(--color-success, #2e7d32); background: var(--color-success-soft, rgba(46,125,50,0.1)); }
.pill-pending { color: var(--color-text-muted, var(--color-ink-soft)); background: var(--color-rule, rgba(0,0,0,0.06)); }
.store-actions { display: flex; align-items: center; gap: var(--space-3); }
.store-used { font-size: var(--font-size-xs, 0.75rem); color: var(--color-text-muted, var(--color-ink-soft)); }
.danger { color: var(--color-danger, #c0392b); }
</style>
