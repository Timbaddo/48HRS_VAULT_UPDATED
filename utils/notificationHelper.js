// utils/notificationHelper.js
import Notification from "../models/Notification.js";

export async function createNotification(userId, title, message, type = "info") {
  try {
    const notification = new Notification({
      userId,
      title,
      message,
      type,
      read: false
    });
    await notification.save();
    return notification;
  } catch (error) {
    console.error("Error creating notification:", error);
    throw error;
  }
}

export async function notifyPaymentReceived(userId, amount) {
  return createNotification(
    userId,
    "Payment Received",
    `Your payment of ₦${amount} has been successfully processed.`,
    "payment"
  );
}

export async function notifyPaymentApproved(userId, amount) {
  return createNotification(
    userId,
    "Payment Approved",
    `Your payment of ₦${amount} has been approved.`,
    "payment"
  );
}

export async function notifyVipActivated(userId) {
  return createNotification(
    userId,
    "VIP Activated",
    "Congratulations! Your VIP membership is now active.",
    "account"
  );
}

export async function notifyReferralReward(userId, rewardAmount) {
  return createNotification(
    userId,
    "Referral Reward Earned",
    `You earned ₦${rewardAmount} from a referral sign-up!`,
    "reward"
  );
}
