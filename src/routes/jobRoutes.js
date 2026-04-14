const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
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
} = require('../controllers/jobController');

// ─────────────────────────────────────────────────────────────────────────────
//  PUBLIC routes
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', getJobs);                     // Browse all active jobs
router.get('/:id', getJobById);               // Single job detail

// ─────────────────────────────────────────────────────────────────────────────
//  SEEKER routes (any logged-in user)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/apply', protect, applyForJob);                          // Apply to a job
router.get('/applications/my', protect, getMyApplications);               // My applications

// ─────────────────────────────────────────────────────────────────────────────
//  EMPLOYER routes (any logged-in user — scope by postedBy in controller)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', protect, createJob);                                      // Post a job
router.get('/my/listings', protect, getMyJobs);                           // My posted jobs
router.patch('/:id', protect, updateJob);                                  // Edit a job
router.delete('/:id', protect, deleteJob);                                 // Close a job
router.post('/:id/boost', protect, boostJob);                             // Boost a listing
router.get('/:id/applications', protect, getJobApplications);             // View applicants
router.patch(                                                               // Update applicant status
  '/applications/:applicationId/status',
  protect,
  updateApplicationStatus
);

// ─────────────────────────────────────────────────────────────────────────────
//  ADMIN routes
// ─────────────────────────────────────────────────────────────────────────────
router.get('/admin/pending', protect, authorize('admin', 'superadmin'), getPendingJobs);
router.get('/admin/all', protect, authorize('admin', 'superadmin'), adminGetAllJobs);
router.patch('/admin/:id/approve', protect, authorize('admin', 'superadmin'), approveJob);
router.patch('/admin/:id/reject', protect, authorize('admin', 'superadmin'), rejectJob);

module.exports = router;
