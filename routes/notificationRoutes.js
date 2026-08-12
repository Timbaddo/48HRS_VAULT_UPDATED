import express from "express";

import Notification from "../models/Notification.js";
import User from "../models/User.js";

import {
  requireAuth
} from "../middleware/authMiddleware.js";

const router = express.Router();


// ==========================================
// GET MY NOTIFICATIONS
// ==========================================

router.get(
  "/my",
  requireAuth,
  async (req, res) => {
    try {
      const notifications =
        await Notification.find({
          userId: req.user.uid
        })
        .sort({
          createdAt: -1
        });

      const unreadCount =
        await Notification.countDocuments({
          userId: req.user.uid,
          read: false
        });

      return res.json({
        success: true,
        unreadCount,
        notifications
      });

    } catch (error) {
      console.error(
        "Get notifications error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to load notifications."
      });
    }
  }
);


// ==========================================
// GET UNREAD COUNT
// ==========================================

router.get(
  "/unread-count",
  requireAuth,
  async (req, res) => {
    try {
      const unreadCount =
        await Notification.countDocuments({
          userId: req.user.uid,
          read: false
        });

      return res.json({
        success: true,
        unreadCount
      });

    } catch (error) {
      console.error(
        "Unread count error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to get unread notification count."
      });
    }
  }
);


// ==========================================
// MARK ONE NOTIFICATION AS READ
// ==========================================

router.patch(
  "/:id/read",
  requireAuth,
  async (req, res) => {
    try {
      const notification =
        await Notification.findOne({
          _id: req.params.id,
          userId: req.user.uid
        });

      if (!notification) {
        return res.status(404).json({
          success: false,
          message:
            "Notification not found."
        });
      }

      notification.read = true;
      notification.readAt = new Date();

      await notification.save();

      return res.json({
        success: true,
        message:
          "Notification marked as read."
      });

    } catch (error) {
      console.error(
        "Mark notification read error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to update notification."
      });
    }
  }
);


// ==========================================
// MARK ALL NOTIFICATIONS AS READ
// ==========================================

router.patch(
  "/read-all",
  requireAuth,
  async (req, res) => {
    try {
      await Notification.updateMany(
        {
          userId: req.user.uid,
          read: false
        },
        {
          $set: {
            read: true,
            readAt: new Date()
          }
        }
      );

      return res.json({
        success: true,
        message:
          "All notifications marked as read."
      });

    } catch (error) {
      console.error(
        "Mark all notifications read error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to update notifications."
      });
    }
  }
);


// ==========================================
// DELETE ONE NOTIFICATION
// ==========================================

router.delete(
  "/:id",
  requireAuth,
  async (req, res) => {
    try {
      const notification =
        await Notification.findOneAndDelete({
          _id: req.params.id,
          userId: req.user.uid
        });

      if (!notification) {
        return res.status(404).json({
          success: false,
          message:
            "Notification not found."
        });
      }

      return res.json({
        success: true,
        message:
          "Notification deleted."
      });

    } catch (error) {
      console.error(
        "Delete notification error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to delete notification."
      });
    }
  }
);


// ==========================================
// DELETE ALL MY NOTIFICATIONS
// ==========================================

router.delete(
  "/",
  requireAuth,
  async (req, res) => {
    try {
      await Notification.deleteMany({
        userId: req.user.uid
      });

      return res.json({
        success: true,
        message:
          "All notifications deleted."
      });

    } catch (error) {
      console.error(
        "Delete all notifications error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to delete notifications."
      });
    }
  }
);


// ==========================================
// OWNER: SEND NOTIFICATION
// ==========================================

router.post(
  "/send",
  requireAuth,
  async (req, res) => {
    try {
      const owner = await User.findOne({
        firebaseUid: req.user.uid
      });

      if (!owner) {
        return res.status(404).json({
          success: false,
          message:
            "User account not found."
        });
      }

      if (owner.role !== "ADMIN") {
        return res.status(403).json({
          success: false,
          message:
            "Owner access required."
        });
      }

      const {
        userId,
        type,
        title,
        message,
        link
      } = req.body;

      if (
        !userId ||
        !type ||
        !title ||
        !message
      ) {
        return res.status(400).json({
          success: false,
          message:
            "userId, type, title and message are required."
        });
      }

      const notification =
        await Notification.create({
          userId,
          type,
          title,
          message,
          link: link || null,
          read: false,
          readAt: null,
          createdBy: req.user.uid
        });

      return res.status(201).json({
        success: true,
        message:
          "Notification sent successfully.",
        notification
      });

    } catch (error) {
      console.error(
        "Send notification error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to send notification."
      });
    }
  }
);


export default router;