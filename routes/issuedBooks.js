const express = require('express');
const { check, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const router = express.Router();
const pool = require('../config/db');

// Get all issued books
router.get('/', auth, async (req, res) => {
  try {
    console.log('📖 Fetching issued books');
    const result = await pool.query(
      `SELECT ib.*, b.title, b.author, u.name as member_name 
       FROM issued_books ib
       JOIN books b ON ib.book_id = b.id
       JOIN users u ON ib.member_id = u.id
       ORDER BY ib.issue_date DESC`
    );
    console.log('✅ Issued books found:', result.rows.length);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Database error:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Issue a book (simple version for testing)
router.post('/', [
  auth,
  check('book_id', 'Book ID is required').isInt(),
  check('member_id', 'Member ID is required').isInt(),
  check('due_date', 'Due date is required').isDate()
], async (req, res) => {
  console.log('Issue book request:', req.body);
  
  if (req.user.role !== 'admin' && req.user.role !== 'librarian') {
    return res.status(403).json({ message: 'Access denied' });
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { book_id, member_id, due_date } = req.body;
  const issue_date = new Date();

  try {
    // Check if book exists
    const bookResult = await pool.query('SELECT * FROM books WHERE id = $1', [book_id]);
    if (bookResult.rows.length === 0) {
      return res.status(404).json({ message: 'Book not found' });
    }

    const book = bookResult.rows[0];
    if (book.available_copies < 1) {
      return res.status(400).json({ message: 'No copies available' });
    }

    // Check if member exists
    const memberResult = await pool.query('SELECT * FROM users WHERE id = $1 AND role = $2', [member_id, 'member']);
    if (memberResult.rows.length === 0) {
      return res.status(404).json({ message: 'Member not found' });
    }

    // Insert issued book record
    const result = await pool.query(
      'INSERT INTO issued_books (book_id, member_id, issue_date, due_date) VALUES ($1, $2, $3, $4) RETURNING *',
      [book_id, member_id, issue_date, due_date]
    );

    // Update available copies
    await pool.query(
      'UPDATE books SET available_copies = available_copies - 1 WHERE id = $1',
      [book_id]
    );

    console.log('Book issued successfully:', result.rows[0]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error issuing book:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Return a book
router.put('/:id/return', auth, async (req, res) => {
  console.log('Return book request for ID:', req.params.id);
  
  try {
    const returnDate = new Date();
    
    // Update the issued book record
    const result = await pool.query(
      'UPDATE issued_books SET return_date = $1 WHERE id = $2 RETURNING *',
      [returnDate, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Issued book not found' });
    }

    // Get book_id to update available copies
    const issuedBook = result.rows[0];
    
    // Increment available copies
    await pool.query(
      'UPDATE books SET available_copies = available_copies + 1 WHERE id = $1',
      [issuedBook.book_id]
    );

    console.log('Book returned successfully:', issuedBook);
    res.json({ message: 'Book returned successfully', book: issuedBook });
  } catch (error) {
    console.error('Error returning book:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;