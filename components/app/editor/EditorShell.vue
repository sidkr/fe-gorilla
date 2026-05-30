<script setup lang="ts">
// EditorShell — the orchestrator. Owns local state for the entire
// editor session: body, selection, dirty/saving flags, autosave timer,
// undo/redo stacks, setup popover, preview width. State lives here,
// NOT in Pinia (Editor.md §6).
//
// Save pipeline:
//   user edit → patch body → mark dirty → debounce 1.5s → autosave
//   user clicks Save → flush immediately (cancels pending debounce)
//
// Mutation discipline: every structural mutation (insert/move/delete/
// duplicate/setProps) pushes the PRE-mutation body onto undoStack before
// mutating. Inline-edit @input within a 500ms window collapses into a
// single undo entry (Editor-phase1.md §5).
import Parse from "parse";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

import BlockLibrary from "./BlockLibrary.vue";
import EditorCanvas from "./EditorCanvas.vue";
import EditorInspector from "./EditorInspector.vue";
import EditorPreview from "./EditorPreview.vue";
import EditorSetup from "./EditorSetup.vue";
import EditorTestSendPopover from "./EditorTestSendPopover.vue";
import EditorTopBar from "./EditorTopBar.vue";
import PreflightChecklist from "./PreflightChecklist.vue";
import {
  type PreflightCheck,
  type SetupField,
  type SetupValues,
} from "./editor-types";
import { useAudiences, type Audience } from "~/composables/app/useAudiences";
import { useSending } from "~/composables/app/useSending";
import { useSettings } from "~/composables/app/useSettings";
import { useToast, type ToastTone } from "~/composables/shared/useToast";
import {
  type Block,
  type BlockType,
  type Body,
  makeBlockId,
  makeDefaultBody,
  registry,
} from "./blocks/registry";

interface Props {
  campaign: any; // Parse.Object — typing it as any avoids dragging Parse types in
}
const props = defineProps<Props>();

const router = useRouter();

// ── Local state ─────────────────────────────────────────────────────────
const name = ref<string>(props.campaign.get("name") ?? "Untitled campaign");
const body = ref<Body>(normalizeBody(props.campaign.get("body")));
const selectedBlockId = ref<string | null>(null);

// Setup / sender metadata fields. Stored on the Campaign per Editor-phase1.md §1.
const subject = ref<string>(props.campaign.get("subject") ?? "");
const preheader = ref<string>(props.campaign.get("preheader") ?? "");
const fromName = ref<string>(props.campaign.get("fromName") ?? "");
const fromEmail = ref<string>(props.campaign.get("fromEmail") ?? "");
const replyTo = ref<string>(props.campaign.get("replyTo") ?? "");
const audienceId = ref<string | null>(props.campaign.get("audienceId") ?? null);
// Workspace background color behind the email card (Editor canvas §11).
// Stored as a hex string on the Campaign. Empty string → use the
// default (--color-surface-2) — resolved in the canvas via a v-bind.
const bodyBg = ref<string>(props.campaign.get("bodyBg") ?? "");

// Real audiences (replaces the former MOCK_AUDIENCES constant). Loaded once on
// mount; used to resolve the selected audience's name + contact count for the
// pre-flight checklist + recipient count. Failure is non-fatal — the checklist
// just reports "no audience" until it loads.
const audiences = ref<Audience[]>([]);
onMounted(async () => {
  try {
    audiences.value = await useAudiences().listAudiences();
  } catch (_) {
    /* non-fatal: pre-flight will show the audience check as unmet */
  }
});

const dirty = ref(false);
const saving = ref(false);
const lastSavedAt = ref<Date | null>(props.campaign.updatedAt ?? null);

// A continuously-incrementing tick so the TopBar "Saved 12s ago" label
// re-renders without us having to wire reactive `Date.now()`.
const now = ref(Date.now());
let nowTimer: ReturnType<typeof setInterval> | null = null;

// Drag-in-progress flag.
const dragging = ref(false);

// Autosave debounce timer.
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
const AUTOSAVE_DEBOUNCE_MS = 1500;

