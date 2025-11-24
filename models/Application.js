import mongoose from 'mongoose';

const applicationSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    required: true
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'shortlisted', 'rejected', 'hired'],
    default: 'pending'
  },
  appliedDate: {
    type: Date,
    default: Date.now
  },
  resume: {
    type: String,
    required: true
  },
  coverLetter: String,
  interviewDate: Date,
  interviewMode: {
    type: String,
    enum: ['Online', 'Offline']
  },
  interviewLocation: String,
  interviewLink: String,
  feedback: String
});

export default mongoose.model('Application', applicationSchema);