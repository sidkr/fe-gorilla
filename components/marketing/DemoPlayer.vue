<script setup lang="ts">
// MarketingDemoPlayer — the homepage "live demo", an onboarding-tour style player
// over real app screenshots (captured by scripts/demo + tests/demo).
//
// Each scene: a frame crossfades in; a dim+spotlight GLIDES to the highlighted UI
// region; an annotation coachmark (title + caption + step) anchors right beside it
// with a pointer. Autoplays on scroll-into-view, loops, and falls back to a static,
// manually-steppable tour under prefers-reduced-motion.
//
// Marketing-only: NO imports from components/app/* or stores/*. Reads the static
// /demo/manifest.json on the client; renders a poster frame at prerender/first paint.
import { ref, computed, onMounted, onBeforeUnmount } from "vue";

interface Hotspot { x: number; y: number; w: number; h: number; label?: string }
interface Scene {
  id: string; chapter: string; title: string; caption: string; image: string;
  w: number; h: number; hold: number; hotspots: Hotspot[];
}
interface Manifest { version: number; viewport: { width: number; height: number }; chapters: { id: string; label: string }[]; scenes: Scene[] }

const POSTER = "/demo/frames/01-dashboard.jpg";
const PAD = 10; // px padding (manifest coords) around a hotspot for the spotlight

const manifest = ref<Manifest | null>(null);
const idx = ref(0);
const playing = ref(false);
const reduced = ref(false);
const isFullscreen = ref(false);
const root = ref<HTMLElement | null>(null);
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
const stepNum = computed(() => String(idx.value + 1).padStart(2, "0"));
const stepTotal = computed(() => String(scenes.value.length || 9).padStart(2, "0"));

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const pct = (v: number, total: number) => (v / total) * 100;

// Primary highlighted region for this scene (first hotspot, or a sensible default).
const primary = computed<Hotspot>(() => {
  const h = scene.value?.hotspots?.[0];
  if (h) return h;
  const { width: W, height: H } = vp.value;
  return { x: W * 0.05, y: H * 0.12, w: W * 0.5, h: H * 0.2 };
});

// Spotlight box (dim everything else, ring the cutout). Positioned in % so it
// scales with the stage; CSS transitions the top/left/width/height → it glides.
const spotStyle = computed(() => {
  const h = primary.value, { width: W, height: H } = vp.value;
  return {
    left: pct(h.x - PAD, W) + "%",
    top: pct(h.y - PAD, H) + "%",
    width: pct(h.w + PAD * 2, W) + "%",
    height: pct(h.h + PAD * 2, H) + "%",
  };
});

// Anchor the coachmark below the highlight when there's room beneath it, else above.
const annoSide = computed(() => {
  const h = primary.value, H = vp.value.height;
  return (h.y + h.h) / H < 0.6 ? "bottom" : "top";
});
const annoStyle = computed(() => {
  const h = primary.value, { width: W, height: H } = vp.value;
  const left = clamp(pct(h.x + h.w / 2, W), 26, 74);
  const top = annoSide.value === "bottom" ? pct(h.y + h.h, H) : pct(h.y, H);
  return { left: left + "%", top: top + "%" };
});

onMounted(async () => {
  reduced.value = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  try {
    const r = await fetch("/demo/manifest.json", { cache: "no-cache" });
    if (r.ok) manifest.value = await r.json();
  } catch { /* poster stays; graceful degrade */ }

  io = new IntersectionObserver(
    (entries) => {
      const e = entries[0];
      const visible = !!e?.isIntersecting && e.intersectionRatio >= 0.4;
      if (visible && !reduced.value) play();
      else if (!isFullscreen.value) pause();
    },
    { threshold: [0, 0.4, 0.75] },
  );
  if (root.value) io.observe(root.value);

  document.addEventListener("fullscreenchange", onFsChange);
  document.addEventListener("webkitfullscreenchange", onFsChange as EventListener);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  io?.disconnect();
  document.removeEventListener("fullscreenchange", onFsChange);
  document.removeEventListener("webkitfullscreenchange", onFsChange as EventListener);
});