// Test-send popover state.
const testSendOpen = ref(false);
const testSendAnchorTop = ref(0);
const testSendAnchorRight = ref(0);

// Preview modal state.
const previewOpen = ref(false);

// Setup popover state.
const setupOpen = ref(false);
const setupAnchorTop = ref(0);
const setupAnchorLeft = ref(0);
const setupFocusField = ref<SetupField | null>(null);

// Pre-flight checklist state.
const preflightOpen = ref(false);
// Send-in-flight state for the real send path. While `sending` is true the
// pre-flight Send button is disabled. `sendStage` drives the success/error
// overlay copy; `sendError` carries a validation message from the cloud fn.
const sendInFlight = ref(false);
const sendStage = ref<"idle" | "sending" | "sent" | "error">("idle");
const sendRecipientCount = ref<number | null>(null);
const sendError = ref<string>("");

const { scheduleSend } = useSending();
const { getOrgSettings } = useSettings();

// Org timezone label for the schedule picker (Phase 0 §0.3). Best-effort + lazy:
// fetched the first time the preflight gate opens, never blocks the editor, and
// the picker falls back to the browser zone if this stays null.
const orgTimezone = ref<string | null>(null);
async function ensureTimezone() {
  if (orgTimezone.value != null) return;
  try {
    const s = await getOrgSettings();
    orgTimezone.value = (s && (s.timezone as string)) || null;
  } catch {
    /* non-fatal — picker uses the browser zone */
  }
}

// Preview-width preference (Editor-phase1.md §7). Persists in localStorage.
const PREVIEW_WIDTH_KEY = "gorilla_editor_preview_width";
const previewWidth = ref<"desktop" | "mobile">("desktop");

// Toast feedback routes through the shared global toast system (a single
// <ToastHost/> is mounted in layouts/app.vue). Child @toast events may emit
// either a plain string or a { message, tone } payload — normalize both.
const { push } = useToast();

function showToast(
  payload: string | { message?: string; tone?: ToastTone },
) {
  const message = typeof payload === "string" ? payload : (payload.message ?? "");
  const tone: ToastTone =
    typeof payload === "string" ? "neutral" : (payload.tone ?? "neutral");
  if (message) push(message, { tone });
}

// ── Body shape normalization ────────────────────────────────────────────
function normalizeBody(raw: unknown): Body {
  if (
    raw &&
    typeof raw === "object" &&
    "blocks" in (raw as any) &&
    Array.isArray((raw as any).blocks)
  ) {
    const blocks = (raw as any).blocks
      .filter(
        (b: any) =>
          b &&
          typeof b.id === "string" &&
          typeof b.type === "string" &&
          registry[b.type as BlockType],
      )
      .map((b: any) => ({
        id: b.id,
        type: b.type as BlockType,
        props: { ...registry[b.type as BlockType].default(), ...b.props },
      }));
    return { version: 1, blocks: normalizeFooterPosition(blocks) };
  }
  return makeDefaultBody();
}

// Footer must always be last. Called from every body mutation that
// could affect block order (Editor-phase1.md §6 → "Drag-drop constraint":
// "the editor enforces 'footer is always last' on every body mutation").
function normalizeFooterPosition(blocks: Block[]): Block[] {
  const footerIdx = blocks.findIndex((b) => b.type === "footer");
  if (footerIdx < 0 || footerIdx === blocks.length - 1) return blocks;
  const next = [...blocks];
  const [footer] = next.splice(footerIdx, 1);
  next.push(footer);
  return next;
}

// ── Undo / Redo (Editor-phase1.md §5) ────────────────────────────────────
const undoStack = ref<Body[]>([]);
const redoStack = ref<Body[]>([]);
const MAX_HISTORY = 50;

const canUndo = computed(() => undoStack.value.length > 0);
const canRedo = computed(() => redoStack.value.length > 0);

// Deep-clone a body value that may be a Vue reactive proxy. JSON
// round-trip is the safest cheap path — block props are JSON-serializable
// by design, and structuredClone occasionally hiccups on Proxy targets
// in older runtimes. The body is small enough that this is cheap.
function cloneBody(b: Body): Body {
  return JSON.parse(JSON.stringify(b)) as Body;
}

