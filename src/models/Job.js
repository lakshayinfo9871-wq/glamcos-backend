const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema(
  {
    // ── Posted By ──────────────────────────────────────────────────────────
    postedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // ── Company Info ───────────────────────────────────────────────────────
    companyName: {
      type: String,
      required: [true, 'Company name is required'],
      trim: true,
      maxlength: [100, 'Company name cannot exceed 100 characters'],
    },
    companyLogo: {
      type: String,
      default: '',
    },
    companyWebsite: {
      type: String,
      trim: true,
      default: '',
    },

    // ── Job Details ────────────────────────────────────────────────────────
    title: {
      type: String,
      required: [true, 'Job title is required'],
      trim: true,
      maxlength: [100, 'Title cannot exceed 100 characters'],
    },
    description: {
      type: String,
      required: [true, 'Job description is required'],
      maxlength: [5000, 'Description cannot exceed 5000 characters'],
    },
    requirements: {
      type: String,
      maxlength: [3000, 'Requirements cannot exceed 3000 characters'],
    },
    responsibilities: {
      type: String,
      maxlength: [3000, 'Responsibilities cannot exceed 3000 characters'],
    },

    // ── Classification ─────────────────────────────────────────────────────
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: [
        'beauty_wellness',
        'hair_stylist',
        'makeup_artist',
        'nail_technician',
        'spa_therapist',
        'fitness_trainer',
        'salon_manager',
        'receptionist',
        'retail_sales',
        'other',
      ],
      index: true,
    },
    jobType: {
      type: String,
      required: [true, 'Job type is required'],
      enum: ['full_time', 'part_time', 'freelance', 'internship', 'contract'],
      index: true,
    },
    experienceLevel: {
      type: String,
      enum: ['fresher', 'junior', 'mid', 'senior', 'lead'],
      default: 'fresher',
    },
    experienceYears: {
      min: { type: Number, default: 0 },
      max: { type: Number, default: 0 },
    },

    // ── Location ───────────────────────────────────────────────────────────
    location: {
      city: { type: String, trim: true, required: [true, 'City is required'] },
      state: { type: String, trim: true },
      pincode: { type: String, trim: true },
    },
    isRemote: { type: Boolean, default: false },

    // ── Compensation ───────────────────────────────────────────────────────
    salary: {
      min: { type: Number, default: 0 },
      max: { type: Number, default: 0 },
      currency: { type: String, default: 'INR' },
      period: { type: String, enum: ['monthly', 'yearly', 'hourly', 'per_project'], default: 'monthly' },
      isNegotiable: { type: Boolean, default: false },
      isHidden: { type: Boolean, default: false }, // employer can hide salary
    },

    // ── Skills ─────────────────────────────────────────────────────────────
    skills: [{ type: String, trim: true }],

    // ── Listing Plan ───────────────────────────────────────────────────────
    plan: {
      type: String,
      enum: ['free', 'standard', 'featured'],
      default: 'free',
      index: true,
    },
    isFeatured: { type: Boolean, default: false },
    isUrgent: { type: Boolean, default: false },
    boostCount: { type: Number, default: 0 }, // how many times boosted
    lastBoostedAt: { type: Date },

    // ── Admin Review ───────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ['draft', 'pending_review', 'active', 'rejected', 'expired', 'closed'],
      default: 'pending_review',
      index: true,
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    rejectionReason: { type: String, default: '' },

    // ── Validity ───────────────────────────────────────────────────────────
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      index: true,
    },

    // ── Stats ──────────────────────────────────────────────────────────────
    viewCount: { type: Number, default: 0 },
    applicationCount: { type: Number, default: 0 },
    totalPositions: { type: Number, default: 1 },
    filledPositions: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// ── Indexes ─────────────────────────────────────────────────────────────────
jobSchema.index({ status: 1, plan: -1, createdAt: -1 }); // feed query
jobSchema.index({ 'location.city': 1, status: 1 });
jobSchema.index({ category: 1, status: 1 });
jobSchema.index({ title: 'text', description: 'text', companyName: 'text' }); // full-text search

module.exports = mongoose.model('Job', jobSchema);
