document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const previewContainer = document.getElementById('preview-container');
    const imagePreview = document.getElementById('image-preview');
    const dropContent = document.querySelector('.drop-content');
    const removePreviewBtn = document.getElementById('remove-preview');
    const uploadActions = document.getElementById('upload-actions');
    const uploadBtn = document.getElementById('upload-btn');
    const progressContainer = document.getElementById('upload-progress');
    const progressFill = document.querySelector('.progress-fill');
    const galleryGrid = document.getElementById('gallery-grid');
    const refreshBtn = document.getElementById('refresh-gallery');
    const offlineToast = document.getElementById('offline-toast');

    let selectedFile = null;

    // --- Drag & Drop ---
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('active'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('active'), false);
    });

    dropZone.addEventListener('drop', handleDrop, false);
    dropZone.addEventListener('click', () => fileInput.click());

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles(files);
    }

    fileInput.addEventListener('change', function() {
        handleFiles(this.files);
    });

    function handleFiles(files) {
        if (files.length > 0) {
            const file = files[0];
            if (file.type.startsWith('image/')) {
                selectedFile = file;
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onloadend = function() {
                    imagePreview.src = reader.result;
                    previewContainer.hidden = false;
                    dropContent.hidden = true;
                    uploadActions.hidden = false;
                };
            } else {
                alert('Please upload an image file (PNG, JPG, etc)');
            }
        }
    }

    removePreviewBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        resetUploadUI();
    });

    function resetUploadUI() {
        selectedFile = null;
        fileInput.value = '';
        previewContainer.hidden = true;
        dropContent.hidden = false;
        uploadActions.hidden = true;
        progressContainer.hidden = true;
        progressFill.style.width = '0%';
    }

    // --- Upload Logic ---
    uploadBtn.addEventListener('click', async () => {
        if (!selectedFile) return;

        uploadBtn.disabled = true;
        progressContainer.hidden = false;
        let progress = 0;
        const interval = setInterval(() => {
            progress += 10;
            if (progress >= 90) clearInterval(interval);
            progressFill.style.width = `${progress}%`;
        }, 300);

        const formData = new FormData();
        formData.append('image', selectedFile);

        try {
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();
            clearInterval(interval);
            progressFill.style.width = '100%';

            if (response.ok) {
                setTimeout(() => {
                    resetUploadUI();
                    loadGallery(result.url);
                    document.getElementById('gallery-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 500);
            } else {
                const details = result.details ? `\n${result.details}` : '';
                alert(`Upload failed: ${result.error || 'Server error'}${details}`);
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

    // --- Gallery ---
    async function loadGallery(latestUrl = null) {
        galleryGrid.innerHTML = '<div class="loader-container"><div class="loader"></div></div>';
        try {
            const response = await fetch('/gallery');
            const data = await response.json();
            
            if (!response.ok) {
                galleryGrid.innerHTML = `<p class="error-text" style="grid-column: 1/-1; color: #ff4444; text-align: center;">${data.error || 'Failed to load gallery'}</p>`;
                return;
            }

            const images = data;
            
            if (images.length === 0) {
                galleryGrid.innerHTML = '<p class="info-text" style="grid-column: 1/-1">No images in your repository gallery yet.</p>';
                return;
            }

            galleryGrid.innerHTML = '';
            images.forEach(img => {
                const item = document.createElement('article');
                item.className = 'gallery-item';
                if (latestUrl && img.url === latestUrl) {
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
                const media = item.querySelector('.gallery-media');
                const copyButton = item.querySelector('.gallery-copy');
                media.addEventListener('click', () => window.open(img.url, '_blank', 'noopener,noreferrer'));
                copyButton.addEventListener('click', (event) => {
                    event.stopPropagation();
                    copyText(img.url, copyButton);
                });
                galleryGrid.appendChild(item);
            });
            lucide.createIcons();
        } catch (error) {
            galleryGrid.innerHTML = '<p class="error-text" style="grid-column: 1/-1">Failed to load gallery.</p>';
        }
    }

    refreshBtn.addEventListener('click', loadGallery);

    // Initial load
    loadGallery();

    // --- Offline Status ---
    window.addEventListener('online', () => {
        offlineToast.classList.add('hidden');
    });

    window.addEventListener('offline', () => {
        offlineToast.classList.remove('hidden');
    });
    
    if (!navigator.onLine) {
        offlineToast.classList.remove('hidden');
    }
});
