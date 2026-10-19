// Meta-Gen VCPA Browser Extension - Comprehensive Content Script (Manifest V3)

// 1. Right Click Position & Element Tracking
let lastContextMenuTarget = null;
let lastClickX = 0;
let lastClickY = 0;

window.addEventListener(
  'contextmenu',
  (event) => {
    lastContextMenuTarget = event.target;
    lastClickX = event.clientX;
    lastClickY = event.clientY;
  },
  true
);

// Helper: Normalize relative or protocol-relative URL to absolute HTTP/HTTPS
function toAbsoluteUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (trimmed.startsWith('data:image/svg+xml') && trimmed.length < 300) return null; // skip tiny svg data icons
  if (trimmed.includes('1x1') || trimmed.includes('spacer.gif') || trimmed.includes('blank.gif')) return null;
  if (trimmed.startsWith('data:')) return trimmed;
  try {
    return new URL(trimmed, document.baseURI).href;
  } catch {
    return trimmed;
  }
}

// Helper: Parse srcset and select highest resolution candidate
function getBestUrlFromSrcset(srcset) {
  if (!srcset || typeof srcset !== 'string') return null;
  const candidates = srcset
    .split(',')
    .map((item) => {
      const parts = item.trim().split(/\s+/);
      const url = parts[0];
      const desc = parts[1] || '1x';
      let value = 1;
      if (desc.endsWith('w')) {
        value = parseInt(desc.slice(0, -1), 10) || 1;
      } else if (desc.endsWith('x')) {
        value = (parseFloat(desc.slice(0, -1)) || 1) * 1000;
      }
      return { url, value };
    })
    .filter((c) => c.url && !c.url.includes('1x1'));

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.value - a.value);
  return toAbsoluteUrl(candidates[0].url);
}

// Helper: Extract image URL from a single DOM Node
function extractImageFromNode(node) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) return null;

  // 1. IMG tag
  if (node.tagName === 'IMG') {
    const lazyAttributes = [
      'data-original',
      'data-orig-file',
      'data-highres',
      'data-high-res-src',
      'data-full-url',
      'data-large-img',
      'data-zoom-image',
      'data-lazy-src',
      'data-lazy',
      'data-pin-media',
      'data-actualsrc',
      'data-src-retina',
      'data-src',
    ];

    for (const attr of lazyAttributes) {
      const val = node.getAttribute(attr);
      if (val && !val.includes('1x1') && !val.startsWith('data:image/svg')) {
        const abs = toAbsoluteUrl(val);
        if (abs) return abs;
      }
    }

    const bestSrcset = getBestUrlFromSrcset(node.getAttribute('srcset') || node.srcset);
    if (bestSrcset) return bestSrcset;

    const currentSrc = node.currentSrc || node.src;
    if (currentSrc && !currentSrc.includes('1x1')) {
      const abs = toAbsoluteUrl(currentSrc);
      if (abs) return abs;
    }
  }

  // 2. PICTURE tag or source child
  if (node.tagName === 'PICTURE') {
    const sources = Array.from(node.querySelectorAll('source'));
    for (const s of sources) {
      const best = getBestUrlFromSrcset(s.getAttribute('srcset') || s.srcset);
      if (best) return best;
    }
    const imgChild = node.querySelector('img');
    if (imgChild) return extractImageFromNode(imgChild);
  }

  // 3. SVG IMAGE tag
  if (node.tagName === 'IMAGE' || node.tagName === 'image') {
    const href =
      node.getAttribute('href') ||
      node.getAttribute('xlink:href') ||
      node.href?.baseVal;
    if (href) {
      const abs = toAbsoluteUrl(href);
      if (abs) return abs;
    }
  }

  // 4. CANVAS element
  if (node.tagName === 'CANVAS') {
    try {
      if (node.width >= 50 && node.height >= 50) {
        return node.toDataURL('image/png');
      }
    } catch {}
  }

  // 5. VIDEO poster
  if (node.tagName === 'VIDEO' && node.poster) {
    const abs = toAbsoluteUrl(node.poster);
    if (abs) return abs;
  }

  // 6. CSS Background Image (inline style or computed style)
  const bgAttrs = ['data-bg', 'data-background-image', 'data-background', 'data-thumb'];
  for (const attr of bgAttrs) {
    const val = node.getAttribute(attr);
    if (val) {
      const abs = toAbsoluteUrl(val);
      if (abs) return abs;
    }
  }

  const inlineBg = node.style?.backgroundImage || '';
  const computedBg = window.getComputedStyle(node)?.backgroundImage || '';
  const bgStr = inlineBg || computedBg;

  if (bgStr && bgStr !== 'none' && bgStr.includes('url(')) {
    const matches = [...bgStr.matchAll(/url\(["']?([^"')]+)["']?\)/g)];
    for (const m of matches) {
      if (m[1]) {
        const abs = toAbsoluteUrl(m[1]);
        if (abs) return abs;
      }
    }
  }

  return null;
}

