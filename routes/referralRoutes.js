import express from "express";

import Referral from "../models/Referral.js";
import User from "../models/User.js";

import {
  requireAuth
} from "../middleware/authMiddleware.js";

import {
  notifyReferralReward
} from "../utils/notificationHelper.js";

const router = express.Router();


// ==========================================
// QUALIFY REFERRAL
// ==========================================

router.patch(
  "/:id/qualify",
  requireAuth,
  async (req, res) => {
    try {
      // ========================================
      // FIND REFERRAL
      // ========================================

      const referral =
        await Referral.findById(
          req.params.id
        );

      if (!referral) {
        return res.status(404).json({
          success: false,
          message: "Referral not found."
        });
      }

      // ========================================
      // ONLY REFERRED USER CAN QUALIFY
      // ========================================

      if (
        referral.referredUserId !==
        req.user.uid
      ) {
        return res.status(403).json({
          success: false,
          message: "Not authorized."
        });
      }

      // ========================================
      // PREVENT DOUBLE QUALIFICATION
      // ========================================

      if (
        referral.status === "QUALIFIED"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "This referral has already been qualified."
        });
      }

      // ========================================
      // REJECTED REFERRAL
      // ========================================

      if (
        referral.status === "REJECTED"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "This referral has been rejected."
        });
      }

      // ========================================
      // FIND REFERRED USER
      // ========================================

      const user =
        await User.findOne({
          firebaseUid:
            referral.referredUserId
        });

      if (!user) {
        referral.status = "REJECTED";

        await referral.save();

        return res.status(404).json({
          success: false,
          message:
            "User account not found."
        });
      }

      // ========================================
      // BANNED USER CHECK
      // ========================================

      if (user.banned) {
        return res.status(403).json({
          success: false,
          message:
            "Your account is banned."
        });
      }

      // ========================================
      // VERIFY WHATSAPP CONNECTION
      // ========================================

      if (!user.whatsappNumber) {
        return res.status(400).json({
          success: false,
          message:
            "Connect your WhatsApp number before qualifying this referral."
        });
      }

      // ========================================
      // VERIFY TRIAL HAS BEEN USED
      // ========================================

      const trialUsed = user.trialUsed === true;
      if (!trialUsed) {
        return res.status(400).json({
          success: false,
          message:
            "Use your trial before qualifying this referral."
        });
      }

      // ========================================
      // SELF REFERRAL PROTECTION
      // ========================================

      if (
        referral.referredUserId ===
        referral.referrerId
      ) {
        referral.status =
          "REJECTED";

        await referral.save();

        return res.status(400).json({
          success: false,
          message:
            "Invalid self-referral detected."
        });
      }

      // ========================================
      // FIND REFERRER
      // ========================================

      const referrer =
        await User.findOne({
          firebaseUid:
            referral.referrerId
        });

      if (!referrer) {
        referral.status =
          "REJECTED";

        await referral.save();

        return res.status(400).json({
          success: false,
          message:
            "The referring account no longer exists."
        });
      }

      // ========================================
      // REFERRER BANNED CHECK
      // ========================================

      if (referrer.banned) {
        referral.status =
          "REJECTED";

        await referral.save();

        return res.status(400).json({
          success: false,
          message:
            "The referring account is not eligible."
        });
      }

      // ========================================
      // ATOMICALLY QUALIFY REFERRAL
      // ========================================

      const qualifiedReferral =
        await Referral.findOneAndUpdate(
          {
            _id:
              referral._id,

            status:
              "PENDING"
          },
          {
            $set: {
              status:
                "QUALIFIED",

              accountCreated:
                true,

              whatsappConnected:
                true,

              trialUsed:
                true
            }
          },
          {
            new: true
          }
        );

      if (!qualifiedReferral) {
        return res.status(400).json({
          success: false,
          message:
            "This referral has already been processed."
        });
      }

      // ========================================
      // ATOMICALLY INCREASE QUALIFIED COUNT
      // ========================================

      const updatedReferrer =
        await User.findOneAndUpdate(
          {
            firebaseUid:
              referral.referrerId
          },
          {
            $inc: {
              "referral.qualifiedCount":
                1
            }
          },
          {
            new: true
          }
        );

      if (!updatedReferrer) {
        await Referral.findByIdAndUpdate(
          referral._id,
          {
            $set: {
              status:
                "REJECTED"
            }
          }
        );

        return res.status(400).json({
          success: false,
          message:
            "Unable to update referring account."
        });
      }

      const qualifiedCount =
        updatedReferrer.referral
          .qualifiedCount;

      let rewardType =
        "NONE";

      // ========================================
      // 10 REFERRALS → LIFETIME
      // ========================================

      if (
        qualifiedCount >= 10 &&
        !updatedReferrer.referral
          .rewards
          .lifetimeClaimed
      ) {
        updatedReferrer.vip.active =
          true;

        updatedReferrer.vip.plan =
          "LIFETIME";

        updatedReferrer.vip.activatedAt =
          new Date();

        updatedReferrer.vip.expiresAt =
          null;

        updatedReferrer.referral
          .rewards
          .lifetimeClaimed =
          true;

        rewardType =
          "LIFETIME";
      }

      // ========================================
      // 3 REFERRALS → 1 MONTH
      // ========================================

      else if (
        qualifiedCount >= 3 &&
        !updatedReferrer.referral
          .rewards
          .oneMonthClaimed &&
        updatedReferrer.vip.plan !==
          "LIFETIME"
      ) {
        updatedReferrer.vip.active =
          true;

        updatedReferrer.vip.plan =
          "1_MONTH";

        updatedReferrer.vip.activatedAt =
          new Date();

        updatedReferrer.vip.expiresAt =
          new Date(
            Date.now() +
              30 *
                24 *
                60 *
                60 *
                1000
          );

        updatedReferrer.referral
          .rewards
          .oneMonthClaimed =
          true;

        rewardType =
          "1_MONTH";
      }

      // ========================================
      // SAVE REFERRER + REWARD
      // ========================================

      if (rewardType !== "NONE") {
        qualifiedReferral.rewardGiven =
          true;

        qualifiedReferral.rewardType =
          rewardType;

        await updatedReferrer.save();

        await qualifiedReferral.save();

        // ======================================
        // SEND NOTIFICATION AFTER SAVE
        // ======================================

        try {
          await notifyReferralReward({
            userId:
              updatedReferrer.firebaseUid,

            rewardType,

            qualifiedCount
          });
        } catch (notificationError) {
          console.error(
            "Referral reward notification error:",
            notificationError
          );
        }
      }

      return res.json({
        success: true,

        message:
          "Referral qualified successfully.",

        qualifiedCount,

        rewardType
      });

    } catch (error) {
      console.error(
        "Referral qualification error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to qualify referral."
      });
    }
  }
);


// ==========================================
// GET MY REFERRALS
// ==========================================

router.get(
  "/my",
  requireAuth,
  async (req, res) => {
    try {
      const referrals =
        await Referral.find({
          referrerId:
            req.user.uid
        }).sort({
          createdAt: -1
        });

      const user =
        await User.findOne({
          firebaseUid:
            req.user.uid
        });

      return res.json({
        success: true,

        qualifiedCount:
          user?.referral
            ?.qualifiedCount || 0,

        referrals
      });

    } catch (error) {
      console.error(
        "Get referrals error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to load referrals."
      });
    }
  }
);


export default router;