const mongoose = require('mongoose');

const jobApplicationSchema = new mongoose.Schema(
  {
    job: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Job',
      required: true,
      index: true,
    },
    applicant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // ── Application Content ────────────────────────────────────────────────
    coverNote: {
      type: String,
      maxlength: [1000, 'Cover note cannot exceed 1000 characters'],
      default: '',
    },
    resumeUrl: {
      type: String,
      default: '',
    },
    portfolioUrl: {
      type: String,
      default: '',
    },

    // ── Status ─────────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ['applied', 'viewed', 'shortlisted', 'rejected', 'hired'],
      default: 'applied',
      index: true,
    },

    // ── Employer Actions ───────────────────────────────────────────────────
    employerNote: {
      type: String,
      maxlength: [500, 'Employer note cannot exceed 500 characters'],
      default: '',
    },
    viewedAt: { type: Date },
  },
  { timestamps: true }
);

// Prevent duplicate applications
jobApplicationSchema.index({ job: 1, applicant: 1 }, { unique: true });

module.exports = mongoose.model('JobApplication', jobApplicationSchema);