// Deep right-click extractor: checks cursor coordinates and overlay elements
window.__metaGenExtractLastClickedImage = function () {
  // Strategy 1: Check elements beneath the cursor (handles transparent overlay divs/links)
  if (typeof lastClickX === 'number' && typeof lastClickY === 'number') {
    try {
      const elementsUnderCursor = document.elementsFromPoint(lastClickX, lastClickY) || [];
      for (const el of elementsUnderCursor) {
        // Direct element check
        const directUrl = extractImageFromNode(el);
        if (directUrl) return { url: directUrl, alt: el.getAttribute('alt') || document.title };

        // Check child img in overlay container
        const childImg = el.querySelector('img, picture, image, canvas');
        if (childImg) {
          const childUrl = extractImageFromNode(childImg);
          if (childUrl) return { url: childUrl, alt: childImg.getAttribute('alt') || document.title };
        }
      }
    } catch {}
  }

  // Strategy 2: Check recorded target and its ancestry
  if (lastContextMenuTarget) {
    let curr = lastContextMenuTarget;
    let depth = 0;
    while (curr && depth < 6) {
      const url = extractImageFromNode(curr);
      if (url) return { url, alt: curr.getAttribute('alt') || document.title };

      const childImg = curr.querySelector('img, picture, image, canvas');
      if (childImg) {
        const childUrl = extractImageFromNode(childImg);
        if (childUrl) return { url: childUrl, alt: childImg.getAttribute('alt') || document.title };
      }

      curr = curr.parentElement;
      depth++;
    }
  }

  return null;
};

// Comprehensive Frame Image Scanner (supports lazy, hidden, background-image, shadow DOM)
window.__metaGenScanFrameImages = function () {
  const images = [];
  const seenUrls = new Set();

  function addImage(url, width, height, alt) {
    if (!url || seenUrls.has(url)) return;
    if (url.startsWith('data:image/svg') && url.length < 300) return;
    if (url.includes('1x1') || url.includes('spacer.gif') || url.includes('blank.gif')) return;

    seenUrls.add(url);
    images.push({
      url,
      width: Math.round(width || 0),
      height: Math.round(height || 0),
      alt: (alt || document.title || 'Web Visual').trim(),
      frameUrl: window.location.href,
    });
  }

  function inspectElement(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return;

    // 1. Tag IMG
    if (el.tagName === 'IMG') {
      const url = extractImageFromNode(el);
      if (url) {
        const rect = el.getBoundingClientRect();
        const w = el.naturalWidth || rect.width || parseInt(el.getAttribute('width') || '0', 10);
        const h = el.naturalHeight || rect.height || parseInt(el.getAttribute('height') || '0', 10);
        addImage(url, w, h, el.alt);
      }
    }

    // 2. Tag PICTURE
    else if (el.tagName === 'PICTURE') {
      const url = extractImageFromNode(el);
      if (url) {
        const rect = el.getBoundingClientRect();
        addImage(url, rect.width, rect.height, 'Picture Visual');
      }
    }

    // 3. SVG IMAGE
    else if (el.tagName === 'IMAGE' || el.tagName === 'image') {
      const url = extractImageFromNode(el);
      if (url) {
        const rect = el.getBoundingClientRect();
        addImage(url, rect.width, rect.height, 'Vector Graphic');
      }
    }

    // 4. CANVAS
    else if (el.tagName === 'CANVAS') {
      if (el.width >= 60 && el.height >= 60) {
        try {
          const dataUrl = el.toDataURL('image/png');
          addImage(dataUrl, el.width, el.height, 'Canvas Render');
        } catch {}
      }
    }

    // 5. CSS Background Image or data-bg on container elements
    else {
      const styleAttr = el.getAttribute('style') || '';
      const hasBgAttr = el.hasAttribute('data-bg') || el.hasAttribute('data-background-image');
      if (styleAttr.includes('background') || hasBgAttr) {
        const url = extractImageFromNode(el);
        if (url) {
          const rect = el.getBoundingClientRect();
          addImage(url, rect.width, rect.height, el.getAttribute('aria-label') || 'Background Visual');
        }
      }
    }

    // Check open Shadow DOM
    if (el.shadowRoot) {
      const shadowChildren = el.shadowRoot.querySelectorAll('*');
      for (const sc of shadowChildren) {
        inspectElement(sc);
      }
    }
  }

  // Scan all DOM elements
  const allElements = document.querySelectorAll('*');
  for (let i = 0; i < allElements.length; i++) {
    inspectElement(allElements[i]);
  }

  return images;
};

