import express from "express";

import User from "../models/User.js";
import Referral from "../models/Referral.js";

import {
  requireAuth
} from "../middleware/authMiddleware.js";

const router = express.Router();


// ==========================================
// ADMIN EMAILS
// ==========================================

const adminEmails = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);


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

      const isAdmin = adminEmails.includes(
        (user.email || "").toLowerCase()
      );

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
        message: "Unable to load your account."
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

      const firebaseUid = req.user.uid;

      // --------------------------------------
      // NORMALIZE INPUTS
      // --------------------------------------

      const normalizedEmail = String(email || "")
        .trim()
        .toLowerCase();

      const normalizedWhatsApp =
        whatsappNumber
          ? String(whatsappNumber).replace(/[^0-9]/g, "")
          : null;

      if (!name || !normalizedEmail) {
        return res.status(400).json({
          success: false,
          message: "Name and email are required."
        });
      }

      const isAdmin = adminEmails.includes(
        normalizedEmail
      );

      // ======================================
      // CHECK USER BY FIREBASE UID
      // ======================================

      let user = await User.findOne({
        firebaseUid
      });

      // ======================================
      // CHECK USER BY WHATSAPP NUMBER
      // ======================================

      if (!user && normalizedWhatsApp) {
        user = await User.findOne({
          $or: [
            {
              phoneNumber: normalizedWhatsApp
            },
            {
              whatsappNumber: normalizedWhatsApp
            }
          ]
        });

        if (user && !user.firebaseUid) {
          user.firebaseUid = firebaseUid;
        }
      }

      // ======================================
      // EXISTING USER
      // ======================================

      if (user) {
        user.name = name;
        user.email = normalizedEmail;

        if (isAdmin) {
          user.role = "ADMIN";
        }

        if (normalizedWhatsApp !== null) {
          user.whatsappNumber =
            normalizedWhatsApp;
        }

        if (country !== undefined) {
          user.country = country || null;
        }

        user.lastLogin = new Date();

        await user.save();

        return res.json({
          success: true,
          message: "Account synced successfully.",
          user
        });
      }

      // ======================================
      // LINK EXISTING WHATSAPP-ONLY USER
      // ======================================

      if (normalizedWhatsApp) {
        const botUser = await User.findOne({
          $or: [
            {
              phoneNumber: normalizedWhatsApp
            },
            {
              whatsappNumber: normalizedWhatsApp
            }
          ],
          $or: [
            {
              firebaseUid: null
            },
            {
              firebaseUid: {
                $exists: false
              }
            }
          ]
        });

        if (botUser) {
          botUser.firebaseUid = firebaseUid;
          botUser.name = name;
          botUser.email = normalizedEmail;

          botUser.role = isAdmin
            ? "ADMIN"
            : (
                botUser.role === "ADMIN"
                  ? "ADMIN"
                  : "USER"
              );

          botUser.whatsappNumber =
            normalizedWhatsApp;

          botUser.phoneNumber =
            normalizedWhatsApp;

          botUser.lastLogin = new Date();

          // ----------------------------------
          // MAKE SURE REFERRAL CODE EXISTS
          // ----------------------------------

          if (!botUser.referral?.code) {
            let linkedCode;

            do {
              linkedCode =
                `48HRS-${Math.random()
                  .toString(36)
                  .substring(2, 8)
                  .toUpperCase()}`;
            } while (
              await User.exists({
                "referral.code": linkedCode
              })
            );

            if (!botUser.referral) {
              botUser.referral = {};
            }

            botUser.referral.code =
              linkedCode;

            botUser.refCode =
              botUser.refCode ||
              linkedCode;
          }

          await botUser.save();

          return res.json({
            success: true,
            message:
              "Existing WhatsApp account linked successfully.",
            user: botUser
          });
        }
      }

      // ======================================
      // GENERATE UNIQUE REFERRAL CODE
      // ======================================

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
            "referral.code": generatedCode
          });
      }

      // ======================================
      // FIND REFERRER
      // ======================================

      let referrer = null;
      let referredBy = null;
      let normalizedReferralCode = null;

      if (referralCode) {
        normalizedReferralCode =
          String(referralCode)
            .trim()
            .toUpperCase();

        referrer =
          await User.findOne({
            "referral.code":
              normalizedReferralCode
          });

        // ------------------------------------
        // SELF REFERRAL PROTECTION
        // ------------------------------------

        if (
          referrer &&
          referrer.firebaseUid === firebaseUid
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

      // ======================================
      // CREATE NEW USER
      // ======================================

      user = await User.create({
        firebaseUid,

        name,

        email: normalizedEmail,

        role: isAdmin
          ? "ADMIN"
          : "USER",

        whatsappNumber:
          normalizedWhatsApp,

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

      // ======================================
      // CREATE REFERRAL RECORD
      // ======================================

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
              deviceFingerprint || null,

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
          console.error(
            "Referral record creation error:",
            referralError
          );
        }
      }

      // ======================================
      // SUCCESS
      // ======================================

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

      // --------------------------------------
      // DUPLICATE KEY
      // --------------------------------------

      if (error.code === 11000) {
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
      const user =
        await User.findOneAndUpdate(
          {
            firebaseUid:
              req.user.uid
          },
          {
            $set: {
              officialPlatformsPopupAt:
                new Date()
            }
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
          "Popup timestamp updated.",
        officialPlatformsPopupAt:
          user.officialPlatformsPopupAt
      });

    } catch (error) {
      console.error(
        "Official platforms popup error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to update popup status."
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
          whatsappNumber
            ? String(whatsappNumber)
                .replace(/[^0-9]/g, "")
            : null;
      }

      if (country !== undefined) {
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