const express = require('express');
const auth = require('../middleware/auth');
const router = express.Router();
const pool = require('../config/db');

// Get user notifications
router.get('/', auth, async (req, res) => {
  try {
    const notifications = await pool.query(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(notifications.rows);
  } catch (error) {
    console.error('Error fetching notifications:', error.message);
    res.status(500).send('Server error');
  }
});

// Mark notification as read
router.put('/:id/read', auth, async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Error updating notification:', error.message);
    res.status(500).send('Server error');
  }
});

// Get unread count
router.get('/unread/count', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = FALSE`,
      [req.user.id]
    );
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (error) {
    console.error('Error fetching unread count:', error.message);
    res.status(500).send('Server error');
  }
});

module.exports = router;