import User from "../models/User.js";

let jobInterval = null;

export function startTrialJob() {
  if (jobInterval) return;

  // Run trial check every 15 minutes
  jobInterval = setInterval(async () => {
    try {
      const now = new Date();
      const expiredUsers = await User.updateMany(
        {
          trialExpiresAt: { $lte: now },
          isTrialActive: true
        },
        {
          $set: { isTrialActive: false }
        }
      );
      if (expiredUsers.modifiedCount > 0) {
        console.log(`Updated trial status for ${expiredUsers.modifiedCount} users.`);
      }
    } catch (error) {
      console.error("Error executing trial check job:", error);
    }
  }, 15 * 60 * 1000);
}

export function stopTrialJob() {
  if (jobInterval) {
    clearInterval(jobInterval);
    jobInterval = null;
  }
}
