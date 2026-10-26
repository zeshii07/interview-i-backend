const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const multer = require('multer');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Multer for audio file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// --- Routes ---
const interviewRoutes = require('./routes/interviewRoutes');
app.use('/api/interview', interviewRoutes);

const resumeRoutes = require('./routes/resumeRoutes');
app.use('/api/resume', resumeRoutes);

// NEW: Job search routes (multi-source aggregator)
const jobRoutes = require('./routes/jobRoutes');
app.use('/api/jobs', jobRoutes);

// Transcribe Route (attached directly to app — uses upload.single('audio'))
const transcribeController = require('./controllers/transcribeController');
app.post('/api/interview/transcribe', upload.single('audio'), transcribeController.transcribeAudioFile);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Hirely AI API is running',
    apiVersion: 3,
    features: [
      'multilanguage-interviews',
      'resume-file-upload',
      'job-search-multi-provider',
    ],
    timestamp: new Date().toISOString(),
  });
});

// Generic multer / upload error handler (must come BEFORE the catch-all)
app.use((error, _req, res, next) => {
  if (!error) return next();
  if (error.name === 'MulterError' || /PDF|DOCX|DOC|resume|audio|file size/i.test(error.message)) {
    return res.status(400).json({ success: false, message: error.message });
  }
  return next(error);
});

// Catch-all error handler
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: 'Something went wrong!',
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║       Hirely Backend Running              ║
  ║       Port: ${PORT}                         ║
  ║       Env: ${process.env.NODE_ENV || 'development'}                    ║
  ║       URL: http://localhost:${PORT}         ║
  ╚══════════════════════════════════════════╝
  `);
});
