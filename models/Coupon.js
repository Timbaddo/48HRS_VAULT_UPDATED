import mongoose from "mongoose";

const couponSchema = new mongoose.Schema(
  {
    // Coupon code
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true
    },

    // What the coupon gives
    reward: {
      type: String,
      enum: [
        "7_DAYS",
        "1_MONTH",
        "LIFETIME"
      ],
      required: true
    },

    // How many times it can be used
    maxUses: {
      type: Number,
      default: 1
    },

    // Number of successful redemptions
    usedCount: {
      type: Number,
      default: 0
    },

    // Who redeemed it
    redeemedBy: [
      {
        userId: {
          type: String
        },

        whatsappNumber: {
          type: String
        },

        redeemedAt: {
          type: Date,
          default: Date.now
        }
      }
    ],

    // Optional expiry date
    expiresAt: {
      type: Date,
      default: null
    },

    // Admin can disable a coupon
    active: {
      type: Boolean,
      default: true
    },

    // Owner who created it
    createdBy: {
      type: String,
      required: true
    }
  },
  {
    timestamps: true
  }
);

const Coupon = mongoose.model(
  "Coupon",
  couponSchema
);

export default Coupon;