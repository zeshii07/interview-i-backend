const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors( ));
app.use(express.json({ limit: '10mb' }));

// Routes
const interviewRoutes = require('./routes/interviewRoutes');
app.use('/api/interview', interviewRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'InterviewAI API is running',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: 'Something went wrong!'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║     InterviewAI Backend Running          ║
  ║     Port: ${PORT}                         ║
  ║     Env: ${process.env.NODE_ENV}                    ║
  ║     URL: http://localhost:${PORT}         ║
  ╚══════════════════════════════════════════╝
  `);
});