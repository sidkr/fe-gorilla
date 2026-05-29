<script setup>
// /app/templates — Templates gallery.
//
// Authed surface; CSR via the /app/* group route rules. Mock data only —
// real Parse `Template` class lands in a later phase. When it does, the
// `templates` ref will swap to a live `Parse.Query` and the filter tabs
// will hit `equalTo("kind", …)` server-side.
//
// Thumbnails are hand-authored inline SVGs keyed by template id so each
// card visually communicates a different email layout (newsletter,
// plain-text, promo, etc.). Colors strictly via tokens.

definePageMeta({
  layout: "app",
  middleware: "auth-required",
});

useHead({ title: "Templates" });

const templates = [
  { id: "t_01", name: "Standard newsletter",   kind: "standard", lastEdited: "Default",       relative: "system",        usedIn: 12 },
  { id: "t_02", name: "Product announcement",  kind: "saved",    lastEdited: "May 14, 2026",  relative: "1 week ago",    usedIn: 8  },
  { id: "t_03", name: "Welcome email",         kind: "saved",    lastEdited: "Apr 22, 2026",  relative: "1 month ago",   usedIn: 3  },
  { id: "t_04", name: "Promotional sale",      kind: "saved",    lastEdited: "Mar 30, 2026",  relative: "2 months ago",  usedIn: 6  },
  { id: "t_05", name: "Plain text update",     kind: "standard", lastEdited: "Default",       relative: "system",        usedIn: 4  },
  { id: "t_06", name: "Re-engagement",         kind: "saved",    lastEdited: "Feb 14, 2026",  relative: "3 months ago",  usedIn: 2  },
  { id: "t_07", name: "Event invite",          kind: "saved",    lastEdited: "Jan 22, 2026",  relative: "4 months ago",  usedIn: 5  },
  { id: "t_08", name: "Member-only digest",    kind: "standard", lastEdited: "Default",       relative: "system",        usedIn: 9  },
];

// Filter tabs. Counts are derived from the mock so they stay in sync if the
// list ever changes. The "value" matches the `kind` field for non-"all" tabs
// so filtering is a single equality check below.
const tabs = computed(() => {
  const saved = templates.filter((t) => t.kind === "saved").length;
  const standard = templates.filter((t) => t.kind === "standard").length;
  return [
    { value: "all",      label: "All",          count: templates.length },
    { value: "saved",    label: "Saved by me",  count: saved },
    { value: "standard", label: "Standard",     count: standard },
  ];
});

const activeTab = ref("all");

const visibleTemplates = computed(() => {
  if (activeTab.value === "all") return templates;
  return templates.filter((t) => t.kind === activeTab.value);
});
</script>

