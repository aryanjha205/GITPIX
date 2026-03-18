document.addEventListener('DOMContentLoaded', () => {
    const pinGate = document.getElementById('pin-gate');
    const appShell = document.getElementById('app-shell');
    const pinForm = document.getElementById('pin-form');
    const pinInput = document.getElementById('pin-input');
    const pinError = document.getElementById('pin-error');
    
    const openUploadBtn = document.getElementById('open-upload-btn');
    const lockBtn = document.getElementById('lock-btn');
    
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
    const folderInput = document.getElementById('folder-input');
    const uploadSettings = document.getElementById('upload-settings');
    const galleryGrid = document.getElementById('gallery-grid');
    const folderFilter = document.getElementById('folder-filter');
    const folderChips = document.getElementById('folder-chips');
    const refreshBtn = document.getElementById('refresh-gallery');
    const offlineToast = document.getElementById('offline-toast');

    let selectedFiles = [];
    let allImages = [];
    let currentFolder = 'all';

    function switchMobileTab(targetId) {
        document.querySelectorAll('[data-mobile-section]').forEach(sec => sec.classList.remove('mobile-active'));
        const target = document.getElementById(targetId);
        if(target) target.classList.add('mobile-active');
        window.scrollTo({ top: 0, behavior: 'instant' });
        
        mobileDockButtons.forEach(button => {
            button.classList.toggle('is-active', button.dataset.target === targetId);
        });
    }

    function setLockedState(isLocked) {
        if (isLocked) {
            appShell.classList.add('blurred-app');
            openUploadBtn.classList.remove('hidden');
            lockBtn.classList.add('hidden');
            pinInput.value = '';
            pinError.classList.add('hidden');
            pinGate.classList.remove('hidden');
        } else {
            appShell.classList.remove('blurred-app');
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

    if (openUploadBtn) {
        openUploadBtn.addEventListener('click', () => {
            pinGate.classList.remove('hidden');
            pinInput.focus();
        });
    }

    lockBtn.addEventListener('click', async () => {
        await fetch('/logout', { method: 'POST' });
        resetUploadUI();
        setLockedState(true);
        galleryGrid.innerHTML = '<div class="loader-container"><div class="loader"></div></div>'; // Clear on lock
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
        uploadSettings.hidden = false;
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
        uploadSettings.hidden = true;
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
        if (folderInput.value.trim()) {
            formData.append('folder', folderInput.value.trim());
        }

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
                folderFilter.classList.add('hidden');
                return;
            }

            allImages = data;
            const folders = [...new Set(data.map(img => img.folder))].sort();

            if (folders.length > 0) {
                folderFilter.classList.remove('hidden');
                folderChips.innerHTML = `<button class="chip active" data-folder="all"><i data-lucide="layout-grid"></i> All</button>` + 
                    folders.map(f => `<button class="chip" data-folder="${f}"><i data-lucide="folder"></i> ${f}</button>`).join('');
                
                folderChips.querySelectorAll('.chip').forEach(chip => {
                    chip.addEventListener('click', (e) => {
                        folderChips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
                        e.currentTarget.classList.add('active');
                        currentFolder = e.currentTarget.dataset.folder;
                        renderGallery();
                    });
                });
            } else {
                folderFilter.classList.add('hidden');
            }

            renderGallery();
        } catch (error) {
            galleryGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #ff5555;">Error loading gallery.</p>';
        }
    }

    function renderGallery() {
        galleryGrid.innerHTML = '';
        const filtered = currentFolder === 'all' ? allImages : allImages.filter(img => img.folder === currentFolder);

        if (!filtered.length) {
            galleryGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 3rem;">No images in this folder.</p>';
            return;
        }

        filtered.forEach(img => {
            const item = document.createElement('article');
            item.className = 'gallery-item';
            item.innerHTML = `
                <div class="gallery-media"><img src="${img.url}" alt="${img.name}" loading="lazy"></div>
                <div class="gallery-overlay">
                    <div class="gallery-meta">
                        <span class="gallery-name" title="${img.path}">${img.name.length > 15 ? img.name.substring(0, 15) + '...' : img.name}</span>
                        <a class="gallery-open" href="${img.url}" target="_blank">View</a>
                    </div>
                    <button class="btn btn-secondary gallery-copy" type="button">Copy Link</button>
                    ${currentFolder === 'all' && img.folder !== 'root' ? `<div class="folder-badge"><i data-lucide="folder"></i> ${img.folder}</div>` : ''}
                </div>
            `;
            item.querySelector('.gallery-copy').addEventListener('click', async (e) => {
                const btn = e.currentTarget;
                const originalHTML = btn.innerHTML;
                try {
                    await navigator.clipboard.writeText(img.url);
                    btn.innerHTML = '<i data-lucide="check"></i> Copied!';
                    btn.classList.add('btn-success');
                } catch(err) {
                    btn.innerHTML = '<i data-lucide="alert-circle"></i> Retry';
                }
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
    }

    refreshBtn.addEventListener('click', loadGallery);

    mobileDockButtons.forEach(button => {
        button.addEventListener('click', () => {
            switchMobileTab(button.dataset.target);
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
    switchMobileTab('gallery-section');
    // Check initial session state (if uploader is already unlocked by server)
    if (appShell.classList.contains('blurred-app')) {
        setLockedState(true);
    } else {
        setLockedState(false);
    }
});
