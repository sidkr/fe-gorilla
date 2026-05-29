<script setup>
import { useAuthStore } from "~/stores/auth";

definePageMeta({
  middleware: "auth-blocked",
});

useHead({
  title: "Sign up",
  meta: [
    { name: "description", content: "Create your Fe-Mail Gorilla account. Send your first email campaign in minutes — free for 10,000 emails a month." },
    { name: "robots", content: "index,follow" },
  ],
  link: [
    { rel: "canonical", href: "https://gorilla.email/signup" },
  ],
});

const auth = useAuthStore();
const route = useRoute();

const name      = ref("");
const email     = ref("");
const company   = ref("");
const password  = ref("");
const terms     = ref(true);
const submitting = ref(false);
const errorMsg  = ref("");

// Visual state derivations
const emailValid = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()));
const passwordStrength = computed(() => {
  const v = password.value;
  if (!v) return 0;
  let score = 0;
  if (v.length >= 8)  score++;
  if (v.length >= 12) score++;
  if (/[A-Z]/.test(v) && /[a-z]/.test(v)) score++;
  if (/\d/.test(v) || /[^A-Za-z0-9]/.test(v)) score++;
  return Math.min(score, 4);
});
const strengthLabel = computed(() => ["", "Weak", "Fair", "Strong", "Very strong"][passwordStrength.value]);

