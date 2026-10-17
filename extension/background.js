// Meta-Gen VCPA Browser Extension - Background Service Worker (Manifest V3)

const DEFAULT_APP_URL = 'https://meta-gen-gue.pages.dev';

// Setup Single Context Menu on Install or Startup
chrome.runtime.onInstalled.addListener(() => {
  setupContextMenu();
});

chrome.runtime.onStartup.addListener(() => {
  setupContextMenu();
});

function setupContextMenu() {
  chrome.contextMenus.removeAll(() => {
    // Exactly ONE single menu item: no submenus, no secondary options, zero clutter
    chrome.contextMenus.create({
      id: 'metagen_generate_prompt',
      title: '✨ Generate Prompt (Meta-Gen)',
      contexts: ['image', 'link', 'page', 'frame'],
    });
  });
}

// Helper: Convert ArrayBuffer to Base64 Data URL
function arrayBufferToDataUrl(buffer, mimeType = 'image/jpeg') {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return `data:${mimeType};base64,${base64}`;
}

// Helper: Fetch image from URL and convert to Base64 Data URL safely
async function fetchImageAsDataUrl(url) {
  if (!url) return '';
  if (url.startsWith('data:')) return url;

  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const mimeType = blob.type || 'image/jpeg';
    const buffer = await blob.arrayBuffer();
    return arrayBufferToDataUrl(buffer, mimeType);
  } catch (err) {
    console.warn('[Meta-Gen Extension] Direct fetch failed, fallback to raw url:', err);
    return url;
  }
}

// Get configured target app URL from storage
async function getTargetAppUrl() {
  const data = await chrome.storage.local.get(['targetAppUrl']);
  return (data.targetAppUrl || DEFAULT_APP_URL).replace(/\/$/, '');
}

// Send Payload to Meta-Gen Tab SILENTLY in the background (DO NOT SWITCH TAB!)
async function sendPayloadToMetaGenTabSilently(payload, targetAppUrl) {
  const domainPattern = targetAppUrl.includes('localhost')
    ? '*://localhost:*/*'
    : '*://*.meta-gen-gue.pages.dev/*';

  const tabs = await chrome.tabs.query({ url: domainPattern });

  if (tabs.length > 0) {
    const targetTab = tabs[0];

    // Inject message into target tab WITHOUT activating it or focusing its window
    try {
      await chrome.scripting.executeScript({
        target: { tabId: targetTab.id },
        func: (data) => {
          // 1. Post to window
          window.postMessage(
            {
              type: 'METAGEN_ENQUEUE_PROMPT_IMAGE',
              payload: data,
            },
            '*'
          );

          // 2. Broadcast across tabs
          try {
            const bc = new BroadcastChannel('metagen_extension_bus');
            bc.postMessage({
              type: 'METAGEN_ENQUEUE_PROMPT_IMAGE',
              payload: data,
            });
            bc.close();
          } catch {}
        },
        args: [payload],
      });
    } catch (err) {
      console.warn('[Meta-Gen Extension] Could not inject script directly:', err);
    }

    return true;
  } else {
    // If no Meta-Gen tab is open, save to pending queue in storage
    const existing = (await chrome.storage.local.get(['pendingQueue'])).pendingQueue || [];
    if (Array.isArray(payload)) {
      existing.push(...payload);
    } else {
      existing.push(payload);
    }
    await chrome.storage.local.set({ pendingQueue: existing });

    // Open Meta-Gen in BACKGROUND (active: false) so user stays on current tab!
    const newTabUrl = `${targetAppUrl}/?action=enqueue_prompt&source=extension&t=${Date.now()}`;
    await chrome.tabs.create({ url: newTabUrl, active: false });
    return true;
  }
}

// Helper: Show non-intrusive floating toast on the user's current browsing page
async function showToastOnActiveTab(tabId, thumbnail, subtitle = '') {
  if (!tabId) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: (thumb, sub) => {
        if (typeof window.__metaGenShowToast === 'function') {
          window.__metaGenShowToast({
            thumbnail: thumb,
            subtitle: sub || 'Diproses di antrean tanpa mengganggu tab aktif Anda.',
          });
        }
      },
      args: [thumbnail, subtitle],
    });
  } catch (err) {
    console.debug('[Meta-Gen Extension] Toast injection skipped:', err);
  }
}