// ── Full screen ──────────────────────────────────────────────────────────────
function fsElement(): Element | null {
  return document.fullscreenElement || (document as any).webkitFullscreenElement || null;
}
async function toggleFullscreen() {
  const el = root.value as (HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }) | null;
  if (!el) return;
  try {
    if (fsElement()) {
      await (document.exitFullscreen?.() ?? (document as any).webkitExitFullscreen?.());
    } else {
      await (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.());
    }
  } catch { /* fullscreen denied / unsupported — ignore */ }
}
function onFsChange() {
  isFullscreen.value = fsElement() === root.value;
  if (isFullscreen.value && !reduced.value) play();
}

function play() {
  if (playing.value || !scenes.value.length || reduced.value) return;
  playing.value = true;
  sceneStart = performance.now() - sceneProgress.value * (scene.value?.hold || 3600);
  loop();
}
function pause() { playing.value = false; cancelAnimationFrame(raf); }
function toggle() { playing.value ? pause() : play(); }

function go(i: number) {
  const n = scenes.value.length || 1;
  idx.value = ((i % n) + n) % n;
  sceneStart = performance.now();
  sceneProgress.value = 0;
}
function jumpToChapter(id: string) {
  const i = scenes.value.findIndex((s) => s.chapter === id);
  if (i >= 0) { go(i); if (!reduced.value) play(); }
}

function loop() {
  raf = requestAnimationFrame(loop);
  const s = scene.value;
  if (!s) return;
  const hold = s.hold || 3600;
  sceneProgress.value = Math.min(1, (performance.now() - sceneStart) / hold);
  if (sceneProgress.value >= 1) go(idx.value + 1);
}
</script>

<template>
  <section ref="root" class="demo" :class="{ 'is-fs': isFullscreen }" aria-label="Fe-Mail Gorilla product demo">
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
        <div class="demo-actions">
          <button class="demo-play" type="button" :aria-label="playing ? 'Pause demo' : 'Play demo'" @click="toggle">
            <svg v-if="playing" width="13" height="13" viewBox="0 0 12 12"><rect x="2" y="1.5" width="3" height="9" rx="1" /><rect x="7" y="1.5" width="3" height="9" rx="1" /></svg>
            <svg v-else width="13" height="13" viewBox="0 0 12 12"><path d="M3 1.8 10 6 3 10.2Z" /></svg>
          </button>
          <button class="demo-icon-btn" type="button" :aria-label="isFullscreen ? 'Exit full screen' : 'Full screen'" @click="toggleFullscreen">
            <svg v-if="!isFullscreen" width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5V2h3M12 5V2H9M2 9v3h3M12 9v3H9" /></svg>
            <svg v-else width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 2v3H2M9 2v3h3M5 12V9H2M9 12V9h3" /></svg>
          </button>
        </div>
      </div>

      <div class="demo-stage" :class="{ 'is-reduced': reduced }">
        <!-- crossfading frame -->
        <Transition name="xfade">
          <img
            :key="image"
            class="demo-shot"
            :src="image"
            :alt="scene?.title || 'Fe-Mail Gorilla app'"
            :width="vp.width"
            :height="vp.height"
            loading="lazy"
            decoding="async"
          />
        </Transition>

        <!-- dim + gliding spotlight (box-shadow punches a bright hole) -->
        <div class="demo-spot" :style="spotStyle" aria-hidden="true" />

        <!-- annotation coachmark, anchored beside the highlight -->
        <div class="demo-anno" :style="annoStyle" :data-side="annoSide">
          <Transition name="anno" mode="out-in">
            <div :key="idx" class="demo-anno-in">
              <div class="demo-anno-top">
                <span class="demo-anno-eyebrow"><span class="demo-eyedot" />{{ chapterLabel }}</span>
                <span class="demo-anno-step">{{ stepNum }}<span class="demo-anno-step-dim"> / {{ stepTotal }}</span></span>
              </div>
              <h3 class="demo-anno-title">{{ scene?.title }}</h3>
              <p class="demo-anno-text">{{ scene?.caption }}</p>
            </div>
          </Transition>
        </div>
      </div>
    </div>

    <!-- progress rail -->
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
  </section>
</template>

<style scoped>
.demo { display: flex; flex-direction: column; gap: var(--space-4); }