function pushHistory(prev: Body) {
  // Clone yields a deep copy independent of Vue reactivity — mutations
  // after the push don't leak into the stack entry.
  undoStack.value.push(cloneBody(prev));
  if (undoStack.value.length > MAX_HISTORY) undoStack.value.shift();
  redoStack.value = []; // any new mutation clears redo
}

function undo() {
  const prev = undoStack.value.pop();
  if (!prev) return;
  redoStack.value.push(cloneBody(body.value));
  body.value = prev;
  // Reset the inline-edit throttle so the next keystroke begins a new
  // undo group cleanly.
  inlineEditTrack.blockId = null;
  markDirty();
}

function redo() {
  const next = redoStack.value.pop();
  if (!next) return;
  undoStack.value.push(cloneBody(body.value));
  body.value = next;
  inlineEditTrack.blockId = null;
  markDirty();
}

// Inline-edit throttle: subsequent inputs to the same block within
// 500ms of the first one collapse into a single undo step.
const INLINE_EDIT_WINDOW_MS = 500;
const inlineEditTrack: { blockId: string | null; lastInputAt: number } = {
  blockId: null,
  lastInputAt: 0,
};

// ── State mutation helpers ──────────────────────────────────────────────
function markDirty() {
  dirty.value = true;
  scheduleAutosave();
}

// `pushHistory: false` is used by inline-input commits that have already
// pushed their pre-edit snapshot earlier in the keystroke train.
function setBlockProps(
  blockId: string,
  patch: Record<string, unknown>,
  opts: { pushHistory?: boolean } = { pushHistory: true },
) {
  if (opts.pushHistory ?? true) pushHistory(body.value);
  body.value = {
    ...body.value,
    blocks: body.value.blocks.map((b) =>
      b.id === blockId ? { ...b, props: { ...b.props, ...patch } } : b,
    ),
  };
  markDirty();
}

function insertBlock(type: BlockType, index: number) {
  const def = registry[type];
  if (!def) return;
  pushHistory(body.value);
  const newBlock: Block = {
    id: makeBlockId(),
    type,
    props: def.default(),
  };
  const next = [...body.value.blocks];
  const clampedIndex = Math.max(0, Math.min(index, next.length));
  next.splice(clampedIndex, 0, newBlock);
  body.value = { ...body.value, blocks: normalizeFooterPosition(next) };
  selectedBlockId.value = newBlock.id;
  markDirty();
}

function moveBlock(blockId: string, toIndex: number) {
  const from = body.value.blocks.findIndex((b) => b.id === blockId);
  if (from === -1) return;
  const adjusted = toIndex > from ? toIndex - 1 : toIndex;
  if (adjusted === from) return;
  pushHistory(body.value);
  const next = [...body.value.blocks];
  const [removed] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(adjusted, next.length)), 0, removed);
  body.value = { ...body.value, blocks: normalizeFooterPosition(next) };
  markDirty();
}

function moveBlockBy(blockId: string, delta: -1 | 1) {
  const idx = body.value.blocks.findIndex((b) => b.id === blockId);
  if (idx < 0) return;
  // Footer can't move past the end (it's already last) and non-footer
  // blocks can't move past the footer.
  const block = body.value.blocks[idx];
  const lastIdx = body.value.blocks.length - 1;
  const footerIdx = body.value.blocks.findIndex((b) => b.type === "footer");
  let target = idx + delta;
  if (target < 0 || target > lastIdx) return;
  if (block.type !== "footer" && footerIdx >= 0 && target >= footerIdx) return;
  if (block.type === "footer" && delta === -1) {
    // Footer must stay last.
    return;
  }
  pushHistory(body.value);
  const next = [...body.value.blocks];
  const [b] = next.splice(idx, 1);
  next.splice(target, 0, b);
  body.value = { ...body.value, blocks: normalizeFooterPosition(next) };
  markDirty();
}

