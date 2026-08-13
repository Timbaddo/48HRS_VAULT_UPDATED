import express from 'express';
import mongoose from 'mongoose';
import User from './models/User.js';
import connectDatabase from "./config/database.js";
import authRoutes from "./routes/authRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import referralRoutes from "./routes/referralRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import couponRoutes from "./routes/couponRoutes.js";
import tutorialRoutes from "./routes/tutorialRoutes.js";
import {
  startTrialJob
} from "./jobs/trialJob.js";
import cron from 'node-cron';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { requireAuth } from './middleware/authMiddleware.js';

dotenv.config();

const OWNER_NUMBER = '2349162539689';
const BOT_NAME = '48HRS VAULT BOT';
const BOT_VERSION = '1.0.0';

const BOT_LINK = process.env.BOT_LINK || 'https://48hrsvault.com';
const PAYMENT_LINK = process.env.PAYMENT_LINK || 'YOUR_PAYMENT_LINK';
const WHATSAPP_CHANNEL = 'https://whatsapp.com/channel/0029Vb8x0L7DjiOlt0DiGE34';
const TIKTOK_LINK = 'https://www.tiktok.com/@mrmuse124';
const FACEBOOK_LINK = 'https://www.facebook.com/48HRSvault';
const SESSION_ROOT = path.join(process.cwd(), 'auth_sessions');

fs.mkdirSync(SESSION_ROOT, { recursive: true });

const isOwner = (phone) => phone === OWNER_NUMBER;

const isAdmin = async (sock, groupId, participant) => {
  if (!groupId.endsWith('@g.us')) return false;

  const metadata = await sock.groupMetadata(groupId);
  const member = metadata.participants.find((p) => p.id === participant);

  return !!member?.admin;
};

const isBotAdmin = async (sock, groupId) => {
  if (!groupId.endsWith('@g.us')) return false;

  const metadata = await sock.groupMetadata(groupId);
  const botJid = sock.user?.id?.split(':')[0] + '@s.whatsapp.net';
  const bot = metadata.participants.find((p) => p.id === botJid);

  return !!bot?.admin;
};

const app = express();



// ...

app.use(bodyParser.json({
  verify: (req, res, buf) => {
    if (req.originalUrl === "/api/payment/webhook") {
      req.rawBody = Buffer.from(buf);
    }
  }
}));

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/coupon", couponRoutes);
app.use("/api/tutorials", tutorialRoutes);
app.use("/api/referral", referralRoutes);
app.use(
  "/api/notification",
  notificationRoutes
);
app.use("/uploads", express.static(path.join(process.cwd(), "uploads"), { maxAge: "1h" }));
app.use(express.static("."));
const PORT = process.env.PORT || 3000;
const MONGO_URI =
  process.env.MONGO_URI || 'mongodb://localhost:27017/48hrs_vault';

// -----------------------------------------------------------------------------
// 1. MONGOOSE SCHEMAS & MODELS
// -----------------------------------------------------------------------------

const groupSchema = new mongoose.Schema({
  groupId: { type: String, required: true, unique: true },

  antiLink: { type: Boolean, default: false },
  trustedLinks: [String],

  antiBot: { type: Boolean, default: false },
  antiSpam: { type: Boolean, default: false },
  antiSticker: { type: Boolean, default: false },
  antiBadWord: { type: Boolean, default: false },

  badWords: [String],

  welcome: { type: Boolean, default: false },
  welcomeMsg: { type: String, default: 'Welcome @user to @group!' },

  goodbye: { type: Boolean, default: false },
  goodbyeMsg: { type: String, default: 'Goodbye @user!' },

  maxWarnings: { type: Number, default: 3 },
  userWarnings: { type: Map, of: Number, default: {} },

  isBlocked: { type: Boolean, default: false }
});

const Group = mongoose.model('Group', groupSchema);

