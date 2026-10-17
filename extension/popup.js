// Meta-Gen VCPA Extension - Robust Multi-Frame Popup Controller

let allScannedImages = [];
let visibleImages = [];
let selectedUrls = new Set();
let currentPageTitle = 'Web Page';

const targetUrlSelect = document.getElementById('targetUrlSelect');
const imageCountEl = document.getElementById('imageCount');
const selectAllBtn = document.getElementById('selectAllBtn');
const refreshBtn = document.getElementById('refreshBtn');
const filterSmallCheckbox = document.getElementById('filterSmallImages');
const loadingState = document.getElementById('loadingState');
const emptyState = document.getElementById('emptyState');
const imagesGrid = document.getElementById('imagesGrid');
const sendSelectedBtn = document.getElementById('sendSelectedBtn');
const openAppBtn = document.getElementById('openAppBtn');

// Initialize Configuration
async function initConfig() {
  const data = await chrome.storage.local.get(['targetAppUrl']);
  if (data.targetAppUrl) {
    targetUrlSelect.value = data.targetAppUrl;
  }

  targetUrlSelect.addEventListener('change', async (e) => {
    await chrome.storage.local.set({ targetAppUrl: e.target.value });
  });
}

// Filter and re-render images
function applyFilterAndRender() {
  const filterSmall = filterSmallCheckbox ? filterSmallCheckbox.checked : true;

  if (filterSmall) {
    visibleImages = allScannedImages.filter((img) => {
      // Keep images with width/height >= 60, or unknown dimension (0) that have valid image extensions
      if (img.width > 0 && img.height > 0) {
        return img.width >= 60 && img.height >= 60;
      }
      // If 0 (lazy/offscreen), check URL doesn't look like an icon or tracking pixel
      return !img.url.includes('1x1') && !img.url.includes('favicon') && !img.url.includes('icon');
    });
  } else {
    visibleImages = [...allScannedImages];
  }

  renderGrid();
}

// Update Action Button State
function updateSendButton() {
  const count = selectedUrls.size;
  sendSelectedBtn.disabled = count === 0;
  sendSelectedBtn.innerHTML = `<span>Kirim ${count} Gambar ke Antrean (Latar Belakang)</span>`;

  const allVisibleSelected =
    visibleImages.length > 0 &&
    visibleImages.every((img) => selectedUrls.has(img.url));

  selectAllBtn.textContent = allVisibleSelected ? 'Hapus Semua' : 'Pilih Semua';
}

// Toggle Image Selection
function toggleImageSelection(url, cardElement) {
  if (selectedUrls.has(url)) {
    selectedUrls.delete(url);
    cardElement.classList.remove('selected');
    const check = cardElement.querySelector('.checkbox-overlay');
    if (check) check.textContent = '';
  } else {
    selectedUrls.add(url);
    cardElement.classList.add('selected');
    const check = cardElement.querySelector('.checkbox-overlay');
    if (check) check.textContent = '✓';
  }
  updateSendButton();
}

// Render Images Grid
function renderGrid() {
  imagesGrid.innerHTML = '';

  if (visibleImages.length === 0) {
    emptyState.classList.remove('hidden');
    imageCountEl.textContent = '0';
    updateSendButton();
    return;
  }

  emptyState.classList.add('hidden');
  imageCountEl.textContent = String(visibleImages.length);

  visibleImages.forEach((img, idx) => {
    const card = document.createElement('div');
    card.className = `image-card ${selectedUrls.has(img.url) ? 'selected' : ''}`;

    const thumb = document.createElement('div');
    thumb.className = 'thumb-wrapper';

    const imgEl = document.createElement('img');
    imgEl.src = img.url;
    imgEl.alt = img.alt || `Visual ${idx + 1}`;
    imgEl.loading = 'lazy';
    imgEl.onerror = () => {
      card.style.display = 'none'; // hide broken link thumbnails
    };

    const check = document.createElement('div');
    check.className = 'checkbox-overlay';
    check.textContent = selectedUrls.has(img.url) ? '✓' : '';

    const dim = document.createElement('div');
    dim.className = 'dimension-badge';
    dim.textContent =
      img.width > 0 && img.height > 0
        ? `${img.width}x${img.height}`
        : 'Web Res';

    thumb.appendChild(imgEl);
    thumb.appendChild(check);
    thumb.appendChild(dim);
    card.appendChild(thumb);

    card.addEventListener('click', () => {
      toggleImageSelection(img.url, card);
    });

    imagesGrid.appendChild(card);
  });

  updateSendButton();
}

