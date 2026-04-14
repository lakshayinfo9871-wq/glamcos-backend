const Job = require('../models/Job');
const JobApplication = require('../models/JobApplication');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');

// ─────────────────────────────────────────────────────────────────────────────
//  EMPLOYER — Post a job
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/jobs
 * Auth: any logged-in user (verified employer in real flow — extend as needed)
 */
const createJob = asyncHandler(async (req, res) => {
  const {
    companyName, companyLogo, companyWebsite,
    title, description, requirements, responsibilities,
    category, jobType, experienceLevel, experienceYears,
    location, isRemote,
    salary, skills,
    plan, isFeatured, isUrgent,
    totalPositions,
  } = req.body;

  const job = await Job.create({
    postedBy: req.user._id,
    companyName, companyLogo, companyWebsite,
    title, description, requirements, responsibilities,
    category, jobType, experienceLevel, experienceYears,
    location, isRemote,
    salary, skills,
    plan: plan || 'free',
    isFeatured: isFeatured || false,
    isUrgent: isUrgent || false,
    totalPositions: totalPositions || 1,
    status: 'pending_review', // always goes to admin first
  });

  return res.status(201).json(
    new ApiResponse(201, job, 'Job posted successfully. It will go live after admin review.')
  );
});

/**
 * GET /api/v1/jobs/my
 * All jobs posted by the logged-in employer
 */
const getMyJobs = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status } = req.query;
  const filter = { postedBy: req.user._id };
  if (status) filter.status = status;

  const skip = (Number(page) - 1) * Number(limit);
  const [jobs, total] = await Promise.all([
    Job.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    Job.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(200, {
      jobs,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) },
    }, 'Jobs fetched successfully')
  );
});

/**
 * PATCH /api/v1/jobs/:id
 * Employer updates their own job (only if draft/rejected)
 */
const updateJob = asyncHandler(async (req, res) => {
  const job = await Job.findOne({ _id: req.params.id, postedBy: req.user._id });
  if (!job) throw ApiError.notFound('Job not found or not owned by you.');

  if (!['draft', 'rejected'].includes(job.status)) {
    throw ApiError.badRequest('Only draft or rejected listings can be edited.');
  }

  const allowedFields = [
    'companyName', 'companyLogo', 'companyWebsite',
    'title', 'description', 'requirements', 'responsibilities',
    'category', 'jobType', 'experienceLevel', 'experienceYears',
    'location', 'isRemote', 'salary', 'skills',
    'totalPositions',
  ];

  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) job[field] = req.body[field];
  });

  // Re-submit for review
  job.status = 'pending_review';
  job.rejectionReason = '';
  await job.save();

  return res.status(200).json(new ApiResponse(200, job, 'Job updated and re-submitted for review.'));
});

/**
 * DELETE /api/v1/jobs/:id
 * Employer closes/deletes their own job
 */
const deleteJob = asyncHandler(async (req, res) => {
  const job = await Job.findOne({ _id: req.params.id, postedBy: req.user._id });
  if (!job) throw ApiError.notFound('Job not found or not owned by you.');

  job.status = 'closed';
  await job.save();

  return res.status(200).json(new ApiResponse(200, null, 'Job closed successfully.'));
});

/**
 * POST /api/v1/jobs/:id/boost
 * Employer boosts a listing back to top
 */
const boostJob = asyncHandler(async (req, res) => {
  const job = await Job.findOne({ _id: req.params.id, postedBy: req.user._id, status: 'active' });
  if (!job) throw ApiError.notFound('Active job not found.');

  job.lastBoostedAt = new Date();
  job.boostCount += 1;
  await job.save();

  return res.status(200).json(new ApiResponse(200, job, 'Job boosted successfully.'));
});

// ─────────────────────────────────────────────────────────────────────────────
//  JOB SEEKER — Browse & Apply
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/jobs
 * Public: browse all active jobs with filters
 */