function duplicateBlock(blockId: string) {
  const idx = body.value.blocks.findIndex((b) => b.id === blockId);
  if (idx < 0) return;
  const src = body.value.blocks[idx];
  if (src.type === "footer") {
    // Footer is a singleton — surface the rationale instead of silently no-op.
    showToast("Only one footer per email.");
    return;
  }
  pushHistory(body.value);
  const clone: Block = {
    id: makeBlockId(),
    type: src.type,
    props: JSON.parse(JSON.stringify(src.props)),
  };
  const next = [...body.value.blocks];
  next.splice(idx + 1, 0, clone);
  body.value = { ...body.value, blocks: normalizeFooterPosition(next) };
  selectedBlockId.value = clone.id;
  markDirty();
}

function deleteBlock(blockId: string) {
  const target = body.value.blocks.find((b) => b.id === blockId);
  if (!target) return;
  if (target.type === "footer") {
    showToast(
      "Removing the footer means your email won't have an unsubscribe link. Required by CAN-SPAM.",
    );
    return;
  }
  pushHistory(body.value);
  body.value = {
    ...body.value,
    blocks: body.value.blocks.filter((b) => b.id !== blockId),
  };
  if (selectedBlockId.value === blockId) selectedBlockId.value = null;
  markDirty();
}

function selectBlock(id: string | null) {
  // Switching selection commits any in-flight inline-edit throttle.
  if (id !== selectedBlockId.value) inlineEditTrack.blockId = null;
  selectedBlockId.value = id;
}

// Inline editing handlers — these come per-keystroke from the canvas.
// The first input in a 500ms window pushes pre-edit body to undo; later
// inputs in the same window do not, so a long word becomes one undo step.
function onInlineInput(payload: { blockId: string; patch: Record<string, unknown> }) {
  const nowMs = Date.now();
  const inSameGroup =
    inlineEditTrack.blockId === payload.blockId &&
    nowMs - inlineEditTrack.lastInputAt < INLINE_EDIT_WINDOW_MS;
  if (!inSameGroup) {
    pushHistory(body.value);
  }
  inlineEditTrack.blockId = payload.blockId;
  inlineEditTrack.lastInputAt = nowMs;
  setBlockProps(payload.blockId, payload.patch, { pushHistory: false });
}
function onInlineCommit(payload: { blockId: string; patch: Record<string, unknown> }) {
  // Commit on blur — just close the current undo group; the value was
  // already in body via onInlineInput. We still write through to make
  // sure the final value (after any non-input mutations like spellcheck
  // accept) lands in the model.
  inlineEditTrack.blockId = null;
  setBlockProps(payload.blockId, payload.patch, { pushHistory: false });
}

// ── Setup field setters ─────────────────────────────────────────────────
function setName(v: string) {
  if (v === name.value) return;
  name.value = v;
  markDirty();
}
function applySetupPatch(patch: Partial<SetupValues>) {
  if (patch.name !== undefined) setName(patch.name);
  if (patch.subject !== undefined) {
    subject.value = patch.subject;
    markDirty();
  }
  if (patch.preheader !== undefined) {
    preheader.value = patch.preheader;
    markDirty();
  }
  if (patch.fromName !== undefined) {
    fromName.value = patch.fromName;
    markDirty();
  }
  if (patch.fromEmail !== undefined) {
    fromEmail.value = patch.fromEmail;
    markDirty();
  }
  if (patch.replyTo !== undefined) {
    replyTo.value = patch.replyTo;
    markDirty();
  }
  if (patch.audienceId !== undefined) {
    audienceId.value = patch.audienceId;
    markDirty();
  }
  if (patch.bodyBg !== undefined) {
    bodyBg.value = patch.bodyBg;
    markDirty();
  }
}

const setupValues = computed<SetupValues>(() => ({
  name: name.value,
  subject: subject.value,
  preheader: preheader.value,
  fromName: fromName.value,
  fromEmail: fromEmail.value,
  replyTo: replyTo.value,
  audienceId: audienceId.value,
  bodyBg: bodyBg.value,
}));

// ── Save ────────────────────────────────────────────────────────────────
function scheduleAutosave() {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    autosaveTimer = null;
    void save();
  }, AUTOSAVE_DEBOUNCE_MS);
}

