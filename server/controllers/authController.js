const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Helper function to generate tokens
const generateTokens = (user) => {
  const token = jwt.sign(
    { userId: user._id, userType: user.userType },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  const refreshToken = jwt.sign(
    { userId: user._id },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );

  return { token, refreshToken };
};

// Helper function to prepare user response
const prepareUserResponse = (user) => {
  const userObj = user.toObject();
  delete userObj.password;
  
  // Ensure name is set
  if (userObj.userType === 'regular' && !userObj.name) {
    userObj.name = `${userObj.firstName || ''} ${userObj.lastName || ''}`.trim();
  } else if (userObj.userType === 'business' && !userObj.name) {
    userObj.name = userObj.businessName;
  }

  // Ensure profile picture is set
  if (!userObj.profilePicture) {
    userObj.profilePicture = `http://localhost:5000/uploads/profiles/default-profile.png`;
  }

  return userObj;
};

const authController = {
  // Get current user
  getCurrentUser: async (req, res) => {
    try {
      const user = await User.findById(req.user._id);
      if (!user) {
        return res.status(404).json({
          message: 'User not found'
        });
      }
      res.json(prepareUserResponse(user));
    } catch (error) {
      console.error('Get current user error:', error);
      res.status(500).json({
        message: 'Server error while fetching user',
        details: error.message
      });
    }
  },

  // Register a new user
  register: async (req, res) => {
    try {
      const { 
        email, 
        password, 
        userType,
        phoneNumber,
        firstName,
        lastName,
        businessName,
        businessType,
        address,
        city,
        state,
        zipCode,
        licenseNumber,
        licenseExpiry,
        taxId
      } = req.body;

      // Basic validation
      if (!email || !password || !phoneNumber || !userType) {
        return res.status(400).json({
          message: 'Validation Error',
          details: 'Email, password, phone number, and user type are required'
        });
      }

      // Validate userType
      if (!['regular', 'business'].includes(userType)) {
        return res.status(400).json({
          message: 'Validation Error',
          details: 'User type must be either "regular" or "business"'
        });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          message: 'Validation Error',
          details: 'Invalid email format'
        });
      }

      // Validate password length
      if (password.length < 6) {
        return res.status(400).json({
          message: 'Validation Error',
          details: 'Password must be at least 6 characters long'
        });
      }

      // Check if user already exists
      const existingUser = await User.findOne({ email: email.trim().toLowerCase() });
      if (existingUser) {
        return res.status(400).json({ 
          message: 'Registration failed',
          details: 'A user with this email already exists'
        });
      }

      // Prepare user data
      const userData = {
        email: email.trim().toLowerCase(),
        password,
        phoneNumber: phoneNumber.trim(),
        userType: userType.trim(),
        profilePicture: req.file 
          ? `http://localhost:5000/uploads/profiles/${req.file.filename}`
          : `http://localhost:5000/uploads/profiles/default-profile.png`,
        createdAt: new Date()
      };

      // Add user type specific fields
      if (userType === 'regular') {
        if (!firstName || !lastName) {
          return res.status(400).json({
            message: 'Validation Error',
            details: 'First name and last name are required for regular users'
          });
        }
        Object.assign(userData, {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          name: `${firstName.trim()} ${lastName.trim()}`
        });
      } else if (userType === 'business') {
        if (!businessName || !address || !businessType) {
          return res.status(400).json({
            message: 'Validation Error',
            details: 'Business name, business type, and address are required for business users'
          });
        }
        if (!['shelter', 'shop'].includes(businessType)) {
          return res.status(400).json({
            message: 'Validation Error',
            details: 'Business type must be either "shelter" or "shop"'
          });
        }
        Object.assign(userData, {
          businessName: businessName.trim(),
          businessType,
          name: businessName.trim(),
          address: address.trim(),
          city: city?.trim(),
          state: state?.trim(),
          zipCode: zipCode?.trim(),
          licenseNumber: licenseNumber?.trim(),
          licenseExpiry: licenseExpiry || null,
          taxId: taxId?.trim()
        });
      }

      // Create new user
      const user = new User(userData);
      await user.save();

      // Generate tokens
      const { token, refreshToken } = generateTokens(user);

      res.status(201).json({
        message: 'Registration successful',
        token,
        refreshToken,
        user: prepareUserResponse(user)
      });
    } catch (error) {
      console.error('Registration error:', error);
      
      if (error.name === 'ValidationError') {
        return res.status(400).json({
          message: 'Validation Error',
          details: Object.values(error.errors).map(err => err.message)
        });
      }
      
      res.status(500).json({ 
        message: 'Server error during registration',
        details: error.message
      });
    }
  },

  // Login user
  login: async (req, res) => {
    try {
      const { email, password } = req.body;

      // Validate input
      if (!email || !password) {
        return res.status(400).json({
          message: 'Validation Error',
          details: 'Email and password are required'
        });
      }

      // Check if user exists
      const user = await User.findOne({ email: email.trim().toLowerCase() });
      if (!user) {
        return res.status(400).json({ 
          message: 'Authentication failed',
          details: 'Invalid email or password'
        });
      }

      // Check password
      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return res.status(400).json({ 
          message: 'Authentication failed',
          details: 'Invalid email or password'
        });
      }

      // Generate tokens
      const { token, refreshToken } = generateTokens(user);

      res.json({
        message: 'Login successful',
        token,
        refreshToken,
        user: prepareUserResponse(user)
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ 
        message: 'Server error during login',
        details: error.message
      });
    }
  },

  // Refresh token
  refreshToken: async (req, res) => {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          message: 'Validation Error',
          details: 'Refresh token is required'
        });
      }

      // Verify refresh token
      const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
      
      // Get user
      const user = await User.findById(decoded.userId);
      if (!user) {
        return res.status(401).json({
          message: 'Authentication failed',
          details: 'User not found'
        });
      }

      // Generate new tokens
      const { token: newToken, refreshToken: newRefreshToken } = generateTokens(user);

      res.json({
        message: 'Token refreshed successfully',
        token: newToken,
        refreshToken: newRefreshToken
      });
    } catch (error) {
      console.error('Token refresh error:', error);
      
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          message: 'Authentication failed',
          details: 'Refresh token has expired'
        });
      }

      res.status(500).json({
        message: 'Server error during token refresh',
        details: error.message
      });
    }
  }
};

module.exports = authController; 