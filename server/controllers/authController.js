const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const authController = {
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
        userType: userType.trim()
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

      // Create JWT token
      const token = jwt.sign(
        { userId: user._id, userType: user.userType },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      // Remove password from response
      const userResponse = user.toObject();
      delete userResponse.password;

      res.status(201).json({
        message: 'Registration successful',
        token,
        user: userResponse
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

      // Create JWT token
      const token = jwt.sign(
        { userId: user._id, userType: user.userType },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      // Remove password from response
      const userResponse = user.toObject();
      delete userResponse.password;

      res.json({
        message: 'Login successful',
        token,
        user: userResponse
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ 
        message: 'Server error during login',
        details: error.message
      });
    }
  },

  // Get current user
  getCurrentUser: async (req, res) => {
    try {
      console.log('Getting current user with ID:', req.user.id);
      const user = await User.findById(req.user.id).select('-password');
      if (!user) {
        console.error('User not found with ID:', req.user.id);
        return res.status(404).json({ 
          message: 'User not found',
          details: 'The requested user could not be found'
        });
      }
      console.log('User found:', user._id);
      res.json(user);
    } catch (error) {
      console.error('Get current user error:', error);
      res.status(500).json({ 
        message: 'Server error',
        details: error.message
      });
    }
  }
};

module.exports = authController; 