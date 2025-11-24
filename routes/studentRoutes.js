import express from "express";
import { isStudent } from "../middleware/roleMiddleware.js";
import Application from "../models/Application.js";
import Job from "../models/Job.js";
import User from "../models/User.js";
import path from "path";

const router = express.Router();

// Protect all student routes
router.use(isStudent);

// Student Dashboard
router.get('/dashboard', async (req, res) => {
    try {
        const user = req.session.user;
        
        if (!user) {
            return res.redirect('/auth/login');
        }

        // Get recent applications
        const applications = await Application.find({ 
            studentId: user._id 
        })
        .populate('jobId')
        .sort({ appliedDate: -1 })
        .limit(5);

        // Get recommended jobs
        const recentJobs = await Job.find({ 
            status: 'active',
            deadline: { $gt: new Date() }
        })
        .sort({ createdAt: -1 })
        .limit(6);

        // Get application stats
        const stats = {
            totalApplications: await Application.countDocuments({ 
                studentId: user._id 
            }) || 0,
            shortlisted: await Application.countDocuments({ 
                studentId: user._id, 
                status: 'shortlisted' 
            }) || 0,
            pendingInterviews: await Application.countDocuments({ 
                studentId: user._id,
                status: 'shortlisted',
                interviewDate: { $ne: null }
            }) || 0,
            offers: await Application.countDocuments({ 
                studentId: user._id,
                status: 'hired'
            }) || 0
        };

        // Calculate profile completion percentage
        const requiredFields = [
            'name',    // Basic info
            'email',
            'phone',
            'branch',  // Academic info
            'year',
            'rollNumber',
            'cgpa',
            'skills',  // Professional info
            'resume'
        ];
        
        const completedFields = requiredFields.filter(field => {
            if (field === 'skills') {
                return user[field] && Array.isArray(user[field]) && user[field].length > 0;
            }
            return user[field] && user[field].toString().trim() !== '';
        });

        const profileCompletion = Math.round((completedFields.length / requiredFields.length) * 100);

        // Get upcoming interviews
        const upcomingInterviews = await Application.find({
            studentId: user._id,
            interviewDate: { $gte: new Date() }
        })
        .populate('jobId')
        .sort({ interviewDate: 1 })
        .limit(5);

        // Map applications to match template expectations
        const mappedApplications = applications.map(app => ({
            _id: app._id,
            job: app.jobId ? {
                _id: app.jobId._id,
                title: app.jobId.title,
                companyName: app.jobId.companyName
            } : null,
            appliedDate: app.appliedDate,
            status: app.status ? app.status.charAt(0).toUpperCase() + app.status.slice(1) : 'Pending'
        }));

        // Map interviews to match template expectations
        const mappedInterviews = upcomingInterviews.map(interview => ({
            _id: interview._id,
            job: interview.jobId ? {
                _id: interview.jobId._id,
                title: interview.jobId.title,
                companyName: interview.jobId.companyName
            } : null,
            scheduledAt: interview.interviewDate,
            type: interview.interviewMode ? interview.interviewMode.toLowerCase() : 'offline',
            meetingLink: interview.interviewLink
        }));

        res.render('pages/student/dashboard', {
            user,
            recentApplications: mappedApplications,
            recentJobs: recentJobs || [],
            stats,
            profileCompletion: profileCompletion || 0,
            upcomingInterviews: mappedInterviews
        });
    } catch (err) {
        console.error('Dashboard Error:', err);
        res.render('pages/error', { error: err.message || 'Error loading dashboard' });
    }
});

// View single job details
router.get('/jobs/:jobId', async (req, res) => {
    try {
        const job = await Job.findById(req.params.jobId);
        if (!job || job.status !== 'active') {
            return res.render('pages/error', { error: 'Job not found or no longer active' });
        }

        // Check if student has already applied
        const hasApplied = await Application.findOne({
            studentId: req.session.user._id,
            jobId: job._id
        });

        res.render('pages/student/job-details', {
            user: req.session.user,
            job,
            hasApplied: !!hasApplied
        });
    } catch (err) {
        console.error(err);
        res.render('pages/error', { error: 'Error loading job details' });
    }
});

