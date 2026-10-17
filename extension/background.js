// Meta-Gen VCPA Browser Extension - Background Service Worker (Manifest V3)

const DEFAULT_APP_URL = 'https://meta-gen-gue.pages.dev';

// Setup Context Menu on Install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'metagen_send_to_vcpa',
      title: '✨ Generate Prompt dengan VCPA (Meta-Gen)',
      contexts: ['image'],
    });

    chrome.contextMenus.create({
      id: 'metagen_scan_tab_images',
      title: '🖼️ Scan Semua Gambar di Halaman Ini...',
      contexts: ['page'],
    });

    chrome.contextMenus.create({
      id: 'metagen_open_app',
      title: '🚀 Buka Meta-Gen Prompt Generator',
      contexts: ['page', 'image'],
    });
  });
});

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
  const data = await chrome.storage.local.get(['targetAppUrl', 'autoFocusTab']);
  return {
    targetAppUrl: (data.targetAppUrl || DEFAULT_APP_URL).replace(/\/$/, ''),
    autoFocusTab: data.autoFocusTab !== false,
  };
}

// Find open Meta-Gen tab or open a new one
async function sendPayloadToMetaGenTab(payload, targetAppUrl, autoFocus = true) {
  // Query all tabs matching target domain
  const domainPattern = targetAppUrl.includes('localhost')
    ? '*://localhost:*/*'
    : '*://*.meta-gen-gue.pages.dev/*';

  const tabs = await chrome.tabs.query({ url: domainPattern });

  if (tabs.length > 0) {
    const targetTab = tabs[0];
    if (autoFocus && targetTab.id) {
      await chrome.tabs.update(targetTab.id, { active: true });
      if (targetTab.windowId) {
        await chrome.windows.update(targetTab.windowId, { focused: true });
      }
    }

    // Execute message injection to the tab
    await chrome.scripting.executeScript({
      target: { tabId: targetTab.id },
      func: (data) => {
        window.postMessage(
          {
            type: 'METAGEN_ENQUEUE_PROMPT_IMAGE',
            payload: data,
          },
          '*'
        );
      },
      args: [payload],
    });

    // Flash badge
    chrome.action.setBadgeText({ text: 'OK', tabId: targetTab.id });
    chrome.action.setBadgeBackgroundColor({ color: '#ff6b35', tabId: targetTab.id });
    setTimeout(() => {
      chrome.action.setBadgeText({ text: '', tabId: targetTab.id });
    }, 2500);

    return true;
  } else {
    // If no Meta-Gen tab is open, save to pending queue in storage and open new tab
    const existing = (await chrome.storage.local.get(['pendingQueue'])).pendingQueue || [];
    existing.push(payload);
    await chrome.storage.local.set({ pendingQueue: existing });

    // Open Meta-Gen Prompt Generator directly
    const newTabUrl = `${targetAppUrl}/?action=enqueue_prompt&source=extension&t=${Date.now()}`;
    await chrome.tabs.create({ url: newTabUrl, active: autoFocus });
    return true;
  }
}

// Handle Context Menu Clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const { targetAppUrl, autoFocusTab } = await getTargetAppUrl();

  if (info.menuItemId === 'metagen_open_app') {
    await chrome.tabs.create({ url: targetAppUrl, active: true });
    return;
  }

  if (info.menuItemId === 'metagen_scan_tab_images') {
    // Open extension popup or trigger image scanner
    if (tab?.id) {
      chrome.action.openPopup();
    }
    return;
  }

  if (info.menuItemId === 'metagen_send_to_vcpa') {
    const imageUrl = info.srcUrl;
    if (!imageUrl) return;

    // Show loading badge
    chrome.action.setBadgeText({ text: '...' });
    chrome.action.setBadgeBackgroundColor({ color: '#ff6b35' });

    try {
      const dataUrl = await fetchImageAsDataUrl(imageUrl);
      const filename = `Web_Img_${Date.now().toString().slice(-6)}.jpg`;

      const payload = {
        id: `ext_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        source: 'extension',
        imageDataUrl: dataUrl,
        filename: filename,
        sourceUrl: imageUrl,
        pageTitle: tab?.title || 'Web Page',
        addedAt: Date.now(),
      };

      await sendPayloadToMetaGenTab(payload, targetAppUrl, autoFocusTab);
    } catch (e) {
      console.error('[Meta-Gen Extension] Error queuing image:', e);
    } finally {
      chrome.action.setBadgeText({ text: '' });
    }
  }
});

// Handle Messages from Content Script or Popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_CONFIG') {
    getTargetAppUrl().then((conf) => sendResponse(conf));
    return true;
  }

  if (message.type === 'ENQUEUE_IMAGES_BATCH') {
    (async () => {
      const { targetAppUrl, autoFocusTab } = await getTargetAppUrl();
      const images = message.images || [];

      for (const img of images) {
        const dataUrl = img.dataUrl || (await fetchImageAsDataUrl(img.url));
        const payload = {
          id: `ext_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          source: 'extension',
          imageDataUrl: dataUrl,
          filename: img.filename || `Web_Batch_${Date.now().toString().slice(-6)}.jpg`,
          sourceUrl: img.url,
          pageTitle: message.pageTitle || 'Web Page',
          addedAt: Date.now(),
        };
        await sendPayloadToMetaGenTab(payload, targetAppUrl, false);
      }

      // If requested, activate the Meta-Gen tab after all are sent
      if (autoFocusTab) {
        const domainPattern = targetAppUrl.includes('localhost')
          ? '*://localhost:*/*'
          : '*://*.meta-gen-gue.pages.dev/*';
        const tabs = await chrome.tabs.query({ url: domainPattern });
        if (tabs[0]?.id) {
          await chrome.tabs.update(tabs[0].id, { active: true });
        }
      }

      sendResponse({ success: true, count: images.length });
    })();
    return true;
  }

  if (message.type === 'CHECK_PENDING_QUEUE') {
    (async () => {
      const { pendingQueue } = await chrome.storage.local.get(['pendingQueue']);
      if (pendingQueue && pendingQueue.length > 0) {
        await chrome.storage.local.set({ pendingQueue: [] });
        sendResponse({ pending: pendingQueue });
      } else {
        sendResponse({ pending: [] });
      }
    })();
    return true;
  }
});
