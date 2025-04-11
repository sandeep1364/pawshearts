const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async function(req, res, next) {
  try {
    // Get token from header
    const authHeader = req.header('Authorization');
    
    // Check if no token
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        message: 'Authentication failed',
        details: 'No token provided'
      });
    }

    // Get token from Bearer string
    const token = authHeader.split(' ')[1];

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Fetch user from database
      const user = await User.findById(decoded.userId);
      if (!user) {
        return res.status(401).json({
          message: 'Authentication failed',
          details: 'User not found'
        });
      }
      
      // Add complete user info to request
      req.user = user;
      next();
    } catch (jwtError) {
      console.error('JWT verification error:', jwtError);
      
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({ 
          message: 'Authentication failed',
          details: 'Token has expired',
          code: 'TOKEN_EXPIRED'
        });
      }
      
      if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({ 
          message: 'Authentication failed',
          details: 'Invalid token'
        });
      }
      
      throw jwtError;
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ 
      message: 'Server error during authentication',
      details: error.message
    });
  }
}; 