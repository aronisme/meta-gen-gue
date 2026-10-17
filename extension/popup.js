// Meta-Gen VCPA Extension - Popup Controller

let detectedImages = [];
let selectedUrls = new Set();
let currentPageTitle = 'Web Page';

const targetUrlSelect = document.getElementById('targetUrlSelect');
const imageCountEl = document.getElementById('imageCount');
const selectAllBtn = document.getElementById('selectAllBtn');
const refreshBtn = document.getElementById('refreshBtn');
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

// Update Action Button State
function updateSendButton() {
  const count = selectedUrls.size;
  sendSelectedBtn.disabled = count === 0;
  sendSelectedBtn.innerHTML = `<span>Kirim ${count} Gambar ke Antrean</span>`;
  selectAllBtn.textContent = selectedUrls.size === detectedImages.length && detectedImages.length > 0
    ? 'Hapus Semua'
    : 'Pilih Semua';
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

  if (detectedImages.length === 0) {
    emptyState.classList.remove('hidden');
    imageCountEl.textContent = '0';
    updateSendButton();
    return;
  }

  emptyState.classList.add('hidden');
  imageCountEl.textContent = String(detectedImages.length);

  detectedImages.forEach((img, idx) => {
    const card = document.createElement('div');
    card.className = `image-card ${selectedUrls.has(img.url) ? 'selected' : ''}`;

    const thumb = document.createElement('div');
    thumb.className = 'thumb-wrapper';

    const imgEl = document.createElement('img');
    imgEl.src = img.url;
    imgEl.alt = img.alt || `Image ${idx + 1}`;
    imgEl.loading = 'lazy';

    const check = document.createElement('div');
    check.className = 'checkbox-overlay';
    check.textContent = selectedUrls.has(img.url) ? '✓' : '';

    const dim = document.createElement('div');
    dim.className = 'dimension-badge';
    dim.textContent = `${img.width}x${img.height}`;

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

// Scan Active Tab
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

    // Send scan request to content script
    chrome.tabs.sendMessage(tab.id, { type: 'SCAN_PAGE_IMAGES' }, (response) => {
      loadingState.classList.add('hidden');

      if (chrome.runtime.lastError || !response) {
        // If content script was not injected, inject it on demand
        chrome.scripting.executeScript(
          {
            target: { tabId: tab.id },
            files: ['content.js'],
          },
          () => {
            setTimeout(() => {
              chrome.tabs.sendMessage(tab.id, { type: 'SCAN_PAGE_IMAGES' }, (retryRes) => {
                if (retryRes && retryRes.images) {
                  detectedImages = retryRes.images;
                  currentPageTitle = retryRes.title || tab.title || 'Web Page';
                  renderGrid();
                } else {
                  emptyState.classList.remove('hidden');
                }
              });
            }, 100);
          }
        );
        return;
      }

      detectedImages = response.images || [];
      currentPageTitle = response.title || tab.title || 'Web Page';
      renderGrid();
    });
  } catch (err) {
    console.error('Scan error:', err);
    loadingState.classList.add('hidden');
    emptyState.classList.remove('hidden');
  }
}

// Event Listeners
selectAllBtn.addEventListener('click', () => {
  if (selectedUrls.size === detectedImages.length && detectedImages.length > 0) {
    selectedUrls.clear();
  } else {
    selectedUrls = new Set(detectedImages.map((i) => i.url));
  }
  renderGrid();
});

refreshBtn.addEventListener('click', scanActiveTab);

// Send Selected Images to Queue
sendSelectedBtn.addEventListener('click', async () => {
  if (selectedUrls.size === 0) return;

  const selectedImages = detectedImages.filter((img) => selectedUrls.has(img.url));
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
        sendSelectedBtn.innerHTML = `<span>✓ Berhasil Masuk Antrean!</span>`;
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

// Open Meta-Gen App in Tab
openAppBtn.addEventListener('click', async () => {
  const targetUrl = targetUrlSelect.value || 'https://meta-gen-gue.pages.dev';
  chrome.tabs.create({ url: targetUrl, active: true });
});

// Run Init
document.addEventListener('DOMContentLoaded', () => {
  void initConfig();
  void scanActiveTab();
});
