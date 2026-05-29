<script setup lang="ts">
// EditorCanvas — center pane. Renders the block list, hosts drop zones
// (between every pair of blocks plus head/tail), owns selection clicks,
// and translates drag/drop events into structural change events emitted
// upward to EditorShell. The canvas does NOT mutate `body` itself; the
// Shell is the source of truth.
//
// Drop-zone protocol (see Editor.md §7 → Drag-and-drop):
//   application/x-gorilla-block  → new block; payload = BlockType
//   application/x-gorilla-move   → existing block reorder; payload = blockId
//
// We deliberately read BOTH mime types on every drop so reorder and
// new-insert flow through one code path. The Shell handles the dedup.
//
// Phase 1 + canvas-polish additions:
//   - Workspace tinted surround + centered email card (canvas-polish §1)
//   - InboxPreviewStrip at the top of the email card (canvas-polish §2)
//   - Block-type pill on selection (canvas-polish §3)
//   - Drag handle on hover/select (canvas-polish §4)
//   - Animated drop-zones with "Drop here" label (canvas-polish §5)
//   - Insertion/deletion animations via <TransitionGroup> (canvas-polish §6)
//   - Inline alignment toolbar above selected text blocks (canvas-polish §9)
//   - Spacer/Divider visibility chrome (canvas-polish §8)
import { computed, ref } from "vue";
import BlockHoverToolbar from "./BlockHoverToolbar.vue";
import DragHandle from "./DragHandle.vue";
import InboxPreviewStrip from "./InboxPreviewStrip.vue";
import InlineAlignmentToolbar from "./InlineAlignmentToolbar.vue";
import type { SetupValues } from "./editor-types";
import {
  type Block,
  type BlockType,
  type Body,
  registry,
} from "./blocks/registry";

interface Props {
  body: Body;
  selectedBlockId: string | null;
  // While the user is dragging anything (new-block tile OR existing-block
  // handle) the Shell flips this to true. The canvas uses it to show drop
  // zones at full visibility rather than hidden-until-hover.
  dragging: boolean;
  // "desktop" → ~600px max-width; "mobile" → 360px. Editor-phase1.md §7.
  previewWidth: "desktop" | "mobile";
  // Sender/subject/preheader/bodyBg — drives the inbox preview strip
  // and the workspace background color (canvas-polish §2 + §11).
  setupValues: SetupValues;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "select", blockId: string | null): void;
  (e: "insert", payload: { type: BlockType; index: number }): void;
  (e: "move", payload: { blockId: string; toIndex: number }): void;
  (e: "delete", blockId: string): void;
  (e: "duplicate", blockId: string): void;
  (e: "move-up", blockId: string): void;
  (e: "move-down", blockId: string): void;
  (e: "drag-start"): void;
  (e: "drag-end"): void;
  (e: "inline-input", payload: { blockId: string; patch: Record<string, unknown> }): void;
  (e: "inline-commit", payload: { blockId: string; patch: Record<string, unknown> }): void;
  // Used by the inline alignment toolbar (canvas-polish §9). Travels
  // the same update channel as inspector edits; the Shell routes both
  // through setBlockProps.
  (e: "update-props", payload: { blockId: string; patch: Record<string, unknown> }): void;
  (e: "footer-delete-blocked"): void;
  (e: "footer-duplicate-blocked"): void;
}>();

// Active drop-zone index for visual feedback. Distinct from `dragging`
// (which is global) — this is which specific zone the pointer is over.
const activeDropIndex = ref<number | null>(null);

// Per-block hover state (block id when the pointer is over a block).
// Needed for Spacer + Divider visibility (canvas-polish §8) which can't
// use plain CSS :hover because the chrome lives outside the block.
const hoveredBlockId = ref<string | null>(null);

const blocks = computed(() => props.body.blocks);

// Index of the (singleton) footer block, or -1 if none. Cached because
// every drop-zone over check needs it.
const footerIndex = computed(() =>
  props.body.blocks.findIndex((b) => b.type === "footer"),
);

// During an inline-edit cycle, we want clicks inside the
// contenteditable element to NOT bubble up to .block-wrap → reselect
// (which would yank the cursor). We rely on contenteditable's native
// focus behavior; the block-wrap click handler short-circuits on this.
function onBlockClick(e: MouseEvent, block: Block) {
  e.stopPropagation();
  // If user is already editing this block, ignore — clicking inside
  // would otherwise re-trigger the selection path and call .focus()
  // again, moving the caret to the end mid-edit. We just keep the
  // editing session going.
  if (props.selectedBlockId === block.id) return;
  emit("select", block.id);
}

function onWorkspaceClick() {
  emit("select", null);
}

