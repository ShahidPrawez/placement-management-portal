import express from 'express';
import { isAdmin } from '../middleware/roleMiddleware.js';
import User from '../models/User.js';
import Job from '../models/Job.js';
import Application from '../models/Application.js';
import Setting from '../models/Setting.js';

const router = express.Router();

// Protect all admin routes
router.use(isAdmin);

// Admin dashboard
router.get('/dashboard', async (req, res) => {
    try {
        // Get users by role
        const students = await User.find({ role: 'student' }).limit(10).sort({ createdAt: -1 });
        const companies = await User.find({ role: 'company' }).limit(10).sort({ createdAt: -1 });
        const admins = await User.find({ role: 'admin' }).limit(10).sort({ createdAt: -1 });
        
        // Get jobs with application counts
        const jobs = await Job.find().sort({ createdAt: -1 }).limit(10);
        const jobsWithCounts = await Promise.all(jobs.map(async (job) => {
            const applicationCount = await Application.countDocuments({ jobId: job._id });
            return {
                ...job.toObject(),
                applications: applicationCount
            };
        }));

        // Get statistics
        const stats = {
            totalStudents: await User.countDocuments({ role: 'student' }),
            totalCompanies: await User.countDocuments({ role: 'company' }),
            totalAdmins: await User.countDocuments({ role: 'admin' }),
            activeJobs: await Job.countDocuments({ status: 'active' }),
            totalPlacements: await Application.countDocuments({ status: 'hired' })
        };

        res.render('pages/admin/dashboard', { 
            user: req.session.user,
            students,
            companies,
            admins,
            jobs: jobsWithCounts,
            stats,
            isImpersonating: !!req.session.adminOriginal
        });
    } catch (err) {
        console.error('Dashboard Error:', err);
        res.render('pages/error', { error: 'Error loading admin dashboard' });
    }
});

// Manage users
router.get('/users', async (req, res) => {
    try {
        const users = await User.find({}).sort({ createdAt: -1 });
        res.render('pages/admin/users', { users, user: req.session.user });
    } catch (err) {
        console.error(err);
        res.render('pages/error', { error: 'Error loading users' });
    }
});

// Add new user
router.post('/users/add', async (req, res) => {
    try {
        const { name, email, role, password } = req.body;
        
        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.render('pages/admin/dashboard', {
                user: req.session.user,
                error: 'User with this email already exists'
            });
        }

        const newUser = new User({
            name,
            email,
            role,
            password,
            status: 'active'
        });

        await newUser.save();
        res.redirect('/admin/dashboard?success=User+created+successfully');
    } catch (err) {
        console.error('Add User Error:', err);
        res.render('pages/admin/dashboard', {
            user: req.session.user,
            error: 'Failed to create user: ' + (err.message || 'Unknown error')
        });
    }
});