/* chapter rail */
.demo-chapters { display: flex; flex-wrap: wrap; gap: var(--space-2); justify-content: center; }
.demo-chip {
  appearance: none; border: 1px solid var(--color-rule); background: var(--color-surface);
  color: var(--color-ink-soft); font-family: var(--font-mono); font-size: var(--text-xs);
  letter-spacing: var(--tracking-wide); text-transform: uppercase;
  padding: var(--space-1-5) var(--space-3); border-radius: var(--radius-pill); cursor: pointer;
  transition: color var(--dur-base) var(--ease-out), border-color var(--dur-base) var(--ease-out), background var(--dur-base) var(--ease-out);
}
.demo-chip:hover { border-color: var(--color-rule-strong); color: var(--color-ink); }
.demo-chip.is-active { color: var(--color-ink-on-pop); background: var(--color-pop); border-color: var(--color-pop); }

/* device frame */
.demo-device {
  border: 1px solid var(--color-rule); border-radius: var(--radius-xl);
  background: var(--color-surface); box-shadow: var(--shadow-lg); overflow: hidden;
}
.demo-chrome {
  display: flex; align-items: center; gap: var(--space-2);
  padding: 10px var(--space-4); background: var(--color-surface-sunk); border-bottom: 1px solid var(--color-rule);
}
.demo-dot { width: 11px; height: 11px; border-radius: var(--radius-pill); background: var(--color-rule-strong); }
.demo-dot:first-child { background: var(--color-pop); }
.demo-url {
  margin-left: var(--space-3); font-family: var(--font-mono); font-size: var(--text-xs);
  color: var(--color-ink-dim); background: var(--color-surface); border: 1px solid var(--color-rule);
  border-radius: var(--radius-pill); padding: 3px var(--space-3);
  /* Truncate rather than push the play/fullscreen actions past the viewport on
     narrow phones (the chrome bar is a non-wrapping flex row). */
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.demo-actions { flex-shrink: 0; }
.demo-url-path { color: var(--color-pop-deep); }
.demo-actions { margin-left: auto; display: inline-flex; align-items: center; gap: var(--space-2); }
.demo-play {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border: none; border-radius: var(--radius-pill);
  background: var(--color-pop); color: var(--color-ink-on-pop); cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out);
}
.demo-play:hover { background: var(--color-pop-deep); }
.demo-play svg { fill: currentColor; }
.demo-icon-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border: 1px solid var(--color-rule); border-radius: var(--radius-pill);
  background: var(--color-surface); color: var(--color-ink-soft); cursor: pointer;
  transition: color var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out);
}
.demo-icon-btn:hover { color: var(--color-ink); border-color: var(--color-rule-strong); }

/* stage */
.demo-stage { position: relative; aspect-ratio: 1440 / 900; overflow: hidden; background: var(--color-surface-sunk); }
.demo-shot { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }

/* dim + spotlight — the transparent box punches a bright hole via a huge box-shadow,
   dimming everything else; CSS transitions on geometry make it glide between scenes. */
.demo-spot {
  position: absolute; pointer-events: none; border-radius: var(--radius-md);
  border: 2px solid var(--color-pop);
  box-shadow: 0 0 0 100vmax rgba(24, 24, 27, 0.34), 0 0 22px 2px var(--color-pop-glow);
  transition: top 0.55s var(--ease-spring), left 0.55s var(--ease-spring),
              width 0.55s var(--ease-spring), height 0.55s var(--ease-spring);
  animation: spotPulse 2s var(--ease-out) infinite;
}
@keyframes spotPulse {
  0%, 100% { box-shadow: 0 0 0 100vmax rgba(24, 24, 27, 0.34), 0 0 0 0 var(--color-pop-glow); }
  50% { box-shadow: 0 0 0 100vmax rgba(24, 24, 27, 0.34), 0 0 0 6px var(--color-pop-glow); }
}