function onBlockMouseEnter(block: Block) {
  hoveredBlockId.value = block.id;
}
function onBlockMouseLeave(block: Block) {
  if (hoveredBlockId.value === block.id) hoveredBlockId.value = null;
}

// ── Drop-zone handlers ──────────────────────────────────────────────────
// Footer constraint (Editor-phase1.md §6 → "Drag-drop constraint"):
//   - the footer block cannot be dragged ABOVE any non-footer block
//   - other blocks cannot be dropped AFTER the footer (footer stays last;
//     enforced server-side by EditorShell.normalizeFooterPosition, but
//     blocking the drop zone here makes the constraint visible).
function isDropZoneAllowed(index: number, dataTransfer: DataTransfer): boolean {
  const types = Array.from(dataTransfer.types);
  const isMove = types.includes("application/x-gorilla-move");
  const isNew = types.includes("application/x-gorilla-block");

  const fIdx = footerIndex.value;
  // If there's no footer in the body, no constraints.
  if (fIdx < 0) return isMove || isNew;

  // For a NEW block insert: don't allow dropping at or after the footer.
  // (footer is at fIdx; the drop slot directly after it is fIdx+1, also
  // disallowed.)
  if (isNew) return index <= fIdx;

  // For a MOVE, we can't read the payload during dragover (browsers
  // gate getData behind drop for cross-origin reasons); we permissively
  // allow the zone here and validate in onDrop. The visual cost is the
  // odd flicker on a disallowed reorder — acceptable.
  if (isMove) return true;

  return false;
}

function onDropZoneOver(e: DragEvent, index: number) {
  if (!e.dataTransfer) return;
  if (!isDropZoneAllowed(index, e.dataTransfer)) return;
  e.preventDefault(); // required to allow drop
  e.dataTransfer.dropEffect = Array.from(e.dataTransfer.types).includes(
    "application/x-gorilla-move",
  )
    ? "move"
    : "copy";
  activeDropIndex.value = index;
}

function onDropZoneLeave(_e: DragEvent, index: number) {
  if (activeDropIndex.value === index) activeDropIndex.value = null;
}

function onDrop(e: DragEvent, index: number) {
  if (!e.dataTransfer) return;
  e.preventDefault();
  activeDropIndex.value = null;
  emit("drag-end");

  const moveId = e.dataTransfer.getData("application/x-gorilla-move");
  if (moveId) {
    // Footer constraint: don't allow non-footer blocks to be moved
    // below the footer; don't allow the footer to be moved above any
    // non-footer block.
    const fIdx = footerIndex.value;
    const draggedIsFooter =
      props.body.blocks.find((b) => b.id === moveId)?.type === "footer";
    if (fIdx >= 0) {
      if (draggedIsFooter) {
        // The footer needs to end up at the last slot; the Shell already
        // normalizes, but reject obvious "above other blocks" drops.
        const minAllowed = props.body.blocks.filter((b) => b.type !== "footer").length;
        if (index < minAllowed) return;
      } else {
        // Non-footer block: cannot land past the footer position.
        // Index === fIdx + 1 means "just after the footer"; treat the
        // footer's original slot as a hard ceiling.
        if (index > fIdx) return;
      }
    }
    emit("move", { blockId: moveId, toIndex: index });
    return;
  }
  const type = e.dataTransfer.getData(
    "application/x-gorilla-block",
  ) as BlockType;
  if (type) {
    // New block: never insert AT or AFTER the footer.
    const fIdx = footerIndex.value;
    if (fIdx >= 0 && index > fIdx) return;
    emit("insert", { type, index });
  }
}

// Reorder drag — from the left-edge handle on every block (hover/selected).
function onHandleDragStart(e: DragEvent, block: Block) {
  if (!e.dataTransfer) return;
  e.dataTransfer.setData("application/x-gorilla-move", block.id);
  e.dataTransfer.effectAllowed = "move";
  emit("drag-start");
}
function onHandleDragEnd() {
  emit("drag-end");
}

// Hover toolbar handlers.
function onToolbarMoveUp(blockId: string) {
  emit("move-up", blockId);
}
function onToolbarMoveDown(blockId: string) {
  emit("move-down", blockId);
}
function onToolbarDuplicate(blockId: string) {
  emit("duplicate", blockId);
}
function onToolbarDelete(blockId: string) {
  emit("delete", blockId);
}

