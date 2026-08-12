import mongoose from "mongoose";

const referralSchema = new mongoose.Schema(
  {
    // Person who invited
    referrerId: {
      type: String,
      required: true,
      index: true
    },

    // New user who joined
    // One user can only have one referral record
    referredUserId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    // Referral code used
    referralCode: {
      type: String,
      required: true,
      index: true
    },

    // Status tracking
    status: {
      type: String,
      enum: [
        "PENDING",
        "QUALIFIED",
        "REJECTED"
      ],
      default: "PENDING",
      index: true
    },

    // Anti-spam checks
    ipAddress: {
      type: String,
      default: null
    },

    deviceFingerprint: {
      type: String,
      default: null
    },

    // Requirements completed
    accountCreated: {
      type: Boolean,
      default: true
    },

    whatsappConnected: {
      type: Boolean,
      default: false
    },

    trialUsed: {
      type: Boolean,
      default: false
    },

    // Reward information
    rewardGiven: {
      type: Boolean,
      default: false
    },

    rewardType: {
      type: String,
      enum: [
        "NONE",
        "1_MONTH",
        "LIFETIME"
      ],
      default: "NONE"
    }
  },
  {
    timestamps: true
  }
);

const Referral = mongoose.model(
  "Referral",
  referralSchema
);

export default Referral;