const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { sanitizeUser } = require('../utils/helpers');
const config = require('../config/env');

/**
 * @desc    Register a new user
 * @route   POST /api/v1/auth/register
 * @access  Public
 */
const register = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, phone, password, role } = req.body;

  const existingUser = await User.findOne({
    $or: [{ email }, ...(phone ? [{ phone }] : [])],
  });

  if (existingUser) {
    throw ApiError.conflict(
      existingUser.email === email
        ? 'An account with this email already exists'
        : 'An account with this phone number already exists'
    );
  }

  const allowedRoles = ['user', 'provider', 'vendor'];
  const userRole = allowedRoles.includes(role) ? role : 'user';

  const user = await User.create({
    firstName,
    lastName,
    email,
    phone,
    password,
    role: userRole,
    status: 'active',
  });

  sendTokenResponse(user, 201, 'Account created successfully', res);
});

/**
 * @desc    Login user
 * @route   POST /api/v1/auth/login
 * @access  Public
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw ApiError.badRequest('Please provide email and password');
  }

  const user = await User.findOne({ email }).select('+password');

  if (!user) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  const isMatch = await user.matchPassword(password);
  if (!isMatch) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  if (user.status === 'suspended') {
    throw ApiError.forbidden('Your account has been suspended. Contact support.');
  }
  if (user.status === 'banned') {
    throw ApiError.forbidden('Your account has been permanently banned.');
  }

  user.lastLogin = new Date();
  user.loginCount += 1;
  await user.save({ validateBeforeSave: false });

  sendTokenResponse(user, 200, 'Login successful', res);
});

/**
 * @desc    Refresh access token
 * @route   POST /api/v1/auth/refresh-token
 * @access  Public
 */
const refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken: token } = req.body;

  if (!token) {
    throw ApiError.badRequest('Refresh token is required');
  }

  const jwt = require('jsonwebtoken');
  let decoded;

  try {
    decoded = jwt.verify(token, config.jwt.refreshSecret);
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  const user = await User.findById(decoded.id).select('+refreshToken');

  if (!user || user.refreshToken !== token) {
    throw ApiError.unauthorized('Invalid refresh token');
  }

  sendTokenResponse(user, 200, 'Token refreshed', res);
});

/**
 * @desc    Get current logged-in user
 * @route   GET /api/v1/auth/me
 * @access  Private
 */
const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);

  return ApiResponse.success(res, {
    data: { user: sanitizeUser(user) },
    message: 'Profile fetched successfully',
  });
});

/**
 * @desc    Update user profile
 * @route   PUT /api/v1/auth/me
 * @access  Private
 */
const updateProfile = asyncHandler(async (req, res) => {
  const allowedFields = [
    'firstName', 'lastName', 'phone', 'avatar', 'address',
  ];

  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }

  const user = await User.findByIdAndUpdate(req.user.id, updates, {
    new: true,
    runValidators: true,
  });

  return ApiResponse.success(res, {
    data: { user: sanitizeUser(user) },
    message: 'Profile updated successfully',
  });
});

/**
 * @desc    Change password
 * @route   PUT /api/v1/auth/change-password
 * @access  Private
 */
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw ApiError.badRequest('Current password and new password are required');
  }

  const user = await User.findById(req.user.id).select('+password');

  const isMatch = await user.matchPassword(currentPassword);
  if (!isMatch) {
    throw ApiError.unauthorized('Current password is incorrect');
  }

  user.password = newPassword;
  await user.save();

  sendTokenResponse(user, 200, 'Password changed successfully', res);
});

/**
 * @desc    Logout
 * @route   POST /api/v1/auth/logout
 * @access  Private
 */
const logout = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.user.id, { refreshToken: null });

  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 5 * 1000),
    httpOnly: true,
  });

  return ApiResponse.success(res, {
    data: null,
    message: 'Logged out successfully',
  });
});

/**
 * @desc    Register / update Expo push notification token
 * @route   PUT /api/v1/auth/fcm-token
 * @access  Private
 */
