import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    // User receiving the notification
    userId: {
      type: String,
      required: true
    },

    // Notification type
    type: {
      type: String,
      enum: [
        "PAYMENT_RECEIVED",
        "PAYMENT_PENDING",
        "PAYMENT_APPROVED",
        "PAYMENT_REJECTED",
        "VIP_ACTIVATED",
        "TRIAL_EXPIRING",
        "TRIAL_EXPIRED",
        "COUPON_REDEEMED",
        "REFERRAL_REWARD",
        "ANNOUNCEMENT",
        "SYSTEM"
      ],
      required: true
    },

    // Notification title
    title: {
      type: String,
      required: true
    },

    // Notification message
    message: {
      type: String,
      required: true
    },

    // Optional link for the dashboard
    link: {
      type: String,
      default: null
    },

    // Whether the user has opened it
    read: {
      type: Boolean,
      default: false
    },

    // When it was read
    readAt: {
      type: Date,
      default: null
    },

    // Optional sender/admin
    createdBy: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

const Notification = mongoose.model(
  "Notification",
  notificationSchema
);

export default Notification;