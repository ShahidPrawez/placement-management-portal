export const isAuthenticated = (req, res, next) => {
  if (req.session && req.session.user) return next();
  return res.redirect('/auth/login');
};

export const requireRole = (role) => (req, res, next) => {
  if (req.session?.user && req.session.user.role === role) return next();
  return res.status(403).send('Forbidden');
};
