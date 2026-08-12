import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    // User who submitted payment
    userId: {
      type: String,
      required: true
    },

    // Account receiving the VIP upgrade
    recipientWhatsApp: {
      type: String,
      required: true
    },


    // Plan purchased
    plan: {
      type: String,
      enum: [
        "1_MONTH",
        "LIFETIME"
      ],
      required: true
    },


    // Amount paid
    amount: {
      type: Number,
      required: true
    },


    currency: {
      type: String,
      default: "NGN"
    },


    // Manual or Paystack
    paymentType: {
      type: String,
      enum: [
        "MANUAL",
        "PAYSTACK"
      ],
      required: true
    },


    // Payment method
    method: {
      type: String,
      enum: [
        "PALMPAY",
        "OPAY",
        "BINANCE",
        "BYBIT",
        "PAYSTACK"
      ],
      required: true
    },


    // Receipt image
    proofImage: {
      type: String,
      default: null
    },


    // Paystack transaction reference
    reference: { type: String, default: null, index: true },

    // Admin verification
    status: {
      type: String,
      enum: [
        "PENDING",
        "APPROVED",
        "REJECTED"
      ],
      default: "PENDING"
    },


    // Admin who handled it
    reviewedBy: {
      type: String,
      default: null
    },


    reviewedAt: {
      type: Date,
      default: null
    },


    adminNote: {
      type: String,
      default: null
    },

    recipientUserId: { type: String, default: null },
    buyerEmail: { type: String, default: null }

  },
  {
    timestamps: true
  }
);


const Payment = mongoose.model(
  "Payment",
  paymentSchema
);


export default Payment;