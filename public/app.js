const socket = io();

// State
let currentUrl = '';
let isPlaylistMode = false;
let playlistItems = [];
let myClientId = socket.id;

socket.on('connect', () => {
    myClientId = socket.id;
});

// DOM Elements
const urlInput = document.getElementById('urlInput');
const fetchBtn = document.getElementById('fetchBtn');
const loading = document.getElementById('loading');
const errorBox = document.getElementById('errorBox');

// Views
const singleVideoView = document.getElementById('singleVideoView');
const playlistView = document.getElementById('playlistView');
const downloadManager = document.getElementById('downloadManager');
const activeJobs = document.getElementById('activeJobs');

// Single Video Elements
const videoThumb = document.getElementById('videoThumb');
const videoTitle = document.getElementById('videoTitle');
const videoSelect = document.getElementById('videoSelect');
const audioSelect = document.getElementById('audioSelect');
const subtitleSelect = document.getElementById('subtitleSelect');
const audioOnlyToggle = document.getElementById('audioOnlyToggle');
const videoSelectGroup = document.getElementById('videoSelectGroup');
const subtitleGroup = document.getElementById('subtitleGroup');
const trimStart = document.getElementById('trimStart');
const trimEnd = document.getElementById('trimEnd');
const downloadBtn = document.getElementById('downloadBtn');

// Playlist Elements
const playlistTitle = document.getElementById('playlistTitle');
const playlistList = document.getElementById('playlistList');
const downloadPlaylistBtn = document.getElementById('downloadPlaylistBtn');
const selectAllBtn = document.getElementById('selectAllBtn');
const deselectAllBtn = document.getElementById('deselectAllBtn');

// Tabs
const tabBtns = document.querySelectorAll('.tab-btn');

// Language Mapping
const languageMap = {
    'en': 'English', 'bn': 'Bengali', 'hi': 'Hindi', 'es': 'Spanish',
    'fr': 'French', 'de': 'German', 'it': 'Italian', 'pt': 'Portuguese',
    'ru': 'Russian', 'ja': 'Japanese', 'ko': 'Korean', 'zh': 'Chinese',
    'zh-Hans': 'Chinese (Simplified)', 'zh-Hant': 'Chinese (Traditional)',
    'ar': 'Arabic', 'ur': 'Urdu', 'ta': 'Tamil', 'te': 'Telugu',
    'mr': 'Marathi', 'gu': 'Gujarati', 'kn': 'Kannada', 'ml': 'Malayalam',
    'pa': 'Punjabi', 'th': 'Thai', 'vi': 'Vietnamese', 'id': 'Indonesian',
    'tr': 'Turkish', 'pl': 'Polish', 'uk': 'Ukrainian', 'nl': 'Dutch',
    'default': 'Default/Original'
};

function getFullLanguageName(code) {
    if (!code) return 'Default';
    if (languageMap[code]) return languageMap[code];
    const baseCode = code.split('-')[0];
    if (languageMap[baseCode]) return languageMap[baseCode] + ` (${code})`;
    return code.toUpperCase();
}

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        isPlaylistMode = btn.dataset.target === 'playlist';
        
        singleVideoView.classList.add('hidden');
        playlistView.classList.add('hidden');
        urlInput.placeholder = isPlaylistMode ? "Paste YouTube Playlist URL..." : "Paste YouTube Video URL...";
    });
});

// Audio Only Toggle
audioOnlyToggle.addEventListener('change', (e) => {
    if (e.target.checked) {
        videoSelectGroup.classList.add('hidden');
        subtitleGroup.classList.add('hidden');
    } else {
        videoSelectGroup.classList.remove('hidden');
        subtitleGroup.classList.remove('hidden');
    }
});

// Quick Presets
document.querySelectorAll('.quick-presets .btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const quality = btn.dataset.quality;
        let targetRes = quality === 'best' ? '1080' : (quality === 'balanced' ? '720' : '480');
        
        // Find closest match in video dropdown
        let bestMatchIndex = 0;
        let found = false;
        Array.from(videoSelect.options).forEach((opt, idx) => {
            if (!found && opt.text.includes(targetRes)) {
                bestMatchIndex = idx;
                found = true;
            }
        });
        videoSelect.selectedIndex = bestMatchIndex;
    });
});

function showError(msg) {
    errorBox.textContent = msg;
    errorBox.classList.remove('hidden');
    setTimeout(() => { errorBox.classList.add('hidden'); }, 5000);
}

// Fetch Logic
fetchBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    if (!url) return showError('Please enter a valid URL');

    currentUrl = url;
    loading.classList.remove('hidden');
    singleVideoView.classList.add('hidden');
    playlistView.classList.add('hidden');
    fetchBtn.disabled = true;

    try {
        const endpoint = isPlaylistMode ? '/api/playlist-info' : '/api/info';
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to fetch');

        if (isPlaylistMode) {
            populatePlaylist(data);
            playlistView.classList.remove('hidden');
        } else {
            populateSingleVideo(data);
            singleVideoView.classList.remove('hidden');
        }
    } catch (err) {
        showError(err.message);
    } finally {
        loading.classList.add('hidden');
        fetchBtn.disabled = false;
    }
});