// Delete user (DELETE method)
router.delete('/users/:id', async (req, res) => {
    try {
        const userId = req.params.id;
        
        // Prevent admin from deleting themselves
        if (userId === req.session.user._id.toString()) {
            return res.status(400).json({ error: 'You cannot delete your own account' });
        }

        // Delete all applications associated with this user
        if (req.query.role === 'student') {
            await Application.deleteMany({ studentId: userId });
        } else if (req.query.role === 'company') {
            // Delete all jobs and applications for this company
            const jobs = await Job.find({ companyId: userId });
            const jobIds = jobs.map(j => j._id);
            await Application.deleteMany({ jobId: { $in: jobIds } });
            await Job.deleteMany({ companyId: userId });
        }

        await User.findByIdAndDelete(userId);
        res.json({ message: 'User deleted successfully' });
    } catch (err) {
        console.error('Delete User Error:', err);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// View single user details
router.get('/users/:id', async (req, res) => {
    try {
        const userDoc = await User.findById(req.params.id).lean();
        if (!userDoc) return res.render('pages/error', { error: 'User not found' });
        res.render('pages/admin/user', { user: req.session.user, userDoc });
    } catch (err) {
        console.error(err);
        res.render('pages/error', { error: 'Error loading user' });
    }
});

// Edit user routes
router.get('/users/:id/edit', async (req, res) => {
    try {
        const userToEdit = await User.findById(req.params.id).lean();
        if (!userToEdit) return res.render('pages/error', { error: 'User not found' });
        res.render('pages/admin/edit-user', { user: req.session.user, userToEdit });
    } catch (err) {
        console.error(err);
        res.render('pages/error', { error: 'Error loading user for editing' });
    }
});

router.post('/users/:id/edit', async (req, res) => {
    try {
        const { name, email, role, status, companyName, branch, year } = req.body;
        const updates = { name, email, role, status, companyName, branch, year };
        
        await User.findByIdAndUpdate(req.params.id, updates);
        
        res.redirect('/admin/users');
    } catch (err) {
        console.error('Update User Error:', err);
        res.redirect(`/admin/users/${req.params.id}/edit?error=Failed+to+update`);
    }
});

// Impersonate a user (admin will become that user in session)
router.get('/users/impersonate/:id', async (req, res) => {
    try {
        const target = await User.findById(req.params.id).lean();
        if (!target) return res.render('pages/error', { error: 'User not found' });

        // Save original admin info so we can restore later
        req.session.adminOriginal = req.session.user;
        // Set session user to the target
        req.session.user = target;
        res.redirect('/dashboard');
    } catch (err) {
        console.error(err);
        res.render('pages/error', { error: 'Error impersonating user' });
    }
});

// Stop impersonation and restore admin session
router.get('/impersonate/stop', async (req, res) => {
    try {
        if (req.session.adminOriginal) {
            req.session.user = req.session.adminOriginal;
            delete req.session.adminOriginal;
        }
        res.redirect('/admin/dashboard');
    } catch (err) {
        console.error(err);
        res.render('pages/error', { error: 'Error stopping impersonation' });
    }
});

// Toggle user's active status (active/inactive)
router.post('/users/toggle-status/:id', async (req, res) => {
    try {
        const u = await User.findById(req.params.id);
        if (!u) return res.status(404).render('pages/error', { error: 'User not found' });
        u.status = u.status === 'active' ? 'inactive' : 'active';
        await u.save();
        res.redirect('/admin/users');
    } catch (err) {
        console.error(err);
        res.render('pages/error', { error: 'Error updating status' });
    }
});

// Manage jobs
router.get('/jobs', async (req, res) => {
    try {
        const jobs = await Job.find().sort({ createdAt: -1 }).populate('companyId', 'companyName name');
        
        const jobsWithCounts = await Promise.all(jobs.map(async (job) => {
            const applicationCount = await Application.countDocuments({ jobId: job._id });
            return {
                ...job.toObject(),
                applications: applicationCount
            };
        }));

        res.render('pages/admin/jobs', { 
            jobs: jobsWithCounts, 
            user: req.session.user 
        });
    } catch (err) {
        console.error(err);
        res.render('pages/error', { error: 'Error loading jobs' });
    }
});

// Delete job

router.delete('/jobs/:id', async (req, res) => {

    try {

        const jobId = req.params.id;

        

        // Delete all applications for this job

        await Application.deleteMany({ jobId });

        

        // Delete the job

        await Job.findByIdAndDelete(jobId);

        

        res.json({ message: 'Job deleted successfully' });

    } catch (err) {

        console.error('Delete Job Error:', err);

        res.status(500).json({ error: 'Failed to delete job' });

    }

});



// Edit job routes

router.get('/jobs/:id/edit', async (req, res) => {

    try {

        const job = await Job.findById(req.params.id).lean();

        if (!job) return res.render('pages/error', { error: 'Job not found' });

        res.render('pages/admin/edit-job', { user: req.session.user, job });

    } catch (err) {

        console.error(err);

        res.render('pages/error', { error: 'Error loading job for editing' });

    }

});



router.post('/jobs/:id/edit', async (req, res) => {

    try {

        await Job.findByIdAndUpdate(req.params.id, req.body);

        res.redirect('/admin/jobs');

    } catch (err) {

        console.error('Update Job Error:', err);

        res.redirect(`/admin/jobs/${req.params.id}/edit?error=Failed+to+update`);

    }

});



// View single job details

router.get('/jobs/:id', async (req, res) => {

    try {

        const job = await Job.findById(req.params.id).populate('companyId', 'companyName name email');

        if (!job) return res.render('pages/error', { error: 'Job not found' });

        

        const applications = await Application.find({ jobId: job._id })

            .populate('studentId', 'name email branch year');

        

        res.render('pages/admin/job-details', { 

            job, 

            applications, 

            user: req.session.user 

        });

    } catch (err) {

        console.error(err);

        res.render('pages/error', { error: 'Error loading job' });

    }

});



// Manage Companies

router.get('/companies', async (req, res) => {

    try {

        const companies = await User.find({ role: 'company' }).sort({ createdAt: -1 });

        res.render('pages/admin/companies', { companies, user: req.session.user });

    } catch (err) {

        console.error(err);

        res.render('pages/error', { error: 'Error loading companies' });

    }

});



// Manage Students

router.get('/students', async (req, res) => {

    try {

        const students = await User.find({ role: 'student' }).sort({ createdAt: -1 });

        res.render('pages/admin/students', { students, user: req.session.user });

    } catch (err) {

        console.error(err);

        res.render('pages/error', { error: 'Error loading students' });

    }

});



// Manage Applications



router.get('/applications', async (req, res) => {



    try {



        const applications = await Application.find()



            .populate('studentId', 'name email')



            .populate('jobId', 'title')



            .populate('companyId', 'companyName name')



            .sort({ appliedDate: -1 });



        res.render('pages/admin/applications', { applications, user: req.session.user });



    } catch (err) {



        console.error(err);



        res.render('pages/error', { error: 'Error loading applications' });



    }



});







// Settings routes



router.get('/settings', async (req, res) => {



    try {



        const settingsDocs = await Setting.find();



        const settings = settingsDocs.reduce((acc, setting) => {



            acc[setting.key] = setting.value;



            return acc;



        }, {});



        res.render('pages/admin/settings', { user: req.session.user, settings });



    } catch (err) {



        console.error(err);



        res.render('pages/error', { error: 'Error loading settings' });



    }



});







router.post('/settings', async (req, res) => {



    try {



        const { registrationDeadline } = req.body;



        



        await Setting.findOneAndUpdate(



            { key: 'registrationDeadline' },



            { 



                value: registrationDeadline,



                name: 'Student Registration Deadline',



                description: 'The last date for students to register on the portal.'



            },



            { upsert: true }



        );







        res.redirect('/admin/settings?success=Settings+updated');



    } catch (err) {



        console.error('Settings Update Error:', err);



        res.redirect('/admin/settings?error=Failed+to+update');



    }



});







export default router;




