<script setup>
import { useAuthStore } from "~/stores/auth";

definePageMeta({
  middleware: "auth-blocked",
});

useHead({
  title: "Log in",
  meta: [
    { name: "description", content: "Log in to your Fe-Mail Gorilla account to manage your email campaigns." },
    { name: "robots", content: "index,follow" },
  ],
  link: [
    { rel: "canonical", href: "https://gorilla.email/login" },
  ],
});

const auth = useAuthStore();
const route = useRoute();

const email      = ref("");
const password   = ref("");
const submitting = ref(false);
const errorMsg   = ref("");

async function onSubmit() {
  errorMsg.value = "";
  if (!email.value.trim() || !password.value) {
    errorMsg.value = "Enter your email and password to continue.";
    return;
  }
  submitting.value = true;
  try {
    await auth.login(email.value.trim(), password.value);
    // Open-redirect guard: only honor `next` if it's a same-origin path.
    const next = typeof route.query.next === "string" && route.query.next.startsWith("/")
      ? route.query.next
      : "/app/dashboard";
    await navigateTo(next);
  } catch (err) {
    if (err?.code === 101) {
      errorMsg.value = "That email or password didn't match. Please try again.";
    } else if (err?.code === 219) {
      errorMsg.value = "Too many failed attempts. Try again in a few minutes.";
    } else {
      errorMsg.value = err?.message || "Couldn't sign you in. Please try again.";
    }
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
<div class="page">

  <!-- ─────────────────────────── LEFT · FORM ──────────────────────────── -->
  <section class="col col-form">
    <header class="chrome">
      <div class="brand">
        <svg class="brand-mark" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Fe-Mail Gorilla">
          <path d="M14 22 C14 11 21 4 32 4 C43 4 50 11 50 22 L50 36 C50 47 43 56 32 60 C21 56 14 47 14 36 Z" fill="var(--color-pop)"/>
          <path d="M14 22 L50 22 L50 28 L14 28 Z" fill="var(--color-pop-deep)"/>
          <line x1="32" y1="4" x2="32" y2="22" stroke="var(--color-ink)" stroke-width="1.4" stroke-opacity="0.32"/>
          <circle cx="32" cy="12" r="1.6" fill="var(--color-ink)" fill-opacity="0.55"/>
          <circle cx="19" cy="25" r="1.4" fill="var(--color-ink)" fill-opacity="0.4"/>
          <circle cx="45" cy="25" r="1.4" fill="var(--color-ink)" fill-opacity="0.4"/>
          <rect x="19" y="33" width="9" height="2.2" rx="0.5" fill="var(--color-ink)"/>
          <rect x="36" y="33" width="9" height="2.2" rx="0.5" fill="var(--color-ink)"/>
          <path d="M22 45 L42 45 L38 53 L26 53 Z" fill="var(--color-pop-deep)"/>
        </svg>
        <span class="wordmark">Fe-Mail Gorilla</span>
        <span class="fe-chip">Fe26</span>
      </div>
      <div class="ghost-link">New here?<NuxtLink to="/signup">Create an account</NuxtLink></div>
    </header>

    <div class="col-body">
      <div class="form-wrap">
        <h1 class="h-title">Welcome back.</h1>
        <p class="h-sub">Log in to keep your campaigns moving.</p>

        <form class="form" @submit.prevent="onSubmit" novalidate>
          <!-- Email -->
          <FormField label="Email" inputId="email">
            <TextInput v-model="email" id="email" type="email" placeholder="name@company.com" autocomplete="email" />
          </FormField>

          <!-- Password -->
          <FormField label="Password" inputId="password">
            <TextInput v-model="password" id="password" type="password" autocomplete="current-password" />
            <template #default>
              <TextInput v-model="password" id="password" type="password" autocomplete="current-password" />
              <div class="field-row">
                <NuxtLink to="/forgot-password" class="forgot-link">Forgot password?</NuxtLink>
              </div>
            </template>
          </FormField>

          <!-- Error -->
          <p v-if="errorMsg" class="form-error" role="alert">{{ errorMsg }}</p>

          <!-- Primary CTA -->
          <Button variant="primary" block type="submit" :loading="submitting" :disabled="submitting" style="margin-top: var(--space-2);">
            {{ submitting ? "Logging in…" : "Log in" }}
            <template v-if="!submitting" #trailing>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M5 12 H19 M13 6 L19 12 L13 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </template>
          </Button>

          <!-- OR divider -->
          <div class="or"><span class="or-chip">or</span></div>

          <!-- Google -->
          <Button variant="ghost" block type="button">
            <template #leading>
              <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M17.64 9.2c0-.64-.06-1.25-.17-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.79 2.72v2.26h2.9c1.7-1.56 2.69-3.86 2.69-6.62z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.83.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18z" fill="#34A853"/>
                <path d="M3.95 10.7A5.4 5.4 0 0 1 3.66 9c0-.59.1-1.16.29-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.03l2.99-2.33z" fill="#FBBC05"/>
                <path d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58A9 9 0 0 0 9 0 9 9 0 0 0 .96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58z" fill="#EA4335"/>
              </svg>
            </template>
            Continue with Google
          </Button>

          <p class="micro">Don't have an account? <NuxtLink to="/signup" class="micro-link">Sign up</NuxtLink></p>
        </form>
      </div>
    </div>

    <footer class="col-foot">
      <span class="element-chip">
        <span class="num">26</span>
        <span>·</span>
        <span class="sym">Fe</span>
        <span>·</span>
        <span class="lbl">IRON</span>
      </span>
    </footer>
  </section>

  <!-- ────────────────────────── RIGHT · PROMO ─────────────────────────── -->
  <aside class="col col-promo">
    <div class="col-body">
      <div class="promo-wrap">
        <span class="eyebrow"><span class="dot"></span>WELCOME BACK</span>

        <h2 class="promo-h">Pick up where you left off.</h2>

        <!-- Quick-stats teaser — a peek at what's waiting on the other side -->
        <div class="stats" aria-label="Account activity since your last visit">
          <div class="stat-row">
            <span class="stat-ico" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 5h18v14H3zM3 5l9 7 9-7" stroke="var(--color-pop)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
            <div class="stat-text">
              <div class="stat-headline">3 active campaigns</div>
              <div class="stat-detail">Two scheduled, one sending</div>
            </div>
          </div>

          <div class="stat-row">
            <span class="stat-ico" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M17 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM3 21a8 8 0 0 1 16 0M19 8h4M21 6v4" stroke="var(--color-pop)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
            <div class="stat-text">
              <div class="stat-headline">+342 subscribers</div>
              <div class="stat-detail">Added in the last 30 days</div>
            </div>
          </div>

          <div class="stat-row">
            <span class="stat-ico" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 17l6-6 4 4 8-8M15 7h6v6" stroke="var(--color-pop)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
            <div class="stat-text">
              <div class="stat-headline">46.4% avg open rate</div>
              <div class="stat-detail">+2.1pp vs the month before</div>
            </div>
          </div>
        </div>

        <p class="teaser-note">Sign in to see what's changed since you were last here.</p>
      </div>
    </div>

    <footer class="promo-foot">
      <span class="element-chip on-pop">
        <span class="num">26</span>
        <span>·</span>
        <span class="sym">Fe</span>
        <span>·</span>
        <span class="lbl">IRON</span>
      </span>
    </footer>
  </aside>

</div>
</template>

<style>
  /* ── Page shell ───────────────────────────────────────────────────────── */
  body {
    min-height: 100vh;
  }
  .page {
    display: grid;
    grid-template-columns: 1fr 1fr;
    min-height: 100vh;
  }

  /* ── Columns ─────────────────────────────────────────────────────────── */
  .col {
    position: relative;
    padding: var(--space-6) var(--space-7);
    display: flex;
    flex-direction: column;
  }
  .col-form {
    background: var(--color-bg);
  }
  .col-promo {
    background: var(--color-pop-bg);
  }

  /* ── Top chrome row ──────────────────────────────────────────────────── */
  .chrome {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }
  .brand-mark { width: 32px; height: 32px; display: block; }
  .wordmark {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: var(--text-md);
    color: var(--color-ink);
    letter-spacing: var(--tracking-tight);
  }
  .fe-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--color-ink-soft);
    border: 1px solid var(--color-rule);
    border-radius: var(--radius-xs);
    padding: 2px var(--space-2);
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
  }
  .ghost-link {
    font-family: var(--font-body);
    font-size: var(--text-sm);
    color: var(--color-ink-soft);
  }
  .ghost-link a {
    color: var(--color-ink);
    font-weight: 600;
    text-decoration: none;
    margin-left: var(--space-1);
  }
  .ghost-link a:hover { color: var(--link-color); }

  /* ── Form column body ────────────────────────────────────────────────── */
  .col-body {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-7) 0;
  }
  .form-wrap {
    width: 100%;
    max-width: 440px;
  }
  .h-title {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: var(--text-4xl);
    line-height: var(--leading-tight);
    letter-spacing: var(--tracking-tight);
    color: var(--color-ink);
    margin: 0 0 var(--space-3) 0;
  }
  .h-sub {
    font-family: var(--font-body);
    font-size: var(--text-md);
    color: var(--color-ink-soft);
    line-height: var(--leading-normal);
    margin: 0 0 var(--space-6) 0;
  }

  /* ── Form fields ─────────────────────────────────────────────────────── */
  .form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .field { display: flex; flex-direction: column; gap: var(--space-2); }
  .field label {
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-ink);
  }
  .input-shell {
    position: relative;
    display: flex;
    align-items: center;
  }
  .input {
    width: 100%;
    height: 44px;
    padding: 0 var(--space-4);
    font-family: var(--font-body);
    font-size: var(--text-md);
    color: var(--field-text);
    background: var(--field-bg);
    border: 1px solid var(--field-border);
    border-radius: var(--radius-md);
    outline: none;
    transition: border-color var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out);
  }
  .input::placeholder { color: var(--field-placeholder); }
  .input:focus { border-color: var(--field-border-focus); box-shadow: var(--shadow-pop-glow); }

  /* ── Forgot-password row under the password field ───────────────────── */
  .field-row {
    display: flex;
    justify-content: flex-end;
    margin-top: var(--space-1);
  }
  .forgot-link {
    font-family: var(--font-body);
    font-size: var(--text-sm);
    color: var(--link-color);
    text-decoration: none;
    font-weight: 500;
  }
  .forgot-link:hover {
    color: var(--link-color-hover);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  /* ── Error display ───────────────────────────────────────────────────── */
  .form-error {
    margin: var(--space-1) 0 0;
    padding: var(--space-3) var(--space-4);
    background: var(--color-danger-bg);
    border: 1px solid rgba(185, 28, 28, 0.25);
    border-radius: var(--radius-md);
    color: var(--color-danger);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    line-height: var(--leading-snug);
  }

  /* ── Buttons ─────────────────────────────────────────────────────────── */
  .btn {
    width: 100%;
    height: 48px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    white-space: nowrap;
    border-radius: var(--radius-md);
    font-family: var(--font-display);
    font-weight: 700;
    font-size: var(--text-md);
    cursor: pointer;
    border: 1px solid transparent;
    transition: background var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out);
  }
  .btn:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }
  .btn-primary {
    background: var(--btn-primary-bg);
    color: var(--btn-primary-fg);
    box-shadow: var(--shadow-md);
  }
  .btn-primary:hover:not(:disabled) { background: var(--btn-primary-hover); }
  .btn-ghost {
    background: var(--color-surface);
    color: var(--btn-ghost-fg);
    border-color: var(--btn-ghost-border);
  }
  .btn-ghost:hover { background: var(--btn-ghost-hover-bg); }

  /* ── OR divider ──────────────────────────────────────────────────────── */
  .or {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: var(--space-2) 0;
  }
  .or::before {
    content: "";
    position: absolute;
    left: 0; right: 0; top: 50%;
    height: 1px;
    background: var(--color-rule);
  }
  .or-chip {
    position: relative;
    background: var(--color-bg);
    padding: 0 var(--space-3);
    font-family: var(--font-body);
    font-size: var(--text-xs);
    color: var(--color-ink-dim);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wider);
  }

  /* ── Footer microcopy + element signature ────────────────────────────── */
  .micro {
    font-family: var(--font-body);
    font-size: var(--text-xs);
    color: var(--color-ink-dim);
    text-align: center;
    margin-top: var(--space-3);
    line-height: var(--leading-snug);
  }
  .micro-link {
    color: var(--color-ink);
    font-weight: 600;
    text-decoration: none;
  }
  .micro-link:hover {
    color: var(--link-color);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .col-foot {
    margin-top: var(--space-6);
    display: flex;
    justify-content: center;
  }
  .element-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--color-ink-dim);
    letter-spacing: var(--tracking-wider);
    border: 1px solid var(--color-rule);
    border-radius: var(--radius-xs);
    padding: var(--space-1) var(--space-3);
  }
  .element-chip .num { color: var(--color-ink-soft); }
  .element-chip .sym { color: var(--color-pop); font-weight: 500; }
  .element-chip .lbl { color: var(--color-ink-dim); }

  /* On the coral promo background, the rule needs to step up a bit. */
  .element-chip.on-pop {
    border-color: var(--color-rule-strong);
  }

  /* ── Promo column ────────────────────────────────────────────────────── */
  .promo-wrap {
    width: 100%;
    max-width: 440px;
  }
  .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-ink);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
    margin-bottom: var(--space-5);
    font-weight: 500;
  }
  .eyebrow .dot {
    width: 6px; height: 6px; border-radius: var(--radius-pill);
    background: var(--color-pop);
  }
  .promo-h {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: var(--text-3xl);
    line-height: var(--leading-tight);
    letter-spacing: var(--tracking-tight);
    color: var(--color-ink);
    margin: 0 0 var(--space-6) 0;
  }

  /* ── Quick-stats teaser ──────────────────────────────────────────────── */
  .stats {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin-bottom: var(--space-6);
  }
  .stat-row {
    display: grid;
    grid-template-columns: 40px 1fr;
    gap: var(--space-4);
    align-items: center;
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    box-shadow: var(--shadow-sm);
  }
  .stat-ico {
    width: 40px; height: 40px;
    border-radius: var(--radius-md);
    background: var(--color-pop-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .stat-text { display: flex; flex-direction: column; gap: var(--space-1); }
  .stat-headline {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: var(--text-lg);
    color: var(--color-ink);
    letter-spacing: var(--tracking-tight);
    line-height: var(--leading-snug);
  }
  .stat-detail {
    font-family: var(--font-body);
    font-size: var(--text-sm);
    color: var(--color-ink-soft);
    line-height: var(--leading-snug);
  }
  .teaser-note {
    font-family: var(--font-body);
    font-size: var(--text-sm);
    color: var(--color-ink-soft);
    line-height: var(--leading-snug);
    margin: 0;
    text-align: center;
  }

  .promo-foot {
    margin-top: var(--space-6);
    display: flex;
    justify-content: center;
  }
</style>
