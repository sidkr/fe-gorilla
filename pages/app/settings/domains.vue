<script setup lang="ts">
// Sending-domain verification (F-04). Add a domain, publish the 3 DNS records
// (DKIM/SPF/DMARC), then Verify. Mock-DNS-first: verifyDomain attempts a real
// lookup and falls back to a mock pass when DNS isn't resolvable. Pop chrome
// mirrors the sender-identities page.
import { onMounted, ref } from "vue";
import { useDomains } from "~/composables/app/useDomains";
import { useToast } from "~/composables/shared/useToast";

definePageMeta({ layout: "app", middleware: "auth-required" });
useHead({ title: "Sending domains" });

const { createSendingDomain, listSendingDomains, verifyDomain, deleteSendingDomain } = useDomains();
const { push } = useToast();

interface DnsRecord {
  kind: string;
  type: string;
  host: string;
  value: string;
  purpose?: string;
}
interface SendingDomain {
  id: string;
  domain: string;
  status: string;
  verified: boolean;
  records: DnsRecord[];
}

const domains = ref<SendingDomain[]>([]);
const loading = ref(true);
const loadError = ref("");

const newDomain = ref("");
const creating = ref(false);
const createError = ref("");

const busyId = ref<string | null>(null);

async function load() {
  loading.value = true;
  loadError.value = "";
  try {
    domains.value = await listSendingDomains();
  } catch (err: any) {
    loadError.value = err?.message || "Could not load sending domains.";
  } finally {
    loading.value = false;
  }
}
onMounted(load);

async function create() {
  if (!newDomain.value.trim()) {
    createError.value = "Enter a domain.";
    return;
  }
  creating.value = true;
  createError.value = "";
  try {
    await createSendingDomain(newDomain.value.trim());
    newDomain.value = "";
    await load();
  } catch (err: any) {
    createError.value = err?.message || "Could not add the domain.";
  } finally {
    creating.value = false;
  }
}

async function verify(d: SendingDomain) {
  busyId.value = d.id;
  try {
    const res = await verifyDomain(d.id);
    if (res.verified) {
      push(res.mocked ? "Domain verified (mock DNS)." : "Domain verified.", { tone: "success" });
    } else {
      push("Records not found yet — DNS can take up to 48 hours.");
    }
    await load();
  } catch (err: any) {
    loadError.value = err?.message || "Could not verify the domain.";
  } finally {
    busyId.value = null;
  }
}

async function remove(d: SendingDomain) {
  if (!confirm(`Remove "${d.domain}"?`)) return;
  busyId.value = d.id;
  try {
    await deleteSendingDomain(d.id);
    await load();
  } catch (err: any) {
    loadError.value = err?.message || "Could not remove the domain.";
  } finally {
    busyId.value = null;
  }
}

function statusTone(status: string): "success" | "danger" | "neutral" {
  if (status === "verified") return "success";
  if (status === "failed") return "danger";
  return "neutral";
}

function copy(value: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    navigator.clipboard.writeText(value);
    push("Copied to clipboard.", { tone: "success" });
  }
}
</script>

<template>
  <div class="dom">
    <header class="dom-header">
      <div class="dom-header-text">
        <h1>Settings</h1>
        <p class="dom-lede">Authenticate your sending domains for inbox deliverability.</p>
      </div>
    </header>

    <nav class="dom-tabs" aria-label="Settings sections">
      <NuxtLink to="/app/settings" class="dom-tab">General</NuxtLink>
      <NuxtLink to="/app/settings/senders" class="dom-tab">Sender identities</NuxtLink>
      <NuxtLink to="/app/settings/domains" class="dom-tab">Domains</NuxtLink>
      <NuxtLink to="/app/settings/suppression" class="dom-tab">Suppression</NuxtLink>
    </nav>

    <p class="dom-note">
      Add a domain, publish the DNS records below at your registrar, then verify.
      Verified domains pass DKIM, SPF, and DMARC — and campaigns can only send from
      a verified domain.
    </p>

    <form class="dom-add" @submit.prevent="create">
      <input
        v-model="newDomain"
        type="text"
        class="dom-add-input"
        placeholder="yourdomain.com"
        aria-label="Domain"
      />
      <Button type="submit" variant="primary" :loading="creating" :disabled="creating">
        {{ creating ? "Adding…" : "Add domain" }}
      </Button>
    </form>
    <p v-if="createError" class="dom-error">{{ createError }}</p>

    <p v-if="loading" class="dom-state">Loading…</p>
    <p v-else-if="loadError" class="dom-state dom-state--error">
      {{ loadError }}
      <button type="button" class="dom-retry" @click="load">Retry</button>
    </p>

    <div v-else-if="domains.length === 0" class="dom-empty">
      <h2 class="dom-empty-title">No domains yet</h2>
      <p class="dom-empty-lede">Add your first sending domain to start authenticating mail.</p>
    </div>

    <section v-for="d in domains" :key="d.id" v-else class="dom-card">
      <div class="dom-card-head">
        <div class="dom-card-title">
          <code class="dom-name">{{ d.domain }}</code>
          <Pill :tone="statusTone(d.status)">{{ d.status }}</Pill>
        </div>
        <div class="dom-card-actions">
          <button
            v-if="d.status !== 'verified'"
            type="button"
            class="dom-link"
            :disabled="busyId === d.id"
            @click="verify(d)"
          >
            {{ busyId === d.id ? "Checking…" : "Verify" }}
          </button>
          <button
            type="button"
            class="dom-link dom-link--danger"
            :disabled="busyId === d.id"
            @click="remove(d)"
          >
            Remove
          </button>
        </div>
      </div>

      <p v-if="d.status === 'verified'" class="dom-card-msg dom-card-msg--ok">
        All records verified — you can send from this domain.
      </p>
      <p v-else class="dom-card-msg">
        Add these records at your DNS provider, then click Verify. Propagation can take up to 48 hours.
      </p>

      <TableShell>
        <template #head>
          <th>Type</th>
          <th>Host</th>
          <th>Value</th>
          <th class="dom-th-actions"><span class="sr-only">Actions</span></th>
        </template>
        <template #body>
          <tr v-for="rec in d.records" :key="rec.kind">
            <td class="dom-rec-kind"><strong>{{ rec.kind }}</strong> <span class="dom-dim">({{ rec.type }})</span></td>
            <td><code class="dom-mono">{{ rec.host }}</code></td>
            <td><code class="dom-mono dom-mono--wrap">{{ rec.value }}</code></td>
            <td class="dom-td-actions">
              <button type="button" class="dom-link" @click="copy(rec.value)">Copy</button>
            </td>
          </tr>
        </template>
      </TableShell>
    </section>
  </div>