// Inline edit handlers (Heading/Paragraph only).
function onInlineInput(block: Block, text: string) {
  if (block.type === "heading") {
    emit("inline-input", { blockId: block.id, patch: { text } });
  } else if (block.type === "paragraph") {
    emit("inline-input", { blockId: block.id, patch: { html: text } });
  }
}
function onInlineCommit(block: Block, text: string) {
  if (block.type === "heading") {
    emit("inline-commit", { blockId: block.id, patch: { text } });
  } else if (block.type === "paragraph") {
    emit("inline-commit", { blockId: block.id, patch: { html: text } });
  }
}

// Which blocks support inline edit. Image/Button/Divider/Spacer/Footer
// stay inspector-driven.
function isInlineEditable(type: BlockType): boolean {
  return type === "heading" || type === "paragraph";
}

// Heading + Paragraph carry an `align` prop. The inline alignment
// toolbar (canvas-polish §9) renders above these two block types.
function hasInlineAlignmentToolbar(type: BlockType): boolean {
  return type === "heading" || type === "paragraph";
}

function onAlignmentChange(block: Block, value: "left" | "center" | "right") {
  emit("update-props", { blockId: block.id, patch: { align: value } });
}

// Workspace background color. Empty / falsy → fall back to the soft
// warm gray default (--color-surface-2) per canvas-polish §1.
const workspaceBg = computed(() => {
  const v = (props.setupValues?.bodyBg || "").trim();
  return v || "var(--color-surface-2)";
});
</script>

<template>
  <div
    class="canvas-workspace"
    :style="{ background: workspaceBg }"
    @click="onWorkspaceClick"
  >
    <div
      class="canvas-card"
      :class="[`canvas-card--${previewWidth}`]"
      :style="{ maxWidth: cardMaxWidth }"
      @click.stop
    >
      <!-- Inbox preview strip (canvas-polish §2). Sits inside the card,
           above any blocks. Bound to setupValues so live edits in the
           Setup popover update the preview without a save round-trip. -->
      <InboxPreviewStrip :values="setupValues" />

      <!-- top drop zone -->
      <div
        :class="[
          'drop-zone',
          { 'drop-zone--visible': dragging, 'drop-zone--active': activeDropIndex === 0 },
        ]"
        @dragover="onDropZoneOver($event, 0)"
        @dragleave="onDropZoneLeave($event, 0)"
        @drop="onDrop($event, 0)"
      >
        <span class="drop-zone-band" aria-hidden="true"></span>
        <span class="drop-zone-label">Drop here</span>
      </div>

      <!-- TransitionGroup drives insertion/deletion animations (canvas-polish §6).
           `tag="div"` so the group keeps a flat container element; each
           direct child <div class="block-row"> is the animated unit
           (block + trailing drop-zone). -->
      <TransitionGroup name="block-list" tag="div" class="block-list">
        <div
          v-for="(block, i) in blocks"
          :key="block.id"
          class="block-row"
        >
          <div
            :class="[
              'block-wrap',
              { 'block-wrap--selected': selectedBlockId === block.id },
              { 'block-wrap--footer': block.type === 'footer' },
            ]"
            @click="onBlockClick($event, block)"
            @mouseenter="onBlockMouseEnter(block)"
            @mouseleave="onBlockMouseLeave(block)"
          >
            <!-- Type-label pill above the block's top-left corner
                 (canvas-polish §3). Shown only while selected.
                 Especially valuable for Spacer / Divider where the
                 selection outline doesn't itself say what's selected. -->
            <span
              v-if="selectedBlockId === block.id"
              class="block-type-pill"
              aria-hidden="true"
            >
              <svg viewBox="0 0 24 24" width="10" height="10">
                <path
                  :d="registry[block.type].iconPath"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              {{ registry[block.type].label }}
            </span>

            <!-- Inline alignment toolbar (canvas-polish §9). Visible
                 only for Heading / Paragraph when selected. Floats
                 above the block-type pill on the right. -->
            <span
              v-if="
                selectedBlockId === block.id &&
                hasInlineAlignmentToolbar(block.type)
              "
              class="block-align-toolbar"
            >
              <InlineAlignmentToolbar
                :value="(block.props as any).align ?? 'left'"
                @update="(v) => onAlignmentChange(block, v)"
              />
            </span>

            <!-- Left-edge drag handle (canvas-polish §4). Shown on hover
                 OR selection. Canonical drag-to-move affordance — the
                 hover toolbar's move-up/move-down arrows stay on the
                 right edge as complementary controls. -->
            <button
              type="button"
              class="block-handle"
              draggable="true"
              :aria-label="`Reorder ${block.type} block`"
              @dragstart="onHandleDragStart($event, block)"
              @dragend="onHandleDragEnd"
              @click.stop
            >
              <DragHandle />
            </button>

            <!-- corner handles, only when selected -->
            <span
              v-if="selectedBlockId === block.id"
              class="block-corner block-corner--tl"
              aria-hidden="true"
            ></span>
            <span
              v-if="selectedBlockId === block.id"
              class="block-corner block-corner--tr"
              aria-hidden="true"
            ></span>
            <span
              v-if="selectedBlockId === block.id"
              class="block-corner block-corner--bl"
              aria-hidden="true"
            ></span>
            <span
              v-if="selectedBlockId === block.id"
              class="block-corner block-corner--br"
              aria-hidden="true"
            ></span>

            <!-- hover toolbar: shown on hover via CSS, persistent when selected -->
            <BlockHoverToolbar
              :is-footer="block.type === 'footer'"
              :is-first="i === 0"
              :is-last="i === blocks.length - 1"
              :selected="selectedBlockId === block.id"
              @move-up="onToolbarMoveUp(block.id)"
              @move-down="onToolbarMoveDown(block.id)"
              @duplicate="onToolbarDuplicate(block.id)"
              @delete="onToolbarDelete(block.id)"
              @footer-delete-blocked="emit('footer-delete-blocked')"
              @footer-duplicate-blocked="emit('footer-duplicate-blocked')"
            />

            <!-- Per Editor-phase1.md §3, heading + paragraph become inline
                 editable when the block is selected. Other blocks render
                 read-only and edit via the inspector. -->
            <component
              v-if="isInlineEditable(block.type)"
              :is="registry[block.type].Render"
              :mode="'render'"
              :editable="selectedBlockId === block.id"
              :block-props="block.props"
              @inline-input="(t) => onInlineInput(block, t)"
              @inline-commit="(t) => onInlineCommit(block, t)"
            />
            <!-- Spacer + Divider need hover/selected awareness so their
                 visibility chrome (dashed band / floating label) only
                 shows when interacting (canvas-polish §8). All other
                 blocks render without those props. -->
            <component
              v-else-if="block.type === 'spacer' || block.type === 'divider'"
              :is="registry[block.type].Render"
              :mode="'render'"
              :block-props="block.props"
              :hovered="hoveredBlockId === block.id"
              :selected="selectedBlockId === block.id"
            />
            <component
              v-else
              :is="registry[block.type].Render"
              :mode="'render'"
              :block-props="block.props"
            />
          </div>

          <!-- drop zone after each block -->
          <div
            :class="[
              'drop-zone',
              {
                'drop-zone--visible': dragging,
                'drop-zone--active': activeDropIndex === i + 1,
              },
            ]"
            @dragover="onDropZoneOver($event, i + 1)"
            @dragleave="onDropZoneLeave($event, i + 1)"
            @drop="onDrop($event, i + 1)"
          >
            <span class="drop-zone-band" aria-hidden="true"></span>
            <span class="drop-zone-label">Drop here</span>
          </div>
        </div>
      </TransitionGroup>

      <div v-if="blocks.length === 0" class="canvas-empty">
        <p>Drag a block from the left rail to start.</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Workspace = the tinted page the email card sits on. Background color
   is bound inline from setupValues.bodyBg with a token fallback so the
   user reads the white card as "the email" and the tinted area as the
   editor workspace around it (canvas-polish §1). */
