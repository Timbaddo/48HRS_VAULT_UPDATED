import cron from "node-cron";

import User from "../models/User.js";

import {
  notifyTrialExpiring,
  notifyTrialExpired
} from "../utils/notificationHelper.js";


// ==========================================
// TRIAL JOB
// ==========================================

const trialJob = cron.schedule(
  "*/10 * * * *",
  async () => {
    try {
      const now = new Date();

      const users = await User.find({
        "trial.active": true,
        "trial.expiresAt": {
          $ne: null
        },
        banned: false
      });

      for (const user of users) {
        try {

          // ====================================
          // VIP USERS
          // ====================================

          if (
            user.vip?.active === true
          ) {
            user.trial.active =
              false;

            await user.save();

            continue;
          }

          // ====================================
          // TRIAL EXPIRED
          // ====================================

          if (
            user.trial.expiresAt <= now
          ) {
            user.trial.active =
              false;

            if (
              user.sentTrialExpired !==
              true
            ) {
              try {
                if (user.firebaseUid) {
                  await notifyTrialExpired({
                    userId: user.firebaseUid
                  });
                }

                user.sentTrialExpired =
                  true;

              } catch (notificationError) {
                console.error(
                  `Trial expired notification error for ${user.firebaseUid}:`,
                  notificationError
                );
              }
            }

            await user.save();

            continue;
          }

          // ====================================
          // TRIAL EXPIRING WITHIN 6 HOURS
          // ====================================

          const remaining =
            user.trial.expiresAt.getTime() -
            now.getTime();

          const sixHours =
            6 *
            60 *
            60 *
            1000;

          if (
            remaining > 0 &&
            remaining <= sixHours &&
            user.sentTrialReminder !== true
          ) {
            try {
              if (user.firebaseUid) {
                await notifyTrialExpiring({
                  userId: user.firebaseUid
                });
              }

              user.sentTrialReminder =
                true;

              await user.save();

            } catch (notificationError) {
              console.error(
                `Trial reminder notification error for ${user.firebaseUid}:`,
                notificationError
              );
            }
          }

        } catch (userError) {
          console.error(
            `Trial processing error for ${user.firebaseUid}:`,
            userError
          );
        }
      }

    } catch (error) {
      console.error(
        "Trial job error:",
        error
      );
    }
  },
  {
    scheduled: false
  }
);


// ==========================================
// START TRIAL JOB
// ==========================================

export function startTrialJob() {
  trialJob.start();

  console.log(
    "⏰ Trial job started."
  );
}


// ==========================================
// STOP TRIAL JOB
// ==========================================

export function stopTrialJob() {
  trialJob.stop();

  console.log(
    "⏹️ Trial job stopped."
  );
}


export default trialJob;