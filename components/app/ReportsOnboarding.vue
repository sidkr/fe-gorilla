<script setup>
// Tutorial-style onboarding card shown at the top of Reports while the org is in
// "demo mode" (no campaign sent yet). It frames the sample-data widgets below
// (KPI strip, opens/clicks trend, engagement funnel, per-campaign table) and
// explains the preview disappears automatically after the first send.
//
// No data props. Emits "dismiss" when the user clicks the primary CTA — the
// Reports page persists that choice and hides the demo widgets.
defineEmits(["dismiss"]);

// 1:1 mapping to the sample widgets rendered below this card, in order.
const steps = [
  {
    icon: "kpi",
    title: "Headline KPIs",
    desc: "Sent, delivered, plus your open and click rates at a glance.",
  },
  {
    icon: "trend",
    title: "Opens vs. clicks over time",
    desc: "Watch engagement rise and fall across the days after each send.",
  },
  {
    icon: "funnel",
    title: "Engagement funnel",
    desc: "See how many move from delivered → opened → clicked.",
  },
  {
    icon: "table",
    title: "Per-campaign performance",
    desc: "Compare every campaign side by side, sortable by any metric.",
  },
];
</script>

<template>
  <section class="ro" aria-label="Reports tutorial">
    <div class="ro-glow" aria-hidden="true"></div>

    <div class="ro-head">
      <div class="ro-head-text">
        <span class="ro-badge">
          <span class="ro-badge-dot" aria-hidden="true"></span>
          Preview · sample data
        </span>
        <h2 class="ro-title">This is a preview of your Reports</h2>
        <p class="ro-intro">
          The numbers below are <strong>sample data</strong> — a quick tour of
          everything Reports tracks, so you can see exactly how it works before
          you send a single campaign.
        </p>
      </div>

      <!-- Friendly inline illustration: a little chart with a coral spark. -->
      <div class="ro-art" aria-hidden="true">
        <svg width="132" height="96" viewBox="0 0 132 96" fill="none">
          <rect x="2" y="2" width="128" height="92" rx="14"
                fill="var(--color-surface)" stroke="var(--color-rule)" />
          <line x1="18" y1="76" x2="114" y2="76"
                stroke="var(--color-rule-strong)" stroke-width="1.4" />
          <rect x="26" y="52" width="14" height="24" rx="3" fill="var(--color-pop-bg)" />
          <rect x="50" y="40" width="14" height="36" rx="3" fill="var(--color-pop-bg)" />
          <rect x="74" y="30" width="14" height="46" rx="3" fill="var(--color-pop)" />
          <rect x="98" y="22" width="14" height="54" rx="3" fill="var(--color-pop)" />
          <path d="M26 58 L57 46 L81 34 L112 20"
                fill="none" stroke="var(--color-pop-deep)" stroke-width="2.4"
                stroke-linecap="round" stroke-linejoin="round" />
          <circle cx="112" cy="20" r="5" fill="var(--color-lemon)"
                  stroke="var(--color-surface)" stroke-width="2" />
        </svg>
      </div>
    </div>

    <ol class="ro-steps">
      <li v-for="(s, i) in steps" :key="s.title" class="ro-step">
        <span class="ro-step-num" aria-hidden="true">{{ i + 1 }}</span>
        <span class="ro-step-icon" aria-hidden="true">
          <!-- KPI -->
          <svg v-if="s.icon === 'kpi'" width="22" height="22" viewBox="0 0 24 24">
            <rect x="3" y="4" width="7" height="7" rx="2" fill="none"
                  stroke="currentColor" stroke-width="1.6" />
            <rect x="3" y="14" width="7" height="6" rx="2" fill="none"
                  stroke="currentColor" stroke-width="1.6" />
            <path d="M14 6 H21 M14 10 H19 M14 15 H21 M14 19 H18"
                  stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          </svg>
          <!-- trend -->
          <svg v-else-if="s.icon === 'trend'" width="22" height="22" viewBox="0 0 24 24">
            <path d="M3 17 L9 11 L13 14 L21 5"
                  fill="none" stroke="currentColor" stroke-width="1.6"
                  stroke-linecap="round" stroke-linejoin="round" />
            <path d="M16 5 H21 V10"
                  fill="none" stroke="currentColor" stroke-width="1.6"
                  stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <!-- funnel -->
          <svg v-else-if="s.icon === 'funnel'" width="22" height="22" viewBox="0 0 24 24">
            <path d="M3 5 H21 L15 12 V19 L9 21 V12 L3 5 Z"
                  fill="none" stroke="currentColor" stroke-width="1.6"
                  stroke-linejoin="round" stroke-linecap="round" />
          </svg>
          <!-- table -->
          <svg v-else width="22" height="22" viewBox="0 0 24 24">
            <rect x="3" y="4" width="18" height="16" rx="2.5" fill="none"
                  stroke="currentColor" stroke-width="1.6" />
            <path d="M3 9 H21 M9 9 V20"
                  stroke="currentColor" stroke-width="1.6" />
          </svg>
        </span>
        <span class="ro-step-text">
          <span class="ro-step-title">{{ s.title }}</span>
          <span class="ro-step-desc">{{ s.desc }}</span>
        </span>
      </li>
    </ol>

    <p class="ro-note">
      <span class="ro-note-icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" fill="none"
                  stroke="currentColor" stroke-width="1.6" />
          <path d="M12 11 V16 M12 7.5 V8"
                stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
      </span>
      <span>
        No setup needed — this preview disappears automatically the moment you
        send your first campaign, and real numbers take its place.
      </span>
    </p>

    <div class="ro-actions">
      <button type="button" class="ro-btn ro-btn-primary" @click="$emit('dismiss')">
        Dismiss sample data
      </button>
      <NuxtLink to="/app/campaigns/new" class="ro-btn ro-btn-ghost">
        Create a campaign
      </NuxtLink>
    </div>
  </section>
