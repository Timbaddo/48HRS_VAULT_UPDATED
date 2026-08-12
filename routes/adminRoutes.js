import express from "express";
import User from "../models/User.js";
import Payment from "../models/Payment.js";
import { requireAuth, requireAdmin } from "../middleware/authMiddleware.js";
import { notifyPaymentApproved, notifyVipActivated } from "../utils/notificationHelper.js";

const router = express.Router();
router.use(requireAuth, requireAdmin);

const PLAN_DAYS = { "1_MONTH": 30 };
const normalizePhone = v => String(v || "").replace(/[^0-9]/g, "");

async function findRecipient(phone) {
  const normalized = normalizePhone(phone);
  let user = await User.findOne({ $or: [{ whatsappNumber: normalized }, { phoneNumber: normalized }] });
  if (!user) {
    const ref = "REF" + Math.random().toString(36).slice(2, 8).toUpperCase();
    user = await User.create({ phoneNumber: normalized, whatsappNumber: normalized, refCode: ref, referral: { code: ref }, trial: { active: false, startedAt: null, expiresAt: null }, trialUsed: false });
  }
  return user;
}

router.get("/me", async (req, res) => res.json({ success: true, authorized: true, admin: true, user: { uid: req.user.uid, email: req.user.email, role: "ADMIN" } }));

router.get("/stats", async (_req, res) => {
  try {
    const [totalUsers, activeVipUsers, activeTrials, bannedUsers, pendingPayments] = await Promise.all([
      User.countDocuments(), User.countDocuments({ "vip.active": true }), User.countDocuments({ "trial.active": true, "trial.expiresAt": { $gt: new Date() } }), User.countDocuments({ banned: true }), Payment.countDocuments({ status: "PENDING" })
    ]);
    res.json({ success: true, stats: { totalUsers, activeVipUsers, activeTrials, bannedUsers, pendingPayments } });
  } catch (e) { res.status(500).json({ success:false, message:"Unable to load admin statistics." }); }
});

router.get("/users", async (_req,res)=>{ try { const users=await User.find().select("-__v").sort({createdAt:-1}); res.json({success:true,count:users.length,users}); } catch(e){res.status(500).json({success:false,message:"Unable to load users."});} });
router.get("/users/search", async (req,res)=>{ try { const q=(req.query.q||"").trim(); if(!q)return res.status(400).json({success:false,message:"Search query is required."}); const users=await User.find({$or:[{email:{$regex:q,$options:"i"}},{name:{$regex:q,$options:"i"}},{whatsappNumber:{$regex:q,$options:"i"}},{firebaseUid:q}]}).select("-__v"); res.json({success:true,count:users.length,users}); } catch(e){res.status(500).json({success:false,message:"Unable to search users."});} });
router.patch("/users/:id/ban", async(req,res)=>{try{const u=await User.findById(req.params.id);if(!u)return res.status(404).json({success:false,message:"User not found."});if(u.role==="ADMIN")return res.status(403).json({success:false,message:"Admins cannot be banned."});u.banned=true;await u.save();res.json({success:true,message:"User banned successfully."});}catch(e){res.status(500).json({success:false,message:"Unable to ban user."});}});
router.patch("/users/:id/unban", async(req,res)=>{try{const u=await User.findById(req.params.id);if(!u)return res.status(404).json({success:false,message:"User not found."});u.banned=false;await u.save();res.json({success:true,message:"User unbanned successfully."});}catch(e){res.status(500).json({success:false,message:"Unable to unban user."});}});
router.patch("/users/:id/vip", async(req,res)=>{try{const {plan}=req.body;if(!["1_MONTH","LIFETIME","7_DAYS"].includes(plan))return res.status(400).json({success:false,message:"Invalid VIP reward."});const u=await User.findById(req.params.id);if(!u)return res.status(404).json({success:false,message:"User not found."});const now=new Date();u.vip.active=true;u.vip.plan=plan;u.vip.activatedAt=now;u.vip.expiresAt=plan==="LIFETIME"?null:new Date(now.getTime()+(plan==="7_DAYS"?7:30)*86400000);u.trial.active=false;await u.save();res.json({success:true,message:`${plan} access activated.`,user:u});}catch(e){res.status(500).json({success:false,message:"Unable to activate access."});}});
router.patch("/users/:id/remove-vip", async(req,res)=>{try{const u=await User.findById(req.params.id);if(!u)return res.status(404).json({success:false,message:"User not found."});u.vip={active:false,plan:"NONE",activatedAt:null,expiresAt:null};await u.save();res.json({success:true,message:"VIP access removed."});}catch(e){res.status(500).json({success:false,message:"Unable to remove VIP."});}});

router.get("/payments", async(req,res)=>{try{const filter=req.query.status?{status:req.query.status}:{};const payments=await Payment.find(filter).sort({createdAt:-1}).limit(200);res.json({success:true,payments});}catch(e){res.status(500).json({success:false,message:"Unable to load payments."});}});

router.patch("/payments/:id/approve", async(req,res)=>{
  try{
    const payment=await Payment.findById(req.params.id); if(!payment)return res.status(404).json({success:false,message:"Payment not found."});
    if(payment.status!=="PENDING")return res.status(400).json({success:false,message:"Payment has already been reviewed."});
    const recipient=await findRecipient(payment.recipientWhatsApp);
    const now=new Date(); if(recipient.vip?.plan !== "LIFETIME"){ recipient.vip.active=true; recipient.vip.plan=payment.plan; recipient.vip.activatedAt=recipient.vip.activatedAt||now; recipient.vip.expiresAt=payment.plan==="LIFETIME"?null:new Date((recipient.vip.expiresAt&&recipient.vip.expiresAt>now?recipient.vip.expiresAt:now).getTime()+30*86400000); } else { recipient.vip.active=true; recipient.vip.plan="LIFETIME"; recipient.vip.expiresAt=null; } recipient.trial.active=false; await recipient.save();
    payment.status="APPROVED";payment.reviewedBy=req.user.email;payment.reviewedAt=now;payment.recipientUserId=recipient.firebaseUid||null;payment.adminNote=String(req.body.note||"").trim()||null;await payment.save();
    if(recipient.firebaseUid){try{await notifyPaymentApproved({userId:recipient.firebaseUid,plan:payment.plan});await notifyVipActivated({userId:recipient.firebaseUid,plan:payment.plan});}catch(e){console.error("Payment approval notification:",e.message);}}
    res.json({success:true,message:"Payment approved and VIP activated.",payment,recipient});
  }catch(e){console.error(e);res.status(500).json({success:false,message:"Unable to approve payment."});}
});
router.patch("/payments/:id/reject", async(req,res)=>{try{const payment=await Payment.findById(req.params.id);if(!payment)return res.status(404).json({success:false,message:"Payment not found."});if(payment.status!=="PENDING")return res.status(400).json({success:false,message:"Payment has already been reviewed."});payment.status="REJECTED";payment.reviewedBy=req.user.email;payment.reviewedAt=new Date();payment.adminNote=String(req.body.note||"Payment rejected.").trim();await payment.save();res.json({success:true,message:"Payment rejected.",payment});}catch(e){res.status(500).json({success:false,message:"Unable to reject payment."});}});

export default router;
