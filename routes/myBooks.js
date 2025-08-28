const express = require('express');
const auth = require('../middleware/auth');
const router = express.Router();
const pool = require('../config/db');

// Get member's issued books
router.get('/', auth, async (req, res) => {
  if (req.user.role !== 'member') {
    return res.status(403).json({ message: 'Access denied. Members only.' });
  }

  try {
    const issuedBooks = await pool.query(
      `SELECT ib.*, b.title, b.author, b.isbn, b.category
       FROM issued_books ib
       JOIN books b ON ib.book_id = b.id
       WHERE ib.member_id = $1
       ORDER BY ib.issue_date DESC`,
      [req.user.id]
    );
    
    res.json(issuedBooks.rows);
  } catch (error) {
    console.error('Error fetching member books:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;