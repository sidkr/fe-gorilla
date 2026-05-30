<script setup>
// Row of 4 tile-style action cards. Each tile is a NuxtLink to the target
// route. Icons are inline SVG — no icon font, no CDN.
defineProps({
  actions: {
    type: Array,
    required: true,
    // [{ to, icon, label, desc }]
  },
});
</script>

<template>
  <div class="qa">
    <SectionEyebrow>Quick actions</SectionEyebrow>

    <div class="qa-grid">
      <Card
        v-for="a in actions"
        :key="a.label"
        :to="a.to"
        interactive
        padding="md"
        class="qa-tile"
      >
        <span class="qa-icon" aria-hidden="true">
          <!-- paper-plane -->
          <svg
            v-if="a.icon === 'paper-plane'"
            width="28"
            height="28"
            viewBox="0 0 28 28"
          >
            <path
              d="M25 3 L3 12 L11 15 L14 24 L25 3 Z M11 15 L25 3"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linejoin="round"
              stroke-linecap="round"
            />
          </svg>
          <!-- upload arrow -->
          <svg
            v-else-if="a.icon === 'upload'"
            width="28"
            height="28"
            viewBox="0 0 28 28"
          >
            <path
              d="M14 19 V5 M8 11 L14 5 L20 11 M4 21 V23 H24 V21"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <!-- filter / venn -->
          <svg
            v-else-if="a.icon === 'filter'"
            width="28"
            height="28"
            viewBox="0 0 28 28"
          >
            <path
              d="M4 6 H24 L17 14 V22 L11 24 V14 L4 6 Z"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linejoin="round"
              stroke-linecap="round"
            />
          </svg>
          <!-- document -->
          <svg
            v-else-if="a.icon === 'document'"
            width="28"
            height="28"
            viewBox="0 0 28 28"
          >
            <path
              d="M7 3 H17 L22 8 V25 H7 Z M17 3 V8 H22 M11 13 H18 M11 17 H18 M11 21 H15"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linejoin="round"
              stroke-linecap="round"
            />
          </svg>
        </span>
        <div class="qa-text">
          <div class="qa-label">{{ a.label }}</div>
          <div class="qa-desc">{{ a.desc }}</div>
        </div>
      </Card>
    </div>
  </div>
</template>

<style scoped>
.qa {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.qa-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-4);
}
/* Lay out the icon + text stack inside the Card body. */
.qa-tile :deep(.card__body) {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.qa-tile:hover {
  border-color: var(--color-pop);
}
.qa-tile:focus-visible {
  outline: none;
  box-shadow: var(--shadow-pop-glow);
}
.qa-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  color: var(--color-pop);
}
.qa-text {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}
.qa-label {
  font-family: var(--font-display);
  font-size: var(--text-md);
  font-weight: 700;
  letter-spacing: var(--tracking-tight);
  color: var(--color-ink);
}
.qa-desc {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--color-ink-soft);
  line-height: var(--leading-snug);
}

@media (max-width: 720px) {
  .qa-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 480px) {
  .qa-grid {
    grid-template-columns: 1fr;
  }
}
</style>
