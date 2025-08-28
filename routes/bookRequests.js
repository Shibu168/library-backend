const express = require('express');
const { check, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const router = express.Router();
const pool = require('../config/db');

// Create book request (Member only)
router.post('/', [
  auth,
  check('book_id', 'Book ID is required').isInt()
], async (req, res) => {
  console.log('Book request received:', req.body);
  
  if (req.user.role !== 'member') {
    return res.status(403).json({ message: 'Access denied. Members only.' });
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { book_id } = req.body;
  const member_id = req.user.id;

  try {
    // Check if book exists
    const bookResult = await pool.query(
      'SELECT * FROM books WHERE id = $1',
      [book_id]
    );

    if (bookResult.rows.length === 0) {
      return res.status(404).json({ message: 'Book not found' });
    }

    const book = bookResult.rows[0];

    // Check if book is available
    if (book.available_copies < 1) {
      return res.status(400).json({ message: 'Book is not available' });
    }

    // Check if member already has a pending request for this book
    const existingRequest = await pool.query(
      'SELECT * FROM book_requests WHERE book_id = $1 AND member_id = $2 AND status = $3',
      [book_id, member_id, 'pending']
    );

    if (existingRequest.rows.length > 0) {
      return res.status(400).json({ message: 'You already have a pending request for this book' });
    }

    // Check if member already has this book issued
    const existingIssue = await pool.query(
      'SELECT * FROM issued_books WHERE book_id = $1 AND member_id = $2 AND return_date IS NULL',
      [book_id, member_id]
    );

    if (existingIssue.rows.length > 0) {
      return res.status(400).json({ message: 'You already have this book issued' });
    }

    // Create book request
    const newRequest = await pool.query(
      'INSERT INTO book_requests (book_id, member_id, status) VALUES ($1, $2, $3) RETURNING *',
      [book_id, member_id, 'pending']
    );

    console.log('Book request created:', newRequest.rows[0]);
    res.json(newRequest.rows[0]);
  } catch (error) {
    console.error('Error creating book request:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get all book requests
router.get('/', auth, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'librarian') {
    return res.status(403).json({ message: 'Access denied' });
  }

  try {
    const requests = await pool.query(
      `SELECT br.*, b.title, b.author, u.name as member_name, u.email as member_email
       FROM book_requests br
       JOIN books b ON br.book_id = b.id
       JOIN users u ON br.member_id = u.id
       WHERE br.status = 'pending'
       ORDER BY br.request_date DESC`
    );
    res.json(requests.rows);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
});

// Update book request status
router.put('/:id', [
  auth,
  check('status', 'Status is required').isIn(['approved', 'rejected'])
], async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'librarian') {
    return res.status(403).json({ message: 'Access denied' });
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { status } = req.body;
  const { id } = req.params;

  try {
    // Update the book request status
    const result = await pool.query(
      'UPDATE book_requests SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
});

module.exports = router;