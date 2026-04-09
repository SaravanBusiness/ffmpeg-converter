import express from 'express';
import ffmpeg from 'fluent-ffmpeg';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

app.get('/', (req, res) => {
  res.json({ status: 'Server running ✅' });
});

app.post('/convert', async (req, res) => {
  try {
    const { m4aUrl } = req.body;
    
    if (!m4aUrl) {
      return res.status(400).json({ error: 'M4A URL required' });
    }

    console.log('Converting:', m4aUrl);

    const timestamp = Date.now();
    const m4aPath = path.join(tempDir, `${timestamp}_input.m4a`);
    const mp3Path = path.join(tempDir, `${timestamp}_output.mp3`);

    const response = await axios({
      method: 'get',
      url: m4aUrl,
      responseType: 'stream',
      timeout: 30000,
    });

    const writeStream = fs.createWriteStream(m4aPath);
    response.data.pipe(writeStream);

    writeStream.on('finish', () => {
      console.log('File downloaded, starting conversion...');

      ffmpeg(m4aPath)
        .toFormat('mp3')
        .audioCodec('libmp3lame')
        .audioBitrate(192)
        .on('end', () => {
          console.log('Conversion complete');

          const fileStream = fs.createReadStream(mp3Path);
          res.setHeader('Content-Type', 'audio/mpeg');
          res.setHeader('Content-Disposition', 'attachment; filename="output.mp3"');
          fileStream.pipe(res);

          fileStream.on('end', () => {
            setTimeout(() => {
              try {
                fs.unlinkSync(m4aPath);
                fs.unlinkSync(mp3Path);
              } catch (e) {
                console.log('Cleanup done');
              }
            }, 2000);
          });
        })
        .on('error', (err) => {
          console.error('FFmpeg error:', err.message);
          res.status(500).json({ error: 'Conversion failed: ' + err.message });
        })
        .save(mp3Path);
    });

    writeStream.on('error', (err) => {
      res.status(500).json({ error: 'Download failed: ' + err.message });
    });

  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 FFmpeg conversion server running on port ${PORT}`);
});
