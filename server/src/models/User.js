const { Schema, model } = require("mongoose");
const { ROLES } = require("../constants");

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Hidden by default. The login route must use .select("+passwordHash").
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true },
  },
  { timestamps: true }
);

module.exports = model("User", userSchema);