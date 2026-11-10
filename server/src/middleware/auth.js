const jwt = require("jsonwebtoken");
const { ROLES } = require("../constants");

const ALGORITHM = "HS256";
const EXPIRES_IN = "8h";

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) throw new Error("JWT_SECRET must be set (16+ characters)");
  return s;
}

function signToken(user) {
  return jwt.sign({ role: user.role, name: user.name }, secret(), {
    algorithm: ALGORITHM,
    expiresIn: EXPIRES_IN,
    subject: String(user._id || user.id),
  });
}

// Sets req.user = { id, role, name }. Every failure is the same 401.
function auth(req, res, next) {
  const [scheme, token] = (req.headers.authorization || "").split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Login required" });
  }
  let payload;
  try {
    payload = jwt.verify(token, secret(), { algorithms: [ALGORITHM] });
  } catch (err) {
    if (err.message.startsWith("JWT_SECRET")) throw err; // misconfiguration is a 500, not a 401
    return res.status(401).json({ error: "Login required" });
  }
  if (!ROLES.includes(payload.role) || !payload.sub) {
    return res.status(401).json({ error: "Login required" });
  }
  req.user = { id: payload.sub, role: payload.role, name: payload.name };
  next();
}

// Use after auth, e.g. router.patch("/:id/review", requireRole("lead"), ...)
const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user && req.user.role)
    ? next()
    : res.status(403).json({ error: "Not allowed" });

module.exports = { auth, requireRole, signToken };