.canvas-workspace {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-7) var(--space-5);
  display: flex;
  justify-content: center;
  transition: background var(--dur-slow) var(--ease-out);
}

/* The email card itself — white, larger padding, ~600px desktop / 360px
   mobile, lifted off the workspace with a card shadow. The max-width
   modifiers below are what let `justify-content: center` on the workspace
   actually center the card; without them width: 100% makes the card fill
   the workspace and "centering" has nothing to do. */
.canvas-card {
  width: 100%;
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: var(--space-7);
  min-height: 480px;
  align-self: flex-start;
  transition: max-width var(--dur-slow) var(--ease-out);
}
.canvas-card--desktop { max-width: 640px; }
.canvas-card--mobile  { max-width: 380px; }

.canvas-empty {
  padding: var(--space-7) var(--space-5);
  text-align: center;
  color: var(--color-ink-dim);
  font-size: var(--text-sm);
}

/* The TransitionGroup container — needed to host child transitions.
   Display: contents so it doesn't interfere with the card's flow. */
.block-list {
  position: relative;
  display: flex;
  flex-direction: column;
}
.block-row {
  display: flex;
  flex-direction: column;
}

/* ── Drop zones ───────────────────────────────────────────────────────
   Idle (no drag in progress): zero-height, no pointer events. As soon
   as a drag starts the `--visible` modifier expands the hit-target to
   ~6px. Hovering a zone (--active) expands it again to ~24px and
   surfaces the dashed band + "Drop here" label, while the block above/
   below smoothly shifts via the height transition. */
