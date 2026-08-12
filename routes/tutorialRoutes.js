import express from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import Tutorial from "../models/Tutorial.js";
import { requireAuth, requireAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

const useCloudinary = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (useCloudinary) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}
const uploadDir = path.join(process.cwd(), "uploads", "tutorials");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeBase = path
      .basename(file.originalname, ext)
      .replace(/[^a-z0-9-_]/gi, "-")
      .slice(0, 70) || "tutorial";
    cb(null, `${Date.now()}-${safeBase}${ext}`);
  }
});

const allowedVideoTypes = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-matroska"
]);

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!allowedVideoTypes.has(file.mimetype)) {
      return cb(new Error("Only MP4, WebM, MOV or MKV videos are allowed."));
    }
    cb(null, true);
  }
});

// Public: published tutorials
router.get("/", async (_req, res) => {
  try {
    const tutorials = await Tutorial.find({ published: true })
      .select("title description videoUrl originalName createdAt")
      .sort({ createdAt: -1 });

    return res.json({ success: true, tutorials });
  } catch (error) {
    console.error("Get tutorials error:", error);
    return res.status(500).json({ success: false, message: "Unable to load tutorials." });
  }
});

// Owner: all tutorials
router.get("/all", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const tutorials = await Tutorial.find().sort({ createdAt: -1 });
    return res.json({ success: true, tutorials });
  } catch (error) {
    console.error("Get all tutorials error:", error);
    return res.status(500).json({ success: false, message: "Unable to load tutorials." });
  }
});

// Owner: upload tutorial
router.post("/upload", requireAuth, requireAdmin, upload.single("video"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Choose a video first." });
    }

    const title = String(req.body.title || "").trim();
    const description = String(req.body.description || "").trim();

    if (!title) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, message: "Tutorial title is required." });
    }

    let videoUrl = `/uploads/tutorials/${req.file.filename}`;

    if (useCloudinary) {
      const uploaded = await cloudinary.uploader.upload(req.file.path, {
        resource_type: "video",
        folder: "48hrs-vault/tutorials"
      });
      videoUrl = uploaded.secure_url;
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    }

    const tutorial = await Tutorial.create({
      title,
      description,
      videoUrl,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      published: true,
      createdBy: req.user.email || req.user.uid
    });

    return res.status(201).json({
      success: true,
      message: "Tutorial uploaded and published.",
      tutorial
    });
  } catch (error) {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error("Upload tutorial error:", error);
    return res.status(500).json({ success: false, message: error.message || "Unable to upload tutorial." });
  }
});

// Owner: publish/unpublish
router.patch("/:id/toggle", requireAuth, requireAdmin, async (req, res) => {
  try {
    const tutorial = await Tutorial.findById(req.params.id);
    if (!tutorial) return res.status(404).json({ success: false, message: "Tutorial not found." });
    tutorial.published = !tutorial.published;
    await tutorial.save();
    return res.json({ success: true, message: tutorial.published ? "Tutorial published." : "Tutorial hidden.", tutorial });
  } catch (error) {
    console.error("Toggle tutorial error:", error);
    return res.status(500).json({ success: false, message: "Unable to update tutorial." });
  }
});

// Owner: delete
router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const tutorial = await Tutorial.findById(req.params.id);
    if (!tutorial) return res.status(404).json({ success: false, message: "Tutorial not found." });

    if (tutorial.videoUrl?.startsWith("/uploads/tutorials/")) {
      const filePath = path.join(process.cwd(), tutorial.videoUrl.replace(/^\//, ""));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await Tutorial.findByIdAndDelete(req.params.id);
    return res.json({ success: true, message: "Tutorial deleted." });
  } catch (error) {
    console.error("Delete tutorial error:", error);
    return res.status(500).json({ success: false, message: "Unable to delete tutorial." });
  }
});

export default router;