// Handle Context Menu Clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'metagen_generate_prompt') return;

  const targetAppUrl = await getTargetAppUrl();

  // Show processing badge on extension icon
  chrome.action.setBadgeText({ text: '⏳' });
  chrome.action.setBadgeBackgroundColor({ color: '#ff6b35' });

  try {
    let targetImageUrl = info.srcUrl || '';

    // If right-clicked on an overlay/div/frame/canvas, extract real image from the clicked frame
    if (tab?.id) {
      try {
        const frameResults = await chrome.scripting.executeScript({
          target: { tabId: tab.id, frameIds: [info.frameId || 0] },
          func: () => {
            return window.__metaGenExtractLastClickedImage
              ? window.__metaGenExtractLastClickedImage()
              : null;
          },
        });

        const extracted = frameResults?.[0]?.result;
        if (extracted?.url) {
          targetImageUrl = extracted.url;
        }
      } catch (err) {
        console.debug('[Meta-Gen Extension] Frame element extraction fallback:', err);
      }
    }

    // Fallback: check if link points directly to an image
    if (!targetImageUrl && info.linkUrl) {
      if (/\.(jpe?g|png|webp|avif|gif)(\?.*)?$/i.test(info.linkUrl)) {
        targetImageUrl = info.linkUrl;
      }
    }

    if (!targetImageUrl) {
      chrome.action.setBadgeText({ text: '?' });
      chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
      await showToastOnActiveTab(tab?.id, '', 'Tidak menemukan gambar di titik klik ini.');
      setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2000);
      return;
    }

    // Fetch and convert image to Data URL to bypass CORS/hotlinking
    const dataUrl = await fetchImageAsDataUrl(targetImageUrl);
    const filename = `Web_Img_${Date.now().toString().slice(-6)}.jpg`;

    const payload = {
      id: `ext_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      source: 'extension',
      imageDataUrl: dataUrl,
      filename: filename,
      sourceUrl: targetImageUrl,
      pageTitle: tab?.title || 'Web Page',
      addedAt: Date.now(),
    };

    // Send silently to Meta-Gen in background (NEVER switch tabs)
    await sendPayloadToMetaGenTabSilently(payload, targetAppUrl);

    // Show instant feedback on the user's active browsing screen
    await showToastOnActiveTab(tab?.id, dataUrl || targetImageUrl);

    // Update extension badge to success
    chrome.action.setBadgeText({ text: '✓' });
    chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
    setTimeout(() => {
      chrome.action.setBadgeText({ text: '' });
    }, 2500);
  } catch (e) {
    console.error('[Meta-Gen Extension] Error queuing image:', e);
    chrome.action.setBadgeText({ text: 'ERR' });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2500);
  }
});

// Handle Messages from Content Script or Popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_CONFIG') {
    getTargetAppUrl().then((url) => sendResponse({ targetAppUrl: url }));
    return true;
  }

  if (message.type === 'CHECK_PENDING_QUEUE') {
    chrome.storage.local.get(['pendingQueue']).then((data) => {
      const pending = data.pendingQueue || [];
      if (pending.length > 0) {
        chrome.storage.local.set({ pendingQueue: [] });
      }
      sendResponse({ pending });
    });
    return true;
  }

  if (message.type === 'ENQUEUE_IMAGES_BATCH') {
    (async () => {
      try {
        const targetAppUrl = await getTargetAppUrl();
        const images = message.images || [];
        const payloads = [];

        for (const img of images) {
          const dataUrl = img.dataUrl || (await fetchImageAsDataUrl(img.url));
          payloads.push({
            id: `ext_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            source: 'extension',
            imageDataUrl: dataUrl,
            filename: img.filename || `Web_Batch_${Date.now().toString().slice(-6)}.jpg`,
            sourceUrl: img.url,
            pageTitle: message.pageTitle || 'Web Page',
            addedAt: Date.now(),
          });
        }

        // Send to Meta-Gen tab silently without switching tab
        await sendPayloadToMetaGenTabSilently(payloads, targetAppUrl);

        // Flash badge
        chrome.action.setBadgeText({ text: `+${images.length}` });
        chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
        setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2500);

        sendResponse({ success: true, count: payloads.length });
      } catch (err) {
        console.error('[Meta-Gen Extension] Batch send error:', err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }
});
