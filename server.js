const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS configuration
const corsOptions = {
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000','https://library-frontend-0kki.onrender.com'],
  credentials: true
};
app.use(cors(corsOptions));

// Enhanced request logging middleware
app.use((req, res, next) => {
  console.log('\n🌐 Incoming Request:', {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
    headers: req.headers,
    body: req.body
  });

  const originalSend = res.send;
  res.send = function (body) {
    console.log('📤 Response:', {
      statusCode: res.statusCode,
      body: body
    });
    originalSend.call(this, body);
  };

  next();
});

// Database connection
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'library_db',
  password: process.env.DB_PASSWORD || 'password',
  port: process.env.DB_PORT || 5432,
});

// Test database connection
app.get('/api/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ message: 'Database connected successfully', time: result.rows[0].now });
  } catch (error) {
    res.status(500).json({ error: 'Database connection failed' });
  }
});

// Simple debug endpoint
app.get('/api/debug/env', (req, res) => {
  res.json({
    DB_USER: process.env.DB_USER,
    DB_HOST: process.env.DB_HOST,
    DB_NAME: process.env.DB_NAME,
    JWT_SECRET: process.env.JWT_SECRET ? 'Set' : 'Not set'
  });
});

// Function to load routes safely
const loadRoute = (path, routePath) => {
  try {
    app.use(path, require(routePath));
    console.log(`✓ Loaded route: ${path}`);
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      console.warn(`⚠️  Route not found: ${routePath}, skipping...`);
    } else {
      console.error(`❌ Error loading route ${routePath}:`, error.message);
    }
  }
};

// Load routes
loadRoute('/api/auth', './routes/auth');
loadRoute('/api/users', './routes/users');
loadRoute('/api/books', './routes/books');
loadRoute('/api/issued-books', './routes/issuedBooks');
loadRoute('/api/book-requests', './routes/bookRequests');
loadRoute('/api/my-books', './routes/myBooks');
loadRoute('/api/payments', './routes/payments');
loadRoute('/api/notifications', './routes/notifications');
loadRoute('/api/admin', './routes/admin'); // ADD THIS LINE
loadRoute('/api/transactions', './routes/transactions'); // ADD THIS LINE

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Handle undefined routes
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
});

module.exports = app;