<template>
  <div class="tpl-page">
    <!-- 1. Header -->
    <header class="tpl-header">
      <div class="tpl-header-text">
        <h1>Templates</h1>
        <p class="tpl-lede">Reusable email layouts. Save current designs or start from a curated set.</p>
      </div>
      <NuxtLink to="/app/templates/new" class="tpl-cta">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M7 2.5 V11.5 M2.5 7 H11.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
        <span>New template</span>
      </NuxtLink>
    </header>

    <!-- 2. Filter tabs -->
    <div class="tpl-tabs" role="tablist" aria-label="Filter templates">
      <button
        v-for="tab in tabs"
        :key="tab.value"
        role="tab"
        type="button"
        :aria-selected="activeTab === tab.value"
        :class="['tpl-tab', { 'is-active': activeTab === tab.value }]"
        @click="activeTab = tab.value"
      >
        <span>{{ tab.label }}</span>
        <span class="tpl-tab-count">({{ tab.count }})</span>
      </button>
    </div>

    <!-- 3. Gallery -->
    <section class="tpl-grid" aria-label="Template gallery">
      <AppTemplateCard
        v-for="tpl in visibleTemplates"
        :key="tpl.id"
        :id="tpl.id"
        :name="tpl.name"
        :kind="tpl.kind"
        :last-edited="tpl.lastEdited"
        :relative="tpl.relative"
        :used-in="tpl.usedIn"
      >
        <template #thumb>
          <!-- Inline SVG per template id. viewBox is 3:4 to match the card
               thumbnail aspect ratio. Strictly token colors only. -->

          <!-- Standard newsletter: header + 3 paragraphs + image + 2 paragraphs + button + footer.
               Long-form layout that reads as a content-heavy newsletter. -->
          <svg v-if="tpl.id === 't_01'" viewBox="0 0 240 320" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Newsletter layout preview">
            <rect x="20" y="20"  width="200" height="14" rx="2" fill="var(--color-pop)" />
            <rect x="20" y="48"  width="160" height="6"  rx="2" fill="var(--color-rule)" />
            <rect x="20" y="62"  width="200" height="6"  rx="2" fill="var(--color-rule)" />
            <rect x="20" y="76"  width="180" height="6"  rx="2" fill="var(--color-rule)" />
            <rect x="20" y="94"  width="200" height="70" rx="3" fill="var(--color-surface-2)" stroke="var(--color-rule)" stroke-width="1" />
            <rect x="20" y="176" width="200" height="6"  rx="2" fill="var(--color-rule)" />
            <rect x="20" y="190" width="170" height="6"  rx="2" fill="var(--color-rule)" />
            <rect x="20" y="212" width="90"  height="22" rx="4" fill="var(--color-pop)" />
            <line x1="20" y1="270" x2="220" y2="270" stroke="var(--color-rule)" stroke-width="1" />
            <rect x="20" y="282" width="120" height="4"  rx="2" fill="var(--color-ink-soft)" opacity="0.4" />
            <rect x="20" y="292" width="80"  height="4"  rx="2" fill="var(--color-ink-soft)" opacity="0.4" />
          </svg>

          <!-- Product announcement: header + hero image + headline + body + button + footer.
               Hero-driven product reveal layout. -->
          <svg v-else-if="tpl.id === 't_02'" viewBox="0 0 240 320" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Product announcement preview">
            <rect x="20" y="20"  width="200" height="14" rx="2" fill="var(--color-pop)" />
            <rect x="20" y="48"  width="200" height="100" rx="3" fill="var(--color-surface-2)" stroke="var(--color-rule)" stroke-width="1" />
            <circle cx="120" cy="98" r="18" fill="var(--color-pop-bg)" />
            <rect x="20" y="162" width="160" height="10" rx="2" fill="var(--color-ink-soft)" opacity="0.6" />
            <rect x="20" y="184" width="200" height="6"  rx="2" fill="var(--color-rule)" />
            <rect x="20" y="198" width="180" height="6"  rx="2" fill="var(--color-rule)" />
            <rect x="20" y="212" width="150" height="6"  rx="2" fill="var(--color-rule)" />
            <rect x="20" y="234" width="110" height="24" rx="4" fill="var(--color-pop)" />
            <line x1="20" y1="280" x2="220" y2="280" stroke="var(--color-rule)" stroke-width="1" />
            <rect x="20" y="292" width="100" height="4"  rx="2" fill="var(--color-ink-soft)" opacity="0.4" />
          </svg>

          <!-- Welcome email: header + image + headline + 2 paragraphs + 2 small buttons side by side. -->
          <svg v-else-if="tpl.id === 't_03'" viewBox="0 0 240 320" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Welcome email preview">
            <rect x="20" y="20"  width="200" height="14" rx="2" fill="var(--color-pop)" />
            <rect x="20" y="48"  width="200" height="80" rx="3" fill="var(--color-surface-2)" stroke="var(--color-rule)" stroke-width="1" />
            <path d="M120 76 L132 96 H108 Z" fill="var(--color-pop-bg)" />
            <rect x="20" y="142" width="150" height="10" rx="2" fill="var(--color-ink-soft)" opacity="0.6" />
            <rect x="20" y="164" width="200" height="6"  rx="2" fill="var(--color-rule)" />
            <rect x="20" y="178" width="180" height="6"  rx="2" fill="var(--color-rule)" />
            <rect x="20" y="192" width="160" height="6"  rx="2" fill="var(--color-rule)" />
            <rect x="20" y="216" width="86"  height="22" rx="4" fill="var(--color-pop)" />
            <rect x="114" y="216" width="86" height="22" rx="4" fill="var(--color-surface)" stroke="var(--color-pop)" stroke-width="1.5" />
            <line x1="20" y1="278" x2="220" y2="278" stroke="var(--color-rule)" stroke-width="1" />
            <rect x="20" y="290" width="90" height="4"  rx="2" fill="var(--color-ink-soft)" opacity="0.4" />
          </svg>

          <!-- Promotional sale: large image (60% of card) + headline + paragraph + large button. -->
          <svg v-else-if="tpl.id === 't_04'" viewBox="0 0 240 320" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Promotional sale preview">
            <rect x="20" y="20"  width="200" height="14" rx="2" fill="var(--color-pop)" />
            <rect x="20" y="48"  width="200" height="170" rx="3" fill="var(--color-surface-2)" stroke="var(--color-rule)" stroke-width="1" />
            <rect x="44" y="100" width="152" height="14" rx="2" fill="var(--color-pop)" opacity="0.85" />
            <rect x="60" y="124" width="120" height="32" rx="3" fill="var(--color-pop-bg)" />
            <rect x="70" y="134" width="100" height="12" rx="2" fill="var(--color-pop-deep)" />
            <rect x="20" y="230" width="180" height="10" rx="2" fill="var(--color-ink-soft)" opacity="0.6" />
            <rect x="20" y="250" width="200" height="6"  rx="2" fill="var(--color-rule)" />
            <rect x="40" y="276" width="160" height="28" rx="4" fill="var(--color-pop)" />
          </svg>

          <!-- Plain text update: header + 5 paragraphs + footer hairline. No image, no button. -->
          <svg v-else-if="tpl.id === 't_05'" viewBox="0 0 240 320" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Plain text update preview">
            <rect x="20" y="20"  width="200" height="14" rx="2" fill="var(--color-pop)" />
            <rect x="20" y="56"  width="200" height="6"  rx="2" fill="var(--color-rule)" />
            <rect x="20" y="70"  width="180" height="6"  rx="2" fill="var(--color-rule)" />
            <rect x="20" y="84"  width="200" height="6"  rx="2" fill="var(--color-rule)" />
            <rect x="20" y="98"  width="160" height="6"  rx="2" fill="var(--color-rule)" />
            <rect x="20" y="124" width="200" height="6"  rx="2" fill="var(--color-rule)" />
            <rect x="20" y="138" width="190" height="6"  rx="2" fill="var(--color-rule)" />
            <rect x="20" y="152" width="170" height="6"  rx="2" fill="var(--color-rule)" />
            <rect x="20" y="178" width="200" height="6"  rx="2" fill="var(--color-rule)" />
            <rect x="20" y="192" width="180" height="6"  rx="2" fill="var(--color-rule)" />
            <rect x="20" y="218" width="200" height="6"  rx="2" fill="var(--color-rule)" />
            <rect x="20" y="232" width="140" height="6"  rx="2" fill="var(--color-rule)" />
            <rect x="20" y="258" width="160" height="6"  rx="2" fill="var(--color-rule)" />
            <rect x="20" y="272" width="120" height="6"  rx="2" fill="var(--color-rule)" />
            <line x1="20" y1="296" x2="220" y2="296" stroke="var(--color-rule)" stroke-width="1" />
          </svg>

          <!-- Re-engagement: header + headline + paragraph + two CTAs side by side. -->
          <svg v-else-if="tpl.id === 't_06'" viewBox="0 0 240 320" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Re-engagement preview">
            <rect x="20" y="20"  width="200" height="14" rx="2" fill="var(--color-pop)" />
            <rect x="20" y="68"  width="200" height="14" rx="2" fill="var(--color-ink-soft)" opacity="0.6" />
            <rect x="20" y="90"  width="170" height="14" rx="2" fill="var(--color-ink-soft)" opacity="0.6" />
            <rect x="20" y="128" width="200" height="6"  rx="2" fill="var(--color-rule)" />
            <rect x="20" y="142" width="200" height="6"  rx="2" fill="var(--color-rule)" />
            <rect x="20" y="156" width="180" height="6"  rx="2" fill="var(--color-rule)" />
            <rect x="20" y="170" width="160" height="6"  rx="2" fill="var(--color-rule)" />
            <rect x="20" y="208" width="90"  height="28" rx="4" fill="var(--color-pop)" />
            <rect x="118" y="208" width="90" height="28" rx="4" fill="var(--color-surface)" stroke="var(--color-pop)" stroke-width="1.5" />
            <line x1="20" y1="278" x2="220" y2="278" stroke="var(--color-rule)" stroke-width="1" />
            <rect x="20" y="290" width="100" height="4"  rx="2" fill="var(--color-ink-soft)" opacity="0.4" />
          </svg>

          <!-- Event invite: header + image + headline + 3 metadata rows (date/time/location) + CTA. -->
          <svg v-else-if="tpl.id === 't_07'" viewBox="0 0 240 320" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Event invite preview">
            <rect x="20" y="20"  width="200" height="14" rx="2" fill="var(--color-pop)" />
            <rect x="20" y="48"  width="200" height="78" rx="3" fill="var(--color-surface-2)" stroke="var(--color-rule)" stroke-width="1" />
            <rect x="52" y="68"  width="136" height="38" rx="3" fill="var(--color-pop-bg)" />
            <rect x="68" y="76"  width="104" height="8" rx="2" fill="var(--color-pop-deep)" />
            <rect x="80" y="90"  width="80"  height="6" rx="2" fill="var(--color-pop-deep)" opacity="0.6" />
            <rect x="20" y="140" width="160" height="12" rx="2" fill="var(--color-ink-soft)" opacity="0.7" />
            <!-- Metadata rows: small swatch + line -->
            <rect x="20" y="168" width="10" height="10" rx="2" fill="var(--color-pop)" />
            <rect x="38" y="170" width="150" height="6" rx="2" fill="var(--color-rule)" />
            <rect x="20" y="188" width="10" height="10" rx="2" fill="var(--color-pop)" />
            <rect x="38" y="190" width="130" height="6" rx="2" fill="var(--color-rule)" />
            <rect x="20" y="208" width="10" height="10" rx="2" fill="var(--color-pop)" />
            <rect x="38" y="210" width="160" height="6" rx="2" fill="var(--color-rule)" />
            <rect x="20" y="242" width="130" height="28" rx="4" fill="var(--color-pop)" />
            <line x1="20" y1="294" x2="220" y2="294" stroke="var(--color-rule)" stroke-width="1" />
          </svg>

          <!-- Member-only digest: header + 4 small section blocks (image + paragraph + "read more"). -->
          <svg v-else-if="tpl.id === 't_08'" viewBox="0 0 240 320" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Member-only digest preview">
            <rect x="20" y="20" width="200" height="14" rx="2" fill="var(--color-pop)" />

            <!-- Section 1 -->
            <rect x="20" y="48" width="48" height="40" rx="3" fill="var(--color-surface-2)" stroke="var(--color-rule)" stroke-width="1" />
            <rect x="76" y="52" width="140" height="8" rx="2" fill="var(--color-ink-soft)" opacity="0.65" />
            <rect x="76" y="66" width="120" height="5" rx="2" fill="var(--color-rule)" />
            <rect x="76" y="76" width="60"  height="5" rx="2" fill="var(--color-pop)" opacity="0.85" />

            <!-- Section 2 -->
            <rect x="20" y="104" width="48" height="40" rx="3" fill="var(--color-surface-2)" stroke="var(--color-rule)" stroke-width="1" />
            <rect x="76" y="108" width="130" height="8" rx="2" fill="var(--color-ink-soft)" opacity="0.65" />
            <rect x="76" y="122" width="140" height="5" rx="2" fill="var(--color-rule)" />
            <rect x="76" y="132" width="60"  height="5" rx="2" fill="var(--color-pop)" opacity="0.85" />

            <!-- Section 3 -->
            <rect x="20" y="160" width="48" height="40" rx="3" fill="var(--color-surface-2)" stroke="var(--color-rule)" stroke-width="1" />
            <rect x="76" y="164" width="120" height="8" rx="2" fill="var(--color-ink-soft)" opacity="0.65" />
            <rect x="76" y="178" width="135" height="5" rx="2" fill="var(--color-rule)" />
            <rect x="76" y="188" width="60"  height="5" rx="2" fill="var(--color-pop)" opacity="0.85" />

            <!-- Section 4 -->
            <rect x="20" y="216" width="48" height="40" rx="3" fill="var(--color-surface-2)" stroke="var(--color-rule)" stroke-width="1" />
            <rect x="76" y="220" width="140" height="8" rx="2" fill="var(--color-ink-soft)" opacity="0.65" />
            <rect x="76" y="234" width="120" height="5" rx="2" fill="var(--color-rule)" />
            <rect x="76" y="244" width="60"  height="5" rx="2" fill="var(--color-pop)" opacity="0.85" />

            <line x1="20" y1="278" x2="220" y2="278" stroke="var(--color-rule)" stroke-width="1" />
            <rect x="20" y="290" width="100" height="4" rx="2" fill="var(--color-ink-soft)" opacity="0.4" />
          </svg>

          <!-- Fallback: a neutral plain layout. Only triggers if a new template
               id slips in without a matching SVG above. -->
          <svg v-else viewBox="0 0 240 320" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Template preview">
            <rect x="20" y="20"  width="200" height="14" rx="2" fill="var(--color-pop)" />
            <rect x="20" y="48"  width="180" height="6"  rx="2" fill="var(--color-rule)" />
            <rect x="20" y="62"  width="200" height="6"  rx="2" fill="var(--color-rule)" />
            <rect x="20" y="82"  width="200" height="80" rx="3" fill="var(--color-surface-2)" stroke="var(--color-rule)" stroke-width="1" />
            <rect x="20" y="180" width="100" height="22" rx="4" fill="var(--color-pop)" />
          </svg>
        </template>
      </AppTemplateCard>
    </section>
  </div>
