// Meta-Gen VCPA Browser Extension - Content Script

// Track last right-clicked element for rich image extraction
let lastRightClickedElement = null;

document.addEventListener(
  'contextmenu',
  (event) => {
    lastRightClickedElement = event.target;
  },
  true
);

// Helper: Extract valid image URL from any DOM element (including background-image, picture, and srcset)
function extractImageUrlFromElement(el) {
  if (!el) return null;

  // 1. Direct IMG tag
  if (el.tagName === 'IMG') {
    const src = el.currentSrc || el.src || el.getAttribute('data-src') || el.getAttribute('data-original');
    if (src && !src.startsWith('data:image/svg+xml') && !src.includes('1x1')) {
      return src;
    }
  }

  // 2. Picture element parent
  if (el.parentElement && el.parentElement.tagName === 'PICTURE') {
    const source = el.parentElement.querySelector('source');
    if (source && source.srcset) {
      const candidates = source.srcset.split(',').map((s) => s.trim().split(' ')[0]);
      if (candidates.length > 0) return candidates[candidates.length - 1]; // highest res
    }
  }

  // 3. CSS Background Image
  const style = window.getComputedStyle(el);
  const bg = style.backgroundImage;
  if (bg && bg.startsWith('url(')) {
    const match = bg.match(/url\(["']?([^"']+)["']?\)/);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

// Scanner: Collect all visible images on the current web page
function scanPageImages() {
  const images = [];
  const seenUrls = new Set();

  // Scan all img elements
  const imgElements = Array.from(document.querySelectorAll('img'));
  for (const img of imgElements) {
    const url = img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('data-original');
    if (!url || seenUrls.has(url)) continue;

    // Filter out tiny tracker icons (< 40x40)
    const rect = img.getBoundingClientRect();
    const naturalWidth = img.naturalWidth || rect.width || 0;
    const naturalHeight = img.naturalHeight || rect.height || 0;

    if (naturalWidth < 48 || naturalHeight < 48) continue;
    if (url.startsWith('data:') && url.length < 500) continue;

    seenUrls.add(url);
    images.push({
      url,
      width: naturalWidth,
      height: naturalHeight,
      alt: img.alt || document.title || 'Image',
    });
  }

  // Scan background-image on hero/banner elements
  const allElements = document.querySelectorAll('div, section, header, a, span');
  for (const el of allElements) {
    if (images.length >= 60) break; // limit to 60 most relevant
    const style = window.getComputedStyle(el);
    const bg = style.backgroundImage;
    if (bg && bg.startsWith('url(')) {
      const match = bg.match(/url\(["']?([^"']+)["']?\)/);
      if (match && match[1]) {
        const url = match[1];
        if (!seenUrls.has(url) && !url.includes('.svg') && !url.includes('1x1')) {
          const rect = el.getBoundingClientRect();
          if (rect.width >= 100 && rect.height >= 100) {
            seenUrls.add(url);
            images.push({
              url,
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              alt: el.getAttribute('aria-label') || 'Background Visual',
            });
          }
        }
      }
    }
  }

  return images;
}

// Listen for messages from extension popup or background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SCAN_PAGE_IMAGES') {
    const list = scanPageImages();
    sendResponse({
      title: document.title,
      url: window.location.href,
      images: list,
    });
    return true;
  }
});

// Bridge for Meta-Gen Web App tab:
// If this tab is Meta-Gen, notify the page that the extension is active and flush any pending queue
const isMetaGenTab =
  window.location.hostname.includes('meta-gen-gue.pages.dev') ||
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1';

if (isMetaGenTab) {
  // Announce extension presence to the Web App
  window.postMessage(
    {
      type: 'METAGEN_EXTENSION_CONNECTED',
      version: '1.0.0',
    },
    '*'
  );

  // Check if there are pending items in storage to inject
  chrome.runtime.sendMessage({ type: 'CHECK_PENDING_QUEUE' }, (response) => {
    if (response?.pending && response.pending.length > 0) {
      for (const item of response.pending) {
        window.postMessage(
          {
            type: 'METAGEN_ENQUEUE_PROMPT_IMAGE',
            payload: item,
          },
          '*'
        );
      }
    }
  });
}
