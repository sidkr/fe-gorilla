<script setup lang="ts">
// Signup forms list page. Mirrors the segments index: header + create button +
// empty state + card grid. Uses useForms() for data, Pop tokens for style.
import { ref, onMounted } from "vue";
import { useForms, type SignupForm } from "~/composables/app/useForms";

definePageMeta({ layout: "app", middleware: "auth-required" });
useHead({ title: "Signup forms — Gorilla" });

const { listForms, createForm, deleteForm } = useForms();

const forms = ref<SignupForm[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const newName = ref("");
const showCreate = ref(false);
const creating = ref(false);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const res = await listForms();
    forms.value = res.rows || [];
  } catch (e: any) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

onMounted(load);

const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString() : "";

async function onCreate() {
  const name = newName.value.trim();
  if (!name) return;
  creating.value = true;
  try {
    const form = await createForm({ name });
    showCreate.value = false;
    newName.value = "";
    await navigateTo(`/app/forms/${form.id}`);
  } catch (e: any) {
    error.value = e.message;
  } finally {
    creating.value = false;
  }
}

async function onDelete(id: string) {
  if (!confirm("Delete this form?")) return;
  try {
    await deleteForm(id);
    await load();
  } catch (e: any) {
    error.value = e.message;
  }
}
</script>

<template>
  <div class="page">
    <header class="page-head">
      <div>
        <h1 class="title">Signup forms</h1>
        <p class="subtitle">Grow your audience with hosted and embeddable forms.</p>
      </div>
      <Button variant="primary" @click="showCreate = true">New form</Button>
    </header>

    <p v-if="error" class="error">{{ error }}</p>

    <div v-if="loading" class="muted">Loading…</div>

    <div v-else-if="!forms.length" class="empty">
      <p class="empty-title">No forms yet</p>
      <p class="muted">Create your first signup form to start collecting subscribers.</p>
    </div>

    <div v-else class="grid">
      <article v-for="f in forms" :key="f.id" class="card">
        <NuxtLink :to="`/app/forms/${f.id}`" class="card-main">
          <h3 class="card-name">{{ f.name }}</h3>
          <p class="card-meta">
            {{ (f.fields || []).length }} field{{ (f.fields || []).length === 1 ? '' : 's' }}
            · {{ f.doubleOptIn ? 'Double opt-in' : 'Single opt-in' }}
          </p>
          <p class="card-meta">{{ f.submissionCount || 0 }} submission{{ (f.submissionCount || 0) === 1 ? '' : 's' }}</p>
        </NuxtLink>
        <div class="card-foot">
          <span class="muted sm">{{ fmtDate(f.updatedAt) }}</span>
          <button class="link-danger" @click="onDelete(f.id)">Delete</button>
        </div>
      </article>
    </div>

    <!-- Create modal -->
    <Transition name="fade">
      <div v-if="showCreate" class="modal-overlay" @click.self="showCreate = false">
        <div class="modal">
          <form @submit.prevent="onCreate">
            <h2 class="modal-title">New signup form</h2>
            <label class="lbl" for="form-name">Name</label>
            <input
              id="form-name"
              v-model="newName"
              class="input"
              placeholder="Newsletter signup"
              autofocus
            />
            <div class="modal-actions">
              <Button type="button" variant="ghost" @click="showCreate = false">Cancel</Button>
              <Button type="submit" variant="primary" :disabled="creating || !newName.trim()">
                {{ creating ? 'Creating…' : 'Create' }}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.page { padding: var(--space-6, 1.5rem); max-width: 96rem; margin: 0 auto; }
.page-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-4); margin-bottom: var(--space-6); }
.title { font-size: var(--text-2xl, 1.5rem); font-weight: 700; margin: 0; color: var(--color-text); }
.subtitle { color: var(--color-text-muted); margin: var(--space-1) 0 0; }
.error { color: var(--color-danger, #b91c1c); margin: 0 0 var(--space-4); }
.muted { color: var(--color-text-muted); }
.sm { font-size: var(--text-sm, .85rem); }
.empty { text-align: center; padding: var(--space-8) var(--space-4); border: 1px dashed var(--color-border); border-radius: var(--radius-lg); }
.empty-title { font-size: var(--text-lg); font-weight: 600; margin: 0 0 var(--space-2); color: var(--color-text); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr)); gap: var(--space-4); }
.card { border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); display: flex; flex-direction: column; }
.card-main { padding: var(--space-4); text-decoration: none; color: inherit; flex: 1; }
.card-name { margin: 0 0 var(--space-2); font-size: var(--text-lg); color: var(--color-text); }
.card-meta { margin: 0 0 var(--space-1); color: var(--color-text-muted); font-size: var(--text-sm); }
.card-foot { display: flex; align-items: center; justify-content: space-between; padding: var(--space-3) var(--space-4); border-top: 1px solid var(--color-border); }
.link-danger { background: none; border: 0; cursor: pointer; color: var(--color-danger, #b91c1c); font: inherit; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: grid; place-items: center; z-index: 50; }
.modal { background: var(--color-surface); padding: var(--space-6); border-radius: var(--radius-lg); width: min(28rem, 92vw); }
.modal-title { margin: 0 0 var(--space-4); font-size: var(--text-xl); color: var(--color-text); }
.lbl { display: block; font-weight: 600; margin: 0 0 var(--space-2); color: var(--color-text); }
.input { width: 100%; box-sizing: border-box; font: inherit; padding: var(--space-2) var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md, 8px); }
.modal-actions { display: flex; justify-content: flex-end; gap: var(--space-2); margin-top: var(--space-5); }
.fade-enter-active, .fade-leave-active { transition: opacity .15s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
