import { adminAuth } from "../config/firebase-admin.js"; 
import User from "../models/User.js";

// Verify Firebase Token Middleware
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

export const requireAuth = verifyFirebaseToken;

// Admin Verification Middleware (MISSING EXPORT ADDED HERE)
export async function requireAdmin(req, res, next) {
  try {
    const user = await User.findOne({ firebaseUid: req.user.uid });
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Access denied. Admin privileges required." });
    }
    req.userData = user;
    next();
  } catch (error) {
    res.status(500).json({ message: "Admin authorization failed.", error: error.message });
  }
}
 