// Scan Active Tab across Main Frame AND All IFrames
async function scanActiveTab() {
  loadingState.classList.remove('hidden');
  emptyState.classList.add('hidden');
  imagesGrid.innerHTML = '';
  selectedUrls.clear();
  updateSendButton();

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      loadingState.classList.add('hidden');
      emptyState.classList.remove('hidden');
      return;
    }

    currentPageTitle = tab.title || 'Web Page';

    // 1. Execute frame scanner across ALL frames (frame 0 + all child iframes)
    let rawResults = [];
    try {
      rawResults = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: () => {
          return typeof window.__metaGenScanFrameImages === 'function'
            ? window.__metaGenScanFrameImages()
            : [];
        },
      });
    } catch (e) {
      console.warn('Initial frame scan notice:', e);
    }

    let flatImages = [];
    for (const r of rawResults || []) {
      if (Array.isArray(r.result)) {
        flatImages.push(...r.result);
      }
    }

    // 2. If no images returned (e.g. scripts not yet ready in some frames), inject content.js and re-scan
    if (flatImages.length === 0) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          files: ['content.js'],
        });

        const retryResults = await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          func: () => {
            return typeof window.__metaGenScanFrameImages === 'function'
              ? window.__metaGenScanFrameImages()
              : [];
          },
        });

        for (const r of retryResults || []) {
          if (Array.isArray(r.result)) {
            flatImages.push(...r.result);
          }
        }
      } catch (err) {
        console.error('Frame script injection error:', err);
      }
    }

    // 3. Deduplicate images by URL
    const seen = new Set();
    const deduped = [];
    for (const img of flatImages) {
      if (!img || !img.url) continue;
      if (!seen.has(img.url)) {
        seen.add(img.url);
        deduped.push(img);
      }
    }

    // 4. Sort by estimated pixel area (highest resolution first)
    deduped.sort((a, b) => {
      const areaA = (a.width || 0) * (a.height || 0);
      const areaB = (b.width || 0) * (b.height || 0);
      return areaB - areaA;
    });

    allScannedImages = deduped;
    loadingState.classList.add('hidden');

    applyFilterAndRender();
  } catch (err) {
    console.error('Scan error:', err);
    loadingState.classList.add('hidden');
    emptyState.classList.remove('hidden');
  }
}

// Event Listeners
if (selectAllBtn) {
  selectAllBtn.addEventListener('click', () => {
    const allVisibleSelected =
      visibleImages.length > 0 &&
      visibleImages.every((img) => selectedUrls.has(img.url));

    if (allVisibleSelected) {
      // Deselect visible
      for (const img of visibleImages) {
        selectedUrls.delete(img.url);
      }
    } else {
      // Select all visible
      for (const img of visibleImages) {
        selectedUrls.add(img.url);
      }
    }
    renderGrid();
  });
}

if (refreshBtn) {
  refreshBtn.addEventListener('click', scanActiveTab);
}

if (filterSmallCheckbox) {
  filterSmallCheckbox.addEventListener('change', applyFilterAndRender);
}

// Send Selected Images to Queue SILENTLY (Latar Belakang - Never switch tab)
sendSelectedBtn.addEventListener('click', async () => {
  if (selectedUrls.size === 0) return;

  const selectedImages = visibleImages.filter((img) => selectedUrls.has(img.url));
  sendSelectedBtn.disabled = true;
  sendSelectedBtn.innerHTML = `<span>Mengirim ${selectedImages.length} Gambar...</span>`;

  chrome.runtime.sendMessage(
    {
      type: 'ENQUEUE_IMAGES_BATCH',
      images: selectedImages,
      pageTitle: currentPageTitle,
    },
    (res) => {
      if (res?.success) {
        sendSelectedBtn.innerHTML = `<span>✓ Berhasil Masuk Antrean Latar Belakang!</span>`;
        sendSelectedBtn.style.backgroundColor = '#10b981';
        setTimeout(() => {
          window.close();
        }, 1200);
      } else {
        sendSelectedBtn.innerHTML = `<span>Gagal Mengirim</span>`;
        sendSelectedBtn.disabled = false;
      }
    }
  );
});

// Explicitly Open Meta-Gen App Tab (Only when clicked)
openAppBtn.addEventListener('click', async () => {
  const targetUrl = targetUrlSelect.value || 'https://meta-gen-gue.pages.dev';
  chrome.tabs.create({ url: targetUrl, active: true });
});

// Run Initialization
document.addEventListener('DOMContentLoaded', () => {
  void initConfig();
  void scanActiveTab();
});
