import User from "../models/User.js";
import crypto from "crypto";
import nodemailer from "nodemailer";

// Email transporter configuration
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const showLogin = (req, res) => res.render("pages/login");
export const showRegister = (req, res) => res.render("pages/register");

export const registerUser = async (req, res) => {
  const { name, email, password, role } = req.body;
  try {
    // Basic validation
    if (!name || !email || !password || !role) {
      return res.render("pages/register", { error: "All fields are required" });
    }

    // Check if user already exists
    const existing = await User.findOne({ email });
    if (existing) {
      return res.render("pages/register", { error: "Email already registered" });
    }

    const userData = { name, email, password, role };
    // Role-specific fields
    if (role === 'student') {
      userData.branch = req.body.branch || '';
      userData.year = req.body.year || '';
    }
    if (role === 'company') {
      userData.companyName = req.body.companyName || name;
      userData.industry = req.body.industry || '';
      userData.website = req.body.website || '';
    }

    const user = new User(userData);
    await user.save();
    res.redirect("/auth/login");
  } catch (err) {
    console.error(err);
    res.render("pages/register", { error: "Registration failed" });
  }
};

export const loginUser = async (req, res) => {
  const { email, password, role, adminKey } = req.body;
  try {
    // If admin, validate admin key first
    if (role === 'admin') {
      const correctAdminKey = process.env.ADMIN_KEY;
      if (!adminKey || adminKey !== correctAdminKey) {
        return res.render("pages/login", { error: "Invalid admin key. Access denied." });
      }
    }
    
    const user = await User.findOne({ email, role });
    if (!user || !(await user.comparePassword(password))) {
      return res.render("pages/login", { error: "Invalid credentials" });
    }
    req.session.user = user.toObject();
    
    // Redirect based on role
    switch (user.role) {
      case 'admin':
        res.redirect("/admin/dashboard");
        break;
      case 'company':
        res.redirect("/company/dashboard");
        break;
      case 'student':
        res.redirect("/student/dashboard");
        break;
      default:
        res.redirect("/");
    }
  } catch (err) {
    console.error(err);
    res.render("pages/login", { error: "Login failed. Please try again." });
  }
};

export const logoutUser = (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
};

// Forgot password - show form
export const showForgotPassword = (req, res) => {
  res.render("pages/forgot-password");
};

// Forgot password - send reset email
export const sendResetEmail = async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.render("pages/forgot-password", { error: "Email not found" });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");
    const resetTokenExpiry = Date.now() + 3600000; // 1 hour

    // Save token and expiry to database
    user.resetToken = resetTokenHash;
    user.resetTokenExpiry = resetTokenExpiry;
    await user.save();

    // Send reset email
    const resetLink = `${process.env.SITE_URL}/auth/reset-password/${resetToken}`;
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Password Reset - Placement Management System",
      html: `
        <h2>Password Reset Request</h2>
        <p>You requested a password reset. Click the link below to reset your password:</p>
        <a href="${resetLink}" style="padding:10px 20px;background:#4361ee;color:white;text-decoration:none;border-radius:5px;">Reset Password</a>
        <p>This link will expire in 1 hour.</p>
        <p>If you did not request this, please ignore this email.</p>
      `
    };

    await transporter.sendMail(mailOptions);
    res.render("pages/forgot-password", { success: "Reset link sent to your email. Check your inbox." });
  } catch (err) {
    console.error("Forgot Password Error:", err);
    res.render("pages/forgot-password", { error: "Error sending reset email. Please try again." });
  }
};

// Reset password - show form
export const showResetPassword = async (req, res) => {
  const { token } = req.params;
  try {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({
      resetToken: tokenHash,
      resetTokenExpiry: { $gt: Date.now() }
    });

    if (!user) {
      return res.render("pages/error", { error: "Invalid or expired reset link" });
    }

    res.render("pages/reset-password", { token });
  } catch (err) {
    console.error(err);
    res.render("pages/error", { error: "Error processing reset link" });
  }
};

// Reset password - update password
export const resetPassword = async (req, res) => {
  const { token } = req.params;
  const { password, confirmPassword } = req.body;

  try {
    if (!password || !confirmPassword) {
      return res.render("pages/reset-password", { token, error: "All fields required" });
    }

    if (password !== confirmPassword) {
      return res.render("pages/reset-password", { token, error: "Passwords do not match" });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({
      resetToken: tokenHash,
      resetTokenExpiry: { $gt: Date.now() }
    });

    if (!user) {
      return res.render("pages/error", { error: "Invalid or expired reset link" });
    }

    user.password = password;
    user.resetToken = undefined;
    user.resetTokenExpiry = undefined;
    await user.save();

    res.render("pages/login", { success: "Password reset successful. Please login with your new password." });
  } catch (err) {
    console.error("Reset Password Error:", err);
    res.render("pages/reset-password", { token, error: "Error resetting password" });
  }
};

// Change password - for logged-in users
export const changePassword = async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;

  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Not logged in" });
    }

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: "All fields are required" });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: "New passwords do not match" });
    }

    const user = await User.findById(req.session.user._id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }

    user.password = newPassword;
    await user.save();

    res.json({ success: "Password changed successfully" });
  } catch (err) {
    console.error("Change Password Error:", err);
    res.status(500).json({ error: "Error changing password" });
  }
};