</template>

<style scoped>
.ro {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  padding: var(--space-6);
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-md);
}
.ro-glow {
  position: absolute;
  top: -120px;
  right: -120px;
  width: 320px;
  height: 320px;
  background: radial-gradient(circle, var(--color-pop-glow) 0%, transparent 70%);
  pointer-events: none;
}

/* ── Head ──────────────────────────────────────────────────────────────── */
.ro-head {
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-6);
}
.ro-head-text {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  max-width: 62ch;
}
.ro-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  align-self: flex-start;
  padding: var(--space-1-5) var(--space-3);
  background: var(--color-pop-bg);
  color: var(--color-pop-deep);
  border-radius: var(--radius-pill);
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
}
.ro-badge-dot {
  width: var(--space-2);
  height: var(--space-2);
  background: var(--color-pop);
  border-radius: var(--radius-pill);
  box-shadow: 0 0 0 3px var(--color-pop-glow);
}
.ro-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  font-weight: 800;
  letter-spacing: var(--tracking-tight);
  line-height: var(--leading-tight);
  color: var(--color-ink);
}
.ro-intro {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-md);
  line-height: var(--leading-normal);
  color: var(--color-ink-soft);
}
.ro-intro strong {
  color: var(--color-ink);
  font-weight: 700;
}
.ro-art {
  flex-shrink: 0;
  filter: drop-shadow(var(--shadow-sm));
}

/* ── Steps ─────────────────────────────────────────────────────────────── */
.ro-steps {
  position: relative;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
  margin: 0;
  padding: 0;
  list-style: none;
}
.ro-step {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-4);
  background: var(--color-surface-2);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg);
}
.ro-step-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  background: var(--color-pop);
  color: var(--color-ink-on-pop);
  border-radius: var(--radius-pill);
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: 800;
}
.ro-step-icon {
  flex-shrink: 0;
  color: var(--color-pop-deep);
  margin-top: -1px;
}
.ro-step-text {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}
.ro-step-title {
  font-family: var(--font-display);
  font-size: var(--text-md);
  font-weight: 700;
  letter-spacing: var(--tracking-tight);
  color: var(--color-ink);
}
.ro-step-desc {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  line-height: var(--leading-snug);
  color: var(--color-ink-soft);
}

/* ── Auto-dismiss note ─────────────────────────────────────────────────── */
.ro-note {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  margin: 0;
  padding: var(--space-3) var(--space-4);
  background: var(--color-ok-bg);
  border-radius: var(--radius-md);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  line-height: var(--leading-snug);
  color: var(--color-ink-soft);
}
.ro-note-icon {
  flex-shrink: 0;
  color: var(--color-ok);
  margin-top: 1px;
}

/* ── Actions ───────────────────────────────────────────────────────────── */
.ro-actions {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}
.ro-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: var(--field-height);
  padding: 0 var(--space-5);
  border-radius: var(--radius-md);
  font-family: var(--font-display);
  font-size: var(--text-base);
  font-weight: 700;
  letter-spacing: var(--tracking-tight);
  text-decoration: none;
  cursor: pointer;
  transition: background var(--dur-base) var(--ease-out),
              border-color var(--dur-base) var(--ease-out),
              transform var(--dur-fast) var(--ease-out),
              box-shadow var(--dur-base) var(--ease-out);
}
.ro-btn:active {
  transform: translateY(1px);
}
.ro-btn:focus-visible {
  outline: none;
  box-shadow: var(--shadow-pop-glow);
}
.ro-btn-primary {
  background: var(--btn-primary-bg);
  color: var(--btn-primary-fg);
  border: 1px solid transparent;
}
.ro-btn-primary:hover {
  background: var(--btn-primary-hover);
}
.ro-btn-ghost {
  background: var(--color-surface);
  color: var(--btn-ghost-fg);
  border: 1px solid var(--btn-ghost-border);
}
.ro-btn-ghost:hover {
  border-color: var(--color-pop);
  background: var(--btn-ghost-hover-bg);
}

/* ── Responsive ────────────────────────────────────────────────────────── */
@media (max-width: 720px) {
  .ro {
    padding: var(--space-5);
  }
  .ro-head {
    flex-direction: column;
    gap: var(--space-4);
  }
  .ro-art {
    display: none;
  }
  .ro-steps {
    grid-template-columns: 1fr;
  }
  .ro-actions {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
