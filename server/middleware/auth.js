const jwt = require('jsonwebtoken');

module.exports = function(req, res, next) {
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

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Add user info to request
    req.user = {
      id: decoded.userId,
      userType: decoded.userType
    };
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        message: 'Authentication failed',
        details: 'Invalid token'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        message: 'Authentication failed',
        details: 'Token has expired'
      });
    }
    
    res.status(500).json({ 
      message: 'Server error',
      details: 'An error occurred while authenticating'
    });
  }
}; 