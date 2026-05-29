<script setup>
import { computed } from "vue";
import { useAuthStore } from "~/stores/auth";

// Every /app/* page uses this layout via `definePageMeta({ layout: 'app' })`.
// noindex on the whole authed surface — crawlers should never index /app/*.
useHead({
  meta: [{ name: "robots", content: "noindex,nofollow" }],
});

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

// Pages may opt into a full-bleed main area by setting
// `definePageMeta({ appWidth: 'full' })`. Useful for surfaces like the editor
// where the 3-pane internal grid needs every available pixel on wide screens.
// Default ('contained') keeps the 1200px-max content container that's right
// for list/detail pages.
const isFullWidth = computed(() => route.meta?.appWidth === "full");

// Two-letter initials for the avatar. Prefer name → username → fallback.
const initials = computed(() => {
  const source = auth.name || auth.username || "";
  const trimmed = source.trim();
  if (!trimmed) return "GO";
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
});

async function onLogout() {
  await auth.logout();
  await router.push("/");
}
</script>

<template>
  <div class="app-shell">
    <aside class="app-sidebar" aria-label="Primary">
      <!-- ── Brand lockup ─────────────────────────────────────────── -->
      <NuxtLink to="/app/dashboard" class="brand" aria-label="Fe-Mail Gorilla home">
        <svg class="brand-mark" width="28" height="28" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Fe-Mail Gorilla">
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
        <span class="brand-word">Fe-Mail Gorilla</span>
        <span class="fe26" aria-label="Iron, element 26">
          <span class="num">26</span><span class="sym">Fe</span>
        </span>
      </NuxtLink>

      <!-- ── Primary CTA ──────────────────────────────────────────── -->
      <NuxtLink to="/app/campaigns/new" class="cta-new">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14"/>
        </svg>
        <span>New campaign</span>
      </NuxtLink>

      <!-- ── Nav links ────────────────────────────────────────────── -->
      <nav class="nav" aria-label="App sections">
        <NuxtLink to="/app/dashboard" class="nav-item">
          <span class="nav-stripe" aria-hidden="true"></span>
          <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 11.5 12 4l9 7.5"/>
            <path d="M5 10.5V20h5v-5h4v5h5v-9.5"/>
          </svg>
          <span class="nav-label">Dashboard</span>
        </NuxtLink>

        <NuxtLink to="/app/campaigns" class="nav-item">
          <span class="nav-stripe" aria-hidden="true"></span>
          <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 3 11 13"/>
            <path d="M21 3l-7 18-3-8-8-3 18-7z"/>
          </svg>
          <span class="nav-label">Campaigns</span>
        </NuxtLink>

        <NuxtLink to="/app/audiences" class="nav-item">
          <span class="nav-stripe" aria-hidden="true"></span>
          <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="9" cy="8" r="3.2"/>
            <path d="M3 19c0-3.3 2.7-5.4 6-5.4s6 2.1 6 5.4"/>
            <circle cx="16.5" cy="9" r="2.4"/>
            <path d="M15.5 13.8c2.8 0 5 1.6 5 4.2"/>
          </svg>
          <span class="nav-label">Audiences</span>
        </NuxtLink>

        <NuxtLink to="/app/segments" class="nav-item">
          <span class="nav-stripe" aria-hidden="true"></span>
          <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="9" cy="12" r="5.5"/>
            <circle cx="15" cy="12" r="5.5"/>
          </svg>
          <span class="nav-label">Segments</span>
        </NuxtLink>

        <NuxtLink to="/app/templates" class="nav-item">
          <span class="nav-stripe" aria-hidden="true"></span>
          <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M6 3h9l4 4v14H6z"/>
            <path d="M14 3v5h5"/>
            <path d="M9 13h7M9 17h5"/>
          </svg>
          <span class="nav-label">Templates</span>
        </NuxtLink>

        <NuxtLink to="/app/reports" class="nav-item">
          <span class="nav-stripe" aria-hidden="true"></span>
          <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4 20V10"/>
            <path d="M10 20V4"/>
            <path d="M16 20v-8"/>
            <path d="M3 20h18"/>
          </svg>
          <span class="nav-label">Reports</span>
        </NuxtLink>
      </nav>

      <div class="spacer" aria-hidden="true"></div>

      <!-- ── User block + logout ─────────────────────────────────── -->
      <div class="user-block">
        <div class="user-row">
          <span class="avatar" aria-hidden="true">{{ initials }}</span>
          <div class="user-meta">
            <span class="user-name">{{ auth.name || auth.username || "Signed in" }}</span>
            <span v-if="auth.username && auth.name" class="user-email">{{ auth.username }}</span>
          </div>
        </div>
        <button type="button" class="logout" @click="onLogout">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M15 17l5-5-5-5"/>
            <path d="M20 12H9"/>
            <path d="M12 20H5V4h7"/>
          </svg>
          <span>Log out</span>
        </button>
      </div>
    </aside>

    <main class="app-main" :class="{ 'app-main--full': isFullWidth }">
      <div class="app-main-inner" :class="{ 'app-main-inner--full': isFullWidth }">
        <slot />
      </div>
    </main>
  </div>
</template>

<style scoped>
/* ── Shell ─────────────────────────────────────────────────────── */
.app-shell {
  min-height: 100vh;
  background: var(--color-bg);
  color: var(--color-ink);
  font-family: var(--font-body);
  display: grid;
  grid-template-columns: 240px 1fr;
}

