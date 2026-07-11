const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const multer = require('multer');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors( ));
app.use(express.json({ limit: '10mb' }));
// Configure Multer to handle file uploads in memory
const upload = multer({ 
  storage: multer.memoryStorage(), 
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max audio file size
});

// Routes
const interviewRoutes = require('./routes/interviewRoutes');
app.use('/api/interview', interviewRoutes);

const transcribeController = require('./controllers/transcribeController');
router.post('/transcribe', upload.single('audio'), transcribeController.transcribeAudioFile);

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