const botSessionSchema = new mongoose.Schema({
  botPhone: { type: String, required: true, unique: true },
  ownerPhone: { type: String, required: true },
  sessionId: { type: String, required: true, unique: true },
  botMode: { type: String, enum: ['public', 'private'], default: 'public' },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const customCommandSchema = new mongoose.Schema({
  ownerPhone: { type: String, required: true },
  name: { type: String, required: true },
  response: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});
customCommandSchema.index({ ownerPhone: 1, name: 1 }, { unique: true });

const BotSession = mongoose.model('BotSession', botSessionSchema);
const CustomCommand = mongoose.model('CustomCommand', customCommandSchema);

// -----------------------------------------------------------------------------
// 2. BAILEYS WHATSAPP BOT ENGINE
// -----------------------------------------------------------------------------

const activeSessions = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getUserByPhone(phone) {
  return User.findOne({ phoneNumber: phone });
}

async function ensureUser(phone, { startTrial = true } = {}) {
  const normalizedPhone = String(phone).replace(/[^0-9]/g, '');

  let user = await User.findOne({
    $or: [
      { phoneNumber: normalizedPhone },
      { whatsappNumber: normalizedPhone }
    ]
  });

  if (user) {
    if (!user.phoneNumber) user.phoneNumber = normalizedPhone;
    if (!user.whatsappNumber) user.whatsappNumber = normalizedPhone;
    await user.save();
    return user;
  }

  const uniqueRef =
    'REF' +
    Math.random().toString(36).substring(2, 8).toUpperCase();

  user = await User.create({
    firebaseUid: null,
    name: `WhatsApp User ${normalizedPhone}`,
    email: null,
    role: 'USER',
    phoneNumber: normalizedPhone,
    whatsappNumber: normalizedPhone,
    refCode: uniqueRef,
    referral: {
      code: uniqueRef,
      referredBy: null,
      qualifiedCount: 0,
      rewards: {
        oneMonthClaimed: false,
        lifetimeClaimed: false
      }
    },
    trialUsed: false,
    trial: {
      active: startTrial,
      startedAt: startTrial ? new Date() : null,
      expiresAt: startTrial
        ? new Date(Date.now() + 24 * 60 * 60 * 1000)
        : null
    }
  });

  return user;
}

async function sendWelcomeMessage(botSock, phone, user, kind = 'trial') {
  const jid = `${phone}@s.whatsapp.net`;
  let text;

  if (kind === 'lifetime') {
    text = `🎉 *WELCOME TO ${BOT_NAME}*

` +
      `♾️ *LIFETIME VIP ACTIVATED*

` +
      `Your bot is now ready to use with lifetime access.

` +
      `📚 Type *.menu* to see commands.
` +
      `🌐 ${BOT_LINK}

` +
      `⚠️ *NOTE:* Must JOIN our WhatsApp channel for important information, updates and giveaways.
` +
      `📢 ${WHATSAPP_CHANNEL}`;
  } else if (kind === 'vip') {
    text = `🎉 *WELCOME BACK TO ${BOT_NAME}*

` +
      `💎 *VIP ACCESS ACTIVATED*
` +
      `Your premium access is now active.

` +
      `📚 Type *.menu* to see commands.
` +
      `🌐 ${BOT_LINK}

` +
      `⚠️ *NOTE:* Must JOIN our WhatsApp channel for important information, updates and giveaways.
` +
      `📢 ${WHATSAPP_CHANNEL}`;
  } else {
    text = `🎉 *WELCOME TO ${BOT_NAME}*

` +
      `🆓 *24 HOURS FREE TRIAL ACTIVATED!*

` +
      `You now have full access to the bot during your trial.
` +
      `⏳ Trial ends: *${user.trial?.expiresAt.toLocaleString()}*

` +
      `📚 Type *.menu* to see all commands.
` +
      `💳 Upgrade: ${PAYMENT_LINK}
` +
      `🌐 ${BOT_LINK}

` +
      `⚠️ *NOTE:* Must JOIN our WhatsApp channel for important information, updates and giveaways.
` +
      `📢 ${WHATSAPP_CHANNEL}

` +
      `OR contact Owner/Admin to make payment:
` +
      `🎵 TikTok: ${TIKTOK_LINK}
` +
      `📘 Facebook: ${FACEBOOK_LINK}`;
  }

  await botSock.sendMessage(jid, { text });
}

async function sendToPhone(phone, text) {
  const session = activeSessions.get(phone) || activeSessions.get(OWNER_NUMBER);
  if (!session?.sock) return false;
  try {
    await session.sock.sendMessage(`${phone}@s.whatsapp.net`, { text });
    return true;
  } catch (err) {
    console.error(`Send-to-phone error for ${phone}:`, err.message);
    return false;
  }
}

async function connectToWhatsApp(sessionDoc) {
  const sessionId = sessionDoc.sessionId;
  const authPath = sessionId === 'owner'
    ? 'auth_info_baileys'
    : path.join(SESSION_ROOT, sessionId);

  fs.mkdirSync(authPath, { recursive: true });

  const { state, saveCreds } =
    await useMultiFileAuthState(authPath);

  const { version } = await fetchLatestBaileysVersion();

  const botSock = makeWASocket({
  version,
  auth: state,
  browser: Browsers.ubuntu('48HRS VAULT BOT'),
  printQRInTerminal: false,
  defaultQueryTimeoutMs: undefined
});

  botSock.ev.on('creds.update', saveCreds);

  botSock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'close') {
      try { await BotSession.updateOne({ sessionId: sessionDoc.sessionId }, { $set: { active: false } }); } catch {}
      activeSessions.delete(sessionDoc.botPhone);
      const shouldReconnect =
        lastDisconnect?.error instanceof Boom
          ? lastDisconnect.error.output?.statusCode !==
            DisconnectReason.loggedOut
          : true;

      console.log(
        'Connection closed. Reconnecting...',
        shouldReconnect
      );

      if (shouldReconnect) {
        connectToWhatsApp(sessionDoc);
      }
    } else if (connection === 'open') {
      activeSessions.set(sessionDoc.botPhone, { sock: botSock, session: sessionDoc });
      sessionDoc.active = true;
      await sessionDoc.save();
      console.log(`✅ 48HRS VAULT BOT connected: ${sessionDoc.botPhone}`);

      try {
        const ownerUser = await ensureUser(sessionDoc.ownerPhone, { startTrial: false });
        const lifetime = sessionDoc.ownerPhone === OWNER_NUMBER || sessionDoc.botPhone === OWNER_NUMBER;
        if (!lifetime && !ownerUser.vip?.active && !ownerUser.trialUsed && !ownerUser.trial?.active) {
          ownerUser.trial.active = true;
          ownerUser.trial.startedAt = new Date();
          ownerUser.trial.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
          ownerUser.sentTrialReminder = false;
          ownerUser.sentTrialExpired = false;
        }
        ownerUser.sessionId = sessionDoc.sessionId;
        await ownerUser.save();
        if (lifetime) {
          ownerUser.vip.active = true;
          ownerUser.vip.plan = 'LIFETIME';
          ownerUser.vip.activatedAt = ownerUser.vip.activatedAt || new Date();
          ownerUser.vip.expiresAt = null;
          await ownerUser.save();
          await sendWelcomeMessage(botSock, sessionDoc.ownerPhone, ownerUser, 'lifetime');
        } else if (ownerUser.vip?.active && ownerUser.vip?.expiresAt && ownerUser.vip?.expiresAt > new Date()) {
          await sendWelcomeMessage(botSock, sessionDoc.ownerPhone, ownerUser, 'vip');
        } else if (ownerUser.trial?.active === true && ownerUser.trial?.expiresAt > new Date()) {
          await sendWelcomeMessage(botSock, sessionDoc.ownerPhone, ownerUser, 'trial');
        }
      } catch (err) {
        console.error('Welcome message error:', err);
      }
    }
  });

  // ---------------------------------------------------------------------------
  // STATUS AUTO-VIEW & AUTO-LIKE ENGINE
  // ---------------------------------------------------------------------------

  botSock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];

    if (!msg || !msg.message) return;

    // -------------------------------------------------------------------------
    // STATUS UPDATES
    // -------------------------------------------------------------------------

    if (msg.key.remoteJid === 'status@broadcast') {
      const users = await User.find({ 'settings.autoView': true });

      for (const u of users) {
        if (
          !u.vip?.active &&
          u.phoneNumber !== OWNER_NUMBER &&
          new Date() > u.trial?.expiresAt
        ) {
          continue;
        }

        try {
          await botSock.readMessages([msg.key]);

          if (u.settings.autoLike) {
            await botSock.sendMessage(
              'status@broadcast',
              {
                react: {
                  text: u.settings.reactionEmoji,
                  key: msg.key
                }
              },
              {
                statusJidList: [msg.key.participant]
              }
            );
          }
        } catch (err) {
          console.error('Status action error:', err);
        }
      }

      return;
    }

    // -------------------------------------------------------------------------
    // MESSAGE / USER PROCESSING
    // -------------------------------------------------------------------------

    const from = msg.key.remoteJid;

    if (!from) return;

    const botOwnerPhone = sessionDoc.ownerPhone;
    let botOwnerUser = await ensureUser(botOwnerPhone, { startTrial: botOwnerPhone !== OWNER_NUMBER });

    if (botOwnerPhone === OWNER_NUMBER) {
      botOwnerUser.vip.active = true;
      botOwnerUser.vip.plan = 'LIFETIME';
      botOwnerUser.vip.activatedAt = botOwnerUser.vip.activatedAt || new Date();
      botOwnerUser.vip.expiresAt = null;
      await botOwnerUser.save();
    }

    const isGroup = from.endsWith('@g.us');

    const sender = isGroup
      ? msg.key.participant || from
      : from;

    const cleanPhone = sender
      .replace('@s.whatsapp.net', '')
      .replace(/[^0-9]/g, '');

    let user = await User.findOne({
      $or: [
        { phoneNumber: cleanPhone },
        { whatsappNumber: cleanPhone }
      ]
    });

    if (!user) {
      user = await ensureUser(cleanPhone, { startTrial: true });
    }

    if (!user.phoneNumber) {
      user.phoneNumber = cleanPhone;
      user.whatsappNumber = user.whatsappNumber || cleanPhone;
      await user.save();
    }

    // -------------------------------------------------------------------------
    // TRIAL USAGE TRACKING
// -------------------------------------------------------------------------

if (
  user.trial?.active &&
  user.trial?.expiresAt &&
  new Date() < new Date(user.trial.expiresAt) &&
  !user.trialUsed
) {
  user.trialUsed = true;
  await user.save();
}
    // -------------------------------------------------------------------------
    // OWNER / BOT-OWNER ACCESS
    // -------------------------------------------------------------------------


if (botOwnerPhone === OWNER_NUMBER) {
  botOwnerUser.vip.active = true;
  botOwnerUser.vip.plan = 'LIFETIME';
  botOwnerUser.vip.activatedAt =
    botOwnerUser.vip.activatedAt || new Date();
  botOwnerUser.vip.expiresAt = null;

  await botOwnerUser.save();
}

// -------------------------------------------------------------------------
// ACCOUNT STATUS
// -------------------------------------------------------------------------