/* ── Sidebar frame ─────────────────────────────────────────────── */
.app-sidebar {
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  width: 240px;
  display: flex;
  flex-direction: column;
  padding: var(--space-4) var(--space-3) var(--space-4);
  background: var(--color-surface);
  border-right: 1px solid var(--color-rule);
  z-index: 10;
}

/* ── Brand lockup ──────────────────────────────────────────────── */
.brand {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  height: 64px;
  padding: 0 var(--space-2);
  text-decoration: none;
  color: var(--color-ink);
}
.brand-mark { display: block; flex-shrink: 0; }
.brand-word {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: var(--text-lg);
  letter-spacing: var(--tracking-tight);
  color: var(--color-ink);
}
.fe26 {
  display: inline-flex;
  align-items: stretch;
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: 1;
  border: 1px solid var(--color-rule-strong);
  border-radius: var(--radius-xs);
  overflow: hidden;
  background: var(--color-surface);
  color: var(--color-ink);
  letter-spacing: var(--tracking-wide);
}
.fe26 .num {
  padding: var(--space-1) 5px;
  background: var(--color-surface-sunk);
  color: var(--color-ink-soft);
  border-right: 1px solid var(--color-rule);
  font-weight: 500;
}
.fe26 .sym {
  padding: var(--space-1) 5px;
  font-weight: 600;
}

/* ── Primary CTA ──────────────────────────────────────────────── */
.cta-new {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  margin: var(--space-3) var(--space-1) var(--space-4);
  height: 40px;
  background: var(--btn-primary-bg);
  color: var(--btn-primary-fg);
  border-radius: var(--radius-md);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: var(--text-sm);
  letter-spacing: var(--tracking-tight);
  text-decoration: none;
  transition: background var(--dur-base) var(--ease-out),
              box-shadow var(--dur-base) var(--ease-out),
              transform var(--dur-fast) var(--ease-out);
}
.cta-new:hover {
  background: var(--btn-primary-hover);
  box-shadow: var(--shadow-sm);
}
.cta-new:active { transform: translateY(1px); }
.cta-new:focus-visible {
  outline: none;
  box-shadow: var(--shadow-pop-glow);
}

/* ── Nav list ─────────────────────────────────────────────────── */
.nav {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.nav-item {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  height: 40px;
  padding: 0 var(--space-3);
  border-radius: var(--radius-sm);
  text-decoration: none;
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-ink-soft);
  transition: background var(--dur-fast) var(--ease-out),
              color var(--dur-fast) var(--ease-out);
}
.nav-icon {
  flex-shrink: 0;
  color: var(--color-ink-dim);
  transition: color var(--dur-fast) var(--ease-out);
}
.nav-label {
  letter-spacing: var(--tracking-tight);
}
.nav-stripe {
  position: absolute;
  left: 0;
  top: 6px;
  bottom: 6px;
  width: 3px;
  background: transparent;
  border-radius: var(--radius-xs);
  transition: background var(--dur-fast) var(--ease-out);
}
.nav-item:hover {
  background: var(--color-surface-2);
  color: var(--color-ink);
}
.nav-item:hover .nav-icon { color: var(--color-ink-soft); }

.nav-item.router-link-active {
  color: var(--color-ink);
  background: var(--color-surface-2);
}
.nav-item.router-link-active .nav-icon { color: var(--color-pop); }
.nav-item.router-link-active .nav-stripe { background: var(--color-pop); }

.nav-item:focus-visible {
  outline: none;
  box-shadow: var(--shadow-pop-glow);
}

/* ── Spacer pushes user block to bottom ───────────────────────── */
.spacer { flex: 1 1 auto; }

/* ── User block ───────────────────────────────────────────────── */
.user-block {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-rule);
}
.user-row {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  padding: 0 var(--space-2);
  min-width: 0;
}
.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-pill);
  background: var(--color-pop);
  color: var(--color-ink-on-pop);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-wide);
}
.user-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: var(--leading-snug);
}
.user-name {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.user-email {
  font-size: var(--text-xs);
  color: var(--color-ink-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Logout (ghost) ───────────────────────────────────────────── */
.logout {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  height: 36px;
  padding: 0 var(--space-3);
  border: 1px solid var(--btn-ghost-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--btn-ghost-fg);
  font-family: var(--font-body);
  font-weight: 600;
  font-size: var(--text-sm);
  letter-spacing: var(--tracking-tight);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out),
              color var(--dur-fast) var(--ease-out);
}
.logout:hover { background: var(--btn-ghost-hover-bg); }
.logout:focus-visible {
  outline: none;
  box-shadow: var(--shadow-pop-glow);
}

/* ── Main content ─────────────────────────────────────────────── */
.app-main {
  grid-column: 2;
  min-height: 100vh;
  padding: var(--space-7) var(--container-pad);
  overflow-y: auto;
}
.app-main-inner {
  max-width: var(--container-max);
  margin: 0 auto;
}

/* Full-bleed variant — drops the 1200px container so surfaces like the
   editor span every available pixel between the sidebar and the right edge.
   Also tightens the page padding so the 3-pane grid has room to breathe. */
.app-main--full {
  padding: 0;
}
.app-main-inner--full {
  max-width: none;
  margin: 0;
}
</style>
