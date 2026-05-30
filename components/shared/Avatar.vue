<script setup>
// Initials avatar — a tinted circle showing 1–2 uppercase initials derived from
// `name`. Replaces the ad-hoc `.af-avatar` / `.ips-avatar` / `.avatar` styles.
// Pass a `#default` slot to override the initials (e.g. an icon glyph). The
// `tone` prop picks a soft tinted background with a readable foreground from the
// palette; `brand` maps to the coral pop tint.
import { computed } from 'vue';

const props = defineProps({
  name: { type: String, default: '' },
  size: {
    type: String,
    default: 'md',
    validator: (v) => ['sm', 'md', 'lg'].includes(v),
  },
  tone: {
    type: String,
    default: 'neutral',
    validator: (v) =>
      ['neutral', 'brand', 'success', 'warn', 'danger', 'info'].includes(v),
  },
});

const initials = computed(() => {
  const parts = props.name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
});
</script>

<template>
  <span
    class="avatar"
    :class="[`avatar--${size}`, `avatar--${tone}`]"
    :title="name || undefined"
    :aria-label="name || undefined"
    role="img"
  >
    <slot>{{ initials }}</slot>
  </span>
</template>

<style scoped>
.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  border-radius: var(--radius-pill);
  font-family: var(--font-body);
  font-weight: 700;
  letter-spacing: var(--tracking-tight);
  line-height: 1;
  user-select: none;
}

/* ── Sizes ────────────────────────────────────────────────────────────── */
.avatar--sm {
  width: 28px;
  height: 28px;
  font-size: var(--text-xs);
}
.avatar--md {
  width: 36px;
  height: 36px;
  font-size: var(--text-sm);
}
.avatar--lg {
  width: 48px;
  height: 48px;
  font-size: var(--text-base);
}

/* ── Tones ────────────────────────────────────────────────────────────── */
.avatar--neutral {
  background: var(--color-surface-sunk);
  color: var(--color-ink-soft);
}
.avatar--brand {
  background: var(--color-pop-bg);
  color: var(--color-pop-deep);
}
.avatar--success {
  background: var(--color-ok-bg);
  color: var(--color-ok);
}
.avatar--warn {
  background: var(--color-warn-bg);
  color: var(--color-warn);
}
.avatar--danger {
  background: var(--color-danger-bg);
  color: var(--color-danger);
}
.avatar--info {
  background: var(--color-surface-2);
  color: var(--color-ink);
}
</style>
