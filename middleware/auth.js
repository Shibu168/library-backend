const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
  console.log('\n=== AUTH MIDDLEWARE DEBUGGING ===');
  console.log('Request URL:', req.url);
  console.log('Request method:', req.method);
  console.log('Request headers:', JSON.stringify(req.headers, null, 2));
  
  // Get token from header
  const token = req.header('x-auth-token');
  console.log('Token extracted from x-auth-token header:', token ? `${token.substring(0, 20)}...` : 'NO TOKEN FOUND');

  // Check if no token
  if (!token) {
    console.log('❌ No token provided, denying authorization');
    console.log('Available headers:', Object.keys(req.headers));
    return res.status(401).json({ 
      message: 'No token, authorization denied',
      debug: {
        headers: req.headers,
        url: req.url,
        method: req.method
      }
    });
  }

  // Verify token
  try {
    console.log('🔍 Attempting to verify token...');
    console.log('JWT Secret:', process.env.JWT_SECRET ? 'Set' : 'Not set');
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'library_secret');
    console.log('✅ Token successfully decoded:', JSON.stringify(decoded, null, 2));
    
    req.user = decoded.user;
    console.log('👤 User extracted from token:', JSON.stringify(req.user, null, 2));
    
    next();
  } catch (error) {
    console.log('❌ Token verification failed:', error.message);
    console.log('Error name:', error.name);
    
    // More specific error messages based on the type of error
    if (error.name === 'TokenExpiredError') {
      console.log('⏰ Token has expired');
      return res.status(401).json({ 
        message: 'Token has expired',
        debug: {
          error: error.message
        }
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      console.log('🔐 Invalid token signature');
      return res.status(401).json({ 
        message: 'Invalid token',
        debug: {
          error: error.message
        }
      });
    }
    
    res.status(401).json({ 
      message: 'Token is not valid',
      debug: {
        error: error.message
      }
    });
  }
};