/* annotation coachmark */
.demo-anno {
  position: absolute; pointer-events: none; width: min(340px, 64%);
  transform: translate(-50%, 0); margin-top: 16px;
  transition: top 0.55s var(--ease-spring), left 0.55s var(--ease-spring);
  z-index: 2;
}
.demo-anno[data-side="top"] { transform: translate(-50%, -100%); margin-top: -16px; }
.demo-anno-in {
  background: var(--color-surface); border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg); box-shadow: var(--shadow-lg);
  padding: var(--space-4) var(--space-4) var(--space-4-5, 18px);
}
/* pointer triangle aimed at the highlight */
.demo-anno::before, .demo-anno::after {
  content: ""; position: absolute; left: 50%; transform: translateX(-50%); width: 0; height: 0;
  border-left: 9px solid transparent; border-right: 9px solid transparent;
}
.demo-anno[data-side="bottom"]::before { bottom: 100%; border-bottom: 9px solid var(--color-rule); }
.demo-anno[data-side="bottom"]::after { bottom: calc(100% - 1.5px); border-bottom: 9px solid var(--color-surface); }
.demo-anno[data-side="top"]::before { top: 100%; border-top: 9px solid var(--color-rule); }
.demo-anno[data-side="top"]::after { top: calc(100% - 1.5px); border-top: 9px solid var(--color-surface); }

.demo-anno-top { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.demo-anno-eyebrow {
  display: inline-flex; align-items: center; gap: var(--space-2);
  font-family: var(--font-mono); font-size: var(--text-xs); text-transform: uppercase;
  letter-spacing: var(--tracking-wide); color: var(--color-ink-dim);
}
.demo-eyedot { width: 6px; height: 6px; border-radius: var(--radius-pill); background: var(--color-pop); }
.demo-anno-step { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-pop-deep); font-weight: 600; }
.demo-anno-step-dim { color: var(--color-ink-dim); }
.demo-anno-title {
  margin: var(--space-2) 0 var(--space-1); font-family: var(--font-display); font-weight: 700;
  font-size: var(--text-xl); line-height: var(--leading-snug); color: var(--color-ink); letter-spacing: var(--tracking-tight);
}
.demo-anno-text { margin: 0; font-family: var(--font-body); font-size: var(--text-sm); line-height: var(--leading-normal); color: var(--color-ink-soft); }

/* progress rail */
.demo-progress { display: flex; gap: var(--space-1-5); justify-content: center; max-width: 480px; margin: 0 auto; width: 100%; }
.demo-seg { flex: 1; height: 4px; padding: 0; border: none; cursor: pointer; border-radius: var(--radius-pill); background: var(--color-rule); overflow: hidden; }
.demo-seg.is-done { background: var(--color-pop); }
.demo-seg-fill { display: block; height: 100%; width: 100%; background: var(--color-pop); transform: scaleX(0); transform-origin: left; }

/* full screen — the section becomes the fullscreen element; lay the device out
   centered on a dark backdrop, sized to fit the viewport height (aspect 1440/900,
   leaving room for the chapter rail + progress). */
.demo.is-fs {
  background: var(--color-ink);
  padding: clamp(var(--space-4), 3vh, var(--space-7));
  justify-content: center;
  gap: var(--space-5);
}
.demo.is-fs .demo-device {
  width: min(95vw, calc((100vh - 230px) * 1.6));
  margin: 0 auto;
  box-shadow: var(--shadow-pop-deep);
}
.demo.is-fs .demo-progress { max-width: min(95vw, calc((100vh - 230px) * 1.6)); }
.demo.is-fs .demo-seg { background: rgba(255, 255, 255, 0.2); }
.demo.is-fs .demo-seg.is-done { background: var(--color-pop); }

/* transitions */
.xfade-enter-active, .xfade-leave-active { transition: opacity 0.5s var(--ease-out); }
.xfade-enter-from, .xfade-leave-to { opacity: 0; }
.anno-enter-active, .anno-leave-active { transition: opacity var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-out); }
.anno-enter-from { opacity: 0; transform: translateY(6px); }
.anno-leave-to { opacity: 0; transform: translateY(-4px); }

@media (max-width: 720px) {
  .demo-anno { width: min(280px, 78%); }
  .demo-anno-title { font-size: var(--text-lg); }
}

/* reduced motion: no glide, no pulse, no crossfade, no autoplay */
.demo-stage.is-reduced .demo-spot { transition: none; animation: none; }
.demo-stage.is-reduced .demo-anno { transition: none; }
@media (prefers-reduced-motion: reduce) {
  .demo-spot { animation: none; transition: none; }
  .demo-anno { transition: none; }
  .xfade-enter-active, .xfade-leave-active, .anno-enter-active, .anno-leave-active { transition: none; }
}
</style>
