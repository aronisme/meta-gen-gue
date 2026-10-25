// Meta-Gen VCPA Extension - Neo-Brutalist Feature Control Center Controller

const DEFAULT_APP_URL = 'https://meta-gen-gue.pages.dev';

// DOM Elements
const targetUrlSelect = document.getElementById('targetUrlSelect');
const appDot = document.getElementById('appDot');
const appConnectionText = document.getElementById('appConnectionText');
const bridgeDot = document.getElementById('bridgeDot');
const localBridgeText = document.getElementById('localBridgeText');

const toggleAutoDownload = document.getElementById('toggleAutoDownload');
const toggleFlowBridge = document.getElementById('toggleFlowBridge');
const toggleAutoSync = document.getElementById('toggleAutoSync');
const toggleAutoRetry = document.getElementById('toggleAutoRetry');
const toggleFloatingAgent = document.getElementById('toggleFloatingAgent');
const toggleContextMenu = document.getElementById('toggleContextMenu');
const toggleAutoQc = document.getElementById('toggleAutoQc');

const resOptionsWrapper = document.getElementById('resOptionsWrapper');
const resPills = document.querySelectorAll('.res-pill');

const openAppBtn = document.getElementById('openAppBtn');
const openFlowBtn = document.getElementById('openFlowBtn');

// Default Feature Settings
const DEFAULT_FEATURES = {
  targetAppUrl: DEFAULT_APP_URL,
  metagen_feature_auto_download: true,
  metagen_flow_download_resolution: '2K',
  metagen_feature_flow_bridge: true,
  metagen_feature_auto_sync: true,
  metagen_feature_auto_retry: true,
  metagen_feature_floating_agent: true,
  metagen_feature_context_menu: true,
  metagen_feature_auto_qc: true,
};

// Initialize Controls and Load Settings
async function initControlCenter() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULT_FEATURES));
  const settings = { ...DEFAULT_FEATURES, ...stored };

  // 1. Target URL
  if (targetUrlSelect) {
    targetUrlSelect.value = settings.targetAppUrl || DEFAULT_APP_URL;
    targetUrlSelect.addEventListener('change', async (e) => {
      await chrome.storage.local.set({ targetAppUrl: e.target.value });
      checkMetaGenTabStatus(e.target.value);
    });
  }

  // 2. Feature Toggles
  setupToggle(toggleAutoDownload, 'metagen_feature_auto_download', settings.metagen_feature_auto_download, (val) => {
    if (resOptionsWrapper) {
      resOptionsWrapper.style.opacity = val ? '1' : '0.4';
      resOptionsWrapper.style.pointerEvents = val ? 'auto' : 'none';
    }
  });

  setupToggle(toggleFlowBridge, 'metagen_feature_flow_bridge', settings.metagen_feature_flow_bridge);
  setupToggle(toggleAutoSync, 'metagen_feature_auto_sync', settings.metagen_feature_auto_sync);
  setupToggle(toggleAutoRetry, 'metagen_feature_auto_retry', settings.metagen_feature_auto_retry);
  setupToggle(toggleFloatingAgent, 'metagen_feature_floating_agent', settings.metagen_feature_floating_agent);

  setupToggle(toggleContextMenu, 'metagen_feature_context_menu', settings.metagen_feature_context_menu, (val) => {
    chrome.runtime.sendMessage({ type: 'UPDATE_CONTEXT_MENU_TOGGLE', enabled: val }).catch(() => {});
  });

  setupToggle(toggleAutoQc, 'metagen_feature_auto_qc', settings.metagen_feature_auto_qc);

  // 3. Resolution Selector Pills
  const activeRes = settings.metagen_flow_download_resolution || '2K';
  resPills.forEach((pill) => {
    if (pill.dataset.res === activeRes) {
      pill.classList.add('active');
    } else {
      pill.classList.remove('active');
    }

    pill.addEventListener('click', async () => {
      resPills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      const chosen = pill.dataset.res;
      await chrome.storage.local.set({ metagen_flow_download_resolution: chosen });
    });
  });

  if (resOptionsWrapper) {
    resOptionsWrapper.style.opacity = settings.metagen_feature_auto_download ? '1' : '0.4';
    resOptionsWrapper.style.pointerEvents = settings.metagen_feature_auto_download ? 'auto' : 'none';
  }

  // 4. Check Connection Health
  checkMetaGenTabStatus(settings.targetAppUrl);
  checkLocalBridgeStatus();
}

