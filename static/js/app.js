document.addEventListener('DOMContentLoaded', () => {
    const pinGate = document.getElementById('pin-gate');
    const pinForm = document.getElementById('pin-form');
    const pinInput = document.getElementById('pin-input');
    const pinError = document.getElementById('pin-error');
    const closePinGate = document.getElementById('close-pin-gate');
    
    const uploadSection = document.getElementById('upload-section');
    const uploadLockOverlay = document.getElementById('upload-lock-overlay');
    const openUploadBtn = document.getElementById('open-upload-btn');
    const lockBtn = document.getElementById('lock-btn');
    const unlockTriggerBtn = document.getElementById('unlock-trigger-btn');
    
    const mobileDockButtons = Array.from(document.querySelectorAll('.mobile-dock-btn'));

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
        if (isLocked) {
            uploadSection.classList.add('locked-section');
            uploadLockOverlay.classList.remove('hidden');
            openUploadBtn.classList.remove('hidden');
            lockBtn.classList.add('hidden');
            pinInput.value = '';
            pinError.classList.add('hidden');
        } else {
            uploadSection.classList.remove('locked-section');
            uploadLockOverlay.classList.add('hidden');
            openUploadBtn.classList.add('hidden');
            lockBtn.classList.remove('hidden');
            pinGate.classList.add('hidden');
        }
    }

    async function unlockApp(pin) {
        try {
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
        } catch (error) {
            pinError.textContent = error.message;
            pinError.classList.remove('hidden');
        }
    }

    pinForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        await unlockApp(pinInput.value.trim());
    });

    [openUploadBtn, unlockTriggerBtn].forEach(btn => {
        btn?.addEventListener('click', () => {
            pinGate.classList.remove('hidden');
            pinInput.focus();
        });
    });

    closePinGate.addEventListener('click', () => {
        pinGate.classList.add('hidden');
    });

    lockBtn.addEventListener('click', async () => {
        await fetch('/logout', { method: 'POST' });
        resetUploadUI();
        setLockedState(true);
    });

    // File Handling
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, e => {
            e.preventDefault();
            e.stopPropagation();
        }, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('active'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('active'), false);
    });

    dropZone.addEventListener('drop', e => handleFiles(e.dataTransfer.files), false);
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', function() { handleFiles(this.files); });

    function handleFiles(fileList) {
        const files = Array.from(fileList || []).filter(file => file.type.startsWith('image/'));
        if (!files.length) return;

        selectedFiles = files;
        previewCount.textContent = `${files.length} selected`;
        previewGrid.innerHTML = '';

        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = () => {
                const item = document.createElement('div');
                item.className = 'preview-item';
                item.innerHTML = `<img src="${reader.result}" alt="${file.name}">`;
                previewGrid.appendChild(item);
            };
            reader.readAsDataURL(file);
        });

        previewContainer.hidden = false;
        dropContent.hidden = true;
        uploadActions.hidden = false;
        uploadBtn.classList.add('pulse-primary');
    }

    removePreviewBtn.addEventListener('click', e => {
        e.stopPropagation();
        resetUploadUI();
    });

    function resetUploadUI() {
        selectedFiles = [];
        fileInput.value = '';
        previewContainer.hidden = true;
        previewGrid.innerHTML = '';
        dropContent.hidden = false;
        uploadActions.hidden = true;
        progressContainer.hidden = true;
        progressFill.style.width = '0%';
        uploadBtn.disabled = false;
        uploadBtn.classList.remove('pulse-primary');
    }

    uploadBtn.addEventListener('click', async () => {
        if (!selectedFiles.length) return;
        uploadBtn.disabled = true;
        uploadBtn.classList.remove('pulse-primary');
        progressContainer.hidden = false;
        progressText.textContent = `Pushing to GitHub...`;

        const formData = new FormData();
        selectedFiles.forEach(file => formData.append('images', file));

        try {
            const response = await fetch('/upload', { method: 'POST', body: formData });
            const result = await response.json();
            
            if (response.ok) {
                progressFill.style.width = '100%';
                progressText.textContent = 'Success!';
                setTimeout(() => {
                    resetUploadUI();
                    loadGallery();
                }, 1000);
            } else {
                alert(result.error || 'Upload failed');
                uploadBtn.disabled = false;
            }
        } catch (error) {
            alert('Error: ' + error.message);
            uploadBtn.disabled = false;
        }
    });

    async function loadGallery() {
        galleryGrid.innerHTML = '<div class="loader-container"><div class="loader"></div></div>';
        try {
            const response = await fetch('/gallery');
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);

            if (!data.length) {
                galleryGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 3rem;">No images found.</p>';
                return;
            }

            galleryGrid.innerHTML = '';
            data.forEach(img => {
                const item = document.createElement('article');
                item.className = 'gallery-item';
                item.innerHTML = `
                    <div class="gallery-media"><img src="${img.url}" alt="${img.name}" loading="lazy"></div>
                    <div class="gallery-overlay">
                        <div class="gallery-meta">
                            <span class="gallery-name">${img.name.substring(0, 15)}...</span>
                            <a class="gallery-open" href="${img.url}" target="_blank">View</a>
                        </div>
                        <button class="btn btn-secondary gallery-copy" type="button">Copy Link</button>
                    </div>
                `;
                item.querySelector('.gallery-copy').addEventListener('click', async (e) => {
                    const btn = e.currentTarget;
                    const originalHTML = btn.innerHTML;
                    await navigator.clipboard.writeText(img.url);
                    btn.innerHTML = '<i data-lucide="check"></i> Copied!';
                    btn.classList.add('btn-success');
                    lucide.createIcons();
                    setTimeout(() => {
                        btn.innerHTML = originalHTML;
                        btn.classList.remove('btn-success');
                        lucide.createIcons();
                    }, 2000);
                });
                galleryGrid.appendChild(item);
            });
            lucide.createIcons();
        } catch (error) {
            galleryGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #ff5555;">Error loading gallery.</p>';
        }
    }

    refreshBtn.addEventListener('click', loadGallery);

    mobileDockButtons.forEach(button => {
        button.addEventListener('click', () => {
            mobileDockButtons.forEach(b => b.classList.remove('is-active'));
            button.classList.add('is-active');
            const target = document.getElementById(button.dataset.target);
            target.scrollIntoView({ behavior: 'smooth' });
        });
    });

    window.addEventListener('online', () => {
        offlineToast.classList.add('hidden');
    });

    window.addEventListener('offline', () => {
        offlineToast.classList.remove('hidden');
    });

    if (!navigator.onLine) {
        offlineToast.classList.remove('hidden');
    }

    // Initial Load
    loadGallery();
    // Check initial session state (if uploader is already unlocked by server)
    if (uploadSection.classList.contains('locked-section')) {
        setLockedState(true);
    } else {
        setLockedState(false);
    }
});