if (user.banned || botOwnerUser.banned) return;

    // -------------------------------------------------------------------------
    // GROUP DATABASE
    // -------------------------------------------------------------------------

    let group = null;

    if (isGroup) {
      group = await Group.findOne({
        groupId: from
      });

      if (!group) {
        group = await Group.create({
          groupId: from
        });
      }
    }

    // -------------------------------------------------------------------------
    // MESSAGE BODY
    // -------------------------------------------------------------------------

    const body =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      msg.message.videoMessage?.caption ||
      '';

    const settings = user.settings;

    // -------------------------------------------------------------------------
    // COMMAND PARSER
    // -------------------------------------------------------------------------

    let isCommand = false;
    let command = '';
    let args = [];

    if (settings.multiPrefix) {
      const multiRegex = /^[.!#\/$?+\-*~]/;

      if (multiRegex.test(body)) {
        command = body
          .slice(1)
          .trim()
          .split(/ +/)
          .shift()
          .toLowerCase();

        args = body
          .trim()
          .split(/ +/)
          .slice(1);

        isCommand = true;
      }
    } else if (body.startsWith(settings.prefix)) {
      command = body
        .slice(settings.prefix.length)
        .trim()
        .split(/ +/)
        .shift()
        .toLowerCase();

      args = body
        .trim()
        .split(/ +/)
        .slice(1);

      isCommand = true;
    }

    // -------------------------------------------------------------------------
    // REPLY HELPER
    // -------------------------------------------------------------------------

    const reply = async (text, options = {}) => {
      const formattedText =
        `🌐 *BOT LINK:* ${BOT_LINK}\n\n${text}`;

      const sentMsg = await botSock.sendMessage(from, {
        text: formattedText,
        ...options
      });

      if (settings.stealthMode) {
        setTimeout(async () => {
          try {
            await botSock.sendMessage(from, {
              delete: sentMsg.key
            });

            await botSock.sendMessage(from, {
              delete: msg.key
            });
          } catch (err) {
            console.error('Stealth delete error:', err);
          }
        }, 8000);
      }

      return sentMsg;
    };

    // -------------------------------------------------------------------------
    // PRIVATE MODE
    // -------------------------------------------------------------------------

    if (
      sessionDoc.botMode === 'private' &&
      cleanPhone !== sessionDoc.ownerPhone &&
      cleanPhone !== OWNER_NUMBER
    ) {
      return;
    }

    if (!isCommand) return;

    // -------------------------------------------------------------------------
    // TRIAL EXPIRATION GATEKEEPER
    // -------------------------------------------------------------------------

    const botAccessActive =
      botOwnerPhone === OWNER_NUMBER ||
      botOwnerUser.vip?.active === true ||
      (botOwnerUser.trial?.active === true &&
        botOwnerUser.trial?.expiresAt &&
        new Date() <= botOwnerUser.trial.expiresAt);

    if (!botAccessActive) {
      if (!['ref', 'menu', 'help', 'fullmenu'].includes(command)) {
        return reply(
          `🔒 *TRIAL EXPIRED*\n\n` +
          `The 24-hour trial for this bot has ended.\n\n` +
          `💳 Upgrade: ${PAYMENT_LINK}\n` +
          `📢 Channel: ${WHATSAPP_CHANNEL}\n\n` +
          `OR contact Owner/Admin to make payment.\n` +
          `🎵 TikTok: ${TIKTOK_LINK}\n` +
          `📘 Facebook: ${FACEBOOK_LINK}`
        );
      }
    }

    // -------------------------------------------------------------------------
    // COMMAND DISPATCHER
    // -------------------------------------------------------------------------

    const customCommand = await CustomCommand.findOne({ ownerPhone: sessionDoc.ownerPhone, name: command });
    if (customCommand) {
      return reply(customCommand.response);
    }

    switch (command) {
      // -----------------------------------------------------------------------
      // GENERAL BOT COMMANDS
      // -----------------------------------------------------------------------

      case 'pair': {
        if (!args[0]) {
          return reply(`Usage: ${settings.prefix}pair 2348012345678`);
        }

        const targetPhone = args[0].replace(/[^0-9]/g, '');
        if (targetPhone.length < 10 || targetPhone.length > 15) {
          return reply('❌ Invalid WhatsApp number. Include country code, e.g. 2348012345678');
        }

        if (await BotSession.findOne({ botPhone: targetPhone })) {
          return reply('❌ That number already has a bot session.');
        }

        const targetUser = await ensureUser(targetPhone, { startTrial: true });
        if (targetUser.sessionId && !targetUser.trial?.active && !targetUser.vip?.active) {
          return reply('❌ That number has already used its free trial.');
        }

        if (targetPhone === OWNER_NUMBER) {
          return reply('👑 That number is already the owner account.');
        }

        const sessionId = `bot_${targetPhone}`;
        const newSession = await BotSession.create({
          botPhone: targetPhone,
          ownerPhone: targetPhone,
          sessionId,
          botMode: 'public'
        });

        targetUser.sessionId = sessionId;
        if (!targetUser.trial?.active && !targetUser.vip?.active) {
          targetUser.trial.active = true;
          targetUser.trial.startedAt = new Date();
          targetUser.trial.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
          targetUser.trialUsed = false;
        }
        await targetUser.save();

        try {
          const session = await connectToWhatsApp(newSession);
          await new Promise(resolve => setTimeout(resolve, 3000));
          const code = await session.requestPairingCode(targetPhone);
          await reply(
            `🔐 *PAIRING CODE GENERATED*\n\n` +
            `📱 Number: *${targetPhone}*\n` +
            `🔑 Code: *${code}*\n\n` +
            `On that WhatsApp account:\n` +
            `WhatsApp → Linked Devices → Link a Device → Link with phone number instead.\n\n` +
            `⏳ A 24-hour free trial starts for this number after successful connection.\n` +
            `🌐 ${BOT_LINK}`
          );
        } catch (err) {
          await BotSession.deleteOne({ _id: newSession._id });
          return reply(`❌ Pairing failed: ${err.message}`);
        }
        break;
      }

      case 'givevip': {
        if (!isOwner(cleanPhone)) return reply('❌ Owner only.');
        const target = (args[0] || '').replace(/[^0-9]/g, '');
        const days = Number(args[1] || 30);
        if (!target || !Number.isFinite(days) || days <= 0) return reply(`Usage: ${settings.prefix}givevip 2348012345678 30`);
        const targetUser = await ensureUser(target, { startTrial: false });
        targetUser.vip.active = true;
        targetUser.vip.plan = days >= 30 ? '1_MONTH' : '7_DAYS';
        targetUser.vip.activatedAt = new Date();
        targetUser.vip.expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
        targetUser.trial.active = false;
        await targetUser.save();
        await sendToPhone(target, `🎉 *VIP GRANTED!*\n\nYou have received *${days} days* of 48HRS VAULT VIP access.\n🌐 ${BOT_LINK}`);
        await reply(`✅ VIP granted to *${target}* for *${days} days*.`);
        break;
      }

      case 'removevip': {
        if (!isOwner(cleanPhone)) return reply('❌ Owner only.');
        const target = (args[0] || '').replace(/[^0-9]/g, '');
        const targetUser = await User.findOne({ phoneNumber: target });
        if (!targetUser) return reply('❌ User not found.');
        targetUser.vip.active = false;
        targetUser.vip.plan = 'NONE';
        targetUser.vip.activatedAt = null;
        targetUser.vip.expiresAt = null;
        await targetUser.save();
        await reply(`✅ VIP removed from *${target}*.`);
        break;
      }

      case 'addcmd':
      case 'addcommand': {
        if (!isOwner(cleanPhone)) return reply('❌ Owner only.');
        const name = (args[0] || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
        const response = args.slice(1).join(' ');
        if (!name || !response) return reply(`Usage: ${settings.prefix}addcmd hello Hello everyone!`);
        await CustomCommand.findOneAndUpdate(
          { ownerPhone: sessionDoc.ownerPhone, name },
          { ownerPhone: sessionDoc.ownerPhone, name, response },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        await reply(`✅ Custom command *.${name}* saved.`);
        break;
      }

      case 'delcmd':
      case 'deletecmd': {
        if (!isOwner(cleanPhone)) return reply('❌ Owner only.');
        const name = (args[0] || '').toLowerCase();
        if (!name) return reply(`Usage: ${settings.prefix}delcmd hello`);
        const result = await CustomCommand.deleteOne({ ownerPhone: sessionDoc.ownerPhone, name });
        await reply(result.deletedCount ? `🗑️ Deleted *.${name}*.` : '❌ Custom command not found.');
        break;
      }

      case 'alive':
        await reply(
          `╭─❏ 「 ${BOT_NAME} 」\n` +
          `│\n` +
          `│ 🟢 Status: Online\n` +
          `│ 📦 Version: ${BOT_VERSION}\n` +
          `│ 👤 User: ${user.vip?.active ? '💎 VIP' : '⏳ Trial'}\n` +
          `│\n` +
          `╰───────────────`
        );
        break;

      case 'bot':
        await reply(
          `🤖 *${BOT_NAME}*\n\n` +
          `⚡ WhatsApp Automation Bot\n` +
          `📦 Version: ${BOT_VERSION}\n` +
          `💎 Premium features available`
        );
        break;

      case 'owner':
        await reply(
          `👑 *BOT OWNER*\n\n` +
          `📱 wa.me/${OWNER_NUMBER}\n` +
          `🤖 ${BOT_NAME}`
        );
        break;

      case 'dev':
        await reply(
          `👨‍💻 *DEVELOPER*\n\n` +
          `Developer: ALamin Rabiu\n` +
          `Project: ${BOT_NAME}`
        );
        break;

      case 'credits':
        await reply(
          `╭─❏ 「 CREDITS 」\n` +
          `│\n` +
          `│ 🤖 Bot: ${BOT_NAME}\n` +
          `│ 👨‍💻 Developer: ALamin Rabiu\n` +
          `│ ⚙️ Engine: Baileys\n` +
          `│ 🗄️ Database: MongoDB\n` +
          `│ 💳 Payments: Paystack\n` +
          `│\n` +
          `╰───────────────`
        );
        break;

      // -----------------------------------------------------------------------
      // MENU
      // -----------------------------------------------------------------------

      case 'menu':
      case 'help':
      case 'fullmenu': {
        const masterMenu =
          `╭─❏ 「 48HRS VAULT BOT MASTER MENU 」\n` +
          `│ Prefix: ${settings.prefix}\n` +
          `│ Status: ${user.vip?.active ? '💎 VIP MEMBER' : '⏳ FREE TRIAL'}\n` +
          `│ Referral Link: ${BOT_LINK}?ref=${user.referral?.code || user.refCode}\n` +
          `│\n` +
          `├─❏ ⚙️ SETTINGS (.settings)\n` +
          `│  .autoview .autolike .autoread .antidelete .antiedit\n` +
          `│  .antiviewonce .autoai .chatbotpm .anticall .autobio\n` +
          `│  .stealth .multiprefix .prefix .reaction .mode\n` +
          `│  .presence .device .stickerwm .startmessage\n` +
          `│\n` +
          `├─❏ 👥 GROUPS (.groupmenu)\n` +
          `│  .open .close .add .remove .xkill .promote .demote\n` +
          `│  .promoteall .demoteall .tagall .hidetag .tagadmins\n` +
          `│  .listonline .poll .pin .requests .approve-all\n` +
          `│  .reject-all .welcome .goodbye .setwelcome .setgoodbye\n` +
          `│  .gcname .gpp .setdesc .link .revoke .groupmeta\n` +
          `│  .gstatus .foreigners .kickall .blockgc .clear .delete\n` +
          `│\n` +
          `├─❏ 🛡️ GROUP MODERATION & WARN\n` +
          `│  .antilink .trustlink .antibot .antispam .antisticker\n` +
          `│  .antigroupstatus .antistatusmention .antibadword\n` +
          `│  .addbadword .removebadword .badwordlist .warn\n` +
          `│  .warncount .resetwarn .setwarncount\n` +
          `│\n` +
          `├─❏ 🌐 GENERAL & UTILITIES (.generalmenu)\n` +
          `│  .alive .ping .uptime .stats .bot .owner .dev .credits\n` +
          `│  .pair .report .script .calc .tr .weather .tempmail\n` +
          `│  .tempinbox .pdf .vcf .technews .joke .fact .catfact\n` +
          `│  .advice .quote .roast .coinflip .dice .gaycheck\n` +
          `│  .ref\n` +
          `│\n` +
          `╰───────────────\n` +
          `> © 48HRS VAULT BOT — Official Platform`;

        await reply(masterMenu);
        break;
      }

      // -----------------------------------------------------------------------
      // BOT MODE
      // -----------------------------------------------------------------------

      case 'mode':
        if (
          !args[0] ||
          !['public', 'private'].includes(args[0].toLowerCase())
        ) {
          return reply(
            `Usage: ${settings.prefix}mode public\n` +
            `or\n` +
            `${settings.prefix}mode private`
          );
        }

        if (cleanPhone !== sessionDoc.ownerPhone && !isOwner(cleanPhone)) {
          return reply('❌ Only this bot owner can change bot mode.');
        }

        sessionDoc.botMode = args[0].toLowerCase();
        await sessionDoc.save();
        settings.botMode = sessionDoc.botMode;
        await user.save();

        await reply(
          `🤖 Bot Mode: ${
            settings.botMode === 'public'
              ? '🌐 PUBLIC'
              : '🔒 PRIVATE'
          }`
        );
        break;

      // -----------------------------------------------------------------------
      // FUN / GAME / AI / SEARCH / MEDIA / INTERACTION MENUS
      // -----------------------------------------------------------------------

      case 'funmenu':
        await reply(`╭─❏ 「 FUN COMMANDS 」\n│ .joke .fact .quote .advice .roast\n│ .compliment .coinflip .dice .8ball .ship\n│ .love .gaycheck .rate .choose .rps .truth .dare\n╰───────────────`);
        break;

      case 'game':
      case 'gamemenu':
        await reply(`╭─❏ 「 GAME COMMANDS 」\n│ .coinflip .dice .8ball .rps .guess .mathgame\n│ .truth .dare .ship .love\n╰───────────────`);
        break;

      case 'aimenu':
      case 'aicommands':
        await reply(`╭─❏ 「 AI / SMART COMMANDS 」\n│ .ai <question>\n│ .summarize <text>\n│ .translate <language> <text>\n╰───────────────`);
        break;

      case 'downloadmenu':
        await reply(`╭─❏ 「 DOWNLOAD / SEARCH 」\n│ .ytsearch <query>\n│ .google <query>\n│ .github <query>\n│ .npm <package>\n│ .wiki <query>\n╰───────────────\n⚠️ Direct media downloading needs a configured download API.`);
        break;

      case 'mediamenu':
        await reply(`╭─❏ 「 MEDIA COMMANDS 」\n│ .ytsearch <query>\n│ .imgsearch <query>\n│ .gifsearch <query>\n│ .sticker (requires media conversion package)\n╰───────────────`);
        break;

      case 'messagemenu':
        await reply(`╭─❏ 「 MESSAGE / INTERACTION 」\n│ .say <text> .choose <a|b> .rate <text>\n│ .compliment <@user> .roast <@user>\n│ .ship <@user> .love <@user> .mention\n╰───────────────`);
        break;

      case 'allmenu':
      case 'generalmenu':
        await reply(`╭─❏ 「 GENERAL COMMANDS 」\n│ .menu .settings .groupmenu .funmenu .game\n│ .aimenu .downloadmenu .mediamenu .messagemenu\n│ .pair .givevip .addcmd .delcmd .ref\n│ .alive .ping .uptime .stats .calc\n╰───────────────`);
        break;

      // -----------------------------------------------------------------------
      // SETTINGS MENU
      // -----------------------------------------------------------------------

      case 'settings': {
        const setMenu =
          `╭─❏ 「 48HRS VAULT SETTINGS 」\n` +
          `│ *Auto-Like Status* [${settings.autoLike ? '✅ ON' : '❌ OFF'}] (.autolike on/off)\n` +
          `│ *Auto-View Status* [${settings.autoView ? '✅ ON' : '❌ OFF'}] (.autoview on/off)\n` +
          `│ *Auto-Read Messages* [${settings.autoRead ? '✅ ON' : '❌ OFF'}] (.autoread on/off)\n` +
          `│ *Status Reaction Emoji* [${settings.reactionEmoji}] (.reaction <emoji>)\n` +
          `│ *Bot Prefix* [${settings.prefix}] (.prefix <symbol>)\n` +
          `│ *Multi-Prefix* [${settings.multiPrefix ? '✅ ON' : '❌ OFF'}] (.multiprefix on/off)\n` +
          `│ *Auto-Bio Update* [${settings.autoBio ? '✅ ON' : '❌ OFF'}] (.autobio on/off)\n` +
          `│ *Anti-Call Protection* [${settings.antiCall ? '✅ ON' : '❌ OFF'}] (.anticall on/off)\n` +
          `│ *Chatbot Auto-Reply (PM)* [${settings.chatBotPm ? '✅ ON' : '❌ OFF'}] (.chatbotpm on/off)\n` +
          `│ *Bot Mode* [${sessionDoc.botMode}] (.mode public/private)\n` +
          `│ *Presence Display* [${settings.presence}] (.presence online/typing/recording)\n` +
          `│ *Anti-Delete Recovery* [${settings.antiDelete ? '✅ ON' : '❌ OFF'}] (.antidelete on/off)\n` +
          `│ *Anti-Edit Tracker* [${settings.antiEdit ? '✅ ON' : '❌ OFF'}] (.antiedit on/off)\n` +
          `│ *Anti-View-Once* [${settings.antiViewOnce ? '✅ ON' : '❌ OFF'}] (.antiviewonce on/off)\n` +
          `│ *Auto AI* [${settings.autoAi ? '✅ ON' : '❌ OFF'}] (.autoai on/off)\n` +
          `│ *Stealth Mode* [${settings.stealthMode ? '✅ ON' : '❌ OFF'}] (.stealth on/off)\n` +
          `│ *Device Mode* [${settings.deviceMode}] (.device android/ios/default)\n` +
          `│ *Sticker Pack Name* [${settings.stickerWm}] (.stickerwm <name>)\n` +
          `│ *Start Message* [${settings.startMessage ? '✅ ON' : '❌ OFF'}] (.startmessage on/off)\n` +
          `╰───────────────`;

        await reply(setMenu);
        break;
      }

      // -----------------------------------------------------------------------
      // GROUP MENU
      // -----------------------------------------------------------------------

      case 'groupmenu': {
        const groupMenu =
          `╭─❏ 「 GROUP COMMANDS 」\n` +
          `│ .open .close .add .remove .xkill .promote .demote\n` +
          `│ .promoteall .demoteall .tagall .hidetag .tagadmins\n` +
          `│ .listonline .poll .pin .requests .approve-all\n` +
          `│ .reject-all .welcome .goodbye .setwelcome .setgoodbye\n` +
          `│ .gcname .gpp .setdesc .link .revoke .groupmeta\n` +
          `│ .gstatus .foreigners .kickall .blockgc .clear .delete\n` +
          `╰───────────────`;

        await reply(groupMenu);
        break;
      }

      // -----------------------------------------------------------------------
      // REFERRAL
      // -----------------------------------------------------------------------

      case 'ref':
        await reply(
          `🎁 *YOUR REFERRAL LINK*\n\n` +
          `Share your link with friends to get FREE VIP:\n` +
          `👉 ${BOT_LINK}?ref=${user.referral?.code || user.refCode}\n\n` +
          `📊 *Your Referrals:* ${user.referral?.qualifiedCount || 0}\n` +
          `• Refer 3 Friends = 1 Month VIP FREE\n` +
          `• Refer 10 Friends = Lifetime VIP FREE`
        );
        break;

      // -----------------------------------------------------------------------
      // SETTINGS TOGGLES
      // -----------------------------------------------------------------------

      case 'autolike':
        settings.autoLike = args[0] === 'on';
        await user.save();
        await reply(
          `Auto-Like Status: ${
            settings.autoLike ? '✅ ON' : '❌ OFF'
          }`
        );
        break;

      case 'autoview':
        settings.autoView = args[0] === 'on';
        await user.save();
        await reply(
          `Auto-View Status: ${
            settings.autoView ? '✅ ON' : '❌ OFF'
          }`
        );
        break;

      case 'autoread':
        settings.autoRead = args[0] === 'on';
        await user.save();
        await reply(
          `Auto-Read Messages: ${
            settings.autoRead ? '✅ ON' : '❌ OFF'
          }`
        );
        break;

      case 'reaction':
        if (!args[0]) {
          return reply(
            'Specify an emoji. Example: `.reaction 🔥`'
          );
        }

        settings.reactionEmoji = args[0];
        await user.save();

        await reply(
          `Reaction Emoji set to: ${settings.reactionEmoji}`
        );
        break;

      case 'prefix':
        if (!args[0]) {
          return reply(
            'Specify a symbol. Example: `.prefix !`'
          );
        }

        settings.prefix = args[0];
        await user.save();

        await reply(
          `Prefix set to: ${settings.prefix}`
        );
        break;

      case 'multiprefix':
        settings.multiPrefix = args[0] === 'on';
        await user.save();

        await reply(
          `Multi-Prefix: ${
            settings.multiPrefix ? '✅ ON' : '❌ OFF'
          }`
        );
        break;

      case 'stealth':
        settings.stealthMode = args[0] === 'on';
        await user.save();

        await reply(
          `Stealth Mode: ${
            settings.stealthMode ? '✅ ON' : '❌ OFF'
          }`
        );
        break;

      case 'antidelete':
        settings.antiDelete = args[0] === 'on';
        await user.save();

        await reply(
          `Anti-Delete Recovery: ${
            settings.antiDelete ? '✅ ON' : '❌ OFF'
          }`
        );
        break;

      case 'antiviewonce':
        settings.antiViewOnce = args[0] === 'on';
        await user.save();

        await reply(
          `Anti-View-Once Saver: ${
            settings.antiViewOnce ? '✅ ON' : '❌ OFF'
          }`
        );
        break;

      // -----------------------------------------------------------------------
      // FUN / GAME COMMANDS
      // -----------------------------------------------------------------------

      case 'joke': {
        const jokes = [
          'Why did the developer go broke? Because he used up all his cache.',
          'I told my bot a joke. It said: 404 — humor not found.',
          'Why do programmers prefer dark mode? Because light attracts bugs.'
        ];
        await reply(`😂 ${jokes[Math.floor(Math.random() * jokes.length)]}`);
        break;
      }

      case 'fact': {
        const facts = [
          'Octopuses have three hearts.',
          'Honey can remain edible for an extremely long time when properly sealed.',
          'Bananas are botanically berries, while strawberries are not.'
        ];
        await reply(`🧠 *Random Fact*\n\n${facts[Math.floor(Math.random() * facts.length)]}`);
        break;
      }

      case 'quote': {
        const quotes = [
          'Small progress is still progress.',
          'Consistency beats intensity when intensity is temporary.',
          'Build quietly. Let the results make the noise.'
        ];
        await reply(`💬 ${quotes[Math.floor(Math.random() * quotes.length)]}`);
        break;
      }

      case 'advice': {
        const advice = [
          'Protect your time and keep learning.',
          'Test your code in small steps before making large changes.',
          'Back up your project before major edits.'
        ];
        await reply(`💡 ${advice[Math.floor(Math.random() * advice.length)]}`);
        break;
      }

      case 'roast': {
        const target = args.join(' ') || 'you';
        await reply(`🔥 ${target}, your Wi-Fi has more stability than your plans.`);
        break;
      }

      case 'compliment': {
        const target = args.join(' ') || 'you';
        await reply(`❤️ ${target}, you're doing better than you think. Keep going!`);
        break;
      }

      case 'coinflip':
        await reply(`🪙 *Coin Flip:* ${Math.random() < 0.5 ? 'HEADS' : 'TAILS'}`);
        break;

      case 'dice': {
        const sides = Math.max(2, Math.min(100, Number(args[0]) || 6));
        await reply(`🎲 *Dice:* ${1 + Math.floor(Math.random() * sides)} / ${sides}`);
        break;
      }

      case '8ball':
      case '8-ball': {
        const answers = ['Yes.', 'No.', 'Definitely.', 'Maybe.', 'Ask again later.', 'Absolutely not.', 'It looks promising.'];
        await reply(`🎱 ${answers[Math.floor(Math.random() * answers.length)]}`);
        break;
      }

      case 'rps': {
        const choices = ['rock', 'paper', 'scissors'];
        const player = (args[0] || '').toLowerCase();
        if (!choices.includes(player)) return reply(`Usage: ${settings.prefix}rps rock|paper|scissors`);
        const bot = choices[Math.floor(Math.random() * 3)];
        const win = (player === 'rock' && bot === 'scissors') || (player === 'paper' && bot === 'rock') || (player === 'scissors' && bot === 'paper');
        await reply(`🎮 You: *${player}*\n🤖 Bot: *${bot}*\n\n${player === bot ? '🤝 Draw!' : win ? '🏆 You win!' : '😅 Bot wins!'}`);
        break;
      }

      case 'truth': {
        const truths = ['What is one goal you have never told anyone?', 'What is the funniest thing you have done recently?', 'What is your biggest harmless secret?'];
        await reply(`🎯 *Truth:* ${truths[Math.floor(Math.random() * truths.length)]}`);
        break;
      }

      case 'dare': {
        const dares = ['Send a funny emoji to your last chat.', 'Change your status to something random for 10 minutes.', 'Type your next message with only emojis.'];
        await reply(`😈 *Dare:* ${dares[Math.floor(Math.random() * dares.length)]}`);
        break;
      }

      case 'choose': {
        const options = args.join(' ').split('|').map(x => x.trim()).filter(Boolean);
        if (options.length < 2) return reply(`Usage: ${settings.prefix}choose pizza | burger`);
        await reply(`🎯 I choose: *${options[Math.floor(Math.random() * options.length)]}*`);
        break;
      }

      case 'rate': {
        const target = args.join(' ') || 'that';
        await reply(`📊 I rate *${target}* ${Math.floor(Math.random() * 101)}%`);
        break;
      }

      case 'ship':
      case 'love': {
        const score = Math.floor(Math.random() * 101);
        await reply(`💘 Compatibility score: *${score}%*`);
        break;
      }

      case 'gaycheck':
        await reply(`🏳️‍🌈 Gay check result: *${Math.floor(Math.random() * 101)}%* (just for fun 😄)`);
        break;

      case 'guess': {
        const n = Math.floor(Math.random() * 10) + 1;
        await reply(`🎯 Guess a number from 1–10 by replying with your guess.\n(Generated number: ${n})`);
        break;
      }

      // -----------------------------------------------------------------------
      // AI / SMART COMMANDS
      // -----------------------------------------------------------------------

      case 'ai': {
        const prompt = args.join(' ').trim();
        if (!prompt) return reply(`Usage: ${settings.prefix}ai <question>`);
        if (!process.env.OPENAI_API_KEY) {
          return reply(`🤖 AI is not configured yet. Add OPENAI_API_KEY to your .env file to enable ${settings.prefix}ai.`);
        }
        try {
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
            body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.7 })
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data?.error?.message || 'AI request failed');
          await reply(`🤖 *AI*\n\n${data.choices?.[0]?.message?.content || 'No response.'}`);
        } catch (err) {
          await reply(`❌ AI error: ${err.message}`);
        }
        break;
      }

      case 'summarize': {
        const text = args.join(' ').trim();
        if (!text) return reply(`Usage: ${settings.prefix}summarize <text>`);
        if (!process.env.OPENAI_API_KEY) return reply('🤖 Summarize needs OPENAI_API_KEY in .env.');
        try {
          const response = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', messages: [{ role: 'system', content: 'Summarize the user text clearly and briefly.' }, { role: 'user', content: text }] }) });
          const data = await response.json();
          if (!response.ok) throw new Error(data?.error?.message || 'Request failed');
          await reply(`📝 *Summary*\n\n${data.choices?.[0]?.message?.content || 'No response.'}`);
        } catch (err) { await reply(`❌ ${err.message}`); }
        break;
      }

      // -----------------------------------------------------------------------
      // SEARCH COMMANDS
      // -----------------------------------------------------------------------

      case 'google': {
        const q = args.join(' ').trim();
        if (!q) return reply(`Usage: ${settings.prefix}google <query>`);
        await reply(`🔎 *Google Search*\nhttps://www.google.com/search?q=${encodeURIComponent(q)}`);
        break;
      }
      case 'ytsearch': {
        const q = args.join(' ').trim();
        if (!q) return reply(`Usage: ${settings.prefix}ytsearch <query>`);
        await reply(`▶️ *YouTube Search*\nhttps://www.youtube.com/results?search_query=${encodeURIComponent(q)}`);
        break;
      }
      case 'github': {
        const q = args.join(' ').trim();
        if (!q) return reply(`Usage: ${settings.prefix}github <query>`);
        await reply(`🐙 *GitHub Search*\nhttps://github.com/search?q=${encodeURIComponent(q)}`);
        break;
      }
      case 'npm': {
        const q = args.join(' ').trim();
        if (!q) return reply(`Usage: ${settings.prefix}npm <package>`);
        await reply(`📦 *NPM*\nhttps://www.npmjs.com/search?q=${encodeURIComponent(q)}`);
        break;
      }
      case 'wiki':
      case 'wikipedia': {
        const q = args.join(' ').trim();
        if (!q) return reply(`Usage: ${settings.prefix}wiki <topic>`);
        await reply(`📖 *Wikipedia*\nhttps://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(q)}`);
        break;
      }
      case 'imgsearch': {
        const q = args.join(' ').trim();
        if (!q) return reply(`Usage: ${settings.prefix}imgsearch <query>`);
        await reply(`🖼️ *Image Search*\nhttps://www.google.com/search?tbm=isch&q=${encodeURIComponent(q)}`);
        break;
      }
      case 'gifsearch': {
        const q = args.join(' ').trim();
        if (!q) return reply(`Usage: ${settings.prefix}gifsearch <query>`);
        await reply(`🎞️ *GIF Search*\nhttps://www.google.com/search?tbm=isch&q=${encodeURIComponent(q + ' gif')}`);
        break;
      }
      case 'say':
        if (!args.length) return reply(`Usage: ${settings.prefix}say <text>`);
        await reply(args.join(' '));
        break;

      // -----------------------------------------------------------------------
      // GENERAL UTILITIES
      // -----------------------------------------------------------------------

      case 'ping': {
        const start = Date.now();

        await reply(
          `⚡ *Pong!* Latency: \`${Date.now() - start}ms\``
        );
        break;
      }

      case 'uptime':
      case 'stats': {
        const uptime = process.uptime();

        const hrs = Math.floor(uptime / 3600);
        const mins = Math.floor((uptime % 3600) / 60);
        const secs = Math.floor(uptime % 60);

        await reply(
          `📊 *48HRS VAULT BOT STATS*\n\n` +
          `⏱️ *Uptime:* ${hrs}h ${mins}m ${secs}s\n` +
          `💎 *Status:* ${
            user.vip?.active ? 'VIP Member' : 'Free Trial'
          }`
        );
        break;
      }

      case 'calc':
        if (!args[0]) {
          return reply(
            'Provide math problem. Example: `.calc 10*5+2`'
          );
        }

        try {
          const expression = args.join('');
          const res = Function(
            `'use strict'; return (${expression})`
          )();

          await reply(`🧮 Result: *${res}*`);
        } catch {
          await reply('❌ Invalid expression.');
        }
        break;

      // -----------------------------------------------------------------------
      // GROUP COMMANDS
      // -----------------------------------------------------------------------

      case 'tagall':
        if (!isGroup) {
          return reply('Group command only.');
        }

        {
          const groupMeta = await botSock.groupMetadata(from);
          const members = groupMeta.participants.map(
            (p) => p.id
          );

          let tagText =
            `🌐 *BOT LINK:* ${BOT_LINK}\n\n` +
            `📢 *TAG ALL*\n` +
            `${args.join(' ') || ''}\n\n`;

          members.forEach((m) => {
            tagText += `@${m.split('@')[0]}\n`;
          });

          await botSock.sendMessage(from, {
            text: tagText,
            mentions: members
          });
        }
        break;

      case 'hidetag':
        if (!isGroup) {
          return reply('Group command only.');
        }

        {
          const gMeta = await botSock.groupMetadata(from);
          const allM = gMeta.participants.map(
            (p) => p.id
          );

          const hideText =
            `🌐 *BOT LINK:* ${BOT_LINK}\n\n` +
            `${args.join(' ') || '📢 Announcement'}`;

          await botSock.sendMessage(from, {
            text: hideText,
            mentions: allM
          });
        }
        break;

      case 'tagadmins':
        if (!isGroup) {
          return reply('Group command only.');
        }

        {
          const adminMeta = await botSock.groupMetadata(from);

          const admins = adminMeta.participants
            .filter((p) => p.admin !== null)
            .map((p) => p.id);

          let adminText =
            `🌐 *BOT LINK:* ${BOT_LINK}\n\n` +
            `🛡️ *GROUP ADMINS*\n\n`;

          admins.forEach((a) => {
            adminText += `@${a.split('@')[0]}\n`;
          });

          await botSock.sendMessage(from, {
            text: adminText,
            mentions: admins
          });
        }
        break;

      case 'open':
        if (!isGroup) {
          return reply('Group command only.');
        }

        await botSock.groupSettingUpdate(
          from,
          'not_announcement'
        );

        await reply(
          '🔓 Group opened to all members.'
        );
        break;

      case 'close':
        if (!isGroup) {
          return reply('Group command only.');
        }

        await botSock.groupSettingUpdate(
          from,
          'announcement'
        );

        await reply(
          '🔒 Group closed to admins only.'
        );
        break;

      case 'add':
        if (!isGroup) {
          return reply('Group command only.');
        }

        if (!args[0]) {
          return reply(
            'Provide phone number to add. Example: `.add 2348012345678`'
          );
        }

        {
          const userToAdd =
            args[0].replace(/[^0-9]/g, '') +
            '@s.whatsapp.net';

          await botSock.groupParticipantsUpdate(
            from,
            [userToAdd],
            'add'
          );

          await reply(
            `✅ Added user: ${args[0]}`
          );
        }
        break;

      case 'remove':
      case 'kick':
        if (!isGroup) {
          return reply('Group command only.');
        }

        {
          let userToRemove;

          if (
            msg.message.extendedTextMessage?.contextInfo
              ?.mentionedJid?.length > 0
          ) {
            userToRemove =
              msg.message.extendedTextMessage.contextInfo
                .mentionedJid[0];
          } else if (args[0]) {
            userToRemove =
              args[0].replace(/[^0-9]/g, '') +
              '@s.whatsapp.net';
          } else {
            return reply(
              'Mention or provide user phone number to remove.'
            );
          }

          await botSock.groupParticipantsUpdate(
            from,
            [userToRemove],
            'remove'
          );

          await reply(
            '❌ User removed successfully.'
          );
        }
        break;

      case 'promote':
        if (!isGroup) {
          return reply('Group command only.');
        }

        {
          let userToPromote;

          if (
            msg.message.extendedTextMessage?.contextInfo
              ?.mentionedJid?.length > 0
          ) {
            userToPromote =
              msg.message.extendedTextMessage.contextInfo
                .mentionedJid[0];
          } else if (args[0]) {
            userToPromote =
              args[0].replace(/[^0-9]/g, '') +
              '@s.whatsapp.net';
          } else {
            return reply(
              'Mention or provide user phone number to promote.'
            );
          }

          await botSock.groupParticipantsUpdate(
            from,
            [userToPromote],
            'promote'
          );

          await reply(
            '👑 User promoted to admin.'
          );
        }
        break;

      case 'demote':
        if (!isGroup) {
          return reply('Group command only.');
        }

        {
          let userToDemote;

          if (
            msg.message.extendedTextMessage?.contextInfo
              ?.mentionedJid?.length > 0
          ) {
            userToDemote =
              msg.message.extendedTextMessage.contextInfo
                .mentionedJid[0];
          } else if (args[0]) {
            userToDemote =
              args[0].replace(/[^0-9]/g, '') +
              '@s.whatsapp.net';
          } else {
            return reply(
              'Mention or provide user phone number to demote.'
            );
          }

          await botSock.groupParticipantsUpdate(
            from,
            [userToDemote],
            'demote'
          );

          await reply(
            '👤 Admin demoted to member.'
          );
        }
        break;

      // -----------------------------------------------------------------------
      // ANTI-LINK
      // -----------------------------------------------------------------------

      case 'antilink':
        if (!isGroup) {
          return reply('Group command only.');
        }

        if (args[0] === 'on') {
          group.antiLink = true;
          await group.save();

          await reply(
            '🛡️ Anti-Link protection ENABLED.'
          );
        } else if (args[0] === 'off') {
          group.antiLink = false;
          await group.save();

          await reply(
            '🛡️ Anti-Link protection DISABLED.'
          );
        } else {
          await reply(
            `Anti-Link Status: ${
              group.antiLink ? '✅ ON' : '❌ OFF'
            }\nUsage: \`.antilink on\` or \`.antilink off\``
          );
        }
        break;

      // -----------------------------------------------------------------------
      // WARN SYSTEM
      // -----------------------------------------------------------------------

      case 'warn':
        if (!isGroup) {
          return reply('Group command only.');
        }

        {
          let warnedUser;

          if (
            msg.message.extendedTextMessage?.contextInfo
              ?.mentionedJid?.length > 0
          ) {
            warnedUser =
              msg.message.extendedTextMessage.contextInfo
                .mentionedJid[0];
          } else if (args[0]) {
            warnedUser =
              args[0].replace(/[^0-9]/g, '') +
              '@s.whatsapp.net';
          } else {
            return reply(
              'Mention or provide user phone number to warn.'
            );
          }

          const currentWarns =
            (group.userWarnings.get(warnedUser) || 0) + 1;

          group.userWarnings.set(
            warnedUser,
            currentWarns
          );

          await group.save();

          if (currentWarns >= group.maxWarnings) {
            await botSock.groupParticipantsUpdate(
              from,
              [warnedUser],
              'remove'
            );

            group.userWarnings.delete(warnedUser);
            await group.save();

            await reply(
              `⚠️ User reached maximum warnings (${group.maxWarnings}) and was removed from the group.`
            );
          } else {
            await reply(
              `⚠️ User warned (${currentWarns}/${group.maxWarnings}).`
            );
          }
        }
        break;

      case 'resetwarn':
        if (!isGroup) {
          return reply('Group command only.');
        }

        {
          let resetUser;

          if (
            msg.message.extendedTextMessage?.contextInfo
              ?.mentionedJid?.length > 0
          ) {
            resetUser =
              msg.message.extendedTextMessage.contextInfo
                .mentionedJid[0];
          } else if (args[0]) {
            resetUser =
              args[0].replace(/[^0-9]/g, '') +
              '@s.whatsapp.net';
          } else {
            return reply(
              'Mention or provide user phone number to reset warnings.'
            );
          }

          group.userWarnings.delete(resetUser);
          await group.save();

          await reply(
            '✅ User warnings reset to 0.'
          );
        }
        break;

      // -----------------------------------------------------------------------
      // UNKNOWN COMMAND
      // -----------------------------------------------------------------------

      default:
        await reply(
          `❌ Unknown command: *${command}*\n\n` +
          `Use *${settings.prefix}menu* to view available commands.`
        );
        break;
    }
  });

  return botSock;
}