async function save() {
  if (saving.value) return;
  if (autosaveTimer) {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }
  saving.value = true;
  try {
    props.campaign.set("name", name.value);
    props.campaign.set("body", JSON.parse(JSON.stringify(body.value)));
    // Phase 1: persist the setup fields alongside body on the same save.
    props.campaign.set("subject", subject.value || null);
    props.campaign.set("preheader", preheader.value || null);
    props.campaign.set("fromName", fromName.value || null);
    props.campaign.set("fromEmail", fromEmail.value || null);
    props.campaign.set("replyTo", replyTo.value || null);
    props.campaign.set("audienceId", audienceId.value || null);
    props.campaign.set("bodyBg", bodyBg.value || null);
    await props.campaign.save();
    dirty.value = false;
    lastSavedAt.value = props.campaign.updatedAt ?? new Date();
  } catch (err) {
    console.error("[editor] save failed", err);
    showToast("Save failed — your changes are still in this tab. Try again.");
  } finally {
    saving.value = false;
  }
}

// ── Keyboard ────────────────────────────────────────────────────────────
function isInTextField(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || t.isContentEditable;
}

function onKeyDown(e: KeyboardEvent) {
  // Cmd/Ctrl+S — always saves (works inside text fields too).
  if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "s") {
    e.preventDefault();
    void save();
    return;
  }

  // Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z / Cmd+Y — undo / redo. Only when
  // the user is NOT inside a regular input/textarea — let the browser
  // handle native undo there (Editor-phase1.md §5). We DO take over
  // when the focus is inside a contenteditable, because that IS our
  // inline-edit surface and the undo we want is our snapshot stack.
  const target = e.target as HTMLElement | null;
  const inFormField =
    target instanceof HTMLElement &&
    (target.tagName.toLowerCase() === "input" ||
      target.tagName.toLowerCase() === "textarea");
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
    if (inFormField) return; // native undo
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
    return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
    if (inFormField) return;
    e.preventDefault();
    redo();
    return;
  }

  if (isInTextField(e.target)) return;

  if (e.key === "Escape") {
    selectedBlockId.value = null;
    return;
  }
  if (
    (e.key === "Delete" || e.key === "Backspace") &&
    selectedBlockId.value
  ) {
    e.preventDefault();
    deleteBlock(selectedBlockId.value);
    return;
  }
  if ((e.key === "ArrowUp" || e.key === "ArrowDown") && selectedBlockId.value) {
    const idx = body.value.blocks.findIndex(
      (b) => b.id === selectedBlockId.value,
    );
    if (idx === -1) return;
    const target = e.key === "ArrowUp" ? idx - 1 : idx + 1;
    if (target >= 0 && target < body.value.blocks.length) {
      e.preventDefault();
      selectedBlockId.value = body.value.blocks[target].id;
    }
  }
}

// ── beforeunload guard ──────────────────────────────────────────────────
function onBeforeUnload(e: BeforeUnloadEvent) {
  if (dirty.value) {
    e.preventDefault();
    e.returnValue = "";
  }
}

// ── TopBar handlers ─────────────────────────────────────────────────────
function onBack() {
  void router.push("/app/campaigns");
}

function onOpenTestSend(anchor: HTMLElement) {
  const rect = anchor.getBoundingClientRect();
  testSendAnchorTop.value = rect.bottom + 8;
  testSendAnchorRight.value = window.innerWidth - rect.right;
  anchor.setAttribute("data-test-send-anchor", "true");
  testSendOpen.value = true;
}

function onOpenPreview() {
  previewOpen.value = true;
}

function onOpenSetup(anchor: HTMLElement) {
  // Toggle when re-clicking the same anchor.
  if (setupOpen.value) {
    setupOpen.value = false;
    return;
  }
  const rect = anchor.getBoundingClientRect();
  setupAnchorTop.value = rect.bottom + 8;
  // Anchor the popover's left edge to the button's left edge, but keep
  // it inside the viewport.
  const POPOVER_WIDTH = 480;
  setupAnchorLeft.value = Math.max(
    16,
    Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 16),
  );
  setupOpen.value = true;
}

