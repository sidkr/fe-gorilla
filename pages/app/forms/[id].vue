<script setup lang="ts">
// Signup form builder. Edit name, target audience, fields, double-opt-in, etc.
// with a live preview and an embed-code modal. Pop tokens for style.
import { ref, computed, onMounted, reactive } from "vue";
import { useRoute } from "vue-router";
import {
  useForms,
  type SignupForm,
} from "~/composables/app/useForms";
import { useAudiences, type Audience } from "~/composables/app/useAudiences";

definePageMeta({ layout: "app", middleware: "auth-required" });
useHead({ title: "Edit form — Gorilla" });

const route = useRoute();
const id = String(route.params.id);
const { getForm, updateForm } = useForms();
const { listAudiences } = useAudiences();

const audiences = ref<Audience[]>([]);
const loading = ref(true);
const saving = ref(false);
const error = ref<string | null>(null);
const saved = ref(false);
const showEmbed = ref(false);

const FIELD_TYPES = ["text", "email", "number", "checkbox", "select"];

const model = reactive<SignupForm>({
  id,
  name: "",
  fields: [],
  targetListId: "",
  doubleOptIn: false,
  redirectUrl: "",
  submitButtonText: "Subscribe",
  status: "active",
});

const publicBase = computed(() =>
  // Public form pages are served by the Express server under the same origin
  // (the /f/** proxy rule). Use the browser origin at runtime.
  import.meta.client ? window.location.origin : "",
);

const formUrl = computed(() => `${publicBase.value}/f/${id}`);
const embedSnippet = computed(
  () => `<script async src="${publicBase.value}/f/${id}/embed.js"><\/script>`,
);
const iframeSnippet = computed(
  () =>
    `<iframe src="${formUrl.value}" style="border:0;width:100%;min-height:480px" title="Signup form" loading="lazy"></iframe>`,
);

onMounted(async () => {
  try {
    audiences.value = await listAudiences();
    const f = await getForm(id);
    Object.assign(model, f);
    if (!model.fields || !model.fields.length) {
      model.fields = [{ key: "email", label: "Email", type: "email", required: true }];
    }
    if (!model.submitButtonText) model.submitButtonText = "Subscribe";
  } catch (e: any) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
});

function addField() {
  model.fields.push({ key: "", label: "", type: "text", required: false });
}
function removeField(i: number) {
  model.fields.splice(i, 1);
}

async function onSave() {
  saving.value = true;
  error.value = null;
  saved.value = false;
  try {
    // Drop fields with no key before persisting.
    const fields = model.fields.filter((f) => f.key.trim());
    await updateForm(id, {
      name: model.name,
      targetListId: model.targetListId,
      doubleOptIn: model.doubleOptIn,
      redirectUrl: model.redirectUrl,
      submitButtonText: model.submitButtonText,
      status: model.status,
      fields,
    });
    saved.value = true;
    setTimeout(() => (saved.value = false), 2000);
  } catch (e: any) {
    error.value = e.message;
  } finally {
    saving.value = false;
  }
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    /* clipboard unavailable */
  }
}
</script>

<template>
  <div class="page">
    <header class="page-head">
      <div>
        <NuxtLink to="/app/forms" class="back">← Forms</NuxtLink>
        <h1 class="title">{{ model.name || "Edit form" }}</h1>
      </div>
      <div class="head-actions">
        <Button variant="ghost" @click="showEmbed = true">Get embed code</Button>
        <Button variant="primary" :disabled="saving" @click="onSave">
          {{ saving ? "Saving…" : saved ? "Saved ✓" : "Save" }}
        </Button>
      </div>
    </header>

    <p v-if="error" class="error">{{ error }}</p>
    <div v-if="loading" class="muted">Loading…</div>

    <div v-else class="layout">
      <!-- Builder -->
      <section class="builder">
        <div class="block">
          <label class="lbl" for="b-name">Form name</label>
          <input id="b-name" v-model="model.name" class="input" />
        </div>

        <div class="block">
          <label class="lbl" for="b-list">Target audience</label>
          <select id="b-list" v-model="model.targetListId" class="input">
            <option value="">— None —</option>
            <option v-for="a in audiences" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
        </div>

        <div class="block">
          <span class="lbl">Fields</span>
          <div v-for="(f, i) in model.fields" :key="i" class="field-row">
            <input v-model="f.key" class="input sm-in" placeholder="key" />
            <input v-model="f.label" class="input sm-in" placeholder="Label" />
            <select v-model="f.type" class="input sm-in">
              <option v-for="t in FIELD_TYPES" :key="t" :value="t">{{ t }}</option>
            </select>
            <label class="req"><input v-model="f.required" type="checkbox" /> required</label>
            <button class="link-danger" type="button" @click="removeField(i)">✕</button>
          </div>
          <Button variant="ghost" type="button" @click="addField">+ Add field</Button>
        </div>

        <div class="block">
          <label class="toggle">
            <input v-model="model.doubleOptIn" type="checkbox" />
            <span>Require double opt-in (email confirmation)</span>
          </label>
        </div>

        <div class="block">
          <label class="lbl" for="b-btn">Submit button text</label>
          <input id="b-btn" v-model="model.submitButtonText" class="input" />
        </div>

        <div class="block">
          <label class="lbl" for="b-redirect">Redirect URL (optional)</label>
          <input id="b-redirect" v-model="model.redirectUrl" class="input" placeholder="https://example.com/thanks" />
        </div>

        <div class="block">
          <label class="lbl" for="b-status">Status</label>
          <select id="b-status" v-model="model.status" class="input">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="draft">Draft</option>
          </select>
        </div>
      </section>

      <!-- Live preview -->
      <section class="preview-wrap">
        <span class="lbl">Live preview</span>
        <div class="preview-card">
          <h3 class="pv-title">{{ model.name || "Sign up" }}</h3>
          <div v-for="(f, i) in model.fields.filter((x) => x.key.trim())" :key="i" class="pv-field">
            <label class="pv-lbl">{{ f.label || f.key }}<span v-if="f.required"> *</span></label>
            <input v-if="f.type !== 'checkbox'" class="pv-input" :type="f.type === 'number' ? 'number' : f.type === 'email' ? 'email' : 'text'" disabled />
            <input v-else type="checkbox" disabled />
          </div>
          <button class="pv-btn" type="button" disabled>{{ model.submitButtonText || "Subscribe" }}</button>
          <p v-if="model.doubleOptIn" class="muted sm">Subscribers confirm via email.</p>
        </div>
        <p class="muted sm">Hosted at <a :href="formUrl" target="_blank">{{ formUrl }}</a></p>
      </section>
    </div>

    <!-- Embed modal -->
    <Transition name="fade">
      <div v-if="showEmbed" class="modal-overlay" @click.self="showEmbed = false">
        <div class="modal">
          <h2 class="modal-title">Embed this form</h2>
          <p class="lbl">One-line script embed (recommended)</p>
          <pre class="code">{{ embedSnippet }}</pre>
          <Button variant="ghost" type="button" @click="copy(embedSnippet)">Copy script</Button>

          <p class="lbl mt">Raw iframe embed</p>
          <pre class="code">{{ iframeSnippet }}</pre>
          <Button variant="ghost" type="button" @click="copy(iframeSnippet)">Copy iframe</Button>

          <p class="lbl mt">Direct link</p>
          <pre class="code">{{ formUrl }}</pre>

          <div class="modal-actions">
            <Button variant="primary" type="button" @click="showEmbed = false">Done</Button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.page { padding: var(--space-6, 1.5rem); max-width: 80rem; margin: 0 auto; }