const getJobs = asyncHandler(async (req, res) => {
  const {
    page = 1, limit = 10,
    category, jobType, city, isRemote,
    salaryMin, salaryMax,
    experienceLevel, plan,
    q, // search query
  } = req.query;

  const filter = { status: 'active', expiresAt: { $gt: new Date() } };

  if (category) filter.category = category;
  if (jobType) filter.jobType = jobType;
  if (city) filter['location.city'] = new RegExp(city, 'i');
  if (isRemote !== undefined) filter.isRemote = isRemote === 'true';
  if (experienceLevel) filter.experienceLevel = experienceLevel;
  if (plan) filter.plan = plan;
  if (salaryMin) filter['salary.min'] = { $gte: Number(salaryMin) };
  if (salaryMax) filter['salary.max'] = { $lte: Number(salaryMax) };

  // Full-text search
  if (q) filter.$text = { $search: q };

  const skip = (Number(page) - 1) * Number(limit);

  // Featured jobs appear first, then by lastBoostedAt, then by createdAt
  const sortOrder = { isFeatured: -1, isUrgent: -1, lastBoostedAt: -1, createdAt: -1 };

  const [jobs, total] = await Promise.all([
    Job.find(filter)
      .select('-rejectionReason -reviewedBy')
      .populate('postedBy', 'firstName lastName avatar')
      .sort(sortOrder)
      .skip(skip)
      .limit(Number(limit)),
    Job.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(200, {
      jobs,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) },
    }, 'Jobs fetched successfully')
  );
});

/**
 * GET /api/v1/jobs/:id
 * Public: get single job detail + increment view count
 */
const getJobById = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id)
    .populate('postedBy', 'firstName lastName avatar');

  if (!job || job.status !== 'active') throw ApiError.notFound('Job not found.');

  // Increment view count (fire and forget)
  Job.findByIdAndUpdate(req.params.id, { $inc: { viewCount: 1 } }).exec();

  return res.status(200).json(new ApiResponse(200, job, 'Job fetched successfully.'));
});

/**
 * POST /api/v1/jobs/:id/apply
 * Auth required: job seeker applies
 */
const applyForJob = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id);
  if (!job || job.status !== 'active') throw ApiError.notFound('Job not found or no longer active.');

  // Prevent employer from applying to own job
  if (job.postedBy.toString() === req.user._id.toString()) {
    throw ApiError.badRequest('You cannot apply to your own job listing.');
  }

  // Check duplicate application
  const existing = await JobApplication.findOne({ job: job._id, applicant: req.user._id });
  if (existing) throw ApiError.badRequest('You have already applied to this job.');

  const { coverNote, resumeUrl, portfolioUrl } = req.body;

  const application = await JobApplication.create({
    job: job._id,
    applicant: req.user._id,
    coverNote,
    resumeUrl,
    portfolioUrl,
  });

  // Increment application count
  Job.findByIdAndUpdate(job._id, { $inc: { applicationCount: 1 } }).exec();

  return res.status(201).json(new ApiResponse(201, application, 'Application submitted successfully.'));
});

/**
 * GET /api/v1/jobs/applications/my
 * Auth: seeker views their own applications
 */
const getMyApplications = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const [applications, total] = await Promise.all([
    JobApplication.find({ applicant: req.user._id })
      .populate('job', 'title companyName location jobType salary status')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    JobApplication.countDocuments({ applicant: req.user._id }),
  ]);

  return res.status(200).json(
    new ApiResponse(200, {
      applications,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) },
    }, 'Applications fetched successfully')
  );
});

// ─────────────────────────────────────────────────────────────────────────────
//  EMPLOYER — Manage applicants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/jobs/:id/applications
 * Auth: employer views applicants for their job
 */
const getJobApplications = asyncHandler(async (req, res) => {
  const job = await Job.findOne({ _id: req.params.id, postedBy: req.user._id });
  if (!job) throw ApiError.notFound('Job not found or not owned by you.');

  const { page = 1, limit = 20, status } = req.query;
  const filter = { job: job._id };
  if (status) filter.status = status;

  const skip = (Number(page) - 1) * Number(limit);

  const [applications, total] = await Promise.all([
    JobApplication.find(filter)
      .populate('applicant', 'firstName lastName email phone avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    JobApplication.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(200, {
      applications,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) },
    }, 'Applicants fetched successfully')
  );
});

/**
 * PATCH /api/v1/jobs/applications/:applicationId/status
 * Auth: employer updates application status (shortlist, hire, reject)
 */
