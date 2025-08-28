const express = require('express');
const bcrypt = require('bcryptjs');
const { check, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const router = express.Router();
const pool = require('../config/db');

router.get('/', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'librarian') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { role } = req.query;
    let query = 'SELECT id, name, email, role, created_at FROM users';
    let params = [];

    if (role) {
      query += ' WHERE role = $1 ORDER BY created_at DESC';
      params = [role];
    } else {
      query += ' WHERE role IN ($1, $2) ORDER BY created_at DESC';
      params = ['librarian', 'member'];
    }

    console.log('👥 Fetching users with role:', role);
    const usersResult = await pool.query(query, params);
    console.log('✅ Users found:', usersResult.rows.length);
    res.json(usersResult.rows);
  } catch (error) {
    console.error('❌ Database error:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get all users (Admin only)
router.get('/', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const usersResult = await pool.query(
      'SELECT id, name, email, role, created_at FROM users WHERE role IN ($1, $2) ORDER BY created_at DESC',
      ['librarian', 'member']
    );

    res.json(usersResult.rows);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
});

// Create user (Admin only)
router.post('/', [
  auth,
  check('name', 'Name is required').not().isEmpty(),
  check('email', 'Please include a valid email').isEmail(),
  check('password', 'Password must be at least 6 characters').isLength({ min: 6 }),
  check('role', 'Role is required').isIn(['librarian', 'member'])
], async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied' });
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, email, password, role } = req.body;

  try {
    // Check if user exists
    const userExists = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (userExists.rows.length > 0) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Encrypt password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const newUser = await pool.query(
      'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, created_at',
      [name, email, hashedPassword, role]
    );

    res.json(newUser.rows[0]);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
});

// Delete user (Admin only)
router.delete('/:id', auth, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied' });
  }

  try {
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ message: 'User deleted' });
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
});

// Change user password (Admin/Librarian can change member passwords)
router.put('/:id/password', [
  auth,
  check('new_password', 'New password must be at least 6 characters').isLength({ min: 6 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { new_password } = req.body;
    const targetUserId = parseInt(req.params.id);

    // Check permissions
    if (req.user.role === 'member' && req.user.id !== targetUserId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (req.user.role === 'librarian') {
      const targetUser = await pool.query('SELECT role FROM users WHERE id = $1', [targetUserId]);
      if (targetUser.rows[0]?.role !== 'member') {
        return res.status(403).json({ message: 'Librarians can only change member passwords' });
      }
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(new_password, salt);

    // Update password
    await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, targetUserId]);

    // Create notification
    await pool.query(
      `INSERT INTO notifications (user_id, message, type, related_id, related_type)
       VALUES ($1, $2, 'password_change', $3, 'user')`,
      [targetUserId, 'Your password was changed by an administrator', targetUserId]
    );

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Error changing password:', error.message);
    res.status(500).send('Server error');
  }
});
// Edit user password (Admin/Librarian can edit member passwords)
router.put('/:id/edit-password', [
  auth,
  check('new_password', 'New password must be at least 6 characters').isLength({ min: 6 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { new_password } = req.body;
    const targetUserId = parseInt(req.params.id);

    // Check permissions
    if (req.user.role === 'member') {
      return res.status(403).json({ message: 'Access denied. Members cannot edit passwords.' });
    }

    // Get target user info
    const targetUserResult = await pool.query('SELECT id, name, role FROM users WHERE id = $1', [targetUserId]);
    if (targetUserResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const targetUser = targetUserResult.rows[0];

    // Librarians can only edit member passwords
    if (req.user.role === 'librarian' && targetUser.role !== 'member') {
      return res.status(403).json({ message: 'Librarians can only edit member passwords' });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(new_password, salt);

    // Update password
    await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, targetUserId]);

    // Create notification for the user
    await pool.query(
      `INSERT INTO notifications (user_id, message, type, related_id, related_type)
       VALUES ($1, $2, 'password_change', $3, 'user')`,
      [targetUserId, 'Your password was updated by a librarian', targetUserId]
    );

    // Create notification for admin (if changed by librarian)
    if (req.user.role === 'librarian') {
      const librarian = await pool.query('SELECT name FROM users WHERE id = $1', [req.user.id]);
      const librarianName = librarian.rows[0]?.name || 'Unknown Librarian';
      
      await pool.query(
        `INSERT INTO notifications (user_id, message, type, related_id, related_type)
         SELECT id, $1, 'password_change', $2, 'user' FROM users WHERE role = 'admin'`,
        [`Librarian ${librarianName} updated password for member ${targetUser.name}`, targetUserId]
      );
    }

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Error updating password:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// Get users count (excluding admin)
router.get('/count', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT COUNT(*) FROM users WHERE role IN ($1, $2)',
      ['librarian', 'member']
    );
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (error) {
    console.error('Error getting users count:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// Create member (Librarian can create members)
router.post('/member', [
  auth,
  check('name', 'Name is required').not().isEmpty(),
  check('email', 'Please include a valid email').isEmail(),
  check('password', 'Password must be at least 6 characters').isLength({ min: 6 })
], async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'librarian') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, password } = req.body;

    // Check if user exists
    const userExists = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const newUser = await pool.query(
      'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, created_at',
      [name, email, hashedPassword, 'member']
    );

    res.json(newUser.rows[0]);
  } catch (error) {
    console.error('Error creating member:', error.message);
    res.status(500).send('Server error');
  }
});

module.exports = router;