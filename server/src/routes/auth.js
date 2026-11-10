const { Router } = require("express");
const bcrypt = require("bcryptjs");
const { z } = require("zod");
const User = require("../models/User");
const { signToken } = require("../middleware/auth");

const router = Router();

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(200),
});

// Compared against when the email is unknown, so the response time does not
// reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Email and password are required" });
  }
  const { email, password } = parsed.data;

  const user = await User.findOne({ email }).select("+passwordHash");
  const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !ok) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  res.json({
    token: signToken(user),
    user: { id: String(user._id), name: user.name, email: user.email, role: user.role },
  });
});

module.exports = router;