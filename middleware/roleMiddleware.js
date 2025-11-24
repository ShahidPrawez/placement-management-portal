export const isAdmin = (req, res, next) => {
    if (req.session?.user?.role === 'admin') {
        next();
    } else {
        res.status(403).render('pages/error', { 
            error: 'Access denied. Admin privileges required.' 
        });
    }
};

export const isCompany = (req, res, next) => {
    if (req.session?.user?.role === 'company') {
        next();
    } else {
        res.status(403).render('pages/error', { 
            error: 'Access denied. Company account required.' 
        });
    }
};

export const isStudent = (req, res, next) => {
    if (req.session?.user?.role === 'student') {
        next();
    } else {
        res.status(403).render('pages/error', { 
            error: 'Access denied. Student account required.' 
        });
    }
};

export const checkRole = (roles) => {
    return (req, res, next) => {
        if (!req.session?.user) {
            return res.redirect('/auth/login');
        }
        
        if (roles.includes(req.session.user.role)) {
            next();
        } else {
            res.status(403).render('pages/error', { 
                error: 'Access denied. Insufficient privileges.' 
            });
        }
    };
};