function setupToggle(el, key, initialValue, onChange) {
  if (!el) return;
  el.checked = !!initialValue;
  el.addEventListener('change', async () => {
    const val = el.checked;
    await chrome.storage.local.set({ [key]: val });
    if (onChange) onChange(val);
  });
}

// Check if Meta-Gen App Tab is open
async function checkMetaGenTabStatus(targetUrl) {
  try {
    const tabs = await chrome.tabs.query({});
    const urlLower = (targetUrl || '').toLowerCase();
    const hasTab = tabs.some((t) => {
      if (!t.url) return false;
      const u = t.url.toLowerCase();
      return (
        (urlLower && u.startsWith(urlLower)) ||
        u.includes('meta-gen-gue.pages.dev') ||
        u.includes('localhost:3000') ||
        t.title?.toLowerCase().includes('meta-gen')
      );
    });

    if (appDot && appConnectionText) {
      if (hasTab) {
        appDot.className = 'indicator-dot online';
        appConnectionText.textContent = 'Web App Terhubung';
      } else {
        appDot.className = 'indicator-dot offline';
        appConnectionText.textContent = 'Web App Belum Dibuka';
      }
    }
  } catch {
    if (appDot && appConnectionText) {
      appDot.className = 'indicator-dot unknown';
      appConnectionText.textContent = 'Status Web App: ?';
    }
  }
}

// Check Local FTP & ExifTool Bridge Status (:45678)
async function checkLocalBridgeStatus() {
  try {
    const res = await fetch('http://127.0.0.1:45678/health', {
      signal: AbortSignal.timeout(1500),
    });
    if (res.ok) {
      bridgeDot.className = 'indicator-dot online';
      localBridgeText.textContent = 'Local Bridge :45678 (Aktif)';
    } else {
      bridgeDot.className = 'indicator-dot offline';
      localBridgeText.textContent = 'Bridge :45678 (Mati)';
    }
  } catch {
    bridgeDot.className = 'indicator-dot offline';
    localBridgeText.textContent = 'Bridge :45678 (Offline)';
  }
}

// Open Meta-Gen Web App
if (openAppBtn) {
  openAppBtn.addEventListener('click', async () => {
    const data = await chrome.storage.local.get(['targetAppUrl']);
    const targetUrl = data.targetAppUrl || DEFAULT_APP_URL;

    const tabs = await chrome.tabs.query({});
    const existing = tabs.find((t) => {
      if (!t.url) return false;
      const u = t.url.toLowerCase();
      return (
        u.startsWith(targetUrl.toLowerCase()) ||
        u.includes('meta-gen-gue.pages.dev') ||
        u.includes('localhost:3000')
      );
    });

    if (existing) {
      await chrome.tabs.update(existing.id, { active: true });
      if (existing.windowId) {
        await chrome.windows.update(existing.windowId, { focused: true });
      }
    } else {
      await chrome.tabs.create({ url: targetUrl });
    }
    window.close();
  });
}

// Open Google Flow
if (openFlowBtn) {
  openFlowBtn.addEventListener('click', async () => {
    const tabs = await chrome.tabs.query({});
    const existing = tabs.find((t) => {
      if (!t.url) return false;
      const u = t.url.toLowerCase();
      return u.includes('flow.google.com') || u.includes('labs.google');
    });

    if (existing) {
      await chrome.tabs.update(existing.id, { active: true });
      if (existing.windowId) {
        await chrome.windows.update(existing.windowId, { focused: true });
      }
    } else {
      await chrome.tabs.create({ url: 'https://flow.google.com' });
    }
    window.close();
  });
}

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', initControlCenter);