</template>

<style scoped>
.dom { display: flex; flex-direction: column; gap: var(--space-5); }
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}
.dom-header h1 {
  margin: 0 0 var(--space-2);
  font-family: var(--font-display); font-size: var(--text-2xl); font-weight: 800;
  letter-spacing: var(--tracking-tight); color: var(--color-ink);
}
.dom-lede { margin: 0; font-family: var(--font-body); font-size: var(--text-sm); color: var(--color-ink-soft); }

.dom-tabs { display: flex; gap: var(--space-2); border-bottom: 1px solid var(--color-rule); flex-wrap: wrap; }
.dom-tab {
  padding: var(--space-3) var(--space-4); margin-bottom: -1px;
  font-family: var(--font-body); font-size: var(--text-sm); font-weight: 600;
  color: var(--color-ink-soft); text-decoration: none; border-bottom: 2px solid transparent;
}
.dom-tab:hover { color: var(--color-ink); }
.dom-tab.router-link-exact-active { color: var(--color-ink); border-bottom-color: var(--color-pop); }

.dom-note { margin: 0; font-family: var(--font-body); font-size: var(--text-sm); color: var(--color-ink-dim); max-width: 64ch; }

.dom-add { display: flex; gap: var(--space-3); align-items: center; flex-wrap: wrap; }
.dom-add-input {
  flex: 1; max-width: 360px; padding: var(--space-3) var(--space-4);
  font: inherit; font-size: var(--text-sm); color: var(--color-ink);
  background: var(--color-surface); border: 1px solid var(--color-rule); border-radius: var(--radius-md);
}
.dom-error { margin: 0; font-family: var(--font-body); font-size: var(--text-sm); color: var(--color-danger); }

.dom-state { margin: 0; font-family: var(--font-body); font-size: var(--text-sm); color: var(--color-ink-soft); }
.dom-state--error { color: var(--color-danger); }
.dom-retry {
  margin-left: var(--space-3); background: none; border: none; color: var(--link-color);
  font: inherit; font-weight: 600; cursor: pointer; text-decoration: underline;
}

.dom-empty {
  display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-3);
  padding: var(--space-7) var(--space-6);
  background: var(--color-surface); border: 1px dashed var(--color-rule-strong); border-radius: var(--radius-lg);
}
.dom-empty-title { margin: 0; font-family: var(--font-display); font-size: var(--text-xl); font-weight: 700; color: var(--color-ink); }
.dom-empty-lede { margin: 0; font-family: var(--font-body); font-size: var(--text-sm); color: var(--color-ink-soft); }

.dom-card {
  display: flex; flex-direction: column; gap: var(--space-4);
  background: var(--color-surface); border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg); padding: var(--space-5);
}
.dom-card-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); flex-wrap: wrap; }
.dom-card-title { display: flex; align-items: center; gap: var(--space-3); }
.dom-name { font-family: var(--font-mono, monospace); font-size: var(--text-base); font-weight: 700; color: var(--color-ink); }
.dom-card-actions { display: flex; gap: var(--space-2); }
.dom-card-msg { margin: 0; font-family: var(--font-body); font-size: var(--text-sm); color: var(--color-ink-dim); }
.dom-card-msg--ok { color: var(--color-success, var(--color-pop-deep)); }

.dom-th-actions { width: 1%; }
.dom-td-actions { white-space: nowrap; text-align: right; }
.dom-rec-kind { white-space: nowrap; }
.dom-dim { color: var(--color-ink-dim); }
.dom-mono { font-family: var(--font-mono, monospace); font-size: var(--text-xs); color: var(--color-ink-soft); }
.dom-mono--wrap { word-break: break-all; }
.dom-link { background: none; border: none; padding: 0 var(--space-2); color: var(--link-color); font: inherit; font-weight: 600; cursor: pointer; }
.dom-link:hover { text-decoration: underline; }
.dom-link:disabled { opacity: 0.5; cursor: default; }
.dom-link--danger { color: var(--color-danger); }
</style>
