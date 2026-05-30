// CSV import upload route (F-07). Mounted by server/routes/index.js.
//
// POST /api/imports/upload  (multipart/form-data, field "file")
//   - Streams the uploaded .csv to /tmp/import-<token>.csv (disk, ~100MB cap).
//   - Sniffs the first ~5 data rows for the column-map wizard preview.
//   - Returns { token, filePath, fileName, headers, preview, rowCountEstimate }.
//     The wizard then calls the `startContactImport` cloud fn with `filePath`.
//
// NOTE: multer is NOT installed; busboy IS (it's multer's underlying parser), so
// we use busboy directly for the multipart stream. INTEGRATION DELTA: if you'd
// rather use multer disk storage, `npm i multer` and swap the handler.
//
// Auth: the upload itself is session-token gated via the X-Parse-Session-Token
// header (the SPA already sends it). We verify it with the Parse REST endpoint
// before accepting the file so anonymous users can't fill /tmp. The cloud fn
// re-checks org ownership of the target list, so this is defense-in-depth.
// ─────────────────────────────────────────────────────────────────────────────
const express = require("express");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const Parse = require("parse/node");

const MAX_BYTES = 100 * 1024 * 1024; // ~100MB cap
const PREVIEW_ROWS = 5;

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function stripBom(s) {
  if (typeof s === "string" && s.charCodeAt(0) === 0xfeff) return s.slice(1);
  return s;
}

// Verify the caller is signed in via their Parse session token. Returns the
// user, or null if missing/invalid.
async function verifySession(req) {
  const token =
    req.get("X-Parse-Session-Token") ||
    (req.query && req.query.sessionToken) ||
    "";
  if (!token) return null;
  try {
    return await Parse.User.become(token);
  } catch (_) {
    return null;
  }
}

function mount(app) {
  const router = express.Router();

  router.post("/api/imports/upload", async (req, res) => {
    const user = await verifySession(req);
    if (!user) {
      return res.status(401).json({ error: "Sign in to upload a file." });
    }

    let busboy;
    try {
      busboy = require("busboy");
    } catch (_) {
      return res
        .status(500)
        .json({ error: "Upload parser unavailable on this server." });
    }

    let bb;
    try {
      bb = busboy({ headers: req.headers, limits: { files: 1, fileSize: MAX_BYTES } });
    } catch (e) {
      return res.status(400).json({ error: "Expected a multipart upload." });
    }

    const token = crypto.randomBytes(16).toString("hex");
    const filePath = path.join(os.tmpdir(), `import-${token}.csv`);
    let fileName = "";
    let tooBig = false;
    let sawFile = false;

    // Preview buffer: keep the first chunk(s) until we have enough lines.
    let head = "";
    let headDone = false;

    bb.on("file", (_name, stream, info) => {
      sawFile = true;
      fileName = (info && info.filename) || "upload.csv";
      const ws = fs.createWriteStream(filePath);
      stream.on("data", (chunk) => {
        if (!headDone) {
          head += chunk.toString("utf8");
          if (head.length > 64 * 1024 || head.split("\n").length > PREVIEW_ROWS + 2) {
            headDone = true;
          }
        }
      });
      stream.on("limit", () => {
        tooBig = true;
        ws.destroy();
        stream.resume();
      });
      stream.pipe(ws);
    });

    bb.on("error", () => {
      try { fs.unlinkSync(filePath); } catch (_) {}
      if (!res.headersSent) res.status(400).json({ error: "Upload failed." });
    });

    bb.on("finish", () => {
      if (tooBig) {
        try { fs.unlinkSync(filePath); } catch (_) {}
        return res.status(413).json({ error: "File exceeds the 100MB limit." });
      }
      if (!sawFile) {
        return res.status(400).json({ error: "No file field in the upload." });
      }

      // Build the preview from the buffered head.
      const lines = head.split(/\r?\n/).filter((l, i) => i === 0 || l.length > 0);
      const rows = lines.slice(0, PREVIEW_ROWS + 1).map((l, i) => {
        const cells = splitCsvLine(l);
        if (i === 0 && cells.length) cells[0] = stripBom(cells[0]);
        return cells;
      });
      const headers = rows.length ? rows[0] : [];
      const preview = rows.slice(1, PREVIEW_ROWS + 1);

      return res.json({
        token,
        filePath,
        fileName,
        headers,
        preview,
        columnCount: headers.length,
      });
    });

    req.pipe(bb);
  });

  app.use(router);
}

module.exports = { mount };
