import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    // ==========================================
    // WEBSITE / FIREBASE ACCOUNT
    // ==========================================

    firebaseUid: {
      type: String,
      unique: true,
      sparse: true,
      default: null,
      index: true
    },

    name: {
      type: String,
      trim: true,
      default: null
    },

    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      default: null
    },

    role: {
      type: String,
      enum: ["USER", "ADMIN"],
      default: "USER"
    },

    // ==========================================
    // WHATSAPP ACCOUNT
    // ==========================================

phoneNumber: {
  type: String,
  unique: true,
  sparse: true,
  trim: true
},
whatsappNumber: {
  type: String,
  default: null
},

    country: {
      type: String,
      default: null
    },

    sessionId: {
      type: String,
      default: null
    },

    // ==========================================
    // REFERRAL CODE
    // ==========================================

    refCode: {
      type: String,
      unique: true,
      sparse: true,
      default: null
    },

    // ==========================================
    // TRIAL SYSTEM
    // ==========================================

    trial: {
      active: {
        type: Boolean,
        default: true
      },

      startedAt: {
        type: Date,
        default: Date.now
      },

      expiresAt: {
        type: Date,
        default: () =>
          new Date(
            Date.now() +
              24 *
                60 *
                60 *
                1000
          )
      }
    },

    // True when the user has actually used
    // the WhatsApp bot during the trial.
    trialUsed: {
      type: Boolean,
      default: false
    },

    sentTrialReminder: {
      type: Boolean,
      default: false
    },

    sentTrialExpired: {
      type: Boolean,
      default: false
    },

    sentVipReminder: {
      type: Boolean,
      default: false
    },

    // ==========================================
    // VIP SYSTEM
    // ==========================================

    vip: {
      active: {
        type: Boolean,
        default: false
      },

      plan: {
        type: String,
        enum: [
          "NONE",
          "7_DAYS",
          "1_MONTH",
          "LIFETIME"
        ],
        default: "NONE"
      },

      activatedAt: {
        type: Date,
        default: null
      },

      expiresAt: {
        type: Date,
        default: null
      }
    },

    // ==========================================
    // REFERRAL SYSTEM
    // ==========================================

    referral: {
      code: {
        type: String,
        unique: true,
        sparse: true,
        default: null
      },

      referredBy: {
        type: String,
        default: null
      },

      qualifiedCount: {
        type: Number,
        default: 0,
        min: 0
      },

      rewards: {
        oneMonthClaimed: {
          type: Boolean,
          default: false
        },

        lifetimeClaimed: {
          type: Boolean,
          default: false
        }
      }
    },

    // ==========================================
    // OLD / COMPATIBILITY REFERRAL COUNT
    // ==========================================

    referralCount: {
      type: Number,
      default: 0,
      min: 0
    },

    // ==========================================
    // WHATSAPP BOT SETTINGS
    // ==========================================

    settings: {
      autoLike: {
        type: Boolean,
        default: false
      },

      autoView: {
        type: Boolean,
        default: true
      },

      autoRead: {
        type: Boolean,
        default: false
      },

      reactionEmoji: {
        type: String,
        default: "❤️"
      },

      prefix: {
        type: String,
        default: "."
      },

      multiPrefix: {
        type: Boolean,
        default: false
      },

      autoBio: {
        type: Boolean,
        default: false
      },

      antiCall: {
        type: Boolean,
        default: false
      },

      chatBotPm: {
        type: Boolean,
        default: false
      },

      botMode: {
        type: String,
        enum: [
          "public",
          "private"
        ],
        default: "public"
      },

      presence: {
        type: String,
        enum: [
          "online",
          "typing",
          "recording"
        ],
        default: "online"
      },

      antiDelete: {
        type: Boolean,
        default: false
      },

      antiEdit: {
        type: Boolean,
        default: false
      },

      stickerWm: {
        type: String,
        default: "48HRS-VAULT"
      },

      startMessage: {
        type: Boolean,
        default: true
      },

      autoAi: {
        type: Boolean,
        default: false
      },

      antiViewOnce: {
        type: Boolean,
        default: false
      },

      stealthMode: {
        type: Boolean,
        default: false
      },

      deviceMode: {
        type: String,
        enum: [
          "android",
          "ios",
          "default"
        ],
        default: "default"
      }
    },

    // ==========================================
    // ACCOUNT STATUS
    // ==========================================

    banned: {
      type: Boolean,
      default: false
    },

    officialPlatformsPopupAt: {
      type: Date,
      default: null
    },

    lastLogin: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);


// ==========================================
// MODEL
// ==========================================

const User = mongoose.model(
  "User",
  userSchema
);

export default User;