.page-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-4); margin-bottom: var(--space-6); }
.head-actions { display: flex; gap: var(--space-2); }
.back { display: inline-block; color: var(--color-text-muted); text-decoration: none; font-size: var(--text-sm); margin-bottom: var(--space-1); }
.title { font-size: var(--text-2xl, 1.5rem); font-weight: 700; margin: 0; color: var(--color-text); }
.error { color: var(--color-danger, #b91c1c); margin: 0 0 var(--space-4); }
.muted { color: var(--color-text-muted); } .sm { font-size: var(--text-sm, .85rem); }
.layout { display: grid; grid-template-columns: 1fr 22rem; gap: var(--space-6); align-items: start; }
.builder { display: flex; flex-direction: column; gap: var(--space-5); }
.block { display: flex; flex-direction: column; gap: var(--space-2); }
.lbl { font-weight: 600; color: var(--color-text); }
.mt { margin-top: var(--space-4); }
.input { width: 100%; box-sizing: border-box; font: inherit; padding: var(--space-2) var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md, 8px); background: var(--color-surface); color: var(--color-text); }
.field-row { display: flex; gap: var(--space-2); align-items: center; }
.sm-in { flex: 1; }
.req { display: flex; align-items: center; gap: 4px; font-size: var(--text-sm); color: var(--color-text-muted); white-space: nowrap; }
.toggle { display: flex; align-items: center; gap: var(--space-2); color: var(--color-text); }
.link-danger { background: none; border: 0; cursor: pointer; color: var(--color-danger, #b91c1c); font: inherit; }
.preview-wrap { display: flex; flex-direction: column; gap: var(--space-2); position: sticky; top: var(--space-6); }
.preview-card { border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); padding: var(--space-5); }
.pv-title { margin: 0 0 var(--space-4); color: var(--color-text); }
.pv-field { margin-bottom: var(--space-3); display: flex; flex-direction: column; gap: 4px; }
.pv-lbl { font-size: var(--text-sm); font-weight: 600; color: var(--color-text); }
.pv-input { width: 100%; box-sizing: border-box; padding: var(--space-2); border: 1px solid var(--color-border); border-radius: var(--radius-md, 8px); background: var(--color-bg, #fafaf9); }
.pv-btn { font: inherit; font-weight: 600; border: 0; border-radius: var(--radius-md, 8px); padding: var(--space-2) var(--space-4); background: var(--color-primary, #16a34a); color: #fff; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: grid; place-items: center; z-index: 50; }
.modal { background: var(--color-surface); padding: var(--space-6); border-radius: var(--radius-lg); width: min(36rem, 92vw); max-height: 90vh; overflow: auto; }
.modal-title { margin: 0 0 var(--space-4); font-size: var(--text-xl); color: var(--color-text); }
.code { background: var(--color-bg, #f5f5f4); border: 1px solid var(--color-border); border-radius: var(--radius-md, 8px); padding: var(--space-3); overflow-x: auto; font-size: var(--text-sm); white-space: pre-wrap; word-break: break-all; margin: var(--space-2) 0; }
.modal-actions { display: flex; justify-content: flex-end; margin-top: var(--space-5); }
.fade-enter-active, .fade-leave-active { transition: opacity .15s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
@media (max-width: 60rem) { .layout { grid-template-columns: 1fr; } .preview-wrap { position: static; } }
</style>
