const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const multer = require('multer');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// --- Routes ---
const interviewRoutes = require('./routes/interviewRoutes');
app.use('/api/interview', interviewRoutes);

const resumeRoutes = require('./routes/resumeRoutes');
app.use('/api/resume', resumeRoutes);

const jobRoutes = require('./routes/jobRoutes');
app.use('/api/jobs', jobRoutes);

// NEW: Interview readiness routes (Sprint 1)
const readinessRoutes = require('./routes/readinessRoutes');
app.use('/api/interview', readinessRoutes);

const transcribeController = require('./controllers/transcribeController');
app.post('/api/interview/transcribe', upload.single('audio'), transcribeController.transcribeAudioFile);

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Hirely AI API is running',
    apiVersion: 4,
    features: [
      'multilanguage-interviews',
      'resume-file-upload',
      'job-search-multi-provider',
      'interview-readiness-score',
    ],
    timestamp: new Date().toISOString(),
  });
});

app.use((error, _req, res, next) => {
  if (!error) return next();
  if (error.name === 'MulterError' || /PDF|DOCX|DOC|resume|audio|file size/i.test(error.message)) {
    return res.status(400).json({ success: false, message: error.message });
  }
  return next(error);
});

app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Something went wrong!' });
});

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
