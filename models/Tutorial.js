import mongoose from "mongoose"; 
const tutorialSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  videoUrl: { type: String, required: true },
  category: { type: String, default: "General" },
  isVipOnly: { type: Boolean, default: false }
}, { timestamps: true });
export default mongoose.models.Tutorial || mongoose.model("Tutorial", tutorialSchema);
 