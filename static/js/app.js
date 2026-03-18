document.addEventListener('DOMContentLoaded', () => {
    const pinGate = document.getElementById('pin-gate');
    const appShell = document.getElementById('app-shell');
    const pinForm = document.getElementById('pin-form');
    const pinInput = document.getElementById('pin-input');
    const pinError = document.getElementById('pin-error');
    const lockBtn = document.getElementById('lock-btn');
    const mobileDock = document.getElementById('mobile-dock');
    const mobileDockButtons = Array.from(document.querySelectorAll('.mobile-dock-btn'));
    const mobileSections = Array.from(document.querySelectorAll('[data-mobile-section]'));

    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const previewContainer = document.getElementById('preview-container');
    const previewGrid = document.getElementById('preview-grid');
    const previewCount = document.getElementById('preview-count');
    const dropContent = document.querySelector('.drop-content');
    const removePreviewBtn = document.getElementById('remove-preview');
    const uploadActions = document.getElementById('upload-actions');
    const uploadBtn = document.getElementById('upload-btn');
    const progressContainer = document.getElementById('upload-progress');
    const progressFill = document.querySelector('.progress-fill');
    const progressText = document.getElementById('progress-text');
    const galleryGrid = document.getElementById('gallery-grid');
    const refreshBtn = document.getElementById('refresh-gallery');
    const offlineToast = document.getElementById('offline-toast');

    let selectedFiles = [];

    function setActiveDockButton(sectionId) {
        mobileDockButtons.forEach((button) => {
            button.classList.toggle('is-active', button.dataset.target === sectionId);
        });
    }

    function setLockedState(isLocked) {
        appShell.classList.toggle('app-locked', isLocked);
        pinGate.classList.toggle('hidden', !isLocked);
        if (isLocked) {
            pinInput.value = '';
            pinError.classList.add('hidden');
            galleryGrid.innerHTML = '<div class="loader-container"><div class="loader"></div></div>';
            pinInput.focus();
        }
    }

    async function unlockApp(pin) {
        const response = await fetch('/unlock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin })
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'Unlock failed');
        }
        setLockedState(false);
        loadGallery();
    }

    pinForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
            await unlockApp(pinInput.value.trim());
        } catch (error) {
            pinError.textContent = error.message;
            pinError.classList.remove('hidden');
        }
    });

    lockBtn.addEventListener('click', async () => {
        await fetch('/logout', { method: 'POST' });
        resetUploadUI();
        setLockedState(true);
    });

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((eventName) => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(event) {
        event.preventDefault();
        event.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach((eventName) => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('active'), false);
    });

    ['dragleave', 'drop'].forEach((eventName) => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('active'), false);
    });

    dropZone.addEventListener('drop', (event) => handleFiles(event.dataTransfer.files), false);
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', function() {
        handleFiles(this.files);
    });

    function handleFiles(fileList) {
        const files = Array.from(fileList || []).filter((file) => file.type.startsWith('image/'));
        if (!files.length) {
            alert('Please choose image files only.');
            return;
        }

        selectedFiles = files;
        previewCount.textContent = `${files.length} file${files.length > 1 ? 's' : ''} selected`;
        previewGrid.innerHTML = '';

        files.forEach((file) => {
            const reader = new FileReader();
            reader.onload = () => {
                const item = document.createElement('div');
                item.className = 'preview-item';
                item.innerHTML = `
                    <img src="${reader.result}" alt="${file.name}">
                    <div class="preview-item-meta">
                        <span>${file.name}</span>
                    </div>
                `;
                previewGrid.appendChild(item);
            };
            reader.readAsDataURL(file);
        });

        previewContainer.hidden = false;
        dropContent.hidden = true;
        uploadActions.hidden = false;
        lucide.createIcons();
    }

    removePreviewBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        resetUploadUI();
    });

    function resetUploadUI() {
        selectedFiles = [];
        fileInput.value = '';
        previewContainer.hidden = true;
        previewGrid.innerHTML = '';
        previewCount.textContent = '0 files selected';
        dropContent.hidden = false;
        uploadActions.hidden = true;
        progressContainer.hidden = true;
        progressFill.style.width = '0%';
        progressText.textContent = 'Uploading...';
        uploadBtn.disabled = false;
    }

    uploadBtn.addEventListener('click', async () => {
        if (!selectedFiles.length) {
            return;
        }

        uploadBtn.disabled = true;
        progressContainer.hidden = false;
        progressText.textContent = `Uploading ${selectedFiles.length} image(s)...`;

        let progress = 0;
        const interval = setInterval(() => {
            progress += 8;
            if (progress >= 90) {
                clearInterval(interval);
            }
            progressFill.style.width = `${Math.min(progress, 90)}%`;
        }, 220);

        const formData = new FormData();
        selectedFiles.forEach((file) => formData.append('images', file));

        try {
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });
            const result = await response.json();
            clearInterval(interval);
            progressFill.style.width = '100%';

            if (response.ok) {
                const latestUrls = (result.uploaded || []).map((item) => item.url);
                progressText.textContent = result.failed?.length
                    ? `Uploaded ${result.uploaded.length} image(s), ${result.failed.length} failed`
                    : `Uploaded ${result.uploaded.length} image(s)`;
                setTimeout(() => {
                    resetUploadUI();
                    loadGallery(latestUrls);
                    document.getElementById('gallery-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
                    if (result.failed?.length) {
                        alert(`Some images failed:\n${result.failed.map((item) => `${item.filename}: ${item.details || item.error}`).join('\n')}`);
                    }
                }, 600);
            } else {
                const details = Array.isArray(result.details)
                    ? result.details.map((item) => `${item.filename}: ${item.details || item.error}`).join('\n')
                    : result.details;
                alert(`Upload failed: ${result.error || 'Server error'}${details ? `\n${details}` : ''}`);
                uploadBtn.disabled = false;
            }
        } catch (error) {
            clearInterval(interval);
            alert(`Error: ${error.message}`);
            uploadBtn.disabled = false;
        }
    });

    async function copyText(value, button) {
        const originalText = button.innerHTML;
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(value);
            } else {
                const tempInput = document.createElement('input');
                tempInput.value = value;
                document.body.appendChild(tempInput);
                tempInput.select();
                document.execCommand('copy');
                tempInput.remove();
            }
            button.innerHTML = '<i data-lucide="check"></i> Copied';
        } catch (error) {
            button.innerHTML = '<i data-lucide="alert-circle"></i> Retry';
        }
        lucide.createIcons();
        setTimeout(() => {
            button.innerHTML = originalText;
            lucide.createIcons();
        }, 1800);
    }

    async function loadGallery(latestUrls = []) {
        galleryGrid.innerHTML = '<div class="loader-container"><div class="loader"></div></div>';
        try {
            const response = await fetch('/gallery');
            const data = await response.json();

            if (!response.ok) {
                if (response.status === 401) {
                    setLockedState(true);
                    return;
                }
                galleryGrid.innerHTML = `<p class="error-text" style="grid-column: 1/-1">${data.error || 'Failed to load gallery'}</p>`;
                return;
            }

            if (!data.length) {
                galleryGrid.innerHTML = '<p class="info-text" style="grid-column: 1/-1">No images in your repository gallery yet.</p>';
                return;
            }

            galleryGrid.innerHTML = '';
            data.forEach((img) => {
                const item = document.createElement('article');
                item.className = 'gallery-item';
                if (latestUrls.includes(img.url)) {
                    item.classList.add('is-new');
                }
                item.innerHTML = `
                    <div class="gallery-media">
                        <img src="${img.url}" alt="${img.name}" loading="lazy">
                    </div>
                    <div class="gallery-overlay">
                        <div class="gallery-meta">
                            <span class="gallery-name">${img.name}</span>
                            <a class="gallery-open" href="${img.url}" target="_blank" rel="noopener noreferrer">Open</a>
                        </div>
                        <button class="btn btn-secondary gallery-copy" type="button">
                            <i data-lucide="copy"></i> Copy Link
                        </button>
                    </div>
                `;
                item.querySelector('.gallery-media').addEventListener('click', () => {
                    window.open(img.url, '_blank', 'noopener,noreferrer');
                });
                item.querySelector('.gallery-copy').addEventListener('click', (event) => {
                    event.stopPropagation();
                    copyText(img.url, event.currentTarget);
                });
                galleryGrid.appendChild(item);
            });
            lucide.createIcons();
        } catch (error) {
            galleryGrid.innerHTML = '<p class="error-text" style="grid-column: 1/-1">Failed to load gallery.</p>';
        }
    }

    refreshBtn.addEventListener('click', () => loadGallery());

    mobileDockButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const target = document.getElementById(button.dataset.target);
            if (!target) {
                return;
            }
            setActiveDockButton(button.dataset.target);
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });

    const sectionObserver = new IntersectionObserver((entries) => {
        const visibleEntry = entries
            .filter((entry) => entry.isIntersecting)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (visibleEntry) {
            setActiveDockButton(visibleEntry.target.id);
        }
    }, {
        threshold: [0.3, 0.55, 0.8]
    });

    mobileSections.forEach((section) => sectionObserver.observe(section));

    window.addEventListener('online', () => {
        offlineToast.classList.add('hidden');
    });

    window.addEventListener('offline', () => {
        offlineToast.classList.remove('hidden');
    });

    if (!navigator.onLine) {
        offlineToast.classList.remove('hidden');
    }

    if (pinGate.classList.contains('hidden')) {
        loadGallery();
    } else {
        pinInput.focus();
    }
});
