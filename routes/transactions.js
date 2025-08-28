const express = require('express');
const auth = require('../middleware/auth');
const router = express.Router();
const pool = require('../config/db');

// Get borrowed books count
router.get('/borrowed-count', auth, async (req, res) => {
  try {
    console.log('📚 Fetching borrowed books count');
    const result = await pool.query(
      `SELECT COUNT(*) FROM issued_books 
       WHERE return_date IS NULL AND status = 'issued'`
    );
    const count = parseInt(result.rows[0].count);
    console.log('✅ Borrowed books count:', count);
    res.json({ count });
  } catch (error) {
    console.error('❌ Error getting borrowed books count:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get overdue books count
router.get('/overdue-count', auth, async (req, res) => {
  try {
    console.log('⏰ Fetching overdue books count');
    const result = await pool.query(
      `SELECT COUNT(*) FROM issued_books 
       WHERE return_date IS NULL AND due_date < CURRENT_DATE AND status = 'issued'`
    );
    const count = parseInt(result.rows[0].count);
    console.log('✅ Overdue books count:', count);
    res.json({ count });
  } catch (error) {
    console.error('❌ Error getting overdue books count:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;