// ── Preflight ───────────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const preflightChecks = computed<PreflightCheck[]>(() => {
  const checks: PreflightCheck[] = [];
  // Subject
  const hasSubject = subject.value.trim().length > 0;
  checks.push({
    id: "subject",
    status: hasSubject ? "ok" : "fail",
    label: "Subject set",
    description: hasSubject
      ? `"${subject.value.length > 60 ? subject.value.slice(0, 57) + "…" : subject.value}"`
      : "What recipients see in their inbox.",
    fixField: "subject",
  });
  // From name
  const hasFromName = fromName.value.trim().length > 0;
  checks.push({
    id: "fromName",
    status: hasFromName ? "ok" : "fail",
    label: "From name set",
    description: hasFromName
      ? fromName.value
      : "The sender name recipients see.",
    fixField: "fromName",
  });
  // From email
  const trimmedEmail = fromEmail.value.trim();
  const validEmail = trimmedEmail.length > 0 && EMAIL_RE.test(trimmedEmail);
  checks.push({
    id: "fromEmail",
    status: validEmail ? "ok" : "fail",
    label: "From email valid",
    description: validEmail
      ? trimmedEmail
      : "A real email so replies and bounces land somewhere.",
    fixField: "fromEmail",
  });
  // Audience
  const aud = audiences.value.find((a) => a.id === audienceId.value);
  checks.push({
    id: "audience",
    status: aud ? "ok" : "fail",
    label: "Audience selected",
    description: aud
      ? `${aud.name} · ${aud.contactCount.toLocaleString("en-US")} contacts`
      : "Pick who this email goes to.",
    fixField: "audience",
  });
  // Email has content (at least one non-footer block).
  const nonFooterCount = body.value.blocks.filter((b) => b.type !== "footer").length;
  checks.push({
    id: "content",
    status: nonFooterCount > 0 ? "ok" : "warn",
    label: "Email has content",
    description:
      nonFooterCount > 0
        ? `${nonFooterCount} content block${nonFooterCount === 1 ? "" : "s"}.`
        : "Add at least one heading, paragraph, or image.",
    fixField: null,
  });
  // Footer present (auto-inserted, so usually green).
  const hasFooter = body.value.blocks.some((b) => b.type === "footer");
  checks.push({
    id: "footer",
    status: hasFooter ? "ok" : "fail",
    label: "Footer present",
    description: hasFooter
      ? "Unsubscribe + business address included."
      : "Every email needs an unsubscribe link (CAN-SPAM).",
    fixField: null,
  });
  return checks;
});

const preflightRecipientCount = computed(() => {
  const aud = audiences.value.find((a) => a.id === audienceId.value);
  return aud?.contactCount ?? null;
});

function onOpenSend() {
  preflightOpen.value = true;
  void ensureTimezone();
}

async function onPreflightSend(payload?: { when: string }) {
  if (sendInFlight.value) return;
  const when = payload?.when || "now";
  sendInFlight.value = true;
  sendStage.value = "sending";
  sendError.value = "";
  try {
    // Flush a save first so the server compiles + sends from the latest
    // campaign state (subject, body, audience, compiledHtml).
    await save();
    // when === "now" sends immediately; a future ISO schedules the send.
    const res = await scheduleSend(props.campaign.id, when);
    sendRecipientCount.value = res.recipientCount ?? null;
    sendStage.value = "sent";
    sendInFlight.value = false;
  } catch (err: unknown) {
    // Surface validation errors from the cloud fn inline in the modal
    // (e.g. "no verified recipients", "subject required").
    sendError.value =
      (err as { message?: string })?.message ||
      "Send failed. Check the campaign and try again.";
    sendStage.value = "error";
    sendInFlight.value = false;
  }
}

function onSendSuccessDone() {
  // Close the modal and route to the campaigns list so the user can
  // track the send in Reports.
  preflightOpen.value = false;
  sendStage.value = "idle";
  void router.push("/app/campaigns");
}

