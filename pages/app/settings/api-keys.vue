<template>
  <div class="settings-page">
    <h1 class="settings-title">API keys</h1>
    <p class="settings-sub">
      Keys authenticate inbound events (orders) to the events API. The full key
      is shown once at creation — store it securely.
    </p>

    <!-- Create -->
    <form class="card" @submit.prevent="onCreate">
      <label class="field">
        <span class="field-label">Key name</span>
        <input v-model="newName" class="input" type="text" placeholder="e.g. Storefront production" />
      </label>
      <Button type="submit" :disabled="loading || !newName.trim()">
        {{ loading ? "Creating…" : "Create key" }}
      </Button>
      <p v-if="error" class="error">{{ error }}</p>
    </form>

    <!-- Freshly created raw key (shown once) -->
    <div v-if="rawKey" class="card raw-card">
      <p class="raw-label">Your new key — copy it now, it won't be shown again:</p>
      <div class="raw-row">
        <code class="raw-key">{{ rawKey }}</code>
        <Button type="button" @click="copy(rawKey)">{{ copied === rawKey ? "Copied" : "Copy" }}</Button>
      </div>
    </div>

    <!-- List -->
    <div class="card">
      <h2 class="section-title">Your keys</h2>
      <p v-if="!keys.length" class="muted">No API keys yet.</p>
      <ul v-else class="key-list">
        <li v-for="k in keys" :key="k.objectId" class="key-row" :class="{ revoked: k.revokedAt }">
          <div class="key-meta">
            <span class="key-name">{{ k.name || "Unnamed" }}</span>
            <code class="key-prefix">{{ k.keyPrefix }}…</code>
            <span v-if="k.revokedAt" class="pill-revoked">Revoked</span>
            <span v-else class="pill-active">Active</span>
          </div>
          <div class="key-actions">
            <span class="key-used">{{ k.lastUsedAt ? "Last used " + fmt(k.lastUsedAt) : "Never used" }}</span>
            <Button v-if="!k.revokedAt" type="button" class="danger" @click="onRevoke(k.objectId)">Revoke</Button>
          </div>
        </li>
      </ul>
    </div>

    <!-- Conversion pixel snippet -->
    <div class="card">
      <h2 class="section-title">Conversion pixel</h2>
      <p class="muted">
        Drop this on your order-confirmation page to attribute revenue from a
        tracked click. Set <code>orderId</code> and <code>value</code> (in minor
        units, e.g. cents) per order.
      </p>
      <div class="snippet-row">
        <pre class="snippet"><code>{{ snippet }}</code></pre>
        <Button type="button" @click="copy(snippet)">{{ copied === snippet ? "Copied" : "Copy" }}</Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: "app", middleware: "auth-required" });

import { ref, onMounted, computed } from "vue";
import { useApiKeys, conversionPixelSnippet } from "../../../composables/app/useApiKeys";

const { keys, loading, error, list, create, revoke } = useApiKeys();

const newName = ref("");
const rawKey = ref<string | null>(null);
const copied = ref<string | null>(null);

const snippet = computed(() => conversionPixelSnippet());

function fmt(d: string | Date | null): string {
  if (!d) return "";
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
  rawKey.value = null;
  const created = await create(newName.value.trim());
  if (created) {
    rawKey.value = created.key;
    newName.value = "";
    await list();
  }
}

async function onRevoke(id: string) {
  await revoke(id);
  await list();
}

onMounted(list);
</script>

<style scoped>
.settings-page { max-width: var(--container-narrow, 720px); }
.settings-title { font-size: var(--font-size-2xl); font-weight: var(--font-weight-bold); color: var(--color-text); }
.settings-sub { color: var(--color-text-muted); margin-bottom: var(--space-6); }
.card { display: flex; flex-direction: column; gap: var(--space-4); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-6); margin-bottom: var(--space-6); }
.field { display: flex; flex-direction: column; gap: var(--space-2); }
.field-label { font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); color: var(--color-text); }
.input { padding: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); font-size: var(--font-size-base); background: var(--color-bg); color: var(--color-text); }
.section-title { font-size: var(--font-size-lg); font-weight: var(--font-weight-bold); color: var(--color-text); }
.muted { color: var(--color-text-muted); font-size: var(--font-size-sm); }
.error { color: var(--color-danger, #c0392b); font-size: var(--font-size-sm); }

.raw-card { border-color: var(--color-primary); }
.raw-label { font-weight: var(--font-weight-medium); color: var(--color-text); }
.raw-row { display: flex; align-items: center; gap: var(--space-3); }
.raw-key { flex: 1; padding: var(--space-3); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-md); font-family: var(--font-mono, monospace); font-size: var(--font-size-sm); word-break: break-all; color: var(--color-text); }

.key-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: var(--space-3); }
.key-row { display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); padding: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
.key-row.revoked { opacity: 0.6; }
.key-meta { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
.key-name { font-weight: var(--font-weight-medium); color: var(--color-text); }
.key-prefix { font-family: var(--font-mono, monospace); font-size: var(--font-size-sm); color: var(--color-text-muted); }
.pill-active { font-size: var(--font-size-xs); color: var(--color-success, #2e7d32); }
.pill-revoked { font-size: var(--font-size-xs); color: var(--color-danger, #c0392b); }
.key-actions { display: flex; align-items: center; gap: var(--space-3); }
.key-used { font-size: var(--font-size-xs); color: var(--color-text-muted); }
.danger { color: var(--color-danger, #c0392b); }

.snippet-row { display: flex; flex-direction: column; gap: var(--space-3); align-items: flex-start; }
.snippet { width: 100%; overflow-x: auto; padding: var(--space-4); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-md); font-family: var(--font-mono, monospace); font-size: var(--font-size-xs); color: var(--color-text); }
</style>
