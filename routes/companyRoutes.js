import express from "express";
import { isCompany } from "../middleware/roleMiddleware.js";
import Job from "../models/Job.js";
import Application from "../models/Application.js";
import User from "../models/User.js";
import path from "path";

const router = express.Router();

// Protect all company routes
router.use(isCompany);

// Company Dashboard
router.get("/dashboard", async (req, res) => {
    try {
        const user = req.session.user;
        
        // Get active jobs
        const jobs = await Job.find({ 
            companyId: user._id,
            status: "active" 
        }).sort({ createdAt: -1 }).limit(5);

        // Get recent applications
        const applications = await Application.find({ 
            jobId: { $in: jobs.map(j => j._id) }
        })
        .populate("studentId")
        .populate("jobId")
        .sort({ appliedDate: -1 })
        .limit(10);

        // Get upcoming interviews
        const upcomingInterviews = await Application.find({
            jobId: { $in: jobs.map(j => j._id) },
            interviewDate: { $ne: null, $gte: new Date() }
        })
        .populate("studentId")
        .populate("jobId")
        .sort({ interviewDate: 1 })
        .limit(5);

        // Get statistics
        const stats = {
            activeJobs: await Job.countDocuments({ 
                companyId: user._id,
                status: "active"
            }),
            totalApplications: await Application.countDocuments({
                jobId: { $in: jobs.map(j => j._id) }
            }),
            shortlisted: await Application.countDocuments({
                jobId: { $in: jobs.map(j => j._id) },
                status: "shortlisted"
            }),
            hired: await Application.countDocuments({
                jobId: { $in: jobs.map(j => j._id) },
                status: "hired"
            })
        };

        res.render("pages/company/dashboard", {
            user,
            jobs,
            applications,
            upcomingInterviews,
            stats
        });
    } catch (err) {
        console.error(err);
        res.render("pages/error", { error: "Error loading dashboard" });
    }
});

// Company profile
router.get("/profile", (req, res) => {
    res.render("pages/company/profile", { user: req.session.user });
});

router.post("/profile", async (req, res) => {
    try {
        const updates = {
            companyName: req.body.companyName,
            industry: req.body.industry,
            website: req.body.website,
            foundedYear: req.body.foundedYear,
            description: req.body.description,
            contactName: req.body.contactName,
            contactDesignation: req.body.contactDesignation,
            phone: req.body.phone,
            address: req.body.address,
            city: req.body.city,
            state: req.body.state,
            pincode: req.body.pincode,
            linkedin: req.body.linkedin,
            twitter: req.body.twitter
        };

        // Handle logo upload if present
        if (req.files && req.files.logo) {
            const logoFile = req.files.logo;
            const fileName = `${req.session.user._id}-${Date.now()}-${logoFile.name}`;
            const uploadPath = path.join(process.cwd(), 'public', 'uploads', 'logos', fileName);
            
            await logoFile.mv(uploadPath);
            updates.logo = `/uploads/logos/${fileName}`;
            updates.profilePicture = updates.logo;
        }

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
        
        res.redirect("/company/profile?success=Profile+updated+successfully");
    } catch (err) {
        console.error(err);
        
        // Check if it's an AJAX request
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(500).json({ success: false, message: 'Failed to update profile' });
        }
        
        res.render("pages/company/profile", {
            user: req.session.user,
            error: "Failed to update profile. Please try again."
        });
    }
});

// Post new job
router.get("/jobs/post", (req, res) => {
    res.render("pages/company/post-job", { user: req.session.user });
});

