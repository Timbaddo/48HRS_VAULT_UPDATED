import User from "../models/User.js";

export async function requireActiveAccess(req, res, next) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const now = new Date();
    const hasActiveTrial = user.trialExpiresAt && user.trialExpiresAt > now;
    const hasActiveSubscription = user.accessExpiresAt && user.accessExpiresAt > now;

    if (!hasActiveTrial && !hasActiveSubscription) {
      return res.status(403).json({
        message: "Access expired. Please renew your subscription or upgrade."
      });
    }

    req.userData = user;
    next();
  } catch (error) {
    res.status(500).json({ message: "Access check failed", error: error.message });
  }
}

export async function requireVip(req, res, next) {
  try {
    const user = await User.findById(req.user.id);
    if (!user || user.role !== "vip") {
      return res.status(403).json({ message: "VIP membership required." });
    }
    req.userData = user;
    next();
  } catch (error) {
    res.status(500).json({ message: "VIP check failed", error: error.message });
  }
}
