const youtubedl = require('youtube-dl-exec');
const prompt = require('prompt-sync')({sigint: true});

async function main() {
    const url = prompt('Enter YouTube Video URL: ');
    if (!url) {
        console.log("No URL provided.");
        return;
    }

    console.log("Fetching video information... Please wait.");
    let info;
    try {
        info = await youtubedl(url, {
            dumpJson: true,
            noWarnings: true
        });
    } catch (e) {
        console.error("Error fetching video info:", e.message);
        return;
    }

    console.log(`\nTitle: ${info.title}`);

    const videoTracks = [];
    const audioTracks = [];

    // Separate video and audio formats
    const formats = info.formats || [];
    for (const f of formats) {
        const formatId = f.format_id;
        const ext = f.ext;
        const vcodec = f.vcodec || 'none';
        const acodec = f.acodec || 'none';

        // Audio only formats
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
        }
        // Video only formats
        else if (vcodec !== 'none') {
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

    console.log("\n--- Available Video Tracks ---");
    videoTracks.forEach((track, idx) => {
        console.log(`[${idx}] ID: ${track.id} | ${track.desc}`);
    });

    console.log("\n--- Available Audio Tracks ---");
    audioTracks.forEach((track, idx) => {
        console.log(`[${idx}] ID: ${track.id} | Language: ${track.language} | Bitrate: ${track.abr}kbps | Ext: ${track.ext}`);
    });

    const vIdxStr = prompt("\nSelect Video Track Number: ");
    const aIdxStr = prompt("Select Audio Track Number: ");

    const vIdx = parseInt(vIdxStr);
    const aIdx = parseInt(aIdxStr);

    if (isNaN(vIdx) || isNaN(aIdx) || vIdx < 0 || vIdx >= videoTracks.length || aIdx < 0 || aIdx >= audioTracks.length) {
        console.log("Invalid selection. Exiting.");
        return;
    }

    const selectedVideo = videoTracks[vIdx].id;
    const selectedAudio = audioTracks[aIdx].id;

    console.log(`\nYou selected Video ID ${selectedVideo} and Audio ID ${selectedAudio}.`);
    console.log("Starting download and merge process...\n");

    try {
        // Run youtube-dl to download and merge
        // We do not use dumpJson here because we want the download progress in terminal
        // Instead we can spawn a process or just use the exec wrapper
        
        // youtube-dl-exec uses child_process.execFile. If we want output, we can pass standard stdio
        const dlProcess = youtubedl.exec(url, {
            format: `${selectedVideo}+${selectedAudio}`,
            mergeOutputFormat: 'mp4',
            output: '%(title)s.%(ext)s'
        });
        
        dlProcess.stdout.pipe(process.stdout);
        dlProcess.stderr.pipe(process.stderr);
        
        await dlProcess;
        console.log("\nDownload Complete!");
    } catch (e) {
        console.error("Error during download:", e.message);
    }
}

main();
