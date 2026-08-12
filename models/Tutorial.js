import mongoose from "mongoose";

const tutorialSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    videoUrl: { type: String, required: true },
    originalName: { type: String, default: null },
    mimeType: { type: String, default: null },
    published: { type: Boolean, default: true },
    createdBy: { type: String, default: null },
    createdAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

tutorialSchema.index({ published: 1, createdAt: -1 });

export default mongoose.model("Tutorial", tutorialSchema);
