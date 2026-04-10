const express = require('express');
const router  = express.Router();

router.use('/auth',       require('./authRoutes'));
router.use('/categories', require('./categoryRoutes'));
router.use('/services',   require('./serviceRoutes'));
router.use('/products',   require('./productRoutes'));
router.use('/health',     require('./healthRoutes'));
router.use('/bookings',   require('./bookingRoutes'));
router.use('/stylists',   require('./stylistRoutes'));
router.use('/banners',    require('./bannerRoutes'));

// ── Phase 2 routes ──────────────────────────────────────────────────────────
router.use('/providers',  require('./providerRoutes'));
router.use('/loyalty',    require('./loyaltyRoutes'));

module.exports = router;