// Jobs listing
router.get('/jobs', async (req, res) => {
    try {
        const jobs = await Job.find({ 
            status: 'active',
            deadline: { $gt: new Date() }
        }).sort({ createdAt: -1 });
        
        res.render('pages/student/jobs', { 
            user: req.session.user,
            jobs 
        });
    } catch (err) {
        console.error(err);
        res.render('pages/error', { error: 'Error loading jobs' });
    }
});

// Apply for job
router.post('/jobs/:jobId/apply', async (req, res) => {
    try {
        const user = req.session.user;
        
        if (!user) {
            return res.status(401).json({ error: 'Please login to apply' });
        }

        // Check if resume is uploaded
        if (!user.resume) {
            return res.status(400).json({ error: 'Please upload your resume before applying' });
        }

        const job = await Job.findById(req.params.jobId);
        if (!job || job.status !== 'active') {
            return res.status(404).json({ error: 'Job not found or no longer active' });
        }

        // Check if deadline has passed
        if (job.deadline && new Date(job.deadline) < new Date()) {
            return res.status(400).json({ error: 'Application deadline has passed' });
        }

        // Check if already applied
        const existingApplication = await Application.findOne({
            studentId: user._id,
            jobId: job._id
        });

        if (existingApplication) {
            return res.status(400).json({ error: 'You have already applied to this job' });
        }

        const application = new Application({
            studentId: user._id,
            jobId: job._id,
            companyId: job.companyId,
            status: 'pending',
            appliedDate: new Date(),
            resume: user.resume || ''
        });

        await application.save();
        res.json({ message: 'Application submitted successfully' });
    } catch (err) {
        console.error('Apply Job Error:', err);
        res.status(500).json({ error: 'Failed to submit application. Please try again.' });
    }
});

// View applications
router.get('/applications', async (req, res) => {
    try {
        const applications = await Application.find({ 
            studentId: req.session.user._id 
        })
        .populate('jobId')
        .sort({ appliedDate: -1 });

        // Map applications to match template expectations
        const mappedApplications = applications.map(app => ({
            _id: app._id,
            jobId: app.jobId,
            appliedDate: app.appliedDate,
            status: app.status ? app.status.charAt(0).toUpperCase() + app.status.slice(1) : 'Pending',
            interviewDate: app.interviewDate,
            interviewMode: app.interviewMode,
            interviewLocation: app.interviewLocation,
            interviewLink: app.interviewLink
        }));

        res.render('pages/student/applications', { 
            user: req.session.user,
            applications: mappedApplications
        });
    } catch (err) {
        console.error(err);
        res.render('pages/error', { error: 'Error loading applications' });
    }
});

// View single application details
router.get('/applications/:applicationId', async (req, res) => {
    try {
        const application = await Application.findById(req.params.applicationId)
            .populate('jobId')
            .populate('companyId', 'companyName name email phone');

        if (!application || application.studentId.toString() !== req.session.user._id.toString()) {
            return res.render('pages/error', { error: 'Application not found' });
        }

        res.render('pages/student/application-details', {
            user: req.session.user,
            application
        });
    } catch (err) {
        console.error(err);
        res.render('pages/error', { error: 'Error loading application details' });
    }
});

// Profile routes
// Profile view
router.get('/profile', (req, res) => {
    res.render('pages/student/profile', { 
        user: req.session.user,
        success: req.query.success,
        error: req.query.error
    });
});

// Update profile information
router.post('/profile', async (req, res) => {
    try {
        const updates = {
            name: req.body.name,
            branch: req.body.branch,
            year: parseInt(req.body.year),
            rollNumber: req.body.rollNumber,
            cgpa: parseFloat(req.body.cgpa),
            phone: req.body.phone,
            dob: req.body.dob,
            skills: req.body.skills?.split(',').map(s => s.trim()).filter(s => s) || []
        };

        const user = await User.findByIdAndUpdate(
            req.session.user._id,
            updates,
            { new: true }
        );

        req.session.user = user.toObject();
        
        // Check if it's an AJAX request
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.json({ success: true, message: 'Profile updated successfully' });
        }
        
        res.redirect('/student/profile?success=Profile+updated+successfully');
    } catch (err) {
        console.error(err);
        
        // Check if it's an AJAX request
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(500).json({ success: false, message: 'Failed to update profile' });
        }
        
        res.redirect('/student/profile?error=Failed+to+update+profile');
    }
});

