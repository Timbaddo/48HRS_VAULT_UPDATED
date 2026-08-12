import express from "express";

import User from "../models/User.js";
import Referral from "../models/Referral.js";

import {
  requireAuth
} from "../middleware/authMiddleware.js";

const router = express.Router();


// ==========================================
// GET CURRENT USER
// ==========================================

router.get(
  "/me",
  requireAuth,
  async (req, res) => {
    try {
      const user = await User.findOne({
        firebaseUid: req.user.uid
      }).select("-__v");

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User account not found."
        });
      }

      const ownerEmails = (process.env.ADMIN_EMAILS || "")
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean);
      const isAdmin = ownerEmails.includes((user.email || "").toLowerCase());

      return res.json({
        success: true,
        user: user.toObject(),
        isAdmin
      });

    } catch (error) {
      console.error(
        "Get current user error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to load your account."
      });
    }
  }
);


// ==========================================
// REGISTER / SYNC USER
// ==========================================

router.post(
  "/register",
  requireAuth,
  async (req, res) => {
    try {
      const {
        name,
        email,
        whatsappNumber,
        country,
        referralCode,
        ipAddress,
        deviceFingerprint
      } = req.body;

      const firebaseUid =
        req.user.uid;

      const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map(v => v.trim().toLowerCase()).filter(Boolean);

      if (!name || !email) {
        return res.status(400).json({
          success: false,
          message:
            "Name and email are required."
        });
      }

      // ========================================
      // CHECK EXISTING USER
      // ========================================

      let user = await User.findOne({ firebaseUid });

      if (!user && whatsappNumber) {
        const normalizedWhatsApp = String(whatsappNumber).replace(/[^0-9]/g, "");
        user = await User.findOne({ whatsappNumber: normalizedWhatsApp });
        if (user && !user.firebaseUid) user.firebaseUid = firebaseUid;
      }

      if (user) {
        user.name = name;
        user.email = email;
        if (adminEmails.includes(email.toLowerCase())) user.role = "ADMIN";

        if (
          whatsappNumber !== undefined
        ) {
          user.whatsappNumber = whatsappNumber ? String(whatsappNumber).replace(/[^0-9]/g, "") : null;
        }

        if (
          country !== undefined
        ) {
          user.country =
            country || null;
        }

        user.lastLogin =
          new Date();

        await user.save();

        return res.json({
          success: true,
          message:
            "Account synced successfully.",
          user
        });
      }

      // ========================================
      // LINK EXISTING WHATSAPP-ONLY USER
      // ========================================

      if (whatsappNumber) {
        const normalizedWhatsApp = String(whatsappNumber).replace(/[^0-9]/g, '');
        const botUser = await User.findOne({
          $or: [
            { phoneNumber: normalizedWhatsApp },
            { whatsappNumber: normalizedWhatsApp }
          ],
          firebaseUid: null
        });

        if (botUser) {
          botUser.firebaseUid = firebaseUid;
          botUser.name = name;
          botUser.email = email;
          botUser.role = adminEmails.includes(email.toLowerCase()) ? "ADMIN" : (botUser.role === "ADMIN" ? "ADMIN" : "USER");
          botUser.whatsappNumber = normalizedWhatsApp;
          botUser.phoneNumber = normalizedWhatsApp;
          botUser.lastLogin = new Date();

          if (!botUser.referral?.code) {
            let linkedCode;
            do {
              linkedCode = `48HRS-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
            } while (await User.exists({ 'referral.code': linkedCode }));
            botUser.referral.code = linkedCode;
            botUser.refCode = botUser.refCode || linkedCode;
          }

          await botUser.save();

          return res.json({
            success: true,
            message: "Existing WhatsApp account linked successfully.",
            user: botUser
          });
        }
      }

      // ========================================
      // GENERATE UNIQUE REFERRAL CODE
      // ========================================

      let generatedCode;
      let codeExists = true;

      while (codeExists) {
        generatedCode =
          `48HRS-${Math.random()
            .toString(36)
            .substring(2, 8)
            .toUpperCase()}`;

        codeExists =
          await User.exists({
            "referral.code":
              generatedCode
          });
      }

      // ========================================
      // FIND REFERRER
      // ========================================

      let referrer = null;
      let referredBy = null;
      let normalizedReferralCode = null;

      if (referralCode) {
        normalizedReferralCode =
          referralCode
            .trim()
            .toUpperCase();

        referrer =
          await User.findOne({
            "referral.code":
              normalizedReferralCode
          });

        // ======================================
        // SELF-REFERRAL PROTECTION
        // ======================================

        if (
          referrer &&
          referrer.firebaseUid ===
            firebaseUid
        ) {
          return res.status(400).json({
            success: false,
            message:
              "You cannot use your own referral code."
          });
        }

        if (referrer) {
          referredBy =
            referrer.firebaseUid;
        }
      }

      // ========================================
      // CREATE USER
      // ========================================

      user = await User.create({
        firebaseUid,

        name,

        email,

        role: ownerEmails.includes(email.toLowerCase()) ? "ADMIN" : "USER",

        whatsappNumber: whatsappNumber ? String(whatsappNumber).replace(/[^0-9]/g, "") : null,

        country:
          country || null,

        trial: {
          active: true,

          startedAt:
            new Date(),

          expiresAt:
            new Date(
              Date.now() +
                24 *
                  60 *
                  60 *
                  1000
            )
        },

        vip: {
          active: false,
          plan: "NONE",
          activatedAt: null,
          expiresAt: null
        },

        referral: {
          code:
            generatedCode,

          referredBy,

          qualifiedCount: 0,

          rewards: {
            oneMonthClaimed:
              false,

            lifetimeClaimed:
              false
          }
        },

        banned: false,

        lastLogin:
          new Date(),

        sentTrialReminder:
          false,

        sentTrialExpired:
          false
      });

      // ========================================
      // CREATE REFERRAL RECORD
      // ========================================

      if (
        referrer &&
        normalizedReferralCode
      ) {
        try {
          await Referral.create({
            referrerId:
              referrer.firebaseUid,

            referredUserId:
              user.firebaseUid,

            referralCode:
              normalizedReferralCode,

            status:
              "PENDING",

            ipAddress:
              ipAddress || null,

            deviceFingerprint:
              deviceFingerprint ||
              null,

            accountCreated:
              true,

            whatsappConnected:
              false,

            trialUsed:
              false,

            rewardGiven:
              false,

            rewardType:
              "NONE"
          });

        } catch (referralError) {

          /*
          ======================================
          REFERRAL CREATION FAILED

          The user was already created, so
          don't delete the account here.
          Log the error for investigation.
          ======================================
          */

          console.error(
            "Referral record creation error:",
            referralError
          );
        }
      }

      return res.status(201).json({
        success: true,
        message:
          "Account created successfully.",
        user
      });

    } catch (error) {
      console.error(
        "Register user error:",
        error
      );

      if (
        error.code === 11000
      ) {
        return res.status(409).json({
          success: false,
          message:
            "An account with these details already exists."
        });
      }

      return res.status(500).json({
        success: false,
        message:
          "Unable to create account."
      });
    }
  }
);


// ==========================================
// UPDATE LAST LOGIN
// ==========================================

router.patch(
  "/login",
  requireAuth,
  async (req, res) => {
    try {
      const user =
        await User.findOneAndUpdate(
          {
            firebaseUid:
              req.user.uid
          },
          {
            $set: {
              lastLogin:
                new Date()
            }
          },
          {
            new: true
          }
        ).select("-__v");

      if (!user) {
        return res.status(404).json({
          success: false,
          message:
            "User account not found."
        });
      }

      return res.json({
        success: true,
        message:
          "Login recorded.",
        user
      });

    } catch (error) {
      console.error(
        "Login update error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to update login information."
      });
    }
  }
);


// ==========================================
// OFFICIAL PLATFORMS POPUP
// ==========================================

router.patch(
  "/official-popup-seen",
  requireAuth,
  async (req, res) => {
    try {
      const user = await User.findOneAndUpdate(
        { firebaseUid: req.user.uid },
        { $set: { officialPlatformsPopupAt: new Date() } },
        { new: true, runValidators: true }
      ).select("-__v");

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User account not found."
        });
      }

      return res.json({
        success: true,
        message: "Popup timestamp updated.",
        officialPlatformsPopupAt: user.officialPlatformsPopupAt
      });
    } catch (error) {
      console.error("Official platforms popup error:", error);
      return res.status(500).json({
        success: false,
        message: "Unable to update popup status."
      });
    }
  }
);


// ==========================================
// UPDATE PROFILE
// ==========================================

router.patch(
  "/profile",
  requireAuth,
  async (req, res) => {
    try {
      const {
        name,
        whatsappNumber,
        country
      } = req.body;

      const updates = {};

      if (name !== undefined) {
        updates.name = name;
      }

      if (
        whatsappNumber !== undefined
      ) {
        updates.whatsappNumber =
          whatsappNumber || null;
      }

      if (
        country !== undefined
      ) {
        updates.country =
          country || null;
      }

      const user =
        await User.findOneAndUpdate(
          {
            firebaseUid:
              req.user.uid
          },
          {
            $set: updates
          },
          {
            new: true,
            runValidators: true
          }
        ).select("-__v");

      if (!user) {
        return res.status(404).json({
          success: false,
          message:
            "User account not found."
        });
      }

      return res.json({
        success: true,
        message:
          "Profile updated successfully.",
        user
      });

    } catch (error) {
      console.error(
        "Update profile error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to update profile."
      });
    }
  }
);


export default router;