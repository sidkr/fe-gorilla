// contenteditable="plaintext-only" auto-strips rich formatting, but Firefox
// doesn't support it (the element silently stays non-editable). Feature-detect
// once and fall back to "true" — the block inline-edit handlers read innerText,
// so the stored value stays plain text across browsers either way.
let cached: "plaintext-only" | "true" | null = null;

export function plaintextEditableValue(): "plaintext-only" | "true" {
  if (cached) return cached;
  if (typeof document === "undefined") return "true"; // SSR / no DOM — don't cache
  try {
    const el = document.createElement("div");
    el.setAttribute("contenteditable", "plaintext-only");
    cached = el.contentEditable === "plaintext-only" ? "plaintext-only" : "true";
  } catch {
    cached = "true";
  }
  return cached;
}