function onSendErrorDismiss() {
  // Return to the checklist so the user can fix + retry.
  sendStage.value = "idle";
  sendError.value = "";
}

function onPreflightClose() {
  // Don't allow closing mid-send; reset any terminal state on close so a
  // re-open starts fresh on the checklist.
  if (sendInFlight.value) return;
  preflightOpen.value = false;
  sendStage.value = "idle";
  sendError.value = "";
}

function onPreflightEdit(field: SetupField) {
  // Close the modal, open the setup popover, focus the right field.
  preflightOpen.value = false;
  // Anchor the popover to the topbar's Setup button so the geometry is
  // consistent with the regular open path.
  const setupBtn = document.querySelector<HTMLElement>(
    '[data-setup-anchor="true"]',
  );
  if (setupBtn) {
    onOpenSetup(setupBtn);
  } else {
    // Fallback: anchor near the top-left below the topbar.
    setupAnchorTop.value = 64;
    setupAnchorLeft.value = 24;
    setupOpen.value = true;
  }
  setupFocusField.value = field;
}

function onPreflightOpenTestSend() {
  preflightOpen.value = false;
  // Anchor under the Test send button if visible; else fall back to a
  // sibling lookup by text. (data-test-send-anchor is set on the first
  // click; first-time clicks via pre-flight take the fallback path.)
  let btn = document.querySelector<HTMLElement>('button[data-test-send-anchor="true"]');
  if (!btn) {
    const candidates = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
    btn = candidates.find((b) => b.textContent?.trim() === "Test send") ?? null;
  }
  if (btn) onOpenTestSend(btn);
}

// ── Preview width persistence ───────────────────────────────────────────
function setPreviewWidth(v: "desktop" | "mobile") {
  previewWidth.value = v;
  try {
    localStorage.setItem(PREVIEW_WIDTH_KEY, v);
  } catch {
    /* localStorage may be unavailable (Safari private etc.); ignore */
  }
}

// Computed default-test-send email from the current Parse user.
const currentUserEmail = computed(() => {
  const u = Parse.User.current();
  return (u && (u.get("email") as string)) || "";
});

// ── Lifecycle ───────────────────────────────────────────────────────────
const shellEl = ref<HTMLElement | null>(null);

function syncTopOffset() {
  if (!shellEl.value) return;
  const topNav = document.querySelector(".app-top");
  const h = topNav ? (topNav as HTMLElement).getBoundingClientRect().height : 56;
  shellEl.value.style.setProperty("--shell-top-offset", `${Math.round(h)}px`);
}

onMounted(() => {
  document.addEventListener("keydown", onKeyDown);
  window.addEventListener("beforeunload", onBeforeUnload);
  window.addEventListener("resize", syncTopOffset);
  syncTopOffset();
  nowTimer = setInterval(() => {
    now.value = Date.now();
  }, 5000);
  // Restore preview-width preference. Defaults to desktop.
  try {
    const saved = localStorage.getItem(PREVIEW_WIDTH_KEY);
    if (saved === "desktop" || saved === "mobile") previewWidth.value = saved;
  } catch {
    /* ignore */
  }
});
onUnmounted(() => {
  document.removeEventListener("keydown", onKeyDown);
  window.removeEventListener("beforeunload", onBeforeUnload);
  window.removeEventListener("resize", syncTopOffset);
  if (nowTimer) clearInterval(nowTimer);
  if (autosaveTimer) clearTimeout(autosaveTimer);
});

// If the campaign object reference changes (shouldn't happen mid-mount
// but harmless), reset local state.
watch(
  () => props.campaign,
  (c) => {
    name.value = c.get("name") ?? "Untitled campaign";
    body.value = normalizeBody(c.get("body"));
    subject.value = c.get("subject") ?? "";
    preheader.value = c.get("preheader") ?? "";
    fromName.value = c.get("fromName") ?? "";
    fromEmail.value = c.get("fromEmail") ?? "";
    replyTo.value = c.get("replyTo") ?? "";
    audienceId.value = c.get("audienceId") ?? null;
    bodyBg.value = c.get("bodyBg") ?? "";
    selectedBlockId.value = null;
    dirty.value = false;
    lastSavedAt.value = c.updatedAt ?? null;
    undoStack.value = [];
    redoStack.value = [];
  },
);
</script>