function populateSingleVideo(data) {
    videoTitle.textContent = data.title;
    videoThumb.src = data.thumbnail || 'https://via.placeholder.com/120x80?text=No+Thumb';

    videoSelect.innerHTML = '';
    data.videoTracks.forEach(track => {
        const opt = document.createElement('option');
        opt.value = track.id;
        opt.textContent = track.desc;
        videoSelect.appendChild(opt);
    });

    audioSelect.innerHTML = '';
    data.audioTracks.forEach(track => {
        const opt = document.createElement('option');
        opt.value = track.id;
        const fullName = getFullLanguageName(track.language);
        opt.textContent = `[${fullName}] ${track.abr}kbps (${track.ext})`;
        audioSelect.appendChild(opt);
    });

    subtitleSelect.innerHTML = '<option value="">None</option>';
    if (data.availableSubs) {
        data.availableSubs.forEach(sub => {
            const opt = document.createElement('option');
            opt.value = sub.id;
            opt.textContent = sub.name;
            subtitleSelect.appendChild(opt);
        });
    }
}

function populatePlaylist(data) {
    playlistTitle.textContent = data.title;
    playlistItems = data.entries;
    playlistList.innerHTML = '';

    playlistItems.forEach(item => {
        const div = document.createElement('div');
        div.className = 'playlist-item';
        div.innerHTML = `
            <input type="checkbox" class="pl-cb" value="${item.url}" checked>
            <span class="idx">${item.index}.</span>
            <span class="title">${item.title}</span>
        `;
        playlistList.appendChild(div);
    });
}

selectAllBtn.addEventListener('click', () => {
    document.querySelectorAll('.pl-cb').forEach(cb => cb.checked = true);
});
deselectAllBtn.addEventListener('click', () => {
    document.querySelectorAll('.pl-cb').forEach(cb => cb.checked = false);
});

// Download Logic
downloadBtn.addEventListener('click', () => {
    startDownload(currentUrl, videoTitle.textContent);
});

downloadPlaylistBtn.addEventListener('click', () => {
    const checked = document.querySelectorAll('.pl-cb:checked');
    if (checked.length === 0) return showError("Select at least one video");
    
    // Simple Queue simulation for now (starts them all, server will handle it)
    checked.forEach(cb => {
        const title = cb.nextElementSibling.nextElementSibling.textContent;
        startDownload(cb.value, title);
    });
});

async function startDownload(url, title) {
    let vId = videoSelect.value;
    let aId = audioSelect.value;
    let tStart = trimStart.value || null;
    let tEnd = trimEnd.value || null;
    let subLang = subtitleSelect.value || null;

    // Fix: If downloading from playlist, ignore single video specific settings
    if (isPlaylistMode) {
        vId = 'bestvideo';
        aId = 'bestaudio';
        tStart = null;
        tEnd = null;
        subLang = null;
    }

    const payload = {
        url,
        clientId: myClientId,
        audioOnly: audioOnlyToggle.checked,
        videoId: vId,
        audioId: aId,
        startTime: tStart,
        endTime: tEnd,
        subtitleLang: subLang
    };

    try {
        const res = await fetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        createJobCard(data.jobId, title);
        downloadManager.classList.remove('hidden');
    } catch (err) {
        showError(err.message);
    }
}

// Download Manager UI
function createJobCard(jobId, title) {
    const card = document.createElement('div');
    card.className = 'job-card';
    card.id = `job-${jobId}`;
    card.innerHTML = `
        <div class="job-header">
            <span class="job-title">${title.substring(0, 40)}...</span>
            <span class="job-status" id="status-${jobId}">Starting...</span>
        </div>
        <div class="progress-bar"><div class="progress-fill" id="fill-${jobId}"></div></div>
        <div class="job-stats">
            <span id="speed-${jobId}">0MB/s</span>
            <span id="eta-${jobId}">ETA: ∞</span>
        </div>
        <button class="btn-cancel" onclick="cancelJob('${jobId}')" id="cancel-${jobId}">Cancel</button>
    `;
    activeJobs.appendChild(card);
}

async function cancelJob(jobId) {
    try {
        const btn = document.getElementById(`cancel-${jobId}`);
        if(btn) btn.disabled = true;
        
        await fetch('/api/cancel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId })
        });
    } catch (err) {
        console.error('Failed to cancel job', err);
    }
}

// WebSocket Events
socket.on('downloadProgress', (data) => {
    const fill = document.getElementById(`fill-${data.jobId}`);
    const status = document.getElementById(`status-${data.jobId}`);
    const speed = document.getElementById(`speed-${data.jobId}`);
    const eta = document.getElementById(`eta-${data.jobId}`);

    if (fill) {
        fill.style.width = `${data.percent}%`;
        status.textContent = `${data.percent}% of ${data.totalSize}`;
        speed.textContent = data.speed;
        eta.textContent = `ETA: ${data.eta}`;
    }
});

socket.on('downloadComplete', (data) => {
    const card = document.getElementById(`job-${data.jobId}`);
    if (card) {
        document.getElementById(`status-${data.jobId}`).textContent = "Complete!";
        document.getElementById(`status-${data.jobId}`).style.color = "var(--success)";
        document.getElementById(`fill-${data.jobId}`).style.width = "100%";
        
        const cancelBtn = document.getElementById(`cancel-${data.jobId}`);
        if(cancelBtn) cancelBtn.remove();
        
        const btn = document.createElement('a');
        btn.href = data.fileUrl;
        btn.className = 'btn-dl';
        btn.textContent = 'Save File';
        btn.download = '';
        card.appendChild(btn);
    }
});

socket.on('downloadError', (data) => {
    const card = document.getElementById(`job-${data.jobId}`);
    if (card) {
        document.getElementById(`status-${data.jobId}`).textContent = "Failed/Cancelled";
        document.getElementById(`status-${data.jobId}`).style.color = "var(--error)";
        const cancelBtn = document.getElementById(`cancel-${data.jobId}`);
        if(cancelBtn) cancelBtn.remove();
    }
    showError(data.error);
});
