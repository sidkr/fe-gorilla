<script setup lang="ts">
// MarketingDemoPlayer — the homepage "live demo". Plays back real app screenshots
// (captured by scripts/demo + tests/demo) as a video-like product tour: animated
// cursor, spotlight rings, Ken Burns motion, captions, and a chapter rail.
//
// Marketing-only: NO imports from components/app/* or stores/*. Reads the static
// /demo/manifest.json (written by the capture harness) on the client; renders a
// poster frame at prerender/first paint so there's no layout shift. Honors
// prefers-reduced-motion (static, manual stepping — no autoplay/motion).
import { ref, computed, onMounted, onBeforeUnmount } from "vue";

interface Hotspot { x: number; y: number; w: number; h: number; label?: string }
interface CursorStep { x: number; y: number; t: number; click?: boolean }
interface KenBurns { scaleFrom: number; scaleTo: number; panTo: [number, number] }
interface Scene {
  id: string; chapter: string; title: string; caption: string; image: string;
  w: number; h: number; hold: number; kenburns?: KenBurns; hotspots: Hotspot[]; cursor: CursorStep[];
}
interface Manifest { version: number; viewport: { width: number; height: number }; chapters: { id: string; label: string }[]; scenes: Scene[] }

const POSTER = "/demo/frames/01-dashboard.jpg";

const manifest = ref<Manifest | null>(null);
const idx = ref(0);
const playing = ref(false);
const reduced = ref(false);
const root = ref<HTMLElement | null>(null);
const kb = ref({ scale: 1, x: 0, y: 0 });
const cur = ref({ x: 720, y: 450, show: false });
const ripple = ref({ x: 0, y: 0, p: 1 }); // p: 0→1 animation progress (1 = done/hidden)
const sceneProgress = ref(0);

let raf = 0;
let sceneStart = 0;
let io: IntersectionObserver | null = null;

const scenes = computed(() => manifest.value?.scenes ?? []);
const vp = computed(() => manifest.value?.viewport ?? { width: 1440, height: 900 });
const scene = computed<Scene | null>(() => scenes.value[idx.value] ?? null);
const chapters = computed(() => manifest.value?.chapters ?? []);
const image = computed(() => scene.value?.image ?? POSTER);
const chapterLabel = computed(() => chapters.value.find((c) => c.id === scene.value?.chapter)?.label ?? "");

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

onMounted(async () => {
  reduced.value = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  try {
    const r = await fetch("/demo/manifest.json", { cache: "no-cache" });
    if (r.ok) manifest.value = await r.json();
  } catch { /* poster stays; component degrades gracefully */ }

  io = new IntersectionObserver(
    (entries) => {
      const e = entries[0];
      const visible = !!e?.isIntersecting && e.intersectionRatio >= 0.4;
      if (visible && !reduced.value) play();
      else pause();
    },
    { threshold: [0, 0.4, 0.75] },
  );
  if (root.value) io.observe(root.value);
});

onBeforeUnmount(() => { cancelAnimationFrame(raf); io?.disconnect(); });

function play() {
  if (playing.value || !scenes.value.length || reduced.value) return;
  playing.value = true;
  sceneStart = performance.now();
  loop();
}
function pause() {
  playing.value = false;
  cancelAnimationFrame(raf);
}
function toggle() { playing.value ? pause() : play(); }

function go(i: number) {
  const n = scenes.value.length || 1;
  idx.value = ((i % n) + n) % n;
  sceneStart = performance.now();
  kb.value = { scale: 1, x: 0, y: 0 };
  cur.value = { x: vp.value.width / 2, y: vp.value.height / 2, show: false };
  ripple.value = { x: 0, y: 0, p: 1 };
  sceneProgress.value = 0;
}
function jumpToChapter(id: string) {
  const i = scenes.value.findIndex((s) => s.chapter === id);
  if (i >= 0) { go(i); if (!reduced.value) play(); }
}

function updateCursor(s: Scene, t: number) {
  const steps = s.cursor || [];
  if (!steps.length) { cur.value.show = false; return; }
  cur.value.show = true;
  // position: hold at first until its t, lerp between steps, hold at last.
  let pos = { x: steps[0].x, y: steps[0].y };
  for (let i = 0; i < steps.length; i++) {
    const a = steps[i];
    const b = steps[i + 1];
    if (!b) { pos = { x: a.x, y: a.y }; break; }
    if (t >= a.t && t < b.t) {
      const k = easeInOut((t - a.t) / Math.max(1, b.t - a.t));
      pos = { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) };
      break;
    }
    if (t < a.t) { pos = { x: a.x, y: a.y }; break; }
  }
  cur.value.x = pos.x; cur.value.y = pos.y;
  // click ripple: fire a 480ms ripple when crossing a click step's time.
  const click = steps.find((st) => st.click && t >= st.t && t < st.t + 480);
  if (click) ripple.value = { x: click.x, y: click.y, p: (t - click.t) / 480 };
  else if (ripple.value.p < 1) ripple.value.p = 1;
}

