import { adminAuth } from "../config/firebase-admin.js";

export const requireAuth = async (req, res, next) => {
  try {
    const authorization = req.headers.authorization;
    if (!authorization || !authorization.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Authentication required." });
    }
    const idToken = authorization.slice(7);
    if (!idToken) return res.status(401).json({ success: false, message: "Invalid authentication token." });
    req.user = await adminAuth.verifyIdToken(idToken);
    next();
  } catch (error) {
    console.error("Authentication error:", error.message);
    return res.status(401).json({ success: false, message: "Invalid or expired authentication token." });
  }
};

export const requireAdmin = async (req, res, next) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: "Authentication required." });
    const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map(v => v.trim().toLowerCase()).filter(Boolean);
    const email = (req.user.email || "").toLowerCase();
    if (!email || !adminEmails.includes(email)) {
      return res.status(403).json({ success: false, message: "Admin access required." });
    }
    req.isAdmin = true;
    next();
  } catch (error) {
    console.error("Admin authorization error:", error.message);
    return res.status(403).json({ success: false, message: "Admin authorization failed." });
  }
};

export const requireOwner = requireAdmin;
