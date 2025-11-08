import express from 'express';
import multer from 'multer';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);

// Replicate __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 8080;

// Configuration constants
const CONFIG = {
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB limit
  FFMPEG_TIMEOUT: 120000, // 120 seconds
  ALLOWED_MIME_TYPES: [
    'video/mp4',
    'video/quicktime',
    'video/x-msvideo',
    'video/x-matroska',
    'video/webm',
    'video/mpeg'
  ],
  QUALITY_PRESETS: {
    low: { fps: 10, scale: 320, colors: 128 },
    medium: { fps: 15, scale: 480, colors: 256 },
    high: { fps: 20, scale: 640, colors: 256 }
  }
};

// Structured logging utility
const logger = {
  info: (message, meta = {}) => {
    console.log(JSON.stringify({ level: 'info', message, ...meta, timestamp: new Date().toISOString() }));
  },
  error: (message, error = null, meta = {}) => {
    console.error(JSON.stringify({ 
      level: 'error', 
      message, 
      error: error?.message || error, 
      stack: error?.stack,
      ...meta, 
      timestamp: new Date().toISOString() 
    }));
  },
  warn: (message, meta = {}) => {
    console.warn(JSON.stringify({ level: 'warn', message, ...meta, timestamp: new Date().toISOString() }));
  }
};

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  logger.info('Created uploads directory', { path: uploadDir });
}

// Sanitize filename to prevent command injection
const sanitizeFilename = (filename) => {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
};

// Configure multer with file size limits and validation
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const sanitized = sanitizeFilename(file.originalname);
    cb(null, `${Date.now()}-${sanitized}`);
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: CONFIG.MAX_FILE_SIZE,
    files: 1
  },
  fileFilter: (req, file, cb) => {
    if (CONFIG.ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Allowed types: ${CONFIG.ALLOWED_MIME_TYPES.join(', ')}`));
    }
  }
});

// Execute FFmpeg command with timeout
const execWithTimeout = async (command, timeout) => {
  return Promise.race([
    execAsync(command, { maxBuffer: 50 * 1024 * 1024 }),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('FFmpeg execution timeout')), timeout)
    )
  ]);
};

// Clean up files safely
const cleanupFiles = async (filePaths) => {
  for (const filePath of filePaths) {
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
        logger.info('File cleaned up', { path: filePath });
      }
    } catch (error) {
      logger.error('Failed to cleanup file', error, { path: filePath });
    }
  }
};

// Health check endpoint for container monitoring
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Readiness check endpoint
app.get('/ready', async (req, res) => {
  try {
    // Check if FFmpeg is available
    await execAsync('ffmpeg -version');
    res.status(200).json({ 
      status: 'ready', 
      ffmpeg: 'available',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('FFmpeg not available', error);
    res.status(503).json({ 
      status: 'not ready', 
      error: 'FFmpeg not available' 
    });
  }
});

// Generate video thumbnail
app.post('/thumbnail', upload.single('video'), async (req, res) => {
  let inputPath = null;
  let thumbnailPath = null;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file uploaded' });
    }

    inputPath = req.file.path;
    const thumbnailFileName = `thumb-${path.basename(req.file.filename, path.extname(req.file.filename))}.jpg`;
    thumbnailPath = path.join(uploadDir, thumbnailFileName);

    logger.info('Generating thumbnail', { input: inputPath });

    // Extract frame at 1 second mark, scale to 320px width
    const command = `ffmpeg -i "${inputPath}" -ss 00:00:01 -vframes 1 -vf "scale=320:-1" "${thumbnailPath}"`;
    
    await execWithTimeout(command, 30000); // 30 second timeout for thumbnail

    // Send thumbnail as response
    res.sendFile(thumbnailPath, async (err) => {
      if (err) {
        logger.error('Error sending thumbnail', err);
      }
      // Cleanup after sending
      await cleanupFiles([inputPath, thumbnailPath]);
    });

  } catch (error) {
    logger.error('Thumbnail generation failed', error, { input: inputPath });
    await cleanupFiles([inputPath, thumbnailPath]);
    res.status(500).json({ 
      error: 'Failed to generate thumbnail',
      details: error.message 
    });
  }
});

// Convert video to GIF with quality options
app.post('/convert', upload.single('video'), async (req, res) => {
  let inputPath = null;
  let outputPath = null;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file uploaded' });
    }

    // Get quality setting from request (default to medium)
    const quality = req.body.quality || 'medium';
    if (!CONFIG.QUALITY_PRESETS[quality]) {
      return res.status(400).json({ 
        error: 'Invalid quality setting',
        allowed: Object.keys(CONFIG.QUALITY_PRESETS)
      });
    }

    const preset = CONFIG.QUALITY_PRESETS[quality];
    inputPath = req.file.path;
    const outputFileName = `${path.basename(req.file.filename, path.extname(req.file.filename))}.gif`;
    outputPath = path.join(uploadDir, outputFileName);

    logger.info('Starting video conversion', { 
      input: inputPath, 
      quality,
      fileSize: req.file.size 
    });

    // Build FFmpeg command with quality settings
    // Use palettegen for better color quality
    const paletteFile = path.join(uploadDir, `palette-${Date.now()}.png`);
    
    // Generate optimal color palette
    const paletteCmd = `ffmpeg -i "${inputPath}" -vf "fps=${preset.fps},scale=${preset.scale}:-1:flags=lanczos,palettegen=max_colors=${preset.colors}" -y "${paletteFile}"`;
    await execWithTimeout(paletteCmd, CONFIG.FFMPEG_TIMEOUT / 2);

    // Convert to GIF using the palette
    const convertCmd = `ffmpeg -i "${inputPath}" -i "${paletteFile}" -lavfi "fps=${preset.fps},scale=${preset.scale}:-1:flags=lanczos[x];[x][1:v]paletteuse" -y "${outputPath}"`;
    await execWithTimeout(convertCmd, CONFIG.FFMPEG_TIMEOUT);

    logger.info('Conversion successful', { 
      output: outputPath,
      quality 
    });

    // Send the GIF file to client
    res.sendFile(outputPath, async (err) => {
      if (err) {
        logger.error('Error sending GIF file', err);
      }
      // Cleanup all temporary files after sending
      await cleanupFiles([inputPath, outputPath, paletteFile]);
    });

  } catch (error) {
    logger.error('Video conversion failed', error, { 
      input: inputPath,
      output: outputPath 
    });
    
    // Cleanup on error
    await cleanupFiles([inputPath, outputPath]);
    
    // Send appropriate error response
    if (error.message.includes('timeout')) {
      res.status(408).json({ 
        error: 'Conversion timeout',
        details: 'Video processing took too long. Try a shorter video or lower quality.' 
      });
    } else {
      res.status(500).json({ 
        error: 'Video conversion failed',
        details: error.message 
      });
    }
  }
});

// Global error handler for multer errors
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    logger.error('Multer error', error);
    
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ 
        error: 'File too large',
        maxSize: `${CONFIG.MAX_FILE_SIZE / (1024 * 1024)}MB` 
      });
    }
    
    return res.status(400).json({ 
      error: 'File upload error',
      details: error.message 
    });
  }
  
  if (error) {
    logger.error('Unexpected error', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
  
  next();
});

// Start server
app.listen(port, () => {
  logger.info('Server started', { port, nodeVersion: process.version });
  console.log(`Server running at http://localhost:${port}`);
});

    
