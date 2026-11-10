const express = require("express");
const multer = require("multer");
const path = require("path");
const Source = require("../models/Source");
const Chunk = require("../models/Chunk");
const { SENSITIVITY, FORMALITY } = require("../constants");
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

// TODO(phase 4): protect with auth and allow only the "lead" role.
// Until then this route is open, so do not deploy it.
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

    let source;
    try {
      source = await Source.create({ name, kind: parsed.kind, sensitivity, formality });
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

    // Counts only. The text of a restricted source must never come back in this response.
    res.status(201).json({
      source: { id: source.id, name, kind: parsed.kind, sensitivity, formality },
      chunkCount: parsed.chunks.length,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;