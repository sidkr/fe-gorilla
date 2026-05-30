// ─────────────────────────────────────────────────────────────────────────────
// Render / merge helpers. CommonJS. Pure functions (no I/O, no Parse).
//
// Both the `send-email` worker job and the `sendTestEmail` cloud function run the
// same pipeline over Campaign.compiledHtml:
//
//   1. resolveMergeFields(html, fields)   — {{key}} → contact data
//   2. injectTracking(html, { pixelUrl, rewriteHref })  — open pixel + click rewrite
//   3. injectUnsubscribe(html, unsubUrl)  — {{unsubscribeUrl}} → real link
//   + listUnsubHeaders(unsubUrl)          — List-Unsubscribe header pair
//
// Order matters: resolveMergeFields runs FIRST and deliberately leaves
// {{unsubscribeUrl}}/{{webVersionUrl}} untouched (those are link placeholders,
// handled by injectUnsubscribe, not contact merge fields).
// ─────────────────────────────────────────────────────────────────────────────

// Placeholders that resolveMergeFields must NOT touch — they're link tokens the
// footer/injector own, not contact data.
const RESERVED_PLACEHOLDERS = new Set(["unsubscribeUrl", "webVersionUrl"]);

function escapeHtml(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Look up a merge key in the flat fields map. Supports `key` and `custom.<key>`
// (the editor's custom-field merge tags). Returns the raw value or undefined.
function lookupField(fields, key) {
  if (!fields) return undefined;
  if (Object.prototype.hasOwnProperty.call(fields, key)) return fields[key];
  // `custom.foo` — also accept a nested `custom` object or a flattened key.
  if (key.startsWith("custom.")) {
    const sub = key.slice("custom.".length);
    if (fields.custom && typeof fields.custom === "object") {
      if (Object.prototype.hasOwnProperty.call(fields.custom, sub)) {
        return fields.custom[sub];
      }
    }
  }
  return undefined;
}

// Replace {{key}}, {{custom.<key>}} and {{key|default}} tokens. Missing values
// fall back to the inline default (after `|`) or the empty string. Substituted
// values are HTML-escaped. Reserved link placeholders are left intact.
function resolveMergeFields(html, fields) {
  if (typeof html !== "string" || !html) return html || "";
  return html.replace(/\{\{\s*([^}]*?)\s*\}\}/g, (match, inner) => {
    // Split on the FIRST pipe: key | default text (default may contain spaces).
    const pipe = inner.indexOf("|");
    const key = (pipe === -1 ? inner : inner.slice(0, pipe)).trim();
    const fallback = pipe === -1 ? "" : inner.slice(pipe + 1).trim();

    if (RESERVED_PLACEHOLDERS.has(key)) return match; // leave untouched

    const value = lookupField(fields, key);
    if (value === undefined || value === null || value === "") {
      return escapeHtml(fallback);
    }
    return escapeHtml(value);
  });
}

// Append a 1x1 open-tracking pixel before </body> (or at the end if absent) and
// rewrite every <a href> through rewriteHref. Skips mailto:/tel:/# and any href
// rewriteHref returns null/undefined for (leave original).
function injectTracking(html, { pixelUrl, rewriteHref } = {}) {
  let out = typeof html === "string" ? html : "";

  if (typeof rewriteHref === "function") {
    out = out.replace(
      /(<a\b[^>]*?\bhref\s*=\s*)(["'])(.*?)\2/gi,
      (full, pre, quote, url) => {
        const u = url.trim();
        if (
          !u ||
          /^(mailto:|tel:|#)/i.test(u) ||
          u.startsWith("{{") // unresolved placeholder (e.g. {{unsubscribeUrl}})
        ) {
          return full;
        }
        const rewritten = rewriteHref(u);
        if (rewritten == null) return full;
        return `${pre}${quote}${rewritten}${quote}`;
      },
    );
  }

  if (pixelUrl) {
    const pixel = `<img src="${pixelUrl}" width="1" height="1" alt="" border="0" style="display:none" />`;
    if (/<\/body>/i.test(out)) {
      out = out.replace(/<\/body>/i, `${pixel}</body>`);
    } else {
      out += pixel;
    }
  }

  return out;
}

// Replace {{unsubscribeUrl}} (and {{webVersionUrl}} when provided) with the real
// signed URLs. Footer block emits these placeholders (see editor registry).
function injectUnsubscribe(html, unsubUrl, webVersionUrl) {
  let out = typeof html === "string" ? html : "";
  if (unsubUrl != null) {
    out = out.replace(/\{\{\s*unsubscribeUrl\s*\}\}/g, unsubUrl);
  }
  if (webVersionUrl != null) {
    out = out.replace(/\{\{\s*webVersionUrl\s*\}\}/g, webVersionUrl);
  }
  return out;
}

// The List-Unsubscribe header pair (Sending.md §11, RFC 8058 one-click).
// Returns a plain { name: value } map ready to pass to the SES adapter's
// `headers` option.
function listUnsubHeaders(unsubUrl) {
  return {
    "List-Unsubscribe": `<${unsubUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

module.exports = {
  resolveMergeFields,
  injectTracking,
  injectUnsubscribe,
  listUnsubHeaders,
  escapeHtml,
};
