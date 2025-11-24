import Job from "../models/Job.js";
import Application from "../models/Application.js";
import User from "../models/User.js";

// Helper to ensure company-only actions
const requireCompany = (req) => req.session?.user && req.session.user.role === 'company';

export const companyDashboard = async (req, res) => {
  try {
    const companyId = req.session.user._id;
    const jobs = await Job.find({ companyId }).sort({ createdAt: -1 });
    const applications = await Application.find({ companyId })
      .populate('studentId', 'name email branch year')
      .populate('jobId', 'title');

    const stats = {
      totalJobs: jobs.length,
      totalApplications: applications.length,
      shortlisted: applications.filter(a => a.status === 'shortlisted').length,
      hired: applications.filter(a => a.status === 'hired').length
    };

    res.render('pages/company/dashboard', { user: req.session.user, jobs, applications, stats });
  } catch (err) {
    console.error(err);
    res.render('error', { message: 'Unable to load company dashboard' });
  }
};

export const showPostJob = (req, res) => {
  res.render('pages/company/post-job', { user: req.session.user });
};

export const postJob = async (req, res) => {
  try {
    if (!requireCompany(req)) return res.redirect('/auth/login');
    const { title, description, type, location, salary, eligibility, skillsRequired, deadline } = req.body;
    const job = new Job({
      companyId: req.session.user._id,
      companyName: req.session.user.companyName || req.session.user.name,
      title,
      description,
      type,
      location,
      salary,
      eligibility,
      skillsRequired: (skillsRequired || '').split(',').map(s => s.trim()).filter(Boolean),
      deadline: deadline || null
    });
    await job.save();

    // Redirect to company jobs list
    res.redirect('/companies/jobs');
  } catch (err) {
    console.error(err);
    res.render('pages/company/post-job', { user: req.session.user, error: 'Error posting job' });
  }
};

export const companyJobs = async (req, res) => {
  try {
    const jobs = await Job.find({ companyId: req.session.user._id }).sort({ createdAt: -1 });
    res.render('pages/company/jobs', { user: req.session.user, jobs });
  } catch (err) {
    console.error(err);
    res.render('error', { message: 'Unable to load jobs' });
  }
};

export const jobApplications = async (req, res) => {
  try {
    const jobId = req.params.jobId;
    const applications = await Application.find({ jobId })
      .populate('studentId', 'name email branch year resume')
      .populate('jobId', 'title');
    res.render('pages/company/job-applications', { user: req.session.user, applications });
  } catch (err) {
    console.error(err);
    res.render('error', { message: 'Unable to load applications' });
  }
};

export const updateApplicationStatus = async (req, res) => {
  try {
    const appId = req.params.id;
    const { status } = req.body;
    const application = await Application.findById(appId);
    if (!application) return res.status(404).json({ success: false, message: 'Application not found' });

    // Only the company that owns the application may update
    if (String(application.companyId) !== String(req.session.user._id)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    application.status = status;
    await application.save();

    // Optionally: notify student (could be implemented later)

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Error updating status' });
  }
};

// Student-facing controllers
export const studentDashboard = async (req, res) => {
  try {
    const jobs = await Job.find({ status: 'active' }).sort({ createdAt: -1 }).limit(50);
    const applications = await Application.find({ studentId: req.session.user._id })
      .populate('jobId', 'title companyName')
      .sort({ appliedDate: -1 });

    const stats = {
      applied: applications.length,
      shortlisted: applications.filter(a => a.status === 'shortlisted').length,
      rejected: applications.filter(a => a.status === 'rejected').length,
      placed: applications.filter(a => a.status === 'hired').length
    };

    res.render('pages/dashboard', { user: req.session.user, jobs, applications, stats });
  } catch (err) {
    console.error(err);
    res.render('error', { message: 'Unable to load dashboard' });
  }
};

export const studentApply = async (req, res) => {
  try {
    const jobId = req.params.jobId;
    const job = await Job.findById(jobId);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    // Prevent duplicate applications
    const existing = await Application.findOne({ jobId, studentId: req.session.user._id });
    if (existing) return res.status(400).json({ success: false, message: 'Already applied' });

    const application = new Application({
      studentId: req.session.user._id,
      jobId,
      companyId: job.companyId,
      resume: req.session.user.resume || '',
      coverLetter: req.body.coverLetter || ''
    });
    await application.save();

    // Increase job application count? (not modeled) - front-end can show counts from queries

    res.json({ success: true, message: 'Applied successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Error applying' });
  }
};

export const studentApplications = async (req, res) => {
  try {
    const applications = await Application.find({ studentId: req.session.user._id })
      .populate('jobId', 'title companyName')
      .sort({ appliedDate: -1 });
    res.render('pages/student/applications', { user: req.session.user, applications });
  } catch (err) {
    console.error(err);
    res.render('error', { message: 'Unable to load applications' });
  }
};

export default null;
