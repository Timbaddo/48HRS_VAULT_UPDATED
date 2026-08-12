import express from "express";

import Coupon from "../models/Coupon.js";
import User from "../models/User.js";

import {
  requireAuth,
  requireAdmin
} from "../middleware/authMiddleware.js";

import {
  notifyCouponRedeemed
} from "../utils/notificationHelper.js";

const router = express.Router();


// ==========================================
// USER — REDEEM COUPON
// ==========================================

router.post(
  "/redeem",
  requireAuth,
  async (req, res) => {
    try {
      const code = (
        req.body.code || ""
      )
        .trim()
        .toUpperCase();

      if (!code) {
        return res.status(400).json({
          success: false,
          message:
            "Please enter a coupon code."
        });
      }

      // ========================================
      // FIND LOGGED-IN USER
      // ========================================

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
      // FIND COUPON
      // ========================================

      const coupon =
        await Coupon.findOne({
          code
        });

      if (!coupon) {
        return res.status(404).json({
          success: false,
          message:
            "Invalid coupon code."
        });
      }

      // ========================================
      // CHECK ACTIVE
      // ========================================

      if (!coupon.active) {
        return res.status(400).json({
          success: false,
          message:
            "This coupon is no longer active."
        });
      }

      // ========================================
      // CHECK EXPIRY
      // ========================================

      const now = new Date();

      if (
        coupon.expiresAt &&
        coupon.expiresAt <= now
      ) {
        return res.status(400).json({
          success: false,
          message:
            "This coupon has expired."
        });
      }

      // ========================================
      // CHECK MAXIMUM USES
      // ========================================

      if (
        coupon.maxUses > 0 &&
        coupon.usedCount >=
          coupon.maxUses
      ) {
        return res.status(400).json({
          success: false,
          message:
            "This coupon has reached its usage limit."
        });
      }

      // ========================================
      // PREVENT DUPLICATE REDEMPTION
      // ========================================

      const alreadyRedeemed =
        coupon.redeemedBy.some(
          (entry) =>
            entry.userId ===
            req.user.uid
        );

      if (alreadyRedeemed) {
        return res.status(400).json({
          success: false,
          message:
            "You have already redeemed this coupon."
        });
      }

      // ========================================
      // VIP PLAN PRIORITY
      // ========================================

      const planRank = {
        NONE: 0,
        "7_DAYS": 1,
        "1_MONTH": 2,
        LIFETIME: 3
      };

      const currentPlan =
        user.vip.plan || "NONE";

      const rewardPlan =
        coupon.reward;

      const currentRank =
        planRank[currentPlan] || 0;

      const rewardRank =
        planRank[rewardPlan] || 0;

      /*
      ========================================
      DO NOT DOWNGRADE EXISTING VIP
      ========================================
      */

      if (
        currentPlan ===
        "LIFETIME"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "You already have Lifetime VIP."
        });
      }

      /*
      ========================================
      ACTIVATE / EXTEND REWARD
      ========================================
      */

      user.vip.active = true;

      user.vip.activatedAt = now;

      if (
        rewardPlan ===
        "LIFETIME"
      ) {
        user.vip.plan =
          "LIFETIME";

        user.vip.expiresAt =
          null;
      }

      else if (
        rewardPlan ===
        "1_MONTH"
      ) {
        user.vip.plan =
          "1_MONTH";

        const currentExpiry =
          user.vip.expiresAt &&
          user.vip.expiresAt > now
            ? user.vip.expiresAt
            : now;

        user.vip.expiresAt =
          new Date(
            currentExpiry.getTime() +
            30 *
              24 *
              60 *
              60 *
              1000
          );
      }

      else if (
        rewardPlan ===
        "7_DAYS"
      ) {

        /*
        ======================================
        DON'T DOWNGRADE A LONGER VIP PLAN
        ======================================
        */

        if (
          currentRank >=
          rewardRank
        ) {
          // Keep the existing plan.
        } else {
          user.vip.plan =
            "7_DAYS";

          const currentExpiry =
            user.vip.expiresAt &&
            user.vip.expiresAt > now
              ? user.vip.expiresAt
              : now;

          user.vip.expiresAt =
            new Date(
              currentExpiry.getTime() +
              7 *
                24 *
                60 *
                60 *
                1000
            );
        }
      }

      // ========================================
      // COUPON ENDS FREE TRIAL
      // ========================================

      user.trial.active =
        false;

      await user.save();

      // ========================================
      // RECORD REDEMPTION
      // ========================================

      coupon.usedCount += 1;

      coupon.redeemedBy.push({
        userId:
          req.user.uid,

        whatsappNumber:
          user.whatsappNumber ||
          null,

        redeemedAt: now
      });

      await coupon.save();

      // ========================================
      // NOTIFICATION
      // ========================================

      try {
        await notifyCouponRedeemed({
          userId:
            user.firebaseUid,

          rewardType:
            coupon.reward
        });
      } catch (notificationError) {
        console.error(
          "Coupon notification error:",
          notificationError
        );
      }

      // ========================================
      // RESPONSE
      // ========================================

      let message =
        "🎉 VIP reward activated!";

      if (
        coupon.reward ===
        "LIFETIME"
      ) {
        message =
          "🎉 Lifetime VIP activated!";
      }

      else if (
        coupon.reward ===
        "1_MONTH"
      ) {
        message =
          "🎉 1-month VIP activated!";
      }

      else if (
        coupon.reward ===
        "7_DAYS"
      ) {
        message =
          "🎉 7-day VIP activated!";
      }

      return res.json({
        success: true,
        message,
        reward:
          coupon.reward,
        plan:
          user.vip.plan,
        expiresAt:
          user.vip.expiresAt
      });

    } catch (error) {

      console.error(
        "Coupon redemption error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to redeem coupon."
      });
    }
  }
);