router.post("/jobs/post", async (req, res) => {
    try {
        const user = req.session.user;
        
        // Ensure companyName is set
        if (!user.companyName && !user.name) {
            return res.render("pages/company/post-job", { 
                user: user,
                error: "Please update your company profile with company name first."
            });
        }

        // Convert job type from form format to model format
        const typeMap = {
            'full-time': 'Full-time',
            'part-time': 'Part-time',
            'internship': 'Internship'
        };
        const jobType = typeMap[req.body.type] || req.body.type;

        // Combine description, responsibilities, and benefits
        let description = req.body.description || '';
        if (req.body.responsibilities) {
            description += `\n\nResponsibilities:\n${req.body.responsibilities}`;
        }
        if (req.body.benefits) {
            description += `\n\nBenefits:\n${req.body.benefits}`;
        }

        // Convert skills from comma-separated string to array
        const skillsArray = req.body.skillsRequired ? req.body.skillsRequired.split(',').map(skill => skill.trim()).filter(skill => skill) : [];
        
        // Format salary with period if provided
        let salary = req.body.salary || '';
        if (req.body.salaryPeriod) {
            salary = `₹${salary} ${req.body.salaryPeriod}`;
        }

        // Format eligibility with CGPA if provided
        let eligibility = req.body.eligibility || '';
        if (req.body.minCGPA) {
            eligibility += ` (Min CGPA: ${req.body.minCGPA})`;
        }
        
        const job = new Job({
            companyId: user._id,
            companyName: user.companyName || user.name || 'Company',
            title: req.body.title,
            description: description,
            type: jobType,
            location: req.body.location,
            salary: salary,
            eligibility: eligibility,
            skillsRequired: skillsArray,
            deadline: new Date(req.body.deadline),
            status: "active"
        });
        
        await job.save();
        res.redirect("/company/jobs?success=Job+posted+successfully");
    } catch (err) {
        console.error('Job Posting Error:', err);
        let errorMessage = "Failed to post job. ";
        
        if (err.name === 'ValidationError') {
            const fields = Object.keys(err.errors).map(field => {
                const fieldName = field.charAt(0).toUpperCase() + field.slice(1);
                return `${fieldName}: ${err.errors[field].message}`;
            });
            errorMessage += fields.join(', ');
        } else if (err.message) {
            errorMessage += err.message;
        } else {
            errorMessage += "Please check all required fields and try again.";
        }

        res.render("pages/company/post-job", { 
            user: req.session.user,
            error: errorMessage
        });
    }
});

// View posted jobs
router.get("/jobs", async (req, res) => {
    try {
        const jobs = await Job.find({ companyId: req.session.user._id })
            .sort({ createdAt: -1 });

        // Get application count for each job
        const jobsWithCounts = await Promise.all(jobs.map(async (job) => {
            const applicationCount = await Application.countDocuments({ jobId: job._id });
            return {
                ...job.toObject(),
                applicationCount
            };
        }));

        res.render("pages/company/jobs", { 
            jobs: jobsWithCounts, 
            user: req.session.user,
            success: req.query.success
        });
    } catch (err) {
        console.error(err);
        res.render("pages/error", { error: "Failed to load jobs" });
    }
});

// Edit job
router.get("/jobs/:jobId/edit", async (req, res) => {
    try {
        const job = await Job.findOne({
            _id: req.params.jobId,
            companyId: req.session.user._id
        });
        if (!job) {
            return res.status(404).render("pages/error", { error: "Job not found" });
        }
        res.render("pages/company/edit-job", { job, user: req.session.user });
    } catch (err) {
        res.render("pages/error", { error: "Failed to load job" });
    }
});

router.post("/jobs/:jobId/edit", async (req, res) => {
    try {
        const user = req.session.user;
        
        // Convert job type from form format to model format
        const typeMap = {
            'full-time': 'Full-time',
            'part-time': 'Part-time',
            'internship': 'Internship'
        };
        const jobType = typeMap[req.body.type] || req.body.type;

        // Combine description, responsibilities, and benefits
        let description = req.body.description || '';
        if (req.body.responsibilities) {
            description += `\n\nResponsibilities:\n${req.body.responsibilities}`;
        }
        if (req.body.benefits) {
            description += `\n\nBenefits:\n${req.body.benefits}`;
        }

        // Convert skills from comma-separated string to array
        const skillsArray = req.body.skillsRequired ? req.body.skillsRequired.split(',').map(skill => skill.trim()).filter(skill => skill) : [];
        
        // Format salary with period if provided
        let salary = req.body.salary || '';
        if (req.body.salaryPeriod) {
            salary = `₹${salary} ${req.body.salaryPeriod}`;
        }

        // Format eligibility with CGPA if provided
        let eligibility = req.body.eligibility || '';
        if (req.body.minCGPA) {
            eligibility += ` (Min CGPA: ${req.body.minCGPA})`;
        }

        const job = await Job.findOneAndUpdate(
            { _id: req.params.jobId, companyId: req.session.user._id },
            {
                title: req.body.title,
                description: description,
                type: jobType,
                location: req.body.location,
                salary: salary,
                eligibility: eligibility,
                skillsRequired: skillsArray,
                deadline: new Date(req.body.deadline),
                status: req.body.status || 'active'
            },
            { new: true }
        );

        if (!job) {
            return res.status(404).render("pages/error", { error: "Job not found" });
        }

        res.redirect("/company/jobs?success=Job+updated+successfully");
    } catch (err) {
        console.error('Edit Job Error:', err);
        res.render("pages/company/edit-job", {
            job: req.body,
            user: req.session.user,
            error: "Failed to update job: " + (err.message || 'Unknown error')
        });
    }
});

