import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  role: { type: String, enum: ["student", "company", "admin"], default: "student" },
  // Student specific fields
  branch: String,
  year: String,
  rollNumber: String,
  cgpa: Number,
  skills: [String],
  resume: String,
  // Company specific fields
  companyName: String,
  industry: String,
  website: String,
  description: String,
  location: String,
  // Common fields
  phone: String,
  status: { type: String, default: 'active' },
  profilePicture: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  // Password reset fields
  resetToken: String,
  resetTokenExpiry: Date
});

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function (password) {
  return bcrypt.compare(password, this.password);
};

export default mongoose.model("User", userSchema);
