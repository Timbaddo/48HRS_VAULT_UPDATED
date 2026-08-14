import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    firebaseUid: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    phoneNumber: { type: String, default: "" },
    role: { 
      type: String, 
      enum: ["user", "vip", "admin"], 
      lowercase: true,
      default: "user" 
    },
    isTrialActive: { type: Boolean, default: true },
    trialExpiresAt: { type: Date },
    accessExpiresAt: { type: Date },
    referralCode: { type: String, unique: true },
    referredBy: { type: String, default: null },
    walletBalance: { type: Number, default: 0 }
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model("User", userSchema);

export default User;
 