// Delete job
router.delete("/jobs/:jobId", async (req, res) => {
    try {
        const job = await Job.findOne({
            _id: req.params.jobId,
            companyId: req.session.user._id
        });

        if (!job) {
            return res.status(404).json({ error: "Job not found" });
        }

        // Delete all applications for this job
        await Application.deleteMany({ jobId: req.params.jobId });
        
        // Delete the job
        await Job.findByIdAndDelete(req.params.jobId);
        
        res.json({ message: "Job deleted successfully" });
    } catch (err) {
        console.error('Delete Job Error:', err);
        res.status(500).json({ error: "Failed to delete job" });
    }
});

// View job applications
router.get("/jobs/:jobId/applications", async (req, res) => {
    try {
        const job = await Job.findOne({
            _id: req.params.jobId,
            companyId: req.session.user._id
        });
        
        if (!job) {
            return res.status(404).render("pages/error", { error: "Job not found" });
        }

        const applications = await Application.find({ jobId: req.params.jobId })
            .populate("studentId")
            .sort({ appliedDate: -1 });

        res.render("pages/company/job-applications", {
            job,
            applications,
            user: req.session.user
        });
    } catch (err) {
        res.render("pages/error", { error: "Failed to load applications" });
    }
});

// Update application status
router.post("/applications/:applicationId/status", async (req, res) => {
    try {
        const application = await Application.findById(req.params.applicationId)
            .populate("jobId");

        if (!application || application.jobId.companyId.toString() !== req.session.user._id.toString()) {
            return res.status(404).json({ error: "Application not found" });
        }

        application.status = req.body.status.toLowerCase();
        
        // If shortlisting and interview details provided, save them
        if (req.body.status === "shortlisted" || req.body.status === "Shortlisted") {
            if (req.body.interviewDate) {
                application.interviewDate = new Date(req.body.interviewDate);
            }
            if (req.body.interviewMode) {
                application.interviewMode = req.body.interviewMode;
            }
            if (req.body.interviewLocation) {
                application.interviewLocation = req.body.interviewLocation;
            }
            if (req.body.interviewLink) {
                application.interviewLink = req.body.interviewLink;
            }
        }

        await application.save();
        res.json({ message: "Application status updated successfully" });
    } catch (err) {
        console.error('Update Status Error:', err);
        res.status(500).json({ error: "Failed to update status" });
    }
});

// Schedule an interview
router.post("/applications/:applicationId/schedule-interview", async (req, res) => {
    try {
        const application = await Application.findById(req.params.applicationId)
            .populate("jobId");

        if (!application || application.jobId.companyId.toString() !== req.session.user._id.toString()) {
            return res.status(404).json({ error: "Application not found" });
        }

        if (req.body.interviewDate) {
            application.interviewDate = new Date(req.body.interviewDate);
        }
        if (req.body.interviewMode) {
            application.interviewMode = req.body.interviewMode;
        }
        if (req.body.interviewLocation) {
            application.interviewLocation = req.body.interviewLocation;
        }
        if (req.body.interviewLink) {
            application.interviewLink = req.body.interviewLink;
        }

        await application.save();
        res.json({ message: "Interview scheduled successfully" });
    } catch (err) {
        console.error('Schedule Interview Error:', err);
        res.status(500).json({ error: "Failed to schedule interview" });
    }
});

// View scheduled interviews
router.get("/interviews", async (req, res) => {
    try {
        const interviews = await Application.find({
            companyId: req.session.user._id,
            interviewDate: { $ne: null }
        })
        .populate("studentId", "name")
        .populate("jobId", "title")
        .sort({ interviewDate: -1 });

        res.render("pages/company/interviews", {
            user: req.session.user,
            interviews
        });
    } catch (err) {
        console.error('View Interviews Error:', err);
        res.render("pages/error", { error: "Failed to load interviews" });
    }
});

// View all applications for the company
router.get("/applications", async (req, res) => {
    try {
        const applications = await Application.find({
            companyId: req.session.user._id
        })
        .populate("studentId", "name")
        .populate("jobId", "title")
        .sort({ appliedDate: -1 });

        res.render("pages/company/applications", {
            user: req.session.user,
            applications
        });
    } catch (err) {
        console.error('View Applications Error:', err);
        res.render("pages/error", { error: "Failed to load applications" });
    }
});

// Settings page
router.get("/settings", (req, res) => {
    res.render("pages/company/settings", {
        user: req.session.user
    });
});

export default router;