</template>

<style scoped>
.tpl-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

/* Header */
.tpl-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-5);
  flex-wrap: wrap;
}
.tpl-header-text { min-width: 0; }
.tpl-header h1 {
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-weight: 800;
  letter-spacing: var(--tracking-tight);
  line-height: var(--leading-tight);
  margin: 0 0 var(--space-2);
  color: var(--color-ink);
}
.tpl-lede {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-md);
  color: var(--color-ink-soft);
}
.tpl-cta {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-5);
  background: var(--btn-primary-bg);
  color: var(--btn-primary-fg);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 600;
  border-radius: var(--radius-md);
  text-decoration: none;
  box-shadow: var(--shadow-sm);
  transition: background-color var(--dur-base) var(--ease-out),
              transform var(--dur-fast) var(--ease-out),
              box-shadow var(--dur-base) var(--ease-out);
  white-space: nowrap;
}
.tpl-cta:hover {
  background: var(--btn-primary-hover);
  box-shadow: var(--shadow-md);
}
.tpl-cta:active {
  transform: translateY(1px);
}
.tpl-cta:focus-visible {
  outline: none;
  box-shadow: var(--shadow-pop-glow);
}

/* Filter tabs — segmented row. Idle tabs are quiet ink-soft on transparent;
   active tab uses the soft coral background + deep coral text for a
   strong, on-brand selection state. */
.tpl-tabs {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1);
  background: var(--color-surface-2);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-pill);
  align-self: flex-start;
}
.tpl-tab {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1-5);
  padding: var(--space-2) var(--space-4);
  background: transparent;
  border: none;
  border-radius: var(--radius-pill);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-ink-soft);
  cursor: pointer;
  transition: background-color var(--dur-base) var(--ease-out),
              color var(--dur-base) var(--ease-out);
}
.tpl-tab:hover {
  color: var(--color-ink);
}
.tpl-tab.is-active {
  background: var(--color-pop-bg);
  color: var(--color-ink);
}
.tpl-tab.is-active .tpl-tab-count {
  color: var(--color-pop-deep);
}
.tpl-tab:focus-visible {
  outline: none;
  box-shadow: var(--shadow-pop-glow);
}
.tpl-tab-count {
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  color: var(--color-ink-dim);
}

/* Gallery grid — 3 cols ≥1100, 2 cols 720-1100, 1 col below. */
.tpl-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-4);
}
@media (max-width: 1100px) {
  .tpl-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 720px) {
  .tpl-grid { grid-template-columns: 1fr; }
}
</style>