const updateApplicationStatus = asyncHandler(async (req, res) => {
  const { status, employerNote } = req.body;
  const allowed = ['viewed', 'shortlisted', 'rejected', 'hired'];

  if (!allowed.includes(status)) {
    throw ApiError.badRequest(`Status must be one of: ${allowed.join(', ')}`);
  }

  const application = await JobApplication.findById(req.params.applicationId)
    .populate('job', 'postedBy');

  if (!application) throw ApiError.notFound('Application not found.');

  // Only the job owner can update
  if (application.job.postedBy.toString() !== req.user._id.toString()) {
    throw ApiError.forbidden('Not authorized to update this application.');
  }

  application.status = status;
  if (employerNote) application.employerNote = employerNote;
  if (status === 'viewed' && !application.viewedAt) application.viewedAt = new Date();

  await application.save();

  // If hired, increment filledPositions
  if (status === 'hired') {
    Job.findByIdAndUpdate(application.job._id, { $inc: { filledPositions: 1 } }).exec();
  }

  return res.status(200).json(new ApiResponse(200, application, 'Application status updated.'));
});

// ─────────────────────────────────────────────────────────────────────────────
//  ADMIN — Review queue
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/jobs/admin/pending
 * Admin: get all jobs pending review
 */
const getPendingJobs = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const [jobs, total] = await Promise.all([
    Job.find({ status: 'pending_review' })
      .populate('postedBy', 'firstName lastName email phone')
      .sort({ createdAt: 1 }) // oldest first
      .skip(skip)
      .limit(Number(limit)),
    Job.countDocuments({ status: 'pending_review' }),
  ]);

  return res.status(200).json(
    new ApiResponse(200, {
      jobs,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) },
    }, 'Pending jobs fetched successfully')
  );
});

/**
 * PATCH /api/v1/jobs/admin/:id/approve
 * Admin: approve a job listing → goes live
 */
const approveJob = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id);
  if (!job) throw ApiError.notFound('Job not found.');

  if (job.status !== 'pending_review') {
    throw ApiError.badRequest('Only pending_review jobs can be approved.');
  }

  job.status = 'active';
  job.reviewedBy = req.user._id;
  job.reviewedAt = new Date();
  job.rejectionReason = '';

  // Set expiry from approval date based on plan
  const daysMap = { free: 15, standard: 30, featured: 45 };
  const days = daysMap[job.plan] || 30;
  job.expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  await job.save();

  return res.status(200).json(new ApiResponse(200, job, 'Job approved and is now live.'));
});

/**
 * PATCH /api/v1/jobs/admin/:id/reject
 * Admin: reject a job listing with reason
 */
const rejectJob = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  if (!reason) throw ApiError.badRequest('Rejection reason is required.');

  const job = await Job.findById(req.params.id);
  if (!job) throw ApiError.notFound('Job not found.');

  if (job.status !== 'pending_review') {
    throw ApiError.badRequest('Only pending_review jobs can be rejected.');
  }

  job.status = 'rejected';
  job.reviewedBy = req.user._id;
  job.reviewedAt = new Date();
  job.rejectionReason = reason;

  await job.save();

  return res.status(200).json(new ApiResponse(200, job, 'Job rejected. Employer will be notified.'));
});

/**
 * GET /api/v1/jobs/admin/all
 * Admin: get all jobs with any status + filters
 */
const adminGetAllJobs = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, plan, category } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (plan) filter.plan = plan;
  if (category) filter.category = category;

  const skip = (Number(page) - 1) * Number(limit);

  const [jobs, total] = await Promise.all([
    Job.find(filter)
      .populate('postedBy', 'firstName lastName email')
      .populate('reviewedBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Job.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(200, {
      jobs,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) },
    }, 'All jobs fetched successfully')
  );
});

module.exports = {
  // Employer
  createJob,
  getMyJobs,
  updateJob,
  deleteJob,
  boostJob,
  getJobApplications,
  updateApplicationStatus,
  // Seeker
  getJobs,
  getJobById,
  applyForJob,
  getMyApplications,
  // Admin
  getPendingJobs,
  approveJob,
  rejectJob,
  adminGetAllJobs,
};