async function onSubmit() {
  errorMsg.value = "";
  if (!emailValid.value)  { errorMsg.value = "Please enter a valid email."; return; }
  if (password.value.length < 8) { errorMsg.value = "Password must be at least 8 characters."; return; }
  if (!terms.value) { errorMsg.value = "Please agree to the terms to continue."; return; }

  submitting.value = true;
  try {
    await auth.signup({
      username: email.value.trim(),
      password: password.value,
      email:    email.value.trim(),
      name:     name.value.trim(),
      company:  company.value.trim(),
    });
    const next = typeof route.query.next === "string" ? route.query.next : "/app/dashboard";
    await navigateTo(next);
  } catch (err) {
    errorMsg.value = err?.message || "Sign up failed. Please try again.";
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
      <div class="ghost-link">Already have an account?<NuxtLink to="/login">Sign in</NuxtLink></div>
    </header>

    <div class="col-body">
      <div class="form-wrap">
        <h1 class="h-title">Create your account.</h1>
        <p class="h-sub">Send your first campaign in minutes. Free for 10,000 emails / month.</p>

        <form class="form" @submit.prevent="onSubmit" novalidate>
          <!-- Full name -->
          <div class="field">
            <label for="name">Full name</label>
            <div class="input-shell">
              <input v-model="name" id="name" class="input" type="text" placeholder="Your name" autocomplete="name" required>
            </div>
          </div>

          <!-- Work email -->
          <div class="field">
            <label for="email">Work email</label>
            <div class="input-shell">
              <input v-model="email" id="email" :class="['input', { 'has-affix': emailValid }]" type="email" placeholder="name@company.com" autocomplete="email" required>
              <span v-if="emailValid" class="input-affix" aria-label="valid">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="12" cy="12" r="10" fill="var(--color-ok)"/>
                  <path d="M7.5 12.5 L10.5 15.5 L16.5 9.5" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </span>
            </div>
          </div>

          <!-- Company -->
          <div class="field">
            <label for="company">Company name</label>
            <div class="input-shell">
              <input v-model="company" id="company" class="input" type="text" placeholder="Your company or brand" autocomplete="organization" required>
            </div>
          </div>

          <!-- Password -->
          <div class="field">
            <label for="password">Password</label>
            <div class="input-shell">
              <input v-model="password" id="password" class="input" type="password" autocomplete="new-password" minlength="8" required>
            </div>
            <div v-if="password.length > 0" class="strength">
              <div class="strength-bars" :aria-label="`Password strength: ${strengthLabel.toLowerCase()}`">
                <span v-for="i in 4" :key="i" :class="['strength-bar', { on: i <= passwordStrength }]"></span>
              </div>
              <span class="strength-label">{{ strengthLabel }}</span>
            </div>
          </div>

          <!-- Terms -->
          <label class="terms">
            <span :class="['checkbox', { checked: terms }]" :aria-checked="terms" role="checkbox" tabindex="0" @click="terms = !terms" @keydown.space.prevent="terms = !terms">
              <svg v-if="terms" width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M5 12.5 L10 17.5 L19 7.5" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
            <span class="terms-label">
              I agree to the <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a>
            </span>
          </label>

          <!-- Error -->
          <p v-if="errorMsg" class="form-error" role="alert">{{ errorMsg }}</p>

          <!-- Primary CTA -->
          <button type="submit" class="btn btn-primary" :disabled="submitting" style="margin-top: var(--space-2);">
            {{ submitting ? "Creating account…" : "Create account" }}
            <svg v-if="!submitting" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M5 12 H19 M13 6 L19 12 L13 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>

          <!-- OR divider -->
          <div class="or"><span class="or-chip">or</span></div>

          <!-- Google -->
          <button type="button" class="btn btn-ghost">
            <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M17.64 9.2c0-.64-.06-1.25-.17-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.79 2.72v2.26h2.9c1.7-1.56 2.69-3.86 2.69-6.62z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.83.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18z" fill="#34A853"/>
              <path d="M3.95 10.7A5.4 5.4 0 0 1 3.66 9c0-.59.1-1.16.29-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.03l2.99-2.33z" fill="#FBBC05"/>
              <path d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58A9 9 0 0 0 9 0 9 9 0 0 0 .96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          <p class="micro">By creating an account you'll join 8,400+ marketers shipping iron-clad campaigns.</p>
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
        <span class="eyebrow"><span class="dot"></span>WHY FE-MAIL GORILLA</span>

        <h2 class="promo-h">Heavy-duty marketing tools, light on the brain.</h2>

        <div class="props">
          <!-- Prop 1: Inbox placement -->
          <div class="prop">
            <span class="prop-ico" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 7l9 6 9-6M3 7v10a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7M3 7l1-1h16l1 1" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
            <div>
              <h3 class="prop-title">Inbox placement that holds.</h3>
              <p class="prop-body">98.4% delivery across Gmail, Outlook, Yahoo, and friends.</p>
            </div>
          </div>

          <!-- Prop 2: Real-time reports -->
          <div class="prop">
            <span class="prop-ico" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 19V5M4 19h16M8 15v-4M12 15V9M16 15v-7" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
            <div>
              <h3 class="prop-title">Real-time reports.</h3>
              <p class="prop-body">Watch opens, clicks, and bounces tick the moment they happen.</p>
            </div>
          </div>

          <!-- Prop 3: Editor -->
          <div class="prop">
            <span class="prop-ico" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 7h16M4 12h10M4 17h16M17 12l2 2 4-4" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
            <div>
              <h3 class="prop-title">Editor your team won't fight.</h3>
              <p class="prop-body">Drag, drop, paste HTML — we don't gatekeep your workflow.</p>
            </div>
          </div>
        </div>

        <!-- Testimonial -->
        <div class="quote-card">
          <div class="stars" aria-label="5 out of 5 stars">
            <!-- 5 stars -->
            <svg width="14" height="14" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l2.95 6.6 7.05.85-5.2 4.95L18.2 22 12 18.3 5.8 22l1.4-7.6L2 9.45l7.05-.85L12 2z" fill="var(--color-pop)"/></svg>
            <svg width="14" height="14" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l2.95 6.6 7.05.85-5.2 4.95L18.2 22 12 18.3 5.8 22l1.4-7.6L2 9.45l7.05-.85L12 2z" fill="var(--color-pop)"/></svg>
            <svg width="14" height="14" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l2.95 6.6 7.05.85-5.2 4.95L18.2 22 12 18.3 5.8 22l1.4-7.6L2 9.45l7.05-.85L12 2z" fill="var(--color-pop)"/></svg>
            <svg width="14" height="14" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l2.95 6.6 7.05.85-5.2 4.95L18.2 22 12 18.3 5.8 22l1.4-7.6L2 9.45l7.05-.85L12 2z" fill="var(--color-pop)"/></svg>
            <svg width="14" height="14" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l2.95 6.6 7.05.85-5.2 4.95L18.2 22 12 18.3 5.8 22l1.4-7.6L2 9.45l7.05-.85L12 2z" fill="var(--color-pop)"/></svg>
          </div>
          <blockquote class="quote-text">
            "We switched off Mailchimp in a weekend. Fe-Mail Gorilla is forged for people who actually send — best decision we made all quarter."
          </blockquote>
          <div class="attrib">
            <span class="avatar" aria-hidden="true">AK</span>
            <div>
              <div class="attrib-name">Alex K.</div>
              <div class="attrib-role">Head of Growth, Folkways</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <footer class="promo-foot">
      <span class="compliance">SOC 2 · GDPR · CAN-SPAM · ready</span>
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

  /* ── Top chrome row (both cols share the pattern) ────────────────────── */
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
  .input.is-focus { border-color: var(--field-border-focus); box-shadow: var(--shadow-pop-glow); }
  .input.has-affix { padding-right: 40px; }
  .input-affix {
    position: absolute;
    right: var(--space-3);
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }

  /* ── Password strength ───────────────────────────────────────────────── */
  .strength {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-top: var(--space-1);
  }
  .strength-bars {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-1);
    flex: 1;
  }
  .strength-bar {
    height: 4px;
    border-radius: var(--radius-pill);
    background: var(--color-rule);
  }
  .strength-bar.on { background: var(--color-pop); }
  .strength-label {
    font-family: var(--font-body);
    font-size: var(--text-xs);
    color: var(--color-ink-soft);
    font-weight: 600;
    min-width: 48px;
    text-align: right;
  }

  /* ── Terms checkbox ──────────────────────────────────────────────────── */
  .terms {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    margin-top: var(--space-1);
  }
  .checkbox {
    width: 18px;
    height: 18px;
    border-radius: var(--radius-xs);
    background: var(--color-surface);
    border: 1px solid var(--color-rule-strong);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-top: 1px;
    cursor: pointer;
    transition: background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out);
  }
  .checkbox.checked {
    background: var(--color-pop);
    border-color: var(--color-pop);
  }
  .checkbox:focus-visible {
    outline: none;
    box-shadow: var(--shadow-pop-glow);
  }
  .form-error {
    margin: var(--space-1) 0 0;
    padding: var(--space-3) var(--space-4);
    background: rgba(185, 28, 28, 0.08);
    border: 1px solid rgba(185, 28, 28, 0.25);
    border-radius: var(--radius-md);
    color: var(--color-danger);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    line-height: var(--leading-snug);
  }
  .btn:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }
  .terms-label {
    font-family: var(--font-body);
    font-size: var(--text-sm);
    color: var(--color-ink-soft);
    line-height: var(--leading-snug);
  }
  .terms-label a {
    color: var(--link-color);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .terms-label a:hover { color: var(--link-color-hover); }

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
  .btn-primary {
    background: var(--btn-primary-bg);
    color: var(--btn-primary-fg);
    box-shadow: var(--shadow-md);
  }
  .btn-primary:hover { background: var(--btn-primary-hover); }
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
    margin: 0 0 var(--space-7) 0;
  }
  .props {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    margin-bottom: var(--space-7);
  }
  .prop {
    display: grid;
    grid-template-columns: 32px 1fr;
    gap: var(--space-4);
    align-items: start;
  }
  .prop-ico {
    width: 32px; height: 32px;
    border-radius: var(--radius-md);
    background: var(--color-pop);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .prop-title {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: var(--text-lg);
    color: var(--color-ink);
    margin: 0 0 var(--space-1) 0;
    line-height: var(--leading-snug);
  }
  .prop-body {
    font-family: var(--font-body);
    font-size: var(--text-base);
    color: var(--color-ink-soft);
    margin: 0;
    line-height: var(--leading-snug);
  }

  /* ── Testimonial ─────────────────────────────────────────────────────── */
  .quote-card {
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-md);
    padding: var(--space-5);
  }
  .stars {
    display: flex;
    gap: 2px;
    margin-bottom: var(--space-3);
  }
  .quote-text {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: var(--text-md);
    color: var(--color-ink);
    line-height: var(--leading-snug);
    margin: 0 0 var(--space-4) 0;
    letter-spacing: var(--tracking-tight);
  }
  .attrib {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }
  .avatar {
    width: 36px; height: 36px;
    border-radius: var(--radius-pill);
    background: var(--color-ink);
    color: var(--color-ink-on-pop);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: var(--text-sm);
    letter-spacing: var(--tracking-tight);
  }
  .attrib-name {
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-ink);
    line-height: 1.2;
  }
  .attrib-role {
    font-family: var(--font-body);
    font-size: var(--text-xs);
    color: var(--color-ink-soft);
    line-height: 1.2;
    margin-top: 2px;
  }

  .promo-foot {
    margin-top: var(--space-6);
    display: flex;
    justify-content: center;
  }
  .compliance {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-ink-soft);
    letter-spacing: var(--tracking-wide);
  }
</style>
