import express from "express";
import {
	showLogin,
	showRegister,
	registerUser,
	loginUser,
	logoutUser,
	showForgotPassword,
	sendResetEmail,
	showResetPassword,
	resetPassword,
	changePassword,
} from "../controllers/authController.js";

const router = express.Router();

// Auth routes
router.get("/login", showLogin);
router.get("/register", showRegister);
router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/logout", logoutUser);
router.get("/logout", logoutUser);

// Forgot password routes
router.get("/forgot-password", showForgotPassword);
router.post("/forgot-password", sendResetEmail);
router.get("/reset-password/:token", showResetPassword);
router.post("/reset-password/:token", resetPassword);

// Change password (for logged-in users)
router.post("/change-password", changePassword);

export default router;
