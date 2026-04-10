const rateLimit = require('express-rate-limit');
const ApiResponse = require('../utils/ApiResponse');

/**
 * Create a rate limiter with custom options
 */
const createLimiter = (options = {}) => {
  return rateLimit({
    windowMs: options.windowMs || 15 * 60 * 1000, // 15 min default
    max: options.max || 100,
    message: options.message || 'Too many requests, please try again later.',
    standardHeaders: true, // Return rate limit info in RateLimit-* headers
    legacyHeaders: false,
    handler: (_req, res) => {
      ApiResponse.error(res, {
        message: options.message || 'Too many requests, please try again later.',
        statusCode: 429,
      });
    },
  });
};

// General API limiter
const apiLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100,
});

// Strict limiter for auth routes (login/register)
const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many authentication attempts. Please try again after 15 minutes.',
});

// Relaxed limiter for read-heavy routes
const readLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 200,
});

module.exports = { createLimiter, apiLimiter, authLimiter, readLimiter };
