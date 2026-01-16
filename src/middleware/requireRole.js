// requireRole.js
export function requireRole(...roles) {
  return (req, res, next) => {
    const role = req.user?.role;
    if (!role) return res.status(401).json({ error: "Unauthorized" });
    if (!roles.includes(role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}
