const player = videojs('my-video', {
    controls: true,
    preload: 'auto',
    controlBar: {
        skipButtons: { forward: 10, backward: 10 }
    },
    userActions: {
        hotkeys: true,
        doubleClick: true,
        click: true
    }
});

const select = document.getElementById('video-select');
const button = document.getElementById('load-video');
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');

const deleteBtn = document.getElementById('delete-btn');
const deleteModal = document.getElementById('delete-modal');
const deleteList = document.getElementById('delete-list');
const confirmDelete = document.getElementById('confirm-delete');
const cancelDelete = document.getElementById('cancel-delete');

async function loadVideoList() {
    const res = await fetch('/api/videos');
    const videos = await res.json();

    select.innerHTML = '';
    videos.forEach(video => {
        const option = document.createElement('option');
        option.value = video;
        option.textContent = video;
        select.appendChild(option);
    });
}

loadVideoList();

button.addEventListener('click', async () => {
    const selectedVideo = select.value;
    if (!selectedVideo) {
        showNotification("Select a video first!", 3000);
        return;
    }

    const res = await fetch(`/api/stream/${selectedVideo}`);
    const data = await res.json();

    player.src({
        src: data.playlist,
        type: 'application/x-mpegURL'
    });

    const baseName = selectedVideo.split('.mkv')[0];
    const subtitlePath = `/static/assets/videos/hls/${baseName}/subtitles.vtt`;

    while (player.textTracks().length > 0) {
        player.removeRemoteTextTrack(player.textTracks()[0]);
    }

    player.addRemoteTextTrack({
        kind: 'subtitles',
        src: subtitlePath,
        srclang: 'en',
        label: 'English',
        default: true
    }, false);

    player.load();
    player.play();
});

dropZone.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.mkv')) {
        showNotification("Only MKV files are allowed!", 3000);
        return;
    }

    const formData = new FormData();
    formData.append("file", file);

    showNotification("Uploading...", 10000);

    const res = await fetch("/api/upload", {
        method: "POST",
        body: formData
    });

    const result = await res.json();
    if (result.success) {
        showNotification(`Upload complete: ${result.filename}`, 3000);
        await loadVideoList();
    } else {
        showNotification(result.error || "Upload failed", 3000);
    }
});

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');

    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.mkv')) {
        showNotification("Only MKV files are allowed!", 3000);
        return;
    }

    const formData = new FormData();
    formData.append("file", file);

    showNotification("Uploading...", 10000);

    const res = await fetch("/api/upload", {
        method: "POST",
        body: formData
    });

    const result = await res.json();
    if (result.success) {
        showNotification(`Upload complete: ${result.filename}`, 3000);
        await loadVideoList();
    } else {
        showNotification(result.error || "Upload failed", 3000);
    }
});

function showNotification(message, duration = 2000) {
    const notification = document.getElementById('upload-notification');
    notification.textContent = message;
    notification.style.display = 'block';

    setTimeout(() => {
        notification.style.display = 'none';
    }, duration);
}

deleteBtn.addEventListener('click', async () => {
    // Load videos into modal checklist
    const res = await fetch('/api/videos');
    const videos = await res.json();

    deleteList.innerHTML = '';
    videos.forEach(video => {
        const label = document.createElement('label');
        label.style.display = 'flex';
        label.style.alignItems = 'center';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = video;
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(' ' + video));
        deleteList.appendChild(label);
    });

    deleteModal.style.display = 'flex';
});

cancelDelete.addEventListener('click', () => {
    deleteModal.style.display = 'none';
});

confirmDelete.addEventListener('click', async () => {
    const selected = Array.from(deleteList.querySelectorAll('input:checked'))
        .map(cb => cb.value);

    if (selected.length === 0) {
        showNotification("Select at least one video to delete!", 3000);
        return;
    }

    showNotification("Deleting...", 10000);

    const res = await fetch('/api/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videos: selected })
    });

    const result = await res.json();
    if (result.success) {
        showNotification('Deleted successfully!', 3000);
        await loadVideoList();
        deleteModal.style.display = 'none';
    } else {
        showNotification(result.error || 'Failed to delete', 3000);
    }
});