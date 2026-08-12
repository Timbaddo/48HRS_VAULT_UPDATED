import express from "express";
import crypto from "crypto";
import axios from "axios";
import multer from "multer";
import fs from "fs";
import path from "path";
import Payment from "../models/Payment.js";
import User from "../models/User.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { notifyPaymentReceived, notifyPaymentApproved, notifyVipActivated } from "../utils/notificationHelper.js";

const router=express.Router();
const PRICES={"1_MONTH":500,"LIFETIME":2000};
const METHODS={OPAY:{name:"OPay",accountName:"Timothy",accountNumber:"9024594961"},PALMPAY:{name:"PalmPay",accountName:"Timothy",accountNumber:"2917796858"},BINANCE:{name:"Binance",uid:"948905475"},BYBIT:{name:"Bybit",uid:"232942065"}};
const normalizePhone=v=>String(v||"").replace(/[^0-9]/g,"");
const uploadDir=path.join(process.cwd(),"uploads","payments");fs.mkdirSync(uploadDir,{recursive:true});
const upload=multer({storage:multer.diskStorage({destination:(_r,_f,cb)=>cb(null,uploadDir),filename:(_r,f,cb)=>cb(null,`${Date.now()}-${Math.random().toString(36).slice(2,8)}${path.extname(f.originalname).toLowerCase()}`)}),limits:{fileSize:8*1024*1024},fileFilter:(_r,f,cb)=>cb(null,["image/jpeg","image/png","image/webp"].includes(f.mimetype))});

async function findRecipient(phone){const n=normalizePhone(phone);return User.findOne({$or:[{whatsappNumber:n},{phoneNumber:n}]});}
async function activateRecipient(phone,plan){const n=normalizePhone(phone);let user=await findRecipient(n);if(!user){const ref="REF"+Math.random().toString(36).slice(2,8).toUpperCase();user=await User.create({phoneNumber:n,whatsappNumber:n,refCode:ref,referral:{code:ref},trial:{active:false,startedAt:null,expiresAt:null},trialUsed:false});}const now=new Date();if(user.vip?.plan === "LIFETIME") { user.vip.active=true; user.vip.expiresAt=null; } else { user.vip.active=true; user.vip.plan=plan; user.vip.activatedAt=user.vip.activatedAt||now; user.vip.expiresAt=plan==="LIFETIME"?null:new Date((user.vip.expiresAt&&user.vip.expiresAt>now?user.vip.expiresAt:now).getTime()+30*86400000); } user.trial.active=false;await user.save();return user;}

router.get("/methods",requireAuth,async(_req,res)=>res.json({success:true,prices:PRICES,methods:METHODS,instructions:["Choose the plan you want.","Enter the WhatsApp number that should receive VIP, including country code.","If you are buying for someone else, enter their WhatsApp number.","For manual payment, transfer the exact amount and upload a clear screenshot.","An Admin will review the payment before VIP is activated.","After approval, the recipient can connect the bot and receive a real pairing code."]}));

router.post("/create",requireAuth,upload.single("proof"),async(req,res)=>{try{
 const {recipientWhatsApp,plan,paymentType,method}=req.body;const recipient=normalizePhone(recipientWhatsApp);if(!recipient||recipient.length<10||recipient.length>15)return res.status(400).json({success:false,message:"Enter a valid WhatsApp number with country code."});if(!PRICES[plan])return res.status(400).json({success:false,message:"Only 1 Month and Lifetime plans are available for purchase."});
 const user=await User.findOne({firebaseUid:req.user.uid});if(!user)return res.status(404).json({success:false,message:"User account not found."});if(user.banned)return res.status(403).json({success:false,message:"Your account is banned."});
 if(paymentType==="MANUAL" && !METHODS[method])return res.status(400).json({success:false,message:"Select a valid manual payment method."});
 if(paymentType==="MANUAL" && !req.file)return res.status(400).json({success:false,message:"Upload a clear payment screenshot for Admin review."});
 const payment=await Payment.create({userId:req.user.uid,buyerEmail:req.user.email||null,recipientWhatsApp:recipient,plan,amount:PRICES[plan],currency:"NGN",paymentType,method:paymentType==="PAYSTACK"?"PAYSTACK":method,proofImage:req.file?`/uploads/payments/${req.file.filename}`:null,status:"PENDING"});
 if(paymentType==="PAYSTACK"){
   if(!process.env.PAYSTACK_SECRET_KEY)return res.status(503).json({success:false,message:"Paystack is not configured yet."});
   const response=await axios.post("https://api.paystack.co/transaction/initialize",{email:req.user.email,amount:PRICES[plan]*100,currency:"NGN",callback_url:`${process.env.BOT_LINK||"https://48hrsvault.com"}/payment-success.html`,metadata:{paymentId:String(payment._id),recipientWhatsApp:recipient,plan}}, {headers:{Authorization:`Bearer ${process.env.PAYSTACK_SECRET_KEY}`,"Content-Type":"application/json"}});
   payment.reference=response.data?.data?.reference||null;await payment.save();return res.status(201).json({success:true,message:"Paystack checkout created.",paymentId:payment._id,reference:payment.reference,authorization_url:response.data.data.authorization_url,amount:PRICES[plan]});
 }
 try{await notifyPaymentReceived({userId:req.user.uid,amount:PRICES[plan]});}catch(e){console.error(e.message)}
 res.status(201).json({success:true,message:"Manual payment submitted. An Admin will review it before VIP is activated.",paymentId:payment._id,amount:PRICES[plan]});
 }catch(e){if(req.file?.path&&!fs.existsSync(req.file.path)){} console.error("Create payment error",e.response?.data||e);res.status(500).json({success:false,message:e.response?.data?.message||"Failed to create payment."});}});

router.get("/status/:paymentId",requireAuth,async(req,res)=>{try{const p=await Payment.findById(req.params.paymentId);if(!p)return res.status(404).json({success:false,message:"Payment not found."});if(p.userId!==req.user.uid)return res.status(403).json({success:false,message:"Not authorized."});res.json({success:true,payment:p});}catch(e){res.status(500).json({success:false,message:"Failed to get payment status."});}});

router.post("/webhook",async(req,res)=>{try{const secret=process.env.PAYSTACK_SECRET_KEY;if(!secret)return res.sendStatus(500);const signature=crypto.createHmac("sha512",secret).update(req.rawBody||Buffer.from(JSON.stringify(req.body))).digest("hex");if(signature!==req.headers["x-paystack-signature"])return res.sendStatus(401);if(req.body.event!=="charge.success")return res.sendStatus(200);const data=req.body.data||{};const paymentId=data.metadata?.paymentId;const payment=paymentId?await Payment.findById(paymentId):await Payment.findOne({reference:data.reference});if(!payment)return res.sendStatus(200);if(payment.status==="APPROVED")return res.sendStatus(200);if(Number(data.amount)!==payment.amount*100)return res.sendStatus(400);const recipient=await activateRecipient(payment.recipientWhatsApp,payment.plan);payment.status="APPROVED";payment.paymentType="PAYSTACK";payment.method="PAYSTACK";payment.reference=data.reference||payment.reference;payment.reviewedBy="PAYSTACK";payment.reviewedAt=new Date();payment.recipientUserId=recipient.firebaseUid||null;await payment.save();if(recipient.firebaseUid){try{await notifyPaymentApproved({userId:recipient.firebaseUid,plan:payment.plan});await notifyVipActivated({userId:recipient.firebaseUid,plan:payment.plan});}catch(e){console.error(e.message)}}return res.sendStatus(200);}catch(e){console.error("Paystack webhook error",e);return res.sendStatus(500);}});

export default router;
