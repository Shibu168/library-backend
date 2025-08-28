const express = require('express');
const { check, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const router = express.Router();
const pool = require('../config/db');

// Get all books
router.get('/', async (req, res) => {
  try {
    console.log('📚 Fetching all books');
    const result = await pool.query('SELECT * FROM books ORDER BY title');
    console.log('✅ Books found:', result.rows.length);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Database error:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get available books (with copies > 0)
router.get('/available', async (req, res) => {
  try {
    const booksResult = await pool.query(
      'SELECT * FROM books WHERE available_copies > 0 ORDER BY title'
    );
    res.json(booksResult.rows);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
});

// Add new book (Librarian and Admin only)
router.post('/', [
  auth,
  check('title', 'Title is required').not().isEmpty(),
  check('author', 'Author is required').not().isEmpty(),
  check('isbn', 'ISBN is required').not().isEmpty(),
  check('category', 'Category is required').not().isEmpty(),
  check('rack_no', 'Rack number is required').not().isEmpty(),
  check('total_copies', 'Total copies must be a positive integer').isInt({ min: 1 })
], async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'librarian') {
    return res.status(403).json({ message: 'Access denied' });
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { title, author, isbn, category, rack_no, total_copies } = req.body;

  try {
    // Check if book with ISBN already exists
    const bookExists = await pool.query(
      'SELECT * FROM books WHERE isbn = $1',
      [isbn]
    );

    if (bookExists.rows.length > 0) {
      return res.status(400).json({ message: 'Book with this ISBN already exists' });
    }

    // Insert new book
    const newBook = await pool.query(
      'INSERT INTO books (title, author, isbn, category, rack_no, total_copies, available_copies) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [title, author, isbn, category, rack_no, total_copies, total_copies]
    );

    res.json(newBook.rows[0]);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
});
// Get books count
router.get('/count', async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*) FROM books');
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (error) {
    console.error('Error getting books count:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;