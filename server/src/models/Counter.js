const { Schema, model } = require("mongoose");

const counterSchema = new Schema({
  _id: String, // e.g. "claim"
  seq: Number,
});

module.exports = model("Counter", counterSchema);