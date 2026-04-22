const express = require('express');
const router  = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getJobs,
  getJobById,
  postJob,
  updateJob,
  deleteJob,
  boostJob,
  applyForJob,
  getMyApplications,
  getMyListings,
  getJobApplications,
  updateApplicationStatus,
} = require('../controllers/jobController');

// ── Public routes ─────────────────────────────────────────────────────────────
router.get('/',     getJobs);
router.get('/:id',  getJobById);

// ── Authenticated seeker routes ───────────────────────────────────────────────
router.post('/:id/apply',           protect, applyForJob);
router.get('/applications/my',       protect, getMyApplications);

// ── Authenticated employer routes ─────────────────────────────────────────────
router.post('/',                         protect, postJob);
router.get('/my/listings',               protect, getMyListings);
router.patch('/:id',                     protect, updateJob);
router.delete('/:id',                    protect, deleteJob);
router.post('/:id/boost',                protect, boostJob);
router.get('/:id/applications',          protect, getJobApplications);
router.patch('/applications/:applicationId/status', protect, updateApplicationStatus);

module.exports = router;