// In-Page Non-Intrusive Floating Toast Notification (Shows when image queued in background)
window.__metaGenShowToast = function (opts = {}) {
  const existing = document.getElementById('metagen-toast-root');
  if (existing) existing.remove();

  const container = document.createElement('div');
  container.id = 'metagen-toast-root';
  container.style.cssText = `
    position: fixed !important;
    bottom: 24px !important;
    right: 24px !important;
    z-index: 2147483647 !important;
    background: #fffdf9 !important;
    color: #2c1810 !important;
    border: 3px solid #2c1810 !important;
    box-shadow: 4px 4px 0 #2c1810 !important;
    border-radius: 8px !important;
    padding: 10px 14px !important;
    display: flex !important;
    align-items: center !important;
    gap: 12px !important;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
    font-size: 13px !important;
    line-height: 1.3 !important;
    pointer-events: none !important;
    opacity: 0 !important;
    transform: translateY(12px) !important;
    transition: opacity 0.25s ease, transform 0.25s ease !important;
  `;

  let thumbHtml = '';
  if (opts.thumbnail && !opts.thumbnail.startsWith('data:image/svg')) {
    thumbHtml = `
      <img src="${opts.thumbnail}" style="
        width: 38px !important;
        height: 38px !important;
        object-fit: cover !important;
        border: 2px solid #2c1810 !important;
        border-radius: 4px !important;
        background: #f4ede4 !important;
        flex-shrink: 0 !important;
      " alt="Preview" />
    `;
  } else {
    thumbHtml = `
      <div style="
        width: 38px !important;
        height: 38px !important;
        background: #2c1810 !important;
        color: #ff6b35 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        font-weight: 900 !important;
        border-radius: 4px !important;
        flex-shrink: 0 !important;
      ">✨</div>
    `;
  }

  container.innerHTML = `
    ${thumbHtml}
    <div>
      <div style="font-weight: 900; color: #2c1810; display: flex; align-items: center; gap: 6px;">
        <span>✓ Masuk Antrean Meta-Gen</span>
        <span style="background: #ff6b35; color: #fff; font-size: 9px; padding: 1px 5px; border-radius: 3px; text-transform: uppercase;">Latar Belakang</span>
      </div>
      <div style="font-size: 11px; color: #6b5344; margin-top: 2px;">
        ${opts.subtitle || 'Diproses di antrean tanpa mengganggu tab aktif Anda.'}
      </div>
    </div>
  `;

  document.body.appendChild(container);

  // Trigger smooth entrance
  requestAnimationFrame(() => {
    container.style.opacity = '1';
    container.style.transform = 'translateY(0)';
  });

  // Auto-remove after 2.8s
  setTimeout(() => {
    container.style.opacity = '0';
    container.style.transform = 'translateY(12px)';
    setTimeout(() => {
      container.remove();
    }, 300);
  }, 2800);
};

// Listen for Runtime Messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SCAN_FRAME_IMAGES') {
    const list = window.__metaGenScanFrameImages();
    sendResponse({
      title: document.title,
      url: window.location.href,
      images: list,
    });
    return true;
  }

  if (message.type === 'GET_CLICKED_IMAGE') {
    const res = window.__metaGenExtractLastClickedImage();
    sendResponse(res);
    return true;
  }

  if (message.type === 'SHOW_TOAST') {
    window.__metaGenShowToast(message.opts);
    sendResponse({ success: true });
    return true;
  }
});

// Meta-Gen Web App Integration Bridge:
const isMetaGenTab =
  window.location.hostname.includes('meta-gen-gue.pages.dev') ||
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1';

if (isMetaGenTab) {
  window.postMessage(
    {
      type: 'METAGEN_EXTENSION_CONNECTED',
      version: '1.1.0',
    },
    '*'
  );

  // Listen for Flow Generation trigger from Meta-Gen Web App
  window.addEventListener('message', (event) => {
    if (event.data?.type === 'METAGEN_TRIGGER_FLOW_GEN') {
      const payload = event.data.payload;
      try {
        if (!chrome?.runtime?.id) {
          throw new Error('Ekstensi telah di-reload. Silakan refresh (F5) tab Meta-Gen dan tab Flow.');
        }

        chrome.runtime.sendMessage(
          {
            type: 'EXECUTE_FLOW_GEN',
            payload: payload,
          },
          (response) => {
            if (chrome.runtime.lastError || !response) {
              window.postMessage(
                {
                  type: 'METAGEN_FLOW_GEN_RESULT',
                  payload: {
                    cardId: payload?.cardId,
                    success: false,
                    error:
                      chrome.runtime.lastError?.message ||
                      'Tidak dapat berkomunikasi dengan background extension.',
                  },
                },
                '*'
              );
            }
          }
        );
      } catch (err) {
        window.postMessage(
          {
            type: 'METAGEN_FLOW_GEN_RESULT',
            payload: {
              cardId: payload?.cardId,
              success: false,
              error: err.message || 'Konteks ekstensi tidak aktif. Silakan refresh halaman web ini (F5).',
            },
          },
          '*'
        );
      }
    }
  });

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
