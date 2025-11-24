import express from "express";
const router = express.Router();

router.get("/", (req, res) => res.render("pages/home"));
router.get('/dashboard', (req, res) => {
	const user = req.session?.user;
	if (!user) {
		// If not logged in, render generic dashboard (home) or redirect to login
		return res.redirect('/auth/login');
	}

	// Redirect based on role to keep controllers single-responsibility
	if (user.role === 'company') return res.redirect('/company/dashboard');
	if (user.role === 'student') return res.redirect('/student/dashboard');
	if (user.role === 'admin') return res.redirect('/admin/dashboard');

	// fallback
	res.redirect('/');
});

export default router;