const updateFCMToken = asyncHandler(async (req, res) => {
  const { token: fcmToken, deviceId } = req.body;
  if (!fcmToken) throw ApiError.badRequest('FCM token is required');

  const user = await User.findById(req.user.id);
  if (!user) throw ApiError.notFound('User not found');

  if (!user.fcmTokens.includes(fcmToken)) {
    user.fcmTokens.push(fcmToken);
  }

  if (deviceId) {
    const existing = user.deviceInfo.find((d) => d.deviceId === deviceId);
    if (existing) {
      existing.lastUsed = new Date();
    } else {
      user.deviceInfo.push({ deviceId, platform: req.body.platform || 'unknown', lastUsed: new Date() });
    }
  }

  await user.save({ validateBeforeSave: false });

  return ApiResponse.success(res, {
    data: null,
    message: 'FCM token registered',
  });
});

/**
 * @desc    Admin: Get all users (filterable by role / status)
 * @route   GET /api/v1/auth/admin/users
 * @access  Admin
 */
const getAllUsers = asyncHandler(async (req, res) => {
  const {
    role,
    status,
    search,
    page    = 1,
    limit   = 50,
    sort    = '-createdAt',
  } = req.query;

  const filter = {};

  if (role   && role   !== 'all') filter.role   = role;
  if (status && status !== 'all') filter.status = status;

  if (search) {
    const regex = new RegExp(search, 'i');
    filter.$or  = [
      { firstName: regex },
      { lastName:  regex },
      { email:     regex },
      { phone:     regex },
    ];
  }

  const skip  = (Number(page) - 1) * Number(limit);
  const total = await User.countDocuments(filter);

  const users = await User.find(filter)
    .select('-password -refreshToken -__v')
    .sort(sort)
    .skip(skip)
    .limit(Number(limit))
    .lean();

  return ApiResponse.success(res, {
    data: {
      users,
      pagination: {
        total,
        page:       Number(page),
        limit:      Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    },
    message: `${total} users found`,
  });
});

/**
 * @desc    Admin: Update user status (suspend / activate / ban)
 * @route   PUT /api/v1/auth/admin/users/:id/status
 * @access  Admin
 */
const updateUserStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const allowed = ['active', 'inactive', 'suspended', 'banned'];

  if (!allowed.includes(status)) {
    throw ApiError.badRequest(`Status must be one of: ${allowed.join(', ')}`);
  }

  // Prevent admin from suspending themselves
  if (req.params.id === req.user.id.toString()) {
    throw ApiError.badRequest('You cannot change your own account status.');
  }

  const user = await User.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true }
  ).select('-password -refreshToken');

  if (!user) throw ApiError.notFound('User not found');

  return ApiResponse.success(res, {
    data: { user: sanitizeUser(user) },
    message: `User status updated to ${status}`,
  });
});

// ── Helper: Generate tokens and send response ─────────────────────────────────
const sendTokenResponse = async (user, statusCode, message, res) => {
  const accessToken     = user.getSignedToken();
  const newRefreshToken = user.getRefreshToken();

  user.refreshToken = newRefreshToken;
  await user.save({ validateBeforeSave: false });

  const cookieOptions = {
    expires:  new Date(Date.now() + config.jwt.cookieExpire * 24 * 60 * 60 * 1000),
    httpOnly: true,
    secure:   config.env === 'production',
    sameSite: 'strict',
  };

  return res
    .status(statusCode)
    .cookie('token', accessToken, cookieOptions)
    .json({
      success: true,
      status:  statusCode,
      message,
      data: {
        user: sanitizeUser(user),
        tokens: {
          accessToken,
          refreshToken: newRefreshToken,
          expiresIn:    config.jwt.expire,
        },
      },
    });
};

/**
 * @desc    Update user's current GPS location
 * @route   PUT /api/v1/auth/location
 * @access  Private
 */
const updateLocation = asyncHandler(async (req, res) => {
  const { latitude, longitude } = req.body;

  if (latitude == null || longitude == null) {
    throw ApiError.badRequest('latitude and longitude are required');
  }

  await User.findByIdAndUpdate(req.user.id, {
    location: {
      type:        'Point',
      coordinates: [parseFloat(longitude), parseFloat(latitude)],
    },
  });

  return ApiResponse.success(res, {
    data: null,
    message: 'Location updated',
  });
});

module.exports = {
  register,
  login,
  refreshToken,
  getMe,
  updateProfile,
  changePassword,
  logout,
  updateFCMToken,
  updateLocation,
  getAllUsers,
  updateUserStatus,
};
