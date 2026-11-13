const express = require("express");
const multer = require("multer");
const path = require("path");
const Source = require("../models/Source");
const Chunk = require("../models/Chunk");
const { SENSITIVITY, FORMALITY } = require("../constants");
const audit = require("../services/audit");
const { redact, describeCounts } = require("../services/redact");
const { parseSource, kindFromFilename, IngestError } = require("../services/ingest");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 5 },
}).single("file");

function receive(req, res, next) {
  upload(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "File too large (max 2 MB)" });
    }
    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({ error: 'Send the file in a field named "file"' });
    }
    return res.status(400).json({ error: "Upload failed" });
  });
}

// Both routes are reviewer-only: app.js mounts this router behind auth and requireRole("lead").

// The source list, with a chunk count per source. Never includes chunk text.
router.get("/", async (req, res) => {
  const [sources, counts] = await Promise.all([
    Source.find().sort({ createdAt: -1 }).lean(),
    Chunk.aggregate([{ $group: { _id: "$sourceId", n: { $sum: 1 } } }]),
  ]);
  const byId = new Map(counts.map((c) => [String(c._id), c.n]));
  res.json(
    sources.map((s) => ({
      id: String(s._id),
      name: s.name,
      kind: s.kind,
      sensitivity: s.sensitivity,
      formality: s.formality,
      chunkCount: byId.get(String(s._id)) || 0,
      redactions: {
        credential: (s.redactions && s.redactions.credential) || 0,
        email: (s.redactions && s.redactions.email) || 0,
        phone: (s.redactions && s.redactions.phone) || 0,
      },
      redactedTotal: (s.redactions && s.redactions.total) || 0,
      at: new Date(s.createdAt).toISOString().slice(0, 19),
    }))
  );
});

router.post("/", receive, async (req, res, next) => {
  try {
    const { sensitivity } = req.body;
    const formality = req.body.formality || "informal"; // the safer default: informal sources never reach "verified" alone

    if (!SENSITIVITY.includes(sensitivity)) {
      return res.status(400).json({ error: "sensitivity is required: " + SENSITIVITY.join(", ") });
    }
    if (!FORMALITY.includes(formality)) {
      return res.status(400).json({ error: "formality must be one of: " + FORMALITY.join(", ") });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Attach a file in the "file" field' });
    }

    const name = path.basename(req.file.originalname);
    if (!kindFromFilename(name)) {
      return res.status(415).json({ error: "Unsupported file type. Use .md, .json or .csv" });
    }

    let parsed;
    try {
      parsed = parseSource(name, req.file.buffer.toString("utf8"));
    } catch (err) {
      if (err instanceof IngestError) return res.status(422).json({ error: err.message });
      throw err;
    }
    if (!parsed.chunks.length) {
      return res.status(422).json({ error: "No readable content found in the file" });
    }

    // Team and lead-only text is masked before it is stored, so only the redacted copy ever
    // exists. Restricted sources are where secrets belong: stored as written, reviewer-only.
    let redactions = null;
    if (sensitivity !== "restricted") {
      redactions = { credential: 0, email: 0, phone: 0, total: 0 };
      parsed.chunks = parsed.chunks.map((c) => {
        const cleaned = redact(c.text);
        for (const key of ["credential", "email", "phone"]) redactions[key] += cleaned.counts[key];
        redactions.total += cleaned.total;
        return { ...c, text: cleaned.text };
      });
    }

    let source;
    try {
      source = await Source.create({ name, kind: parsed.kind, sensitivity, formality, redactions, uploadedBy: req.user.id });
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({ error: 'A source named "' + name + '" already exists' });
      }
      throw err;
    }

    try {
      await Chunk.insertMany(
        parsed.chunks.map((c) => ({ ...c, sourceId: source._id, sensitivity }))
      );
    } catch (err) {
      // Do not leave a source with half its chunks behind.
      await Chunk.deleteMany({ sourceId: source._id });
      await Source.deleteOne({ _id: source._id });
      throw err;
    }

    await audit.record({
      actorId: req.user.id,
      action: "Source imported",
      detail:
        name + ", " + sensitivity + ", " + parsed.chunks.length + " chunks" +
        (redactions && redactions.total > 0
          ? ", " + redactions.total + " redacted (" + describeCounts(redactions) + ")"
          : redactions ? ", nothing redacted" : ", stored as written"),
    });

    // Counts only. The text of a restricted source must never come back in this response.
    res.status(201).json({
      source: { id: source.id, name, kind: parsed.kind, sensitivity, formality },
      chunkCount: parsed.chunks.length,
      redactions: {
        credential: redactions ? redactions.credential : 0,
        email: redactions ? redactions.email : 0,
        phone: redactions ? redactions.phone : 0,
      },
      redactedTotal: redactions ? redactions.total : 0,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;