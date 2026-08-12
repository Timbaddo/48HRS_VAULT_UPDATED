import Notification from "../models/Notification.js";


// ==========================================
// CREATE NOTIFICATION
// ==========================================

export async function createNotification({
  userId,
  type,
  title,
  message,
  link = null,
  createdBy = null
}) {
  try {
    if (
      !userId ||
      !type ||
      !title ||
      !message
    ) {
      throw new Error(
        "userId, type, title and message are required."
      );
    }

    const notification =
      await Notification.create({
        userId,
        type,
        title,
        message,
        link,
        read: false,
        readAt: null,
        createdBy
      });

    return notification;

  } catch (error) {
    console.error(
      "Create notification error:",
      error
    );

    throw error;
  }
}


// ==========================================
// PAYMENT NOTIFICATION
// ==========================================

export async function notifyPaymentReceived({
  userId,
  amount
}) {
  return createNotification({
    userId,

    type: "PAYMENT_RECEIVED",

    title: "Payment Received 💰",

    message:
      `Your payment of ${amount} has been received and is being processed.`,

    link: "/dashboard.html"
  });
}


// ==========================================
// PAYMENT APPROVED
// ==========================================

export async function notifyPaymentApproved({
  userId,
  plan
}) {
  return createNotification({
    userId,

    type: "PAYMENT_APPROVED",

    title: "Payment Approved ✅",

    message:
      `Your ${plan} VIP payment has been approved.`,

    link: "/dashboard.html"
  });
}


// ==========================================
// PAYMENT REJECTED
// ==========================================

export async function notifyPaymentRejected({
  userId,
  reason = "Your payment could not be approved."
}) {
  return createNotification({
    userId,

    type: "PAYMENT_REJECTED",

    title: "Payment Rejected ❌",

    message: reason,

    link: "/dashboard.html"
  });
}


// ==========================================
// VIP ACTIVATED
// ==========================================

export async function notifyVipActivated({
  userId,
  plan
}) {
  return createNotification({
    userId,

    type: "VIP_ACTIVATED",

    title: "VIP Activated 💎",

    message:
      `Your ${plan} VIP access is now active.`,

    link: "/dashboard.html"
  });
}


// ==========================================
// COUPON REDEEMED
// ==========================================

export async function notifyCouponRedeemed({
  userId,
  rewardType
}) {
  return createNotification({
    userId,

    type: "COUPON_REDEEMED",

    title: "Coupon Redeemed 🎟️",

    message:
      `Your coupon was successfully redeemed. Reward: ${rewardType}.`,

    link: "/dashboard.html"
  });
}


// ==========================================
// REFERRAL REWARD
// ==========================================

export async function notifyReferralReward({
  userId,
  rewardType,
  qualifiedCount
}) {
  const rewardMessage =
    rewardType === "LIFETIME"
      ? "You have earned Lifetime VIP! 👑"
      : "You have earned 1 Month VIP! 💎";

  return createNotification({
    userId,

    type: "REFERRAL_REWARD",

    title: "Referral Reward Unlocked 🎁",

    message:
      `${rewardMessage} You now have ${qualifiedCount} qualified referrals.`,

    link: "/dashboard.html"
  });
}


// ==========================================
// TRIAL EXPIRING
// ==========================================

export async function notifyTrialExpiring({
  userId
}) {
  return createNotification({
    userId,

    type: "TRIAL_EXPIRING",

    title: "Your Trial Is Expiring ⏰",

    message:
      "Your free trial is about to expire. Upgrade to VIP to continue using the service.",

    link: "/pricing.html"
  });
}


// ==========================================
// TRIAL EXPIRED
// ==========================================

export async function notifyTrialExpired({
  userId
}) {
  return createNotification({
    userId,

    type: "TRIAL_EXPIRED",

    title: "Your Trial Has Expired ⛔",

    message:
      "Your free trial has expired. Upgrade to VIP to regain access.",

    link: "/pricing.html"
  });
}


// ==========================================
// SYSTEM NOTIFICATION
// ==========================================

export async function notifySystem({
  userId,
  title,
  message,
  link = null
}) {
  return createNotification({
    userId,

    type: "SYSTEM",

    title,
    message,
    link
  });
}


// ==========================================
// ANNOUNCEMENT
// ==========================================

export async function notifyAnnouncement({
  userId,
  title,
  message,
  link = null,
  createdBy = null
}) {
  return createNotification({
    userId,

    type: "ANNOUNCEMENT",

    title,
    message,
    link,
    createdBy
  });
}