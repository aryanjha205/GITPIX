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
    const successCard = document.getElementById('success-card');
    const rawUrlInput = document.getElementById('raw-url-input');
    const copyBtn = document.getElementById('copy-btn');
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
                    successCard.hidden = true;
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
                    successCard.hidden = false;
                    rawUrlInput.value = result.url;
                    resetUploadUI();
                    loadGallery();
                    successCard.scrollIntoView({ behavior: 'smooth' });
                }, 500);
            } else {
                alert(`Upload failed: ${result.error || 'Server error'}`);
                uploadBtn.disabled = false;
            }
        } catch (error) {
            clearInterval(interval);
            alert(`Error: ${error.message}`);
            uploadBtn.disabled = false;
        }
    });

    // --- Copy to Clipboard ---
    copyBtn.addEventListener('click', () => {
        rawUrlInput.select();
        document.execCommand('copy');
        const originalText = copyBtn.innerHTML;
        copyBtn.innerHTML = '<i data-lucide="check"></i> Copied!';
        lucide.createIcons();
        setTimeout(() => {
            copyBtn.innerHTML = originalText;
            lucide.createIcons();
        }, 2000);
    });

    // --- Gallery ---
    async function loadGallery() {
        galleryGrid.innerHTML = '<div class="loader-container"><div class="loader"></div></div>';
        try {
            const response = await fetch('/gallery');
            const images = await response.json();
            
            if (images.length === 0) {
                galleryGrid.innerHTML = '<p class="info-text" style="grid-column: 1/-1">No images in your repository gallery yet.</p>';
                return;
            }

            galleryGrid.innerHTML = '';
            images.forEach(img => {
                const item = document.createElement('div');
                item.className = 'gallery-item';
                item.innerHTML = `
                    <img src="${img.url}" alt="${img.name}" loading="lazy">
                    <div class="gallery-overlay">
                        <span>${img.name}</span>
                    </div>
                `;
                item.onclick = () => {
                    rawUrlInput.value = img.url;
                    successCard.hidden = false;
                    successCard.scrollIntoView({ behavior: 'smooth' });
                };
                galleryGrid.appendChild(item);
            });
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