function loop() {
  raf = requestAnimationFrame(loop);
  const s = scene.value;
  if (!s) return;
  const t = performance.now() - sceneStart;
  const hold = s.hold || 3200;
  sceneProgress.value = Math.min(1, t / hold);

  if (s.kenburns) {
    const e = easeInOut(sceneProgress.value);
    kb.value = {
      scale: lerp(s.kenburns.scaleFrom, s.kenburns.scaleTo, e),
      x: lerp(0, s.kenburns.panTo[0], e),
      y: lerp(0, s.kenburns.panTo[1], e),
    };
  }
  updateCursor(s, t);
  if (t >= hold) go(idx.value + 1);
}

// transform that zooms/pans the stage (image + overlay together)
const stageTransform = computed(() =>
  `scale(${kb.value.scale}) translate(${kb.value.x}px, ${kb.value.y}px)`,
);
const rippleR = computed(() => 8 + easeOut(ripple.value.p) * 34);
const rippleOpacity = computed(() => (ripple.value.p >= 1 ? 0 : (1 - ripple.value.p) * 0.5));
</script>

<template>
  <section ref="root" class="demo" aria-label="Fe-Mail Gorilla product demo">
    <!-- Chapter rail -->
    <div class="demo-chapters" role="tablist" aria-label="Demo chapters">
      <button
        v-for="c in chapters"
        :key="c.id"
        class="demo-chip"
        :class="{ 'is-active': c.id === scene?.chapter }"
        role="tab"
        :aria-selected="c.id === scene?.chapter"
        type="button"
        @click="jumpToChapter(c.id)"
      >{{ c.label }}</button>
    </div>

    <!-- Device frame -->
    <div class="demo-device">
      <div class="demo-chrome">
        <span class="demo-dot" /><span class="demo-dot" /><span class="demo-dot" />
        <span class="demo-url">app.gorilla.email<span class="demo-url-path">/{{ scene?.id ?? "dashboard" }}</span></span>
        <button class="demo-play" type="button" :aria-label="playing ? 'Pause demo' : 'Play demo'" @click="toggle">
          <svg v-if="playing" width="13" height="13" viewBox="0 0 12 12"><rect x="2" y="1.5" width="3" height="9" rx="1" /><rect x="7" y="1.5" width="3" height="9" rx="1" /></svg>
          <svg v-else width="13" height="13" viewBox="0 0 12 12"><path d="M3 1.8 10 6 3 10.2Z" /></svg>
        </button>
      </div>

      <div class="demo-stage">
        <div class="demo-zoom" :style="{ transform: stageTransform }">
          <img class="demo-shot" :src="image" :alt="scene?.title || 'Fe-Mail Gorilla app'" :width="vp.width" :height="vp.height" loading="lazy" decoding="async" />
          <svg class="demo-fx" :viewBox="`0 0 ${vp.width} ${vp.height}`" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            <!-- spotlight rings -->
            <template v-for="(h, i) in scene?.hotspots || []" :key="i">
              <rect class="demo-ring" :x="h.x - 6" :y="h.y - 6" :width="h.w + 12" :height="h.h + 12" rx="14" />
              <g v-if="h.label" class="demo-tag" :transform="`translate(${h.x - 6}, ${h.y - 28})`">
                <rect class="demo-tag-bg" width="9" height="18" :data-label="h.label" rx="5" :style="{ width: (h.label.length * 8.2 + 20) + 'px' }" />
                <text class="demo-tag-tx" x="11" y="13">{{ h.label }}</text>
              </g>
            </template>
            <!-- cursor + click ripple -->
            <g v-show="cur.show && !reduced" :transform="`translate(${cur.x}, ${cur.y})`" class="demo-cursor">
              <circle :r="rippleR" :opacity="rippleOpacity" class="demo-ripple" />
              <path d="M0 0 L0 22 L6 16 L10 24 L13 22 L9 14 L17 14 Z" class="demo-pointer" />
            </g>
          </svg>
        </div>
        <div class="demo-vignette" aria-hidden="true" />
      </div>
    </div>

    <!-- Caption + progress -->
    <div class="demo-foot">
      <Transition name="cap" mode="out-in">
        <div :key="idx" class="demo-caption">
          <span class="demo-eyebrow"><span class="demo-eyedot" />{{ chapterLabel }}</span>
          <h3 class="demo-title">{{ scene?.title }}</h3>
          <p class="demo-sub">{{ scene?.caption }}</p>
        </div>
      </Transition>
      <div class="demo-progress" role="presentation">
        <button
          v-for="(s, i) in scenes"
          :key="s.id"
          class="demo-seg"
          :class="{ 'is-done': i < idx, 'is-active': i === idx }"
          type="button"
          :aria-label="`Go to: ${s.title}`"
          @click="go(i)"
        >
          <span class="demo-seg-fill" :style="i === idx ? { transform: `scaleX(${sceneProgress})` } : undefined" />
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.demo {
  --demo-radius: var(--radius-xl);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

/* chapter rail */
.demo-chapters { display: flex; flex-wrap: wrap; gap: var(--space-2); justify-content: center; }
.demo-chip {
  appearance: none;
  border: 1px solid var(--color-rule);
  background: var(--color-surface);
  color: var(--color-ink-soft);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  padding: var(--space-1-5) var(--space-3);
  border-radius: var(--radius-pill);
  cursor: pointer;
  transition: color var(--dur-base) var(--ease-out), border-color var(--dur-base) var(--ease-out), background var(--dur-base) var(--ease-out);
}
.demo-chip:hover { border-color: var(--color-rule-strong); color: var(--color-ink); }
.demo-chip.is-active {
  color: var(--color-ink-on-pop);
  background: var(--color-pop);
  border-color: var(--color-pop);
}

/* device frame */
.demo-device {
  border: 1px solid var(--color-rule);
  border-radius: var(--demo-radius);
  background: var(--color-surface);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}
.demo-chrome {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2-5, 10px) var(--space-4);
  background: var(--color-surface-sunk);
  border-bottom: 1px solid var(--color-rule);
}
.demo-dot { width: 11px; height: 11px; border-radius: var(--radius-pill); background: var(--color-rule-strong); }
.demo-dot:first-child { background: var(--color-pop); }
.demo-url {
  margin-left: var(--space-3);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-ink-dim);
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-pill);
  padding: 3px var(--space-3);
}
.demo-url-path { color: var(--color-pop-deep); }
.demo-play {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px; height: 28px;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--color-pop);
  color: var(--color-ink-on-pop);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out);
}
.demo-play:hover { background: var(--color-pop-deep); }
.demo-play svg { fill: currentColor; }

