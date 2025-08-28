const express = require('express');
const auth = require('../middleware/auth');
const router = express.Router();
const pool = require('../config/db');

// @route   GET /api/admin/dashboard-stats
// @desc    Get dashboard statistics for admin
// @access  Private (Admin only)
router.get('/dashboard-stats', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin only.' });
    }

    console.log('📊 Fetching dashboard stats for admin');

    // Get total books count
    const booksResult = await pool.query('SELECT COUNT(*) FROM books');
    const totalBooks = parseInt(booksResult.rows[0].count);

    // Get total users count (excluding admin)
    const usersResult = await pool.query(
      'SELECT COUNT(*) FROM users WHERE role IN ($1, $2)',
      ['librarian', 'member']
    );
    const totalUsers = parseInt(usersResult.rows[0].count);

    // Get currently borrowed books count
    const borrowedResult = await pool.query(
      `SELECT COUNT(*) FROM issued_books 
       WHERE return_date IS NULL AND status = 'issued'`
    );
    const totalBorrowed = parseInt(borrowedResult.rows[0].count);

    // Get overdue books count - FIXED QUERY
    const overdueResult = await pool.query(
      `SELECT COUNT(*) FROM issued_books 
       WHERE return_date IS NULL 
       AND due_date <= CURRENT_DATE 
       AND status IN ('issued', 'overdue')`
    );
    const overdueBooks = parseInt(overdueResult.rows[0].count);

    console.log('📊 Overdue books count:', overdueBooks);

    // Get recent activity (last 10 activities)
    const activityResult = await pool.query(`
      SELECT 
        'issue' as type,
        'Book issued: ' || b.title as message,
        ib.issue_date as timestamp
      FROM issued_books ib
      JOIN books b ON ib.book_id = b.id
      WHERE ib.issue_date >= CURRENT_DATE - INTERVAL '7 days'
      
      UNION ALL
      
      SELECT 
        'return' as type,
        'Book returned: ' || b.title as message,
        ib.return_date as timestamp
      FROM issued_books ib
      JOIN books b ON ib.book_id = b.id
      WHERE ib.return_date >= CURRENT_DATE - INTERVAL '7 days'
      
      UNION ALL
      
      SELECT 
        'user' as type,
        'New user registered: ' || name as message,
        created_at as timestamp
      FROM users
      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
        AND role IN ('librarian', 'member')
      
      ORDER BY timestamp DESC
      LIMIT 10
    `);

    // Calculate trends (simplified for demo)
    const booksTrend = 12; // Example trend value
    const usersTrend = 5;  // Example trend value
    const borrowedTrend = 8; // Example trend value
    const overdueTrend = overdueBooks > 0 ? 10 : -3; // Dynamic trend based on actual count

    // Calculate library health metrics
    const availabilityRate = await calculateAvailabilityRate();
    const satisfactionRate = 88; // Example value
    const uptime = 99.9; // Example value

    // Get notifications
    const notificationsResult = await pool.query(`
      SELECT * FROM notifications 
      WHERE user_id = $1 OR user_id IS NULL
      ORDER BY created_at DESC 
      LIMIT 10
    `, [req.user.id]);

    console.log('✅ Dashboard stats fetched successfully');
    
    res.json({
      stats: {
        totalBooks,
        totalUsers,
        totalBorrowed,
        overdueBooks,
        booksTrend,
        usersTrend,
        borrowedTrend,
        overdueTrend,
        availabilityRate,
        satisfactionRate,
        uptime
      },
      recentActivity: activityResult.rows,
      notifications: notificationsResult.rows
    });

  } catch (error) {
    console.error('❌ Error fetching dashboard stats:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Helper function for availability rate
async function calculateAvailabilityRate() {
  try {
    const totalResult = await pool.query('SELECT SUM(total_copies) as total FROM books');
    const availableResult = await pool.query('SELECT SUM(available_copies) as available FROM books');
    
    const total = parseInt(totalResult.rows[0].total) || 1;
    const available = parseInt(availableResult.rows[0].available) || 0;
    
    return Math.round((available / total) * 100);
  } catch (error) {
    console.error('Error calculating availability rate:', error);
    return 92; // Fallback value
  }
}

module.exports = router;