// Update resume
router.post('/profile/resume', async (req, res) => {
    try {
        if (!req.files || !req.files.resume) {
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(400).json({ success: false, message: 'No resume file uploaded' });
            }
            return res.redirect('/student/profile?error=No+resume+file+uploaded');
        }

        const resumeFile = req.files.resume;
        
        // Validate file type
        if (!resumeFile.mimetype.includes('pdf')) {
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(400).json({ success: false, message: 'Only PDF files are allowed' });
            }
            return res.redirect('/student/profile?error=Only+PDF+files+are+allowed');
        }

        // Generate unique filename
        const filename = `${req.session.user._id}-${Date.now()}.pdf`;
        const uploadPath = path.join(process.cwd(), 'public', 'uploads', 'resumes', filename);

        // Move file to uploads directory
        await resumeFile.mv(uploadPath);

        // Update user record
        const user = await User.findByIdAndUpdate(
            req.session.user._id,
            { 
                resume: `/uploads/resumes/${filename}`,
                resumeUpdatedAt: new Date()
            },
            { new: true }
        );

        req.session.user = user.toObject();
        
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.json({ success: true, message: 'Resume updated successfully' });
        }
        
        res.redirect('/student/profile?success=Resume+updated+successfully');
    } catch (err) {
        console.error(err);
        
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(500).json({ success: false, message: 'Failed to upload resume' });
        }
        
        res.redirect('/student/profile?error=Failed+to+upload+resume');
    }
});

// Update profile picture
router.post('/profile/picture', async (req, res) => {
    try {
        if (!req.files || !req.files.profilePicture) {
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(400).json({ success: false, message: 'No image file uploaded' });
            }
            return res.redirect('/student/profile?error=No+image+file+uploaded');
        }

        const pictureFile = req.files.profilePicture;
        
        // Validate file type
        if (!pictureFile.mimetype.startsWith('image')) {
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(400).json({ success: false, message: 'Only image files are allowed' });
            }
            return res.redirect('/student/profile?error=Only+image+files+are+allowed');
        }

        // Generate unique filename
        const filename = `${req.session.user._id}-${Date.now()}${path.extname(pictureFile.name)}`;
        const uploadPath = path.join(process.cwd(), 'public', 'uploads', 'avatars', filename);

        // Move file to uploads directory
        await pictureFile.mv(uploadPath);

        // Update user record
        const user = await User.findByIdAndUpdate(
            req.session.user._id,
            { profilePicture: `/uploads/avatars/${filename}` },
            { new: true }
        );

        req.session.user = user.toObject();
        
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.json({ success: true, message: 'Profile picture updated' });
        }
        
        res.redirect('/student/profile?success=Profile+picture+updated');
    } catch (err) {
        console.error(err);
        
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(500).json({ success: false, message: 'Failed to upload picture' });
        }
        
        res.redirect('/student/profile?error=Failed+to+upload+picture');
    }
});

// Interviews page
router.get('/interviews', async (req, res) => {
    try {
        const interviews = await Application.find({
            studentId: req.session.user._id,
            interviewDate: { $ne: null }
        })
        .populate('jobId')
        .sort({ interviewDate: 1 });

        // Map interviews to match template expectations
        const mappedInterviews = interviews.map(interview => ({
            _id: interview._id,
            job: interview.jobId ? {
                _id: interview.jobId._id,
                title: interview.jobId.title,
                companyName: interview.jobId.companyName
            } : null,
            scheduledAt: interview.interviewDate,
            type: interview.interviewMode ? interview.interviewMode.toLowerCase() : 'offline',
            meetingLink: interview.interviewLink,
            location: interview.interviewLocation,
            status: interview.status
        }));

        res.render('pages/student/interviews', {
            user: req.session.user,
            interviews: mappedInterviews
        });
    } catch (err) {
        console.error(err);
        res.render('pages/error', { error: 'Error loading interviews' });
    }
});

// Resume page
router.get('/resume', (req, res) => {
    res.render('pages/student/resume', {
        user: req.session.user
    });
});

// Settings page
router.get('/settings', (req, res) => {
    res.render('pages/student/settings', {
        user: req.session.user
    });
});

export default router;