<template>
  <div class="shell" ref="shellEl">
    <EditorTopBar
      :name="name"
      :saving="saving"
      :dirty="dirty"
      :last-saved-at="lastSavedAt"
      :now="now"
      :preview-width="previewWidth"
      :can-undo="canUndo"
      :can-redo="canRedo"
      @save="save"
      @back="onBack"
      @open-test-send="onOpenTestSend"
      @open-preview="onOpenPreview"
      @open-send="onOpenSend"
      @open-setup="onOpenSetup"
      @update:preview-width="setPreviewWidth"
      @undo="undo"
      @redo="redo"
    />

    <div
      class="shell-cols"
      @dragstart.capture="dragging = true"
      @dragend.capture="dragging = false"
      @drop.capture="dragging = false"
    >
      <BlockLibrary class="shell-left" />
      <EditorCanvas
        class="shell-center"
        :body="body"
        :selected-block-id="selectedBlockId"
        :dragging="dragging"
        :preview-width="previewWidth"
        :setup-values="setupValues"
        @select="selectBlock"
        @insert="(p) => insertBlock(p.type, p.index)"
        @move="(p) => moveBlock(p.blockId, p.toIndex)"
        @delete="deleteBlock"
        @duplicate="duplicateBlock"
        @move-up="(id) => moveBlockBy(id, -1)"
        @move-down="(id) => moveBlockBy(id, 1)"
        @drag-start="dragging = true"
        @drag-end="dragging = false"
        @inline-input="onInlineInput"
        @inline-commit="onInlineCommit"
        @update-props="(p) => setBlockProps(p.blockId, p.patch)"
        @footer-delete-blocked="
          showToast(
            'Removing the footer means your email won\'t have an unsubscribe link. Required by CAN-SPAM.',
          )
        "
        @footer-duplicate-blocked="showToast('Only one footer per email.')"
      />
      <EditorInspector
        class="shell-right"
        :body="body"
        :selected-block-id="selectedBlockId"
        @update:props="(p) => setBlockProps(p.blockId, p.patch)"
      />
    </div>

    <EditorSetup
      :open="setupOpen"
      :values="setupValues"
      :anchor-top="setupAnchorTop"
      :anchor-left="setupAnchorLeft"
      :focus-field="setupFocusField"
      @close="setupOpen = false"
      @update="applySetupPatch"
      @focus-handled="setupFocusField = null"
    />

    <EditorTestSendPopover
      :open="testSendOpen"
      :default-email="currentUserEmail"
      :campaign-id="props.campaign.id"
      :save-fn="save"
      :anchor-top="testSendAnchorTop"
      :anchor-right="testSendAnchorRight"
      @close="testSendOpen = false"
    />

    <EditorPreview
      :open="previewOpen"
      :body="body"
      :campaign-name="name"
      @close="previewOpen = false"
    />

    <PreflightChecklist
      :open="preflightOpen"
      :checks="preflightChecks"
      :recipient-count="preflightRecipientCount"
      :send-stage="sendStage"
      :send-recipient-count="sendRecipientCount"
      :send-error="sendError"
      :timezone="orgTimezone"
      @close="onPreflightClose"
      @send="onPreflightSend"
      @send-success-done="onSendSuccessDone"
      @send-error-dismiss="onSendErrorDismiss"
      @edit="onPreflightEdit"
      @open-test-send="onPreflightOpenTestSend"
      @toast="showToast"
    />
  </div>
</template>

<style scoped>
.shell {
  --shell-top-offset: 56px;
  position: fixed;
  top: var(--shell-top-offset);
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
  z-index: 10;
}
.shell-cols {
  flex: 1;
  display: grid;
  grid-template-columns: 260px 1fr 320px;
  min-height: 0;
}
.shell-left { min-width: 0; }
.shell-center { min-width: 0; display: flex; flex-direction: column; }
.shell-right { min-width: 0; }
</style>