// -----------------------------------------------------------------------------
// WEBSITE BOT CONNECTION / PAIRING API
// -----------------------------------------------------------------------------

const normalizePhone = (value) => String(value || '').replace(/[^0-9]/g, '');

app.get('/api/bot/status', requireAuth, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseUid: req.user.uid });
    if (!user) return res.status(404).json({ success:false, message:'User account not found.' });
    const phone = normalizePhone(user.whatsappNumber || user.phoneNumber);
    const session = phone ? await BotSession.findOne({ botPhone: phone }) : null;
    const active = Boolean(session && activeSessions.get(phone)?.sock && session.active);
    return res.json({ success:true, connected:active, phone:phone || null, sessionId:session?.sessionId || null, trial:user.trial, vip:user.vip });
  } catch (e) { return res.status(500).json({ success:false,message:'Unable to load bot status.' }); }
});

app.post('/api/bot/pair', requireAuth, async (req, res) => {
  try {
    const targetPhone = normalizePhone(req.body.whatsappNumber);
    if (targetPhone.length < 10 || targetPhone.length > 15) return res.status(400).json({ success:false,message:'Enter a valid WhatsApp number with country code, e.g. 2348012345678.' });
    const user = await User.findOne({ firebaseUid:req.user.uid });
    if (!user) return res.status(404).json({success:false,message:'User account not found.'});
    if (user.banned) return res.status(403).json({success:false,message:'Your account is banned.'});
    const ownedNumber = normalizePhone(user.whatsappNumber || user.phoneNumber);
    const adminEmails=(process.env.ADMIN_EMAILS||'').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean);
    const isAdmin=adminEmails.includes((req.user.email||'').toLowerCase());
    if (!isAdmin && ownedNumber !== targetPhone) return res.status(403).json({success:false,message:'Connect the WhatsApp number registered on your account.'});
    if (targetPhone === OWNER_NUMBER) return res.status(400).json({success:false,message:'That number is reserved for the bot administrator.'});
    const existing=await BotSession.findOne({botPhone:targetPhone});
    if(existing && existing.active && activeSessions.get(targetPhone)?.sock) return res.status(409).json({success:false,message:'That WhatsApp number is already connected.'});
    const targetUser=await ensureUser(targetPhone,{startTrial:false});
    if (!targetUser.vip?.active && targetUser.trial?.expiresAt && targetUser.trial.expiresAt <= new Date() && targetUser.trialUsed) return res.status(403).json({success:false,message:'Your 24-hour free trial has expired. Upgrade to VIP to reconnect.'});
    const sessionDoc=existing || await BotSession.create({botPhone:targetPhone,ownerPhone:targetPhone,sessionId:`bot_${targetPhone}`,botMode:'public'});
    targetUser.whatsappNumber=targetPhone;targetUser.phoneNumber=targetPhone;targetUser.sessionId=sessionDoc.sessionId;await targetUser.save();
    const sock = await connectToWhatsApp(sessionDoc);

await new Promise(resolve => setTimeout(resolve, 5000));

const code = await sock.requestPairingCode(targetPhone);

    return res.json({success:true,message: targetUser.vip?.active ? 'Pairing code generated.' : 'Pairing code generated. Your 24-hour free trial will be active when the bot connects.',pairingCode:code,phone:targetPhone,trial:targetUser.trial,vip:targetUser.vip,instructions:['Open WhatsApp on the number above.','Go to Settings → Linked Devices → Link a Device.','Choose “Link with phone number instead”.','Enter the pairing code shown here.']});
  } catch (e) { console.error('Website pairing error:',e); return res.status(500).json({success:false,message:e.message||'Unable to generate pairing code.'}); }
});

