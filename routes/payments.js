const express = require('express');
const { check, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const router = express.Router();
const pool = require('../config/db');

// Get all payments (Admin/Librarian)
router.get('/', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'librarian') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const payments = await pool.query(
      `SELECT p.*, u.name as member_name, u2.name as processed_by_name
       FROM payments p
       JOIN users u ON p.member_id = u.id
       LEFT JOIN users u2 ON p.processed_by = u2.id
       ORDER BY p.payment_date DESC`
    );
    res.json(payments.rows);
  } catch (error) {
    console.error('Error fetching payments:', error.message);
    res.status(500).send('Server error');
  }
});

// Get payments for specific member
router.get('/member/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'librarian' && req.user.id !== parseInt(req.params.id)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const payments = await pool.query(
      `SELECT p.*, u.name as processed_by_name
       FROM payments p
       LEFT JOIN users u ON p.processed_by = u.id
       WHERE p.member_id = $1
       ORDER BY p.payment_date DESC`,
      [req.params.id]
    );
    res.json(payments.rows);
  } catch (error) {
    console.error('Error fetching member payments:', error.message);
    res.status(500).send('Server error');
  }
});

// Create payment
router.post('/', [
  auth,
  check('amount', 'Amount is required').isDecimal(),
  check('member_id', 'Member ID is required').isInt(),
  check('issued_book_id', 'Issued book ID is required').isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { amount, member_id, issued_book_id, description, payment_method } = req.body;

    // Check if user has permission
    if (req.user.role !== 'admin' && req.user.role !== 'librarian' && req.user.id !== member_id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Start transaction
    await pool.query('BEGIN');

    // Create payment
    const paymentResult = await pool.query(
      `INSERT INTO payments (amount, member_id, issued_book_id, description, payment_method, processed_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [amount, member_id, issued_book_id, description, payment_method || 'cash', req.user.id]
    );

    // Update issued book fine status
    await pool.query(
      `UPDATE issued_books SET fine_paid = TRUE, payment_date = CURRENT_TIMESTAMP WHERE id = $1`,
      [issued_book_id]
    );

    // Create notification for admins/librarians
    const memberResult = await pool.query('SELECT name FROM users WHERE id = $1', [member_id]);
    const memberName = memberResult.rows[0]?.name || 'Unknown';

    await pool.query(
      `INSERT INTO notifications (user_id, message, type, related_id, related_type)
       SELECT id, $1, 'payment', $2, 'payment' FROM users WHERE role IN ('admin', 'librarian')`,
      [`Member ${memberName} paid fine of $${amount}`, paymentResult.rows[0].id]
    );

    await pool.query('COMMIT');

    res.json(paymentResult.rows[0]);
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Error creating payment:', error.message);
    res.status(500).send('Server error');
  }
});

module.exports = router;