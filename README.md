# 48HRS VAULT — Consolidated Launch Build

## Main plans
- 24-hour free trial when a user connects the bot without VIP.
- 1 Month VIP: ₦500.
- Lifetime VIP: ₦2,000.
- 7-day access is only a free coupon reward, not a paid plan.

## Manual payment accounts
- OPay — Timothy — 9024594961
- PalmPay — Timothy — 2917796858
- Binance — UID 948905475
- Bybit — UID 232942065

Manual-payment flow: choose plan → enter recipient WhatsApp number with country code → transfer exact amount → upload proof → Admin reviews → approval activates VIP for the recipient → recipient can connect the bot and receive a real Baileys pairing code.

## Admin role
There is one website privileged role: ADMIN. Configure the three admin emails in `ADMIN_EMAILS` in `.env`.

## Official platforms popup
This is the only website popup. It is shown to every authenticated user at most once per 24 hours.

## WhatsApp connection
Users connect from Dashboard → Connect Your WhatsApp Bot. The server validates the account's WhatsApp number and generates a real Baileys pairing code.

## Environment
Copy `.env.example` to `.env` and fill in real credentials. Never put Firebase Admin private keys, MongoDB credentials or Paystack secrets in frontend files or public repositories.

## Production notes
- Set Paystack webhook URL to `/api/payment/webhook`.
- Use HTTPS in production.
- Configure persistent storage or Cloudinary for tutorial videos.
- Install dependencies with `npm install` and run with `npm start`.