.drop-zone {
  position: relative;
  height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  transition: height var(--dur-base) var(--ease-out),
    padding var(--dur-base) var(--ease-out);
}
.drop-zone--visible {
  height: 6px;
  pointer-events: auto;
}
.drop-zone--active {
  height: 24px;
}
.drop-zone-band {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  height: 1px;
  border-top: 1px dashed var(--color-pop);
  opacity: 0;
  transition: opacity var(--dur-fast) var(--ease-out);
}
.drop-zone--visible .drop-zone-band {
  opacity: 0.5;
}
.drop-zone--active .drop-zone-band {
  opacity: 1;
}
.drop-zone-label {
  position: relative;
  font-size: var(--text-xs);
  color: var(--color-pop);
  font-weight: 600;
  background: var(--color-surface);
  padding: 0 var(--space-2);
  opacity: 0;
  transition: opacity var(--dur-fast) var(--ease-out);
  pointer-events: none;
  font-family: var(--font-body);
}
.drop-zone--active .drop-zone-label {
  opacity: 1;
}

/* ── Block wrapper ───────────────────────────────────────────────────── */
.block-wrap {
  position: relative;
  padding: var(--space-3);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out);
}
.block-wrap:hover {
  background: var(--color-surface-2);
}
.block-wrap--selected {
  background: var(--color-surface);
  outline: 1.5px solid var(--color-pop);
  outline-offset: -1.5px;
}
.block-wrap--selected:hover {
  background: var(--color-surface);
}

/* Surface the hover toolbar (child component) when hovering the block.
   We can't write this from inside BlockHoverToolbar's scoped CSS (the
   parent selector isn't reachable), so it lives here next to .block-wrap.
   :deep() pierces the scoped-class hash on the .bht class. */
.block-wrap:hover :deep(.bht) {
  opacity: 1;
  pointer-events: auto;
}

/* Drag handle — left-edge, vertically centered, hidden until hover or
   selection. The bordered tile is the canonical drag-to-move affordance
   (canvas-polish §4). */
.block-handle {
  position: absolute;
  left: calc(var(--space-5) * -1);
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 28px;
  border: 1px solid var(--color-rule);
  background: var(--color-surface);
  border-radius: var(--radius-xs);
  color: var(--color-ink-dim);
  cursor: grab;
  padding: 0;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out);
}
.block-wrap:hover .block-handle,
.block-wrap--selected .block-handle {
  opacity: 1;
  pointer-events: auto;
}
.block-handle:hover {
  color: var(--color-ink);
  border-color: var(--color-rule-strong);
}
.block-handle:active {
  cursor: grabbing;
}

.block-corner {
  position: absolute;
  width: 6px;
  height: 6px;
  background: var(--color-pop);
  border-radius: 1px;
  pointer-events: none;
}
.block-corner--tl { top: -3px; left: -3px; }
.block-corner--tr { top: -3px; right: -3px; }
.block-corner--bl { bottom: -3px; left: -3px; }
.block-corner--br { bottom: -3px; right: -3px; }

/* Block-type pill — anchored to the block's top-left corner, sits OUTSIDE
   the block (slightly above) so the selection chrome reads as
   "this block is X". */
.block-type-pill {
  position: absolute;
  bottom: 100%;
  left: 0;
  margin-bottom: var(--space-1-5);
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 2px var(--space-2);
  background: var(--color-pop);
  color: var(--color-ink-on-pop);
  border-radius: var(--radius-pill);
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  white-space: nowrap;
  pointer-events: none;
  z-index: 2;
}
.block-type-pill svg {
  flex-shrink: 0;
}

.block-align-toolbar {
  position: absolute;
  bottom: 100%;
  right: 0;
  margin-bottom: var(--space-1-5);
  z-index: 2;
}

/* ── Insertion / deletion animations (canvas-polish §6) ─────────────── */
.block-list-enter-active,
.block-list-leave-active {
  transition: opacity var(--dur-base) var(--ease-out),
    transform var(--dur-base) var(--ease-out);
}
.block-list-enter-from {
  opacity: 0;
  transform: translateY(-8px);
}
.block-list-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
.block-list-leave-active {
  /* Take the leaving element out of layout flow so the surrounding
     blocks slide up to fill the gap immediately. Without this the
     leave-transitioning element keeps its slot until the transition
     ends and the list visibly snaps. */
  position: absolute;
  width: 100%;
}
/* Smooth re-layout of the remaining items. */
.block-list-move {
  transition: transform var(--dur-base) var(--ease-out);
}
.block-row {
  position: relative;
}
</style>