app.post('/api/bot/disconnect', requireAuth, async (req,res)=>{try{const user=await User.findOne({firebaseUid:req.user.uid});if(!user)return res.status(404).json({success:false,message:'User not found.'});const phone=normalizePhone(user.whatsappNumber||user.phoneNumber);const session=activeSessions.get(phone);if(session?.sock)try{await session.sock.logout();}catch{}activeSessions.delete(phone);await BotSession.updateOne({botPhone:phone},{$set:{active:false}});await User.updateOne({firebaseUid:req.user.uid},{$set:{sessionId:null}});res.json({success:true,message:'Bot disconnected.'});}catch(e){res.status(500).json({success:false,message:'Unable to disconnect bot.'});}});

async function initializeBotSessions() {
  let ownerSession = await BotSession.findOne({ botPhone: OWNER_NUMBER });
  if (!ownerSession) {
    ownerSession = await BotSession.create({
      botPhone: OWNER_NUMBER,
      ownerPhone: OWNER_NUMBER,
      sessionId: 'owner',
      botMode: 'public'
    });
  }

  const sessions = await BotSession.find({ active: true });
  for (const session of sessions) {
    try {
      await connectToWhatsApp(session);
      await sleep(800);
    } catch (err) {
      console.error(`Failed to start session ${session.botPhone}:`, err);
    }
  }
}
// -----------------------------------------------------------------------------
// 3. PAYSTACK WEBHOOK
// -----------------------------------------------------------------------------
// Paystack webhook is handled securely by routes/paymentRoutes.js at /api/payment/webhook.

// -----------------------------------------------------------------------------
// 5. SERVER & DATABASE INITIALIZATION
// -----------------------------------------------------------------------------

connectDatabase()
  .then(async () => {
    console.log("✅ Connected to MongoDB Database");
startTrialJob();
    app.listen(PORT, async () => {
      console.log(`🚀 Web Server running on port ${PORT}`);

      await initializeBotSessions();
    });
  })
  .catch((err) => {
    console.error("❌ Database connection failed:", err);
  });