/* stage */
.demo-stage { position: relative; aspect-ratio: 1440 / 900; overflow: hidden; background: var(--color-surface-sunk); }
.demo-zoom { position: absolute; inset: 0; transform-origin: center; will-change: transform; }
.demo-shot { width: 100%; height: 100%; object-fit: cover; display: block; }
.demo-fx { position: absolute; inset: 0; width: 100%; height: 100%; }
.demo-vignette {
  position: absolute; inset: 0; pointer-events: none;
  box-shadow: inset 0 0 0 1px rgba(24, 24, 27, 0.04), inset 0 -40px 80px -40px rgba(24, 24, 27, 0.08);
}

/* spotlight ring */
.demo-ring {
  fill: var(--color-pop);
  fill-opacity: 0.06;
  stroke: var(--color-pop);
  stroke-width: 2.5;
  stroke-opacity: 0.9;
  animation: ringPulse 1.8s var(--ease-out) infinite;
}
@keyframes ringPulse { 0%, 100% { stroke-opacity: 0.85; } 50% { stroke-opacity: 0.35; } }
.demo-tag-bg { height: 18px; fill: var(--color-pop); }
.demo-tag-tx { fill: var(--color-ink-on-pop); font-family: var(--font-mono); font-size: 11px; font-weight: 600; }

/* cursor */
.demo-pointer { fill: var(--color-ink); stroke: #fff; stroke-width: 1.2; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.3)); }
.demo-ripple { fill: var(--color-pop); }

/* caption + progress */
.demo-foot { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--space-5); flex-wrap: wrap; }
.demo-caption { max-width: 60ch; }
.demo-eyebrow {
  display: inline-flex; align-items: center; gap: var(--space-2);
  font-family: var(--font-mono); font-size: var(--text-xs); text-transform: uppercase;
  letter-spacing: var(--tracking-wide); color: var(--color-ink-dim);
}
.demo-eyedot { width: 6px; height: 6px; border-radius: var(--radius-pill); background: var(--color-pop); }
.demo-title { margin: var(--space-2) 0 var(--space-1); font-family: var(--font-display); font-size: var(--text-2xl); font-weight: 700; color: var(--color-ink); letter-spacing: var(--tracking-tight); }
.demo-sub { margin: 0; font-family: var(--font-body); font-size: var(--text-md); color: var(--color-ink-soft); line-height: var(--leading-normal); }

.demo-progress { display: flex; gap: var(--space-1-5); flex: 1; min-width: 200px; max-width: 360px; }
.demo-seg {
  flex: 1; height: 4px; padding: 0; border: none; cursor: pointer;
  border-radius: var(--radius-pill); background: var(--color-rule); overflow: hidden;
}
.demo-seg.is-done { background: var(--color-pop); }
.demo-seg-fill { display: block; height: 100%; width: 100%; background: var(--color-pop); transform: scaleX(0); transform-origin: left; }

/* caption transition */
.cap-enter-active, .cap-leave-active { transition: opacity var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-out); }
.cap-enter-from { opacity: 0; transform: translateY(8px); }
.cap-leave-to { opacity: 0; transform: translateY(-6px); }

@media (max-width: 720px) {
  .demo-title { font-size: var(--text-xl); }
  .demo-foot { flex-direction: column; align-items: stretch; }
  .demo-progress { max-width: none; }
}

@media (prefers-reduced-motion: reduce) {
  .demo-ring { animation: none; }
  .demo-zoom { transform: none !important; }
}
</style>
