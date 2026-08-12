import User from "../models/User.js";


// ==========================================
// REQUIRE ACTIVE ACCESS
// ==========================================

export async function requireActiveAccess(
  req,
  res,
  next
) {
  try {
    // ========================================
    // AUTHENTICATION CHECK
    // ========================================

    if (!req.user?.uid) {
      return res.status(401).json({
        success: false,
        message: "Authentication required."
      });
    }

    // ========================================
    // FIND USER
    // ========================================

    const user = await User.findOne({
      firebaseUid: req.user.uid
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User account not found."
      });
    }

    // ========================================
    // BAN CHECK
    // ========================================

    if (user.banned) {
      return res.status(403).json({
        success: false,
        message: "Your account is banned."
      });
    }

    // ========================================
    // VIP ACCESS
    // ========================================

    if (user.vip?.active === true) {

      // Lifetime VIP never expires
      if (
        user.vip.plan ===
        "LIFETIME"
      ) {
        req.currentUser = user;

        return next();
      }

      // Check timed VIP expiry
      if (
        user.vip.expiresAt &&
        user.vip.expiresAt > new Date()
      ) {
        req.currentUser = user;

        return next();
      }

      // VIP has expired
      user.vip.active = false;
      user.vip.plan = "NONE";
      user.vip.expiresAt = null;

      await user.save();
    }

    // ========================================
    // TRIAL ACCESS
    // ========================================

    if (user.trial?.active === true) {

      if (
        user.trial.expiresAt &&
        user.trial.expiresAt > new Date()
      ) {
        req.currentUser = user;

        return next();
      }

      // Trial has expired
      user.trial.active = false;

      await user.save();
    }

    // ========================================
    // NO ACTIVE ACCESS
    // ========================================

    return res.status(403).json({
      success: false,
      message:
        "Your trial has expired. Please upgrade to VIP to continue."
    });

  } catch (error) {

    console.error(
      "Access middleware error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to verify account access."
    });
  }
}


// ==========================================
// REQUIRE VIP
// ==========================================

export async function requireVip(
  req,
  res,
  next
) {
  try {

    if (!req.user?.uid) {
      return res.status(401).json({
        success: false,
        message:
          "Authentication required."
      });
    }

    const user = await User.findOne({
      firebaseUid: req.user.uid
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message:
          "User account not found."
      });
    }

    if (user.banned) {
      return res.status(403).json({
        success: false,
        message:
          "Your account is banned."
      });
    }

    // ========================================
    // CHECK VIP
    // ========================================

    if (
      user.vip?.active !== true
    ) {
      return res.status(403).json({
        success: false,
        message:
          "VIP access is required."
      });
    }

    // ========================================
    // LIFETIME VIP
    // ========================================

    if (
      user.vip.plan ===
      "LIFETIME"
    ) {
      req.currentUser = user;

      return next();
    }

    // ========================================
    // CHECK VIP EXPIRY
    // ========================================

    if (
      !user.vip.expiresAt ||
      user.vip.expiresAt <=
        new Date()
    ) {

      user.vip.active = false;
      user.vip.plan = "NONE";
      user.vip.expiresAt = null;

      await user.save();

      return res.status(403).json({
        success: false,
        message:
          "Your VIP access has expired."
      });
    }

    req.currentUser = user;

    return next();

  } catch (error) {

    console.error(
      "VIP middleware error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to verify VIP access."
    });
  }
}