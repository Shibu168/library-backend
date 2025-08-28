const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { check, validationResult } = require('express-validator');
const router = express.Router();
const pool = require('../config/db');

// Login
router.post('/login', [
  check('email', 'Please include a valid email').isEmail(),
  check('password', 'Password is required').exists()
], async (req, res) => {
  console.log('\n=== LOGIN ATTEMPT ===');
  console.log('Request body:', JSON.stringify(req.body, null, 2));
  console.log('Content-Type header:', req.get('Content-Type'));
  
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log('❌ Validation errors:', errors.array());
    return res.status(400).json({ 
      errors: errors.array(),
      debug: {
        requestBody: req.body,
        contentType: req.get('Content-Type')
      }
    });
  }

  const { email, password } = req.body;
  console.log(`🔐 Login attempt for email: ${email}`);

  try {
    // Check if user exists
    console.log('🔍 Checking if user exists in database...');
    const userResult = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    console.log('Database query result:', userResult.rows);

    if (userResult.rows.length === 0) {
      console.log('❌ No user found with this email');
      return res.status(400).json({ 
        message: 'Invalid credentials',
        debug: {
          email: email
        }
      });
    }

    const user = userResult.rows[0];
    console.log('✅ User found:', JSON.stringify({
      id: user.id,
      email: user.email,
      role: user.role,
      hasPassword: !!user.password
    }, null, 2));

    // Special handling for admin with plain text password
    if (user.email === 'admin@library.com' && password === 'Riya@168') {
      console.log('👑 Admin login detected with plain text password');
      
      // Hash the password and update it in the database for future logins
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      
      console.log('🔄 Updating admin password to hashed version...');
      await pool.query(
        'UPDATE users SET password = $1 WHERE email = $2',
        [hashedPassword, email]
      );

      // Create JWT token
      const payload = {
        user: {
          id: user.id,
          role: user.role
        }
      };

      console.log('📝 Creating JWT token...');
      jwt.sign(
        payload,
        process.env.JWT_SECRET || 'library_secret',
        { expiresIn: '7d' },
        (err, token) => {
          if (err) {
            console.log('❌ Error creating JWT token:', err);
            throw err;
          }
          console.log('✅ Login successful, returning token and user data');
          res.json({
            token,
            user: {
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role
            }
          });
        }
      );
      return;
    }

    // For all other users, check password with bcrypt
    console.log('🔐 Comparing password with bcrypt...');
    console.log('Input password:', password);
    console.log('Stored password:', user.password);
    
    const isMatch = await bcrypt.compare(password, user.password);
    console.log('Password match result:', isMatch);

    if (!isMatch) {
      console.log('❌ Password does not match');
      return res.status(400).json({ 
        message: 'Invalid credentials',
        debug: {
          passwordMatch: false
        }
      });
    }

    console.log('✅ Password matches');
    
    // Create JWT token
    const payload = {
      user: {
        id: user.id,
        role: user.role
      }
    };

    console.log('📝 Creating JWT token...');
    jwt.sign(
      payload,
      process.env.JWT_SECRET || 'library_secret',
      { expiresIn: '7d' },
      (err, token) => {
        if (err) {
          console.log('❌ Error creating JWT token:', err);
          throw err;
        }
        console.log('✅ Login successful, returning token and user data');
        res.json({
          token,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role
          }
        });
      }
    );
  } catch (error) {
    console.error('💥 Server error during login:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).send('Server error');
  }
});

module.exports = router;