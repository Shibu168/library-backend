// routes/fines.js
const express = require('express');
const router = express.Router();
const Fine = require('../models/Fine');
const auth = require('../middleware/auth');

// Get fines for a member
router.get('/:memberId/fines', auth, async (req, res) => {
  try {
    const fines = await Fine.find({ 
      member: req.params.memberId,
      status: { $ne: 'paid' }
    }).populate('book', 'title author coverImage');
    
    const totalFine = fines.reduce((sum, fine) => sum + fine.amount, 0);
    
    res.json({ fines, totalFine });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Process payment
router.post('/pay', auth, async (req, res) => {
  try {
    const { fineIds, amount, paymentMethod, transactionId } = req.body;
    
    // Update fines status to paid
    await Fine.updateMany(
      { _id: { $in: fineIds } },
      { 
        status: 'paid',
        paidAt: new Date(),
        paymentMethod,
        transactionId
      }
    );
    
    res.json({ message: 'Payment successful' });
  } catch (error) {
    res.status(500).json({ message: 'Payment failed' });
  }
});

module.exports = router;