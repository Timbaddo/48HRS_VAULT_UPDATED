// middleware/authMiddleware.js
import { adminAuth } from "../config/firebase-admin.js";

export async function verifyFirebaseToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized: No token provided." });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    return res.status(401).json({ 
      message: "Unauthorized: Invalid or expired token.", 
      error: error.message 
    });
  }
}

// Export requireAuth so authRoutes.js can import it directly
export const requireAuth = verifyFirebaseToken;