// ==========================================
// OWNER — CREATE COUPON
// ==========================================

router.post(
  "/create",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {

      let {
        code,
        reward,
        maxUses,
        expiresAt
      } = req.body;

      code = (code || "")
        .trim()
        .toUpperCase();

      if (!code) {
        return res.status(400).json({
          success: false,
          message:
            "Coupon code is required."
        });
      }

      // ========================================
      // VALID REWARDS
      // ========================================

      const allowedRewards = [
        "7_DAYS",
        "1_MONTH",
        "LIFETIME"
      ];

      if (
        !allowedRewards.includes(
          reward
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid coupon reward."
        });
      }

      // ========================================
      // CHECK DUPLICATE CODE
      // ========================================

      const existingCoupon =
        await Coupon.findOne({
          code
        });

      if (existingCoupon) {
        return res.status(409).json({
          success: false,
          message:
            "A coupon with this code already exists."
        });
      }

      // ========================================
      // PARSE MAX USES
      // ========================================

      const parsedMaxUses =
        Number.isFinite(
          Number(maxUses)
        )
          ? Number(maxUses)
          : 1;

      if (
        parsedMaxUses < 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Maximum uses cannot be negative."
        });
      }

      // ========================================
      // PARSE EXPIRY
      // ========================================

      let parsedExpiry = null;

      if (expiresAt) {

        parsedExpiry =
          new Date(expiresAt);

        if (
          Number.isNaN(
            parsedExpiry.getTime()
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid expiry date."
          });
        }

        if (
          parsedExpiry <=
          new Date()
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Expiry date must be in the future."
          });
        }
      }

      // ========================================
      // CREATE COUPON
      // ========================================

      const coupon =
        await Coupon.create({
          code,

          reward,

          maxUses:
            parsedMaxUses,

          usedCount: 0,

          redeemedBy: [],

          expiresAt:
            parsedExpiry,

          active: true,

          createdBy:
            req.user.email
        });

      return res.status(201).json({
        success: true,
        message:
          "Coupon created successfully.",
        coupon
      });

    } catch (error) {

      console.error(
        "Create coupon error:",
        error
      );

      // MongoDB duplicate-key protection
      if (
        error.code === 11000
      ) {
        return res.status(409).json({
          success: false,
          message:
            "A coupon with this code already exists."
        });
      }

      return res.status(500).json({
        success: false,
        message:
          "Unable to create coupon."
      });
    }
  }
);


// ==========================================
// OWNER — GET ALL COUPONS
// ==========================================

router.get(
  "/all",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {

      const coupons =
        await Coupon.find()
          .sort({
            createdAt: -1
          });

      return res.json({
        success: true,
        count:
          coupons.length,
        coupons
      });

    } catch (error) {

      console.error(
        "Get coupons error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to load coupons."
      });
    }
  }
);


// ==========================================
// OWNER — ENABLE / DISABLE COUPON
// ==========================================

router.patch(
  "/:id/toggle",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {

      const coupon =
        await Coupon.findById(
          req.params.id
        );

      if (!coupon) {
        return res.status(404).json({
          success: false,
          message:
            "Coupon not found."
        });
      }

      coupon.active =
        !coupon.active;

      await coupon.save();

      return res.json({
        success: true,

        message:
          coupon.active
            ? "Coupon enabled."
            : "Coupon disabled.",

        active:
          coupon.active
      });

    } catch (error) {

      console.error(
        "Toggle coupon error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to update coupon."
      });
    }
  }
);


// ==========================================
// OWNER — DELETE COUPON
// ==========================================

router.delete(
  "/:id",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {

      const coupon =
        await Coupon.findById(
          req.params.id
        );

      if (!coupon) {
        return res.status(404).json({
          success: false,
          message:
            "Coupon not found."
        });
      }

      await Coupon.findByIdAndDelete(
        req.params.id
      );

      return res.json({
        success: true,
        message:
          "Coupon deleted successfully."
      });

    } catch (error) {

      console.error(
        "Delete coupon error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to delete coupon."
      });
    }
  }
);


export default router;