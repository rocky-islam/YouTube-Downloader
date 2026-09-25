const express = require('express');
const youtubedl = require('youtube-dl-exec');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = 3000;

app.use(express.json());
app.use(express.static('public'));
app.use('/downloads', express.static('downloads'));

// Ensure downloads directory exists
const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
}

// Auto-delete files older than 2 hours to save server space
const MAX_FILE_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours
setInterval(() => {
    fs.readdir(downloadsDir, (err, files) => {
        if (err) return console.error('Failed to read downloads dir:', err);
        const now = Date.now();
        files.forEach(file => {
            const filePath = path.join(downloadsDir, file);
            fs.stat(filePath, (err, stats) => {
                if (err) return;
                // Delete if file is older than MAX_FILE_AGE_MS
                if (now - stats.birthtimeMs > MAX_FILE_AGE_MS) {
                    fs.unlink(filePath, err => {
                        if (err) console.error(`Failed to delete old file: ${filePath}`, err);
                        else console.log(`Auto-deleted old file: ${file}`);
                    });
                }
            });
        });
    });
}, 60 * 60 * 1000); // Runs every 1 hour

// Map to track active download processes so we can cancel them if needed (optional future feature)
const activeDownloads = new Map();

io.on('connection', (socket) => {
    console.log('A client connected:', socket.id);
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

app.post('/api/info', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    try {
        const options = {
            dumpJson: true,
            noWarnings: true,
            geoBypass: true,
            extractorArgs: 'youtube:player_client=android,web'
        };
        const cookiesPath = path.join(__dirname, 'cookies.txt');
        if (fs.existsSync(cookiesPath)) {
            options.cookies = cookiesPath;
        }

        const info = await youtubedl(url, options);

        const videoTracks = [];
        const audioTracks = [];
        const subtitles = info.subtitles || {};
        const availableSubs = Object.keys(subtitles).map(lang => ({
            id: lang,
            name: subtitles[lang][0]?.name || lang
        }));

        const formats = info.formats || [];
        for (const f of formats) {
            const formatId = f.format_id;
            const ext = f.ext;
            const vcodec = f.vcodec || 'none';
            const acodec = f.acodec || 'none';

            if (vcodec === 'none' && acodec !== 'none') {
                const language = f.language || 'default';
                const abr = f.abr || 0;
                audioTracks.push({
                    id: formatId,
                    ext: ext,
                    abr: abr,
                    language: language,
                    desc: `${language} - ${abr}kbps (${ext})`
                });
            } else if (vcodec !== 'none') {
                const res = f.resolution || `${f.width || '?'}x${f.height || '?'}`;
                const fps = f.fps || '';
                videoTracks.push({
                    id: formatId,
                    ext: ext,
                    res: res,
                    fps: fps,
                    desc: `${res} @ ${fps}fps (${ext})`
                });
            }
        }

        res.json({
            title: info.title,
            thumbnail: info.thumbnail,
            videoTracks,
            audioTracks,
            availableSubs
        });
    } catch (error) {
        console.error('Error fetching info:', error);
        res.status(500).json({ error: 'Failed to fetch video information' });
    }
});

app.post('/api/playlist-info', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    try {
        const options = {
            dumpJson: true,
            flatPlaylist: true,
            noWarnings: true,
            geoBypass: true,
            extractorArgs: 'youtube:player_client=android,web'
        };
        const cookiesPath = path.join(__dirname, 'cookies.txt');
        if (fs.existsSync(cookiesPath)) {
            options.cookies = cookiesPath;
        }

        const info = await youtubedl(url, options);

        if (!info.entries) {
            return res.status(400).json({ error: 'Not a playlist' });
        }

        const entries = info.entries.map((entry, index) => ({
            index: index + 1,
            id: entry.id,
            title: entry.title,
            url: entry.url
        }));

        res.json({ title: info.title, entries });
    } catch (error) {
        console.error('Error fetching playlist:', error);
        res.status(500).json({ error: 'Failed to fetch playlist' });
    }
});

app.post('/api/download', async (req, res) => {
    const { 
        url, videoId, audioId, clientId, 
        audioOnly, startTime, endTime, subtitleLang 
    } = req.body;
    
    if (!url || !clientId) {
        return res.status(400).json({ error: 'URL and Client ID are required' });
    }

    const jobId = uuidv4();
    const outputFilename = `download_${Date.now()}_${jobId.substring(0, 5)}`;
    let outputPath = path.join(__dirname, 'downloads', outputFilename);
    
    // Final extension gets set by yt-dlp based on merge format
    const finalExt = audioOnly ? 'm4a' : 'mp4'; 
    
    // Acknowledge the request immediately
    res.json({ success: true, jobId, message: 'Download started' });

    // Build arguments
    const flags = {
        output: outputPath + '.%(ext)s', // Let yt-dlp determine extension during processing
        noWarnings: true,
        geoBypass: true,
        extractorArgs: 'youtube:player_client=android,web'
    };
    
    const cookiesPath = path.join(__dirname, 'cookies.txt');
    if (fs.existsSync(cookiesPath)) {
        flags.cookies = cookiesPath;
    }

    if (audioOnly) {
        flags.format = audioId || 'bestaudio';
        flags.extractAudio = true;
        flags.audioFormat = 'm4a'; // enforce m4a or mp3
    } else {
        if (!videoId || !audioId) {
            io.to(clientId).emit('downloadError', { jobId, error: 'Video and Audio ID required for video download' });
            return;
        }
        flags.format = `${videoId}+${audioId}`;
        flags.mergeOutputFormat = 'mp4';
    }

    if (startTime && endTime) {
        flags.downloadSections = `*${startTime}-${endTime}`;
    }

    if (subtitleLang && !audioOnly) {
        flags.writeSubs = true;
        flags.subLangs = subtitleLang;
        flags.embedSubs = true;
    }

    console.log(`Starting job ${jobId} for url ${url}`);
    
    try {
        const dlProcess = youtubedl.exec(url, flags);
        activeDownloads.set(jobId, dlProcess);

        dlProcess.stdout.on('data', (data) => {
            const output = data.toString();
            // Parse yt-dlp output for progress
            // typical line: [download]  15.2% of 45.2MiB at 3.2MiB/s ETA 00:15
            const progressMatch = output.match(/\[download\]\s+([\d\.]+)%\s+of\s+([~]?[\d\.]+.*?)\s+at\s+([\d\.]+.*?)\s+ETA\s+([\d:]+)/);
            if (progressMatch) {
                io.to(clientId).emit('downloadProgress', {
                    jobId,
                    percent: parseFloat(progressMatch[1]),
                    totalSize: progressMatch[2],
                    speed: progressMatch[3],
                    eta: progressMatch[4]
                });
            }
        });

        dlProcess.stderr.on('data', (data) => {
            console.log(`yt-dlp stderr (${jobId}):`, data.toString().trim());
        });

        await dlProcess;
        activeDownloads.delete(jobId);
        
        // Return success to the client
        io.to(clientId).emit('downloadComplete', { 
            jobId, 
            fileUrl: `/downloads/${outputFilename}.${finalExt}`
        });

    } catch (error) {
        console.error(`Error in job ${jobId}:`, error.message);
        activeDownloads.delete(jobId);
        io.to(clientId).emit('downloadError', { jobId, error: 'Download process failed or was cancelled' });
    }
});

app.post('/api/cancel', (req, res) => {
    const { jobId } = req.body;
    if (!jobId) return res.status(400).json({ error: 'Job ID required' });

    if (activeDownloads.has(jobId)) {
        const dlProcess = activeDownloads.get(jobId);
        dlProcess.kill('SIGINT'); // Gracefully kill yt-dlp
        activeDownloads.delete(jobId);
        res.json({ success: true, message: 'Download cancelled' });
    } else {
        res.status(404).json({ error: 'Job not found or already finished' });
    }
});

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
