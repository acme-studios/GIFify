# FFmpeg GIF Converter

A production-ready video to GIF converter powered by FFmpeg and Cloudflare Containers.

## Features

### Core Functionality
- **Video to GIF Conversion**: Convert MP4, MOV, AVI, MKV, WebM videos to animated GIFs
- **Quality Presets**: Three quality levels (Low, Medium, High) with optimized settings
- **Video Thumbnails**: Automatic thumbnail generation for video preview
- **Progress Tracking**: Real-time conversion progress with detailed status updates

### Security & Reliability
- **File Size Limits**: 100MB maximum upload size
- **File Type Validation**: Only allows supported video formats
- **Filename Sanitization**: Prevents command injection attacks
- **Timeout Protection**: 120-second timeout for conversions, 30-second for thumbnails
- **Proper Error Handling**: Comprehensive error messages and logging

### Performance
- **Async/Await**: Modern promise-based architecture
- **Optimal Color Palettes**: Uses FFmpeg's palettegen for better GIF quality
- **Automatic Cleanup**: Temporary files removed after processing
- **Health Checks**: `/health` and `/ready` endpoints for monitoring

### User Experience
- **Modern UI**: Gradient background with polished components
- **Drag & Drop**: Easy file selection interface
- **Thumbnail Preview**: See video preview before conversion
- **Quality Selector**: Choose between low, medium, and high quality
- **Progress Bar**: Visual feedback during conversion
- **Error Messages**: Clear, actionable error notifications

## Architecture

```
User Request
    ↓
Cloudflare Worker (src/index.js)
    ↓
Docker Container
    ↓
Express Server (server.js)
    ↓
FFmpeg Processing
    ↓
GIF Response
```

## API Endpoints

### `GET /health`
Health check endpoint for container monitoring.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-11-07T19:00:00.000Z",
  "uptime": 123.456
}
```

### `GET /ready`
Readiness check that verifies FFmpeg availability.

**Response:**
```json
{
  "status": "ready",
  "ffmpeg": "available",
  "timestamp": "2024-11-07T19:00:00.000Z"
}
```

### `POST /thumbnail`
Generate a thumbnail from uploaded video.

**Request:**
- Content-Type: `multipart/form-data`
- Field: `video` (video file)

**Response:**
- Content-Type: `image/jpeg`
- Body: JPEG thumbnail image

**Errors:**
- `400`: No video file uploaded
- `500`: Thumbnail generation failed

### `POST /convert`
Convert video to GIF with quality options.

**Request:**
- Content-Type: `multipart/form-data`
- Fields:
  - `video` (video file)
  - `quality` (optional: "low", "medium", "high", default: "medium")

**Response:**
- Content-Type: `image/gif`
- Body: Animated GIF file

**Errors:**
- `400`: No video file or invalid quality setting
- `408`: Conversion timeout
- `413`: File too large
- `500`: Conversion failed

## Quality Presets

| Quality | Resolution | FPS | Colors | Use Case |
|---------|-----------|-----|--------|----------|
| Low     | 320px     | 10  | 128    | Smaller file size, quick sharing |
| Medium  | 480px     | 15  | 256    | Balanced quality and size |
| High    | 640px     | 20  | 256    | Best quality, larger files |

## Configuration

Edit `server.js` to modify these settings:

```javascript
const CONFIG = {
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB limit
  FFMPEG_TIMEOUT: 120000,           // 120 seconds
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
```

## Development

### Local Testing

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open browser:
```
http://localhost:8080
```

### Docker Build

```bash
docker build -t ffmpeg-gif-app .
docker run -p 8080:8080 ffmpeg-gif-app
```

### Deploy to Cloudflare

```bash
npx wrangler deploy
```

## Logging

The application uses structured JSON logging for easy parsing and monitoring:

```json
{
  "level": "info",
  "message": "Starting video conversion",
  "input": "/path/to/video.mp4",
  "quality": "medium",
  "fileSize": 5242880,
  "timestamp": "2024-11-07T19:00:00.000Z"
}
```

Log levels:
- `info`: Normal operations
- `warn`: Warning conditions
- `error`: Error conditions with stack traces

## Error Handling

### Client-Side Errors
- File too large (>100MB)
- Invalid file type
- Network errors
- Timeout errors

### Server-Side Errors
- FFmpeg execution failures
- File system errors
- Invalid quality settings
- Timeout protection

All errors include:
- Clear error message
- Detailed error information
- Appropriate HTTP status code
- Structured logging

## Performance Considerations

1. **File Size**: Larger videos take longer to process
2. **Quality**: Higher quality = longer processing time
3. **Video Length**: Longer videos = larger GIF files
4. **Container Sleep**: Container sleeps after 5 minutes of inactivity

## Security Features

1. **Filename Sanitization**: Removes special characters to prevent injection
2. **File Type Validation**: Only accepts whitelisted video formats
3. **Size Limits**: Prevents resource exhaustion
4. **Timeout Protection**: Prevents long-running processes
5. **Error Message Sanitization**: Doesn't expose internal paths

## Browser Support

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support
- Mobile browsers: Full support

## Known Limitations

1. Maximum file size: 100MB
2. Maximum processing time: 120 seconds
3. No batch conversion support
4. No video trimming/editing features

## Troubleshooting

### Container won't start
- Check if FFmpeg is installed: `ffmpeg -version`
- Verify port 8080 is available
- Check Docker logs

### Conversion fails
- Verify video format is supported
- Check file size is under 100MB
- Try lower quality setting
- Check server logs for details

### Thumbnail generation fails
- Video might be corrupted
- Format might not be supported
- Check if video has frames at 1-second mark

## Future Improvements

- Video trimming/clipping
- Batch conversion support
- Custom FPS and resolution
- GIF optimization options
- Video format conversion
- Cloud storage integration

## License

ISC
