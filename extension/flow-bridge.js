// Meta-Gen VCPA - Google Flow Bridge Content Script (Manifest V3)
// Supports both https://flow.google.com/* and https://labs.google/fx/*

console.log('[Meta-Gen Flow Bridge] Active on Google Flow tab:', window.location.href);

// In-Page Toast notification for Google Flow tab
function showFlowToast(title, subtitle = '', isSuccess = true) {
  const existing = document.getElementById('metagen-flow-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'metagen-flow-toast';
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 999999;
    background: #1c1917;
    color: #ffffff;
    border: 2px solid ${isSuccess ? '#10b981' : '#f59e0b'};
    border-radius: 12px;
    padding: 12px 18px;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 13px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    animation: metagenSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  `;

  toast.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px; font-weight: 700; color: ${isSuccess ? '#34d399' : '#fbbf24'};">
      <span>${isSuccess ? '⚡' : '⏳'}</span>
      <span>${title}</span>
    </div>
    ${subtitle ? `<div style="font-size: 11px; color: #a8a29e; margin-left: 20px;">${subtitle}</div>` : ''}
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.5s ease';
      setTimeout(() => toast.remove(), 500);
    }
  }, 4500);
}

// Inject CSS animation
if (!document.getElementById('metagen-flow-styles')) {
  const style = document.createElement('style');
  style.id = 'metagen-flow-styles';
  style.textContent = `
    @keyframes metagenSlideIn {
      from { transform: translateY(100px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}

// Dismiss Google Consent/Cookie Bar if blocking bottom controls
function dismissGoogleCookieBar() {
  const bar = document.querySelector('#glue-cookie-notification-bar-1, .glue-cookie-notification-bar');
  if (bar) {
    console.log('[Meta-Gen Flow Bridge] Cookie bar detected. Dismissing...');
    const rejectBtn = bar.querySelector(
      'button.glue-cookie-notification-bar__reject, button[aria-label*="reject" i], button'
    );
    if (rejectBtn) {
      rejectBtn.click();
    } else {
      bar.remove();
    }
  }
}

// Helper: Extract unique identifier for any media element
function getMediaToken(el) {
  if (!el) return null;
  const mediaId = el.getAttribute('data-media-id');
  if (mediaId) return `media_${mediaId}`;
  const src = el.src || el.currentSrc || el.getAttribute('poster') || '';
  if (!src) return null;

  // Pattern 1: labs.google trpc redirect
  const m1 = src.match(/media\.getMediaUrlRedirect\?name=([a-f0-9-]+)/);
  if (m1) return `uuid_${m1[1]}`;

  // Pattern 2: flow.google.com /asb/ token
  const m2 = src.match(/\/asb\/([A-Za-z0-9_-]+)/);
  if (m2) return `asb_${m2[1]}`;

  // Pattern 3: googleusercontent CDN ID
  const m3 = src.match(/googleusercontent\.com\/([A-Za-z0-9_-]+)/);
  if (m3) return `guc_${m3[1]}`;

  return src.split('?')[0];
}

// Helper: Attach visual badge and DOM attributes to a tile element
function tagCardWithPromptData(tileContainer, data) {
  if (!tileContainer || !data) return;

  tileContainer.setAttribute('data-metagen-card-id', data.cardId || '');
  if (data.ordinal) tileContainer.setAttribute('data-metagen-ordinal', String(data.ordinal));
  if (data.prompt) tileContainer.setAttribute('data-metagen-prompt', data.prompt);
  if (data.token) tileContainer.setAttribute('data-metagen-token', data.token);

  const computedPos = window.getComputedStyle(tileContainer).position;
  if (computedPos === 'static') {
    tileContainer.style.position = 'relative';
  }

  // Check if badge already exists
  let badge = tileContainer.querySelector('.metagen-flow-badge');
  if (!badge) {
    badge = document.createElement('div');
    badge.className = 'metagen-flow-badge';
    badge.style.cssText = `
      position: absolute;
      top: 8px;
      left: 8px;
      z-index: 9999;
      background: linear-gradient(135deg, #059669 0%, #10b981 100%);
      color: #ffffff;
      padding: 4px 10px;
      border-radius: 8px;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.3px;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.3);
      display: inline-flex;
      align-items: center;
      gap: 5px;
      cursor: pointer;
      pointer-events: auto;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
      user-select: none;
    `;
    badge.onmouseenter = () => {
      badge.style.transform = 'scale(1.06)';
      badge.style.boxShadow = '0 6px 20px rgba(16, 185, 129, 0.5), 0 0 0 1px #34d399';
    };
    badge.onmouseleave = () => {
      badge.style.transform = 'scale(1)';
      badge.style.boxShadow = '0 4px 14px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.3)';
    };
    tileContainer.appendChild(badge);
  }

  const ordinalText = data.ordinal ? `#${data.ordinal}` : data.cardId ? `#${data.cardId.slice(0, 4)}` : '';
  const variationText = data.variation ? ` (${data.variation})` : '';
  badge.innerHTML = `
    <span style="font-size: 13px;">⚡</span>
    <span>MetaGen ${ordinalText}${variationText}</span>
  `;
  badge.title = `Prompt MetaGen ${ordinalText}${variationText}:\n"${data.prompt || ''}"\n(Klik untuk salin prompt)`;
  badge.onclick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (data.prompt) {
      navigator.clipboard.writeText(data.prompt);
      showFlowToast(`Prompt ${ordinalText}${variationText} Disalin!`, data.prompt.slice(0, 70) + '...', true);
    }
  };
}

// Helper: Save prompt mapping to chrome.storage.local
function savePromptToRegistry(token, data) {
  if (!token || !chrome?.storage?.local) return;
  try {
    chrome.storage.local.get(['metagen_flow_registry'], (res) => {
      const reg = res.metagen_flow_registry || {};
      reg[token] = {
        cardId: data.cardId,
        ordinal: data.ordinal,
        title: data.title,
        prompt: data.prompt,
        ratio: data.ratio,
        mediaId: data.mediaId,
        token: token,
        timestamp: Date.now(),
      };
      chrome.storage.local.set({ metagen_flow_registry: reg });
      console.log('[Meta-Gen Flow Bridge] Saved card to registry:', token, 'Ordinal:', data.ordinal);
    });
  } catch (err) {
    console.warn('[Meta-Gen Flow Bridge] Registry save error:', err);
  }
}

// In-memory set of tokens that have already been synced in this session to prevent redundant processing
const syncedMediaTokensSet = new Set();
// Track auto-retries for failed tiles to avoid infinite loops
const autoRetriedFailedTilesMap = new Map();
let isAutoScannerRunning = false;

// Autonomous Auto-Scanner & Badge Hydration:
// Continuously scans Google Flow canvas for rendered images whose prompt text matches active Meta-Gen prompts.
// When a match is discovered, it IMMEDIATELY and AUTOMATICALLY extracts the image dataUrl,
// tags the tile with a green badge, and dispatches FLOW_CARD_DISCOVERED to Meta-Gen without any manual trigger.
async function scanAndAutoSyncFlowCanvas() {
  if (isAutoScannerRunning) return;
  if (!chrome?.storage?.local) return;

  isAutoScannerRunning = true;
  try {
    chrome.storage.local.get([
      'metagen_flow_registry',
      'metagen_session_prompts',
      'metagen_agent_scenes',
      'metagen_feature_auto_sync',
      'metagen_feature_auto_retry',
    ], async (res) => {
      try {
        if (res && res.metagen_feature_auto_sync === false) {
          isAutoScannerRunning = false;
          return;
        }

        const reg = res.metagen_flow_registry || {};
        const sessionPrompts = res.metagen_session_prompts || [];
        const agentScenes = res.metagen_agent_scenes || [];

        // Combine all target prompts from both normal Prompt Gen sessions and Agent scenes
        const candidatePrompts = [...sessionPrompts, ...agentScenes];
        if (candidatePrompts.length === 0 && Object.keys(reg).length === 0) {
          isAutoScannerRunning = false;
          return;
        }

        // Target all media elements across Google Flow layouts (Batch, Grid, Canvas, Freeform)
        const mediaElements = Array.from(
          document.querySelectorAll('img, video, flow-image-tile img, flow-video-tile img, flow-asset-tile img, flow-grid-tile-container img')
        ).filter((el) => {
          if (!el.isConnected) return false;
          const src = el.src || el.currentSrc || el.getAttribute('poster') || '';
          if (!src && !el.getAttribute('data-media-id')) return false;
          if (
            src.includes('profile') ||
            src.includes('avatar') ||
            src.includes('icon') ||
            src.includes('logo') ||
            src.includes('data:image/svg')
          ) {
            return false;
          }
          const w = el.naturalWidth || el.videoWidth || el.width || 0;
          const h = el.naturalHeight || el.videoHeight || el.height || 0;
          if (w > 0 && w < 80 && h > 0 && h < 80) return false;
          return true;
        });

        for (const el of mediaElements) {
          const token = getMediaToken(el);
          if (!token) continue;

          const tileContainer =
            el.closest('flow-grid-tile-container') ||
            el.closest('flow-tile-container') ||
            el.closest('flow-image-tile') ||
            el.closest('flow-video-tile') ||
            el.closest('.tile-row') ||
            el.closest('flow-batch-row') ||
            el.closest('.batch-row') ||
            el.closest('[data-tile-id]') ||
            el.parentElement;
          if (!tileContainer) continue;

          // 1. Direct restore from registry if already known
          if (reg[token]) {
            if (!tileContainer.querySelector('.metagen-flow-badge')) {
              tagCardWithPromptData(tileContainer, reg[token]);
            }
            // If already recorded in registry but not yet dispatched in this session, sync it to Meta-Gen
            if (!syncedMediaTokensSet.has(token)) {
              syncedMediaTokensSet.add(token);
              try {
                const dataUrl = await imageToDataUrl(el);
                if (dataUrl) {
                  chrome.runtime.sendMessage({
                    type: 'FLOW_CARD_DISCOVERED',
                    result: {
                      cardId: reg[token].cardId,
                      ordinal: reg[token].ordinal,
                      token: token,
                      imageDataUrl: dataUrl,
                    },
                  });
                }
              } catch (e) {}
            }
            continue;
          }

          // 2. Already synced in memory
          if (syncedMediaTokensSet.has(token)) {
            continue;
          }

          // 3. Unregistered tile: Check if prompt matches any active Meta-Gen prompt
          if (candidatePrompts.length > 0) {
            const matchedPrompt = findBestMatchingPrompt(tileContainer, candidatePrompts);
            if (matchedPrompt) {
              syncedMediaTokensSet.add(token);

              const cardData = {
                cardId: matchedPrompt.cardId,
                ordinal: matchedPrompt.ordinal,
                variation: '',
                title: matchedPrompt.title || '',
                prompt: matchedPrompt.prompt || '',
                ratio: matchedPrompt.ratio || '1:1',
                token: token,
                mediaId: el.getAttribute('data-media-id') || '',
              };

              tagCardWithPromptData(tileContainer, cardData);
              savePromptToRegistry(token, cardData);

              console.log('[Meta-Gen Flow Bridge] Auto-detected matching prompt card:', matchedPrompt.ordinal, matchedPrompt.title);

              // Immediately notify Meta-Gen Web App tab with the image dataUrl
              try {
                const dataUrl = await imageToDataUrl(el);
                if (dataUrl) {
                  chrome.runtime.sendMessage({
                    type: 'FLOW_CARD_DISCOVERED',
                    result: {
                      cardId: matchedPrompt.cardId,
                      ordinal: matchedPrompt.ordinal,
                      token: token,
                      imageDataUrl: dataUrl,
                    },
                  });
                  showFlowToast(
                    '⚡ Meta-Gen Auto-Sync',
                    `Adegan #${matchedPrompt.ordinal || ''} otomatis terhubung ke Meta-Gen!`,
                    true
                  );
                }
              } catch (err) {
                console.warn('[Meta-Gen Flow Bridge] Auto-sync export error:', err);
              }
            }
          }
        }

        // 4. Check for any failed tiles with 'Coba lagi' / 'try-again-button'
        if (candidatePrompts.length > 0) {
          const candidateContainers = Array.from(
            document.querySelectorAll(
              'flow-grid-tile-container, flow-tile-container, flow-image-tile, flow-video-tile, .tile-row, [data-tile-id]'
            )
          );

          if (res.metagen_feature_auto_retry !== false) {
            for (const container of candidateContainers) {
              const tryBtn = findTryAgainButton(container);
              if (!tryBtn) continue;

              const matchedPrompt = findBestMatchingPrompt(container, candidatePrompts);
              if (matchedPrompt) {
                const tileKey = matchedPrompt.cardId || extractTilePromptText(container).slice(0, 40) || 'tile_err';
                const retryCount = autoRetriedFailedTilesMap.get(tileKey) || 0;
                if (retryCount < 2) {
                  autoRetriedFailedTilesMap.set(tileKey, retryCount + 1);
                  console.warn(`[Meta-Gen Flow Bridge] Auto-clicking 'Coba lagi' for scene #${matchedPrompt.ordinal}...`);
                  showFlowToast(
                    '⚠️ Auto-Retry Google Flow',
                    `Mencoba lagi render otomatis untuk adegan #${matchedPrompt.ordinal || ''} (${retryCount + 1}/2)...`,
                    false
                  );
                  clickTryAgainButton(tryBtn);
                  break;
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn('[Meta-Gen Flow Bridge] Auto-scanner iteration error:', err);
      } finally {
        isAutoScannerRunning = false;
      }
    });
  } catch (err) {
    isAutoScannerRunning = false;
  }
}

// Backward-compatible alias for existing calls
function hydrateFlowBadges() {
  scanAndAutoSyncFlowCanvas();
}

// Helper: Locate "New Project" / "Project baru" button on Google Flow dashboard
function findNewProjectButton() {
  // Strategy 1: Exact selectors from user's inspected button
  const specificSelectors = [
    'button.new-project-button',
    '.new-project-button',
    'button.mat-mdc-extended-fab.new-project-button',
    'button.mdc-fab--extended.new-project-button',
    'button.mat-mdc-fab.new-project-button',
    'button[mat-fab][extended]',
  ];
  for (const sel of specificSelectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }

  // Strategy 2: Search buttons for text "Project baru" / "New project"
  const allButtons = Array.from(document.querySelectorAll('button, a[role="button"]'));
  for (const b of allButtons) {
    if (b.classList.contains('new-project-button')) return b;
    const txt = (b.textContent || '').trim().toLowerCase();
    if (
      txt.includes('project baru') ||
      txt.includes('proyek baru') ||
      txt.includes('new project') ||
      txt.includes('create project')
    ) {
      return b;
    }
  }

  // Strategy 3: Button with mat-icon "add" + "project"/"proyek"
  for (const b of allButtons) {
    const icons = Array.from(b.querySelectorAll('mat-icon, [role="img"], i, span'));
    const hasAdd = icons.some((i) => {
      const icText = (i.textContent || '').trim().toLowerCase();
      const icType = (i.getAttribute('data-mat-icon-type') || '').toLowerCase();
      return icText === 'add' || icType === 'add';
    });
    const txt = (b.textContent || '').trim().toLowerCase();
    if (hasAdd && (txt.includes('project') || txt.includes('proyek') || b.hasAttribute('mat-fab'))) {
      return b;
    }
  }

  return null;
}

// Helper: Click "Project baru" button using multi-tier pointer simulation, MAIN world Zone.js, and CDP
function clickNewProjectButton(btn) {
  try {
    btn.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
  } catch (e) {}

  btn.focus();

  const rect = btn.getBoundingClientRect();
  const clickX = rect.width > 0 ? Math.round(rect.left + rect.width / 2) : 100;
  const clickY = rect.height > 0 ? Math.round(rect.top + rect.height / 2) : 100;

  // Find inner target elements to dispatch events on
  const innerTargets = [
    btn.querySelector('.mat-mdc-button-touch-target'),
    btn.querySelector('.mdc-button__label'),
    btn.querySelector('span'),
    btn,
  ].filter(Boolean);

  const eventOpts = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX: clickX,
    clientY: clickY,
  };

  // Tier 1: DOM Pointer & Mouse Events in Isolated World on both child and button
  for (const target of innerTargets) {
    target.dispatchEvent(new PointerEvent('pointerover', eventOpts));
    target.dispatchEvent(new PointerEvent('pointerenter', eventOpts));
    target.dispatchEvent(new PointerEvent('pointerdown', { ...eventOpts, isPrimary: true, button: 0 }));
    target.dispatchEvent(new MouseEvent('mousedown', { ...eventOpts, button: 0 }));
    target.dispatchEvent(new PointerEvent('pointerup', { ...eventOpts, isPrimary: true, button: 0 }));
    target.dispatchEvent(new MouseEvent('mouseup', { ...eventOpts, button: 0 }));
    try {
      target.click();
    } catch (e) {}
  }
  btn.click();

  // Tier 2: Trigger click directly inside MAIN World (Angular Zone.js context)
  try {
    chrome.runtime.sendMessage({ type: 'TRIGGER_MAIN_WORLD_CLICK_NEW_PROJECT' });
  } catch (e) {}

  // Tier 3: Hardware-level CDP click via chrome.debugger
  try {
    if (rect.width > 0 && rect.height > 0) {
      chrome.runtime.sendMessage({
        type: 'TRIGGER_CDP_MOUSE_CLICK',
        coords: { x: clickX, y: clickY },
      });
    }
  } catch (e) {}
}

// Helper: Detect if Google Flow requires user login or session has expired
function checkFlowLoginStatus() {
  if (window.location.hostname.includes('accounts.google.com') || window.location.href.includes('ServiceLogin')) {
    return false;
  }
  const signInEl = document.querySelector(
    'a[href*="accounts.google.com"], button[aria-label*="Sign in" i], button[aria-label*="Masuk" i], a[href*="ServiceLogin"]'
  );
  const isAppLoaded = document.querySelector(
    'button.new-project-button, .ProseMirror, flow-prompt-box, mat-sidenav-container, .flow-canvas, flow-image-tile'
  );
  if (signInEl && !isAppLoaded) {
    return false;
  }
  return true;
}

// Helper: Ensure Google Flow has an active project open (auto-clicks "Project baru" if on dashboard)
async function ensureActiveProject() {
  if (!checkFlowLoginStatus()) {
    console.warn('[Meta-Gen Flow Bridge] Google Flow session requires login!');
    try {
      chrome.runtime.sendMessage({ type: 'FLOW_LOGIN_REQUIRED' });
    } catch (e) {}
    throw new Error('Sesi Google Flow belum login atau telah berakhir. Tab Flow telah dibuka di browser Anda. Silakan login terlebih dahulu.');
  }

  const isInsideProjectUrl = window.location.href.includes('/project/');
  const initialNewButton = findNewProjectButton();

  // RULE 1: If strictly on a /project/ URL and "Project baru" button is absent, project canvas is ready!
  if (isInsideProjectUrl && !initialNewButton) {
    console.log('[Meta-Gen Flow Bridge] Already inside active project canvas (/project/):', window.location.href);
    return true;
  }

  console.log(
    '[Meta-Gen Flow Bridge] Dashboard detected (isInsideProjectUrl:',
    isInsideProjectUrl,
    ', hasNewButton:',
    !!initialNewButton,
    '). Must create / open Project first before inputting prompt!'
  );
  showFlowToast('Google Flow', 'Membuat Proyek Baru terlebih dahulu...', false);

  // RULE 2: Search for the "Project baru" button (polling up to 6s if page is still rendering)
  let newProjBtn = initialNewButton;
  if (!newProjBtn) {
    const pollStart = Date.now();
    while (Date.now() - pollStart < 6000 && !newProjBtn) {
      await new Promise((r) => setTimeout(r, 300));
      newProjBtn = findNewProjectButton();
    }
  }

  if (newProjBtn) {
    console.log('[Meta-Gen Flow Bridge] Tombol "Project baru" ditemukan! Mengklik tombol...', newProjBtn);
    clickNewProjectButton(newProjBtn);

    // RULE 3: Wait until the browser navigates into /project/
    const startWait = Date.now();
    while (Date.now() - startWait < 20000) {
      await new Promise((r) => setTimeout(r, 600));

      if (window.location.href.includes('/project/')) {
        console.log('[Meta-Gen Flow Bridge] Navigasi berhasil masuk ke URL project:', window.location.href);
        showFlowToast('Google Flow', 'Proyek baru siap! Mempersiapkan canvas...', false);
        // Wait 1.5s for Angular / ProseMirror component tree on canvas to fully mount
        await new Promise((r) => setTimeout(r, 1500));
        return true;
      }

      // If still on dashboard after 3.5s, click again
      if (Date.now() - startWait > 3500 && !window.location.href.includes('/project/')) {
        const retryBtn = findNewProjectButton();
        if (retryBtn) {
          clickNewProjectButton(retryBtn);
        }
      }
    }

    console.warn('[Meta-Gen Flow Bridge] Timeout menunggu URL berubah menjadi /project/.');
  } else {
    console.warn('[Meta-Gen Flow Bridge] Tombol "Project baru" tidak ditemukan di dashboard.');
  }

  // Strict check: If STILL not on /project/, throw error so we do NOT type prompt on dashboard
  if (!window.location.href.includes('/project/')) {
    throw new Error('Google Flow belum beralih ke halaman project baru. Silakan klik tombol "Project baru" di Google Flow.');
  }

  return true;
}

// Helper: Check if Google Flow Agent Mode is currently active
function isAgentModeActive() {
  // Check container chip for 'checked' class
  const chip = document.querySelector('flow-agent-mode-toggle-chip');
  if (chip && chip.classList.contains('checked')) return true;

  // Check button for aria-pressed="true" or 'agent-mode-chip-checked' class
  const btn = document.querySelector('flow-agent-mode-toggle-chip button, button.agent-mode-chip');
  if (btn) {
    if (btn.getAttribute('aria-pressed') === 'true') return true;
    if (btn.classList.contains('agent-mode-chip-checked')) return true;
  }

  // Check for glow elements present only when active
  const glow = document.querySelector(
    'flow-agent-mode-toggle-chip .glow-fill, flow-agent-mode-toggle-chip .glow-outline, button.agent-mode-chip .glow-fill'
  );
  if (glow) return true;

  return false;
}

// Helper: Locate Agent Mode toggle button in Google Flow
function findAgentModeButton() {
  // Strategy 1: Specific selectors from user's inspected button
  const specificSelectors = [
    'flow-agent-mode-toggle-chip button.agent-mode-chip',
    'flow-agent-mode-toggle-chip button',
    'button.agent-mode-chip',
    'flow-agent-mode-toggle-chip',
  ];
  for (const sel of specificSelectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }

  // Strategy 2: Search button containing .agent-mode-chip-label or text "Agen" / "Agent"
  const allButtons = Array.from(document.querySelectorAll('button, [role="button"]'));
  for (const b of allButtons) {
    if (b.classList.contains('agent-mode-chip')) return b;
    const label = b.querySelector('.agent-mode-chip-label');
    if (label) return b;
    const txt = (b.textContent || '').trim().toLowerCase();
    if (txt === 'agen' || txt === 'agent' || b.closest('flow-agent-mode-toggle-chip')) {
      return b;
    }
  }

  return null;
}

// Helper: Click Agent Mode button using multi-tier pointer simulation, MAIN world Zone.js, and CDP
function clickAgentModeButton(btn) {
  try {
    btn.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
  } catch (e) {}

  btn.focus();

  const rect = btn.getBoundingClientRect();
  const clickX = rect.width > 0 ? Math.round(rect.left + rect.width / 2) : 100;
  const clickY = rect.height > 0 ? Math.round(rect.top + rect.height / 2) : 100;

  const innerTarget = btn.querySelector('.agent-mode-chip-label, span') || btn;

  const eventOpts = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX: clickX,
    clientY: clickY,
  };

  // Tier 1: DOM events in isolated world
  innerTarget.dispatchEvent(new PointerEvent('pointerover', eventOpts));
  innerTarget.dispatchEvent(new PointerEvent('pointerenter', eventOpts));
  innerTarget.dispatchEvent(new PointerEvent('pointerdown', { ...eventOpts, isPrimary: true, button: 0 }));
  innerTarget.dispatchEvent(new MouseEvent('mousedown', { ...eventOpts, button: 0 }));
  innerTarget.dispatchEvent(new PointerEvent('pointerup', { ...eventOpts, isPrimary: true, button: 0 }));
  innerTarget.dispatchEvent(new MouseEvent('mouseup', { ...eventOpts, button: 0 }));
  try {
    innerTarget.click();
  } catch (e) {}
  btn.click();

  // Tier 2: MAIN world dispatch in Zone.js
  try {
    chrome.runtime.sendMessage({ type: 'TRIGGER_MAIN_WORLD_CLICK_AGENT_MODE' });
  } catch (e) {}

  // Tier 3: Hardware-level CDP click
  try {
    if (rect.width > 0 && rect.height > 0) {
      chrome.runtime.sendMessage({
        type: 'TRIGGER_CDP_MOUSE_CLICK',
        coords: { x: clickX, y: clickY },
      });
    }
  } catch (e) {}
}

// Helper: Ensure Google Flow Agent Mode is active
async function ensureAgentModeActive() {
  if (isAgentModeActive()) {
    console.log('[Meta-Gen Flow Bridge] Mode Agen sudah AKTIF (checked / aria-pressed=true).');
    return true;
  }

  console.log('[Meta-Gen Flow Bridge] Mode Agen saat ini NONAKTIF. Mencari tombol untuk mengaktifkan...');
  showFlowToast('Google Flow', 'Mengaktifkan Mode Agen...', false);

  let btn = findAgentModeButton();
  if (!btn) {
    const pollStart = Date.now();
    while (Date.now() - pollStart < 4000 && !btn) {
      await new Promise((r) => setTimeout(r, 250));
      btn = findAgentModeButton();
    }
  }

  if (btn) {
    clickAgentModeButton(btn);

    // Wait up to 3.5 seconds for class="checked" or aria-pressed="true"
    const startWait = Date.now();
    while (Date.now() - startWait < 3500) {
      await new Promise((r) => setTimeout(r, 200));
      if (isAgentModeActive()) {
        console.log('[Meta-Gen Flow Bridge] Mode Agen BERHASIL diaktifkan!');
        showFlowToast('Google Flow', 'Mode Agen aktif! Siap generate...', false);
        await new Promise((r) => setTimeout(r, 400));
        return true;
      }
    }
    console.warn('[Meta-Gen Flow Bridge] Timeout menunggu status Mode Agen aktif.');
  } else {
    console.warn('[Meta-Gen Flow Bridge] Tombol Mode Agen tidak ditemukan di DOM.');
  }

  return isAgentModeActive();
}

// Helper: Normalize aspect ratio string ('16:9', '1:1', '9:16', '4:3', '3:4')
function normalizeRatio(ratio) {
  if (!ratio || typeof ratio !== 'string') return '16:9';
  const clean = ratio.trim().replace(/\s+/g, '');
  if (clean === '1:1' || clean === '1/1') return '1:1';
  if (clean === '16:9' || clean === '16/9') return '16:9';
  if (clean === '9:16' || clean === '9/16') return '9:16';
  if (clean === '4:3' || clean === '4/3') return '4:3';
  if (clean === '3:4' || clean === '3/4') return '3:4';
  return '16:9';
}

// Helper: Safely click Angular Material Button Toggle using full pointer sequence
function clickMaterialToggle(toggleEl) {
  if (!toggleEl) return;
  const btn = toggleEl.querySelector('button.mat-button-toggle-button') || toggleEl.querySelector('button') || toggleEl;
  try {
    btn.scrollIntoView({ behavior: 'instant', block: 'nearest' });
  } catch (e) {}
  btn.focus();
  const opts = { bubbles: true, cancelable: true, composed: true, view: window };
  btn.dispatchEvent(new PointerEvent('pointerdown', opts));
  btn.dispatchEvent(new MouseEvent('mousedown', opts));
  btn.dispatchEvent(new PointerEvent('pointerup', opts));
  btn.dispatchEvent(new MouseEvent('mouseup', opts));
  btn.click();
}

// Helper: Thoroughly dismiss all CDK overlays, backdrops, menus, and popovers
function dismissAllOverlays() {
  try {
    // 1. Click backdrop if present
    const backdrops = document.querySelectorAll('.cdk-overlay-backdrop');
    backdrops.forEach((bd) => {
      try {
        bd.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
        bd.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        bd.click();
      } catch (e) {}
    });

    // 2. Click any buttons that are currently aria-expanded="true" (except agent chip or new project button)
    const expandedButtons = document.querySelectorAll('button[aria-expanded="true"], [role="button"][aria-expanded="true"]');
    expandedButtons.forEach((btn) => {
      try {
        if (!btn.classList.contains('agent-mode-chip') && !btn.classList.contains('new-project-button')) {
          btn.click();
        }
      } catch (e) {}
    });

    // 3. Find and click any close buttons inside CDK overlays or popovers
    const closeButtons = document.querySelectorAll(
      '.cdk-overlay-pane button[aria-label*="tutup" i], .cdk-overlay-pane button[aria-label*="close" i], .cdk-overlay-pane button[mattooltip*="tutup" i], .cdk-overlay-pane button[mattooltip*="close" i]'
    );
    closeButtons.forEach((btn) => {
      try { btn.click(); } catch (e) {}
    });

    const iconButtons = document.querySelectorAll('.cdk-overlay-pane button');
    iconButtons.forEach((btn) => {
      const ic = btn.querySelector('mat-icon');
      if (ic) {
        const txt = (ic.textContent || '').trim().toLowerCase();
        if (txt === 'close' || txt === 'cancel' || txt === 'clear') {
          try { btn.click(); } catch (e) {}
        }
      }
    });

    // 4. Dispatch Escape event directly on document.activeElement, document, and all open cdk-overlay-panes
    const escEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      keyCode: 27,
      which: 27,
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    if (document.activeElement && document.activeElement !== document.body) {
      try { document.activeElement.dispatchEvent(escEvent); } catch (e) {}
    }
    document.dispatchEvent(escEvent);

    const panes = document.querySelectorAll('.cdk-overlay-pane');
    panes.forEach((p) => {
      try { p.dispatchEvent(escEvent); } catch (e) {}
    });
  } catch (err) {
    console.warn('[Meta-Gen Flow Bridge] dismissAllOverlays error:', err);
  }
}

// Helper: Inspect current setting trigger button summary
function getCurrentFlowSettings() {
  let triggerBtn = document.querySelector(
    'flow-prompt-box button.settings-trigger-button, button.settings-trigger-button, flow-prompt-box button[aria-label*="setelan" i], flow-prompt-box button[aria-label*="setting" i], button[aria-label="Pemicu setelan" i]'
  );
  if (!triggerBtn) {
    const allButtons = Array.from(document.querySelectorAll('flow-prompt-box button, button'));
    triggerBtn = allButtons.find((b) => {
      const ic = b.querySelector('mat-icon');
      const icText = (ic ? ic.textContent : '').trim().toLowerCase();
      if (icText === 'settings_2' || icText === 'tune') return false;
      return b.classList.contains('settings-trigger-button') || b.querySelector('.settings-summary') !== null;
    });
  }
  if (!triggerBtn) return null;

  const summary = triggerBtn.querySelector('.settings-summary');
  const txt = (summary ? summary.textContent : triggerBtn.textContent || '').trim().toLowerCase();

  const icon = triggerBtn.querySelector('mat-icon');
  const iconText = (icon ? icon.textContent : '').trim().toLowerCase();

  let ratio = '16:9';
  if (iconText === 'crop_16_9' || txt.includes('16:9')) ratio = '16:9';
  else if (iconText === 'crop_square' || txt.includes('1:1')) ratio = '1:1';
  else if (iconText === 'crop_9_16' || txt.includes('9:16')) ratio = '9:16';
  else if (iconText === 'crop_landscape' || txt.includes('4:3')) ratio = '4:3';
  else if (iconText === 'crop_portrait' || txt.includes('3:4')) ratio = '3:4';

  let count = 'x1';
  if (txt.includes('x4')) count = 'x4';
  else if (txt.includes('x3')) count = 'x3';
  else if (txt.includes('x2')) count = 'x2';
  else if (txt.includes('x1')) count = 'x1';

  const isVideo = txt.includes('video') || iconText === 'videocam';

  return { triggerBtn, ratio, count, isVideo, rawText: txt };
}

// Helper: Configure Google Flow Settings (Mode, Aspect Ratio, Outputs, Video Type)
async function ensureFlowSettings(targetRatio = '16:9', targetOutput = null, targetMode = 'gambar', videoType = null) {
  const normRatio = normalizeRatio(targetRatio);
  const normOutput = targetOutput
    ? (targetOutput.toString().startsWith('x') ? targetOutput.toLowerCase() : `x${targetOutput}`)
    : null;
  const isTargetVideo = (targetMode || 'gambar').toLowerCase() === 'video';

  const current = getCurrentFlowSettings();
  console.log('[Meta-Gen Flow Bridge] Current Flow Settings:', current, 'Target:', {
    normRatio,
    normOutput,
    isTargetVideo,
    videoType,
  });

  // Fast check: If settings already 100% match, skip opening popup (Zero Delay!)
  const isModeMatch = isTargetVideo ? current?.isVideo : !current?.isVideo;
  const isRatioMatch = current?.ratio === normRatio;
  const isOutputMatch = !normOutput || isTargetVideo || current?.count === normOutput;

  if (current && isModeMatch && isRatioMatch && isOutputMatch) {
    console.log(
      '[Meta-Gen Flow Bridge] Settings already 100% match target (Ratio: ' +
        normRatio +
        ', Output: ' +
        (normOutput || current.count) +
        ', Mode: ' +
        (isTargetVideo ? 'Video' : 'Gambar') +
        '). No popup needed.'
    );
    return true;
  }

  const triggerBtn = current?.triggerBtn || document.querySelector(
    'button.settings-trigger-button, button[aria-label="Pemicu setelan" i], button[aria-label*="setelan" i]'
  );

  if (!triggerBtn) {
    console.warn('[Meta-Gen Flow Bridge] Tombol pemicu setelan tidak ditemukan di DOM.');
    return false;
  }

  showFlowToast(
    'Google Flow',
    `Menyesuaikan Setelan (${isTargetVideo ? 'Video' : 'Gambar'}, ${normRatio}${normOutput && !isTargetVideo ? ', ' + normOutput : ''})...`,
    false
  );

  // 1. Open the settings overlay by clicking the trigger button
  triggerBtn.scrollIntoView({ behavior: 'instant', block: 'center' });
  triggerBtn.click();

  // 2. Wait up to 2 seconds for settings overlay to appear
  let overlay = null;
  const overlayStart = Date.now();
  while (Date.now() - overlayStart < 2000 && !overlay) {
    await new Promise((r) => setTimeout(r, 120));
    overlay = document.querySelector('flow-prompt-box-settings, .settings-content-overlay');
  }

  if (!overlay) {
    console.warn('[Meta-Gen Flow Bridge] Overlay flow-prompt-box-settings tidak muncul setelah tombol diklik.');
    return false;
  }

  // 3. Ensure Mode is correctly set ("Gambar" vs "Video")
  const modeGroup = overlay.querySelector('flow-toggles[aria-label="Mode" i]');
  if (modeGroup) {
    const targetModeToggle = Array.from(modeGroup.querySelectorAll('.mat-button-toggle, button')).find((el) => {
      const txt = (el.textContent || '').trim().toLowerCase();
      const icon = el.querySelector('mat-icon')?.textContent || '';
      return isTargetVideo ? (txt.includes('video') || icon === 'videocam') : (txt.includes('gambar') || icon === 'image');
    });
    if (targetModeToggle) {
      const isChecked = targetModeToggle.classList.contains('mat-button-toggle-checked') ||
        targetModeToggle.querySelector('button')?.getAttribute('aria-checked') === 'true';
      if (!isChecked) {
        console.log('[Meta-Gen Flow Bridge] Mengalihkan mode ke:', isTargetVideo ? 'Video' : 'Gambar');
        clickMaterialToggle(targetModeToggle);
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  }

  // 3.5. If video mode and videoType specified ("Frame" vs "Bahan")
  if (isTargetVideo && videoType) {
    const videoTypeGroup = overlay.querySelector('flow-toggles[aria-label="Jenis video" i]');
    if (videoTypeGroup) {
      const vToggle = Array.from(videoTypeGroup.querySelectorAll('.mat-button-toggle')).find((el) => {
        return (el.textContent || '').trim().toLowerCase().includes(videoType.toLowerCase());
      });
      if (vToggle) {
        const isChecked = vToggle.classList.contains('mat-button-toggle-checked') ||
          vToggle.querySelector('button')?.getAttribute('aria-checked') === 'true';
        if (!isChecked) {
          console.log('[Meta-Gen Flow Bridge] Memilih jenis video:', videoType);
          clickMaterialToggle(vToggle);
          await new Promise((r) => setTimeout(r, 150));
        }
      }
    }
  }

  // 4. Select the desired Aspect Ratio
  const ratioGroup = overlay.querySelector('flow-toggles[aria-label="Rasio aspek" i]');
  if (ratioGroup) {
    const ratioToggles = Array.from(ratioGroup.querySelectorAll('.mat-button-toggle'));
    const targetToggle = ratioToggles.find((t) => {
      const txt = (t.querySelector('.toggle-text')?.textContent || t.textContent || '').trim().toLowerCase();
      return txt === normRatio;
    });

    if (targetToggle) {
      const isChecked = targetToggle.classList.contains('mat-button-toggle-checked') ||
        targetToggle.querySelector('button')?.getAttribute('aria-checked') === 'true';

      if (!isChecked) {
        console.log('[Meta-Gen Flow Bridge] Memilih rasio aspek:', normRatio);
        clickMaterialToggle(targetToggle);
        await new Promise((r) => setTimeout(r, 200));
      } else {
        console.log('[Meta-Gen Flow Bridge] Rasio aspek sudah terpilih:', normRatio);
      }
    } else {
      console.warn('[Meta-Gen Flow Bridge] Toggle rasio aspek tidak ditemukan untuk:', normRatio);
    }
  }

  // 5. Select Output Count if targetOutput specified (x1, x2, x3, x4) - max 4
  if (normOutput && !isTargetVideo) {
    const outputGroup = overlay.querySelector('flow-toggles[aria-label="Jumlah output" i]');
    if (outputGroup) {
      const outputToggles = Array.from(outputGroup.querySelectorAll('.mat-button-toggle'));
      const targetToggle = outputToggles.find((t) => {
        const txt = (t.querySelector('.toggle-text')?.textContent || t.textContent || '').trim().toLowerCase();
        return txt === normOutput;
      });

      if (targetToggle) {
        const isChecked = targetToggle.classList.contains('mat-button-toggle-checked') ||
          targetToggle.querySelector('button')?.getAttribute('aria-checked') === 'true';

        if (!isChecked) {
          console.log('[Meta-Gen Flow Bridge] Memilih jumlah output:', normOutput);
          clickMaterialToggle(targetToggle);
          await new Promise((r) => setTimeout(r, 200));
        } else {
          console.log('[Meta-Gen Flow Bridge] Jumlah output sudah terpilih:', normOutput);
        }
      } else {
        console.warn('[Meta-Gen Flow Bridge] Toggle jumlah output tidak ditemukan untuk:', normOutput);
      }
    }
  }

  // 6. Close the overlay
  dismissAllOverlays();
  await new Promise((r) => setTimeout(r, 200));

  // If overlay is still present in DOM, toggle trigger button again to dismiss
  if (document.querySelector('flow-prompt-box-settings, .settings-content-overlay')) {
    try {
      triggerBtn.click();
    } catch (e) {}
    await new Promise((r) => setTimeout(r, 150));
  }
  dismissAllOverlays();

  console.log('[Meta-Gen Flow Bridge] Konfigurasi setelan Google Flow selesai.');
  return true;
}

// Helper: Ensure Google Flow is in "Batch" view mode for clear per-image prompt visibility
let isBatchModeConfirmed = false;

async function ensureBatchViewMode() {
  try {
    // 1. Cek apakah sudah terkonfirmasi di sesi ini (cukup sekali, jangan ulang-ulang)
    if (isBatchModeConfirmed) {
      return;
    }

    // 2. Cek apakah canvas sudah dalam tampilan Batch (ada .tile-row atau flow-expandable-prompt)
    if (document.querySelector('.tile-row, flow-batch-row, flow-expandable-prompt')) {
      isBatchModeConfirmed = true;
      console.log('[Meta-Gen Flow Bridge] Mode tampilan Batch sudah aktif di canvas.');
      return;
    }

    // 3. Cek apakah tombol toggle Batch sedang aktif di DOM
    const checkedToggle = document.querySelector(
      '.mat-button-toggle-checked .toggle-text, [aria-checked="true"] .toggle-text, button[role="radio"][aria-checked="true"]'
    );
    if (checkedToggle && (checkedToggle.textContent || '').trim().toLowerCase().includes('batch')) {
      isBatchModeConfirmed = true;
      console.log('[Meta-Gen Flow Bridge] Mode tampilan Batch sudah aktif.');
      return;
    }

    console.log('[Meta-Gen Flow Bridge] Mengaktifkan Mode Tampilan Batch (hanya sekali)...');

    // 4. Cari tombol Setelan (icon settings_2 atau aria-label Setelan)
    let settingsBtn = document.querySelector(
      'button[aria-label="Setelan" i], button[aria-label="Settings" i], button[mattooltip="Lihat setelan" i], button[mattooltip="View settings" i]'
    );
    if (!settingsBtn) {
      const allButtons = Array.from(document.querySelectorAll('button'));
      settingsBtn = allButtons.find((b) => {
        const ic = b.querySelector('mat-icon');
        return ic && (ic.textContent || '').trim() === 'settings_2';
      });
    }

    if (settingsBtn) {
      settingsBtn.click();
      await new Promise((r) => setTimeout(r, 400));

      // 5. Cari tombol Batch dalam menu/popover yang muncul
      const allToggleButtons = Array.from(
        document.querySelectorAll('.mat-button-toggle-button, [role="radio"], button')
      );
      const batchBtn = allToggleButtons.find((b) => {
        const txt = (b.textContent || '').trim().toLowerCase();
        return txt === 'batch' || txt.includes('batch');
      });

      if (batchBtn) {
        batchBtn.click();
        isBatchModeConfirmed = true;
        console.log('[Meta-Gen Flow Bridge] Pilihan Batch berhasil diaktifkan!');
        await new Promise((r) => setTimeout(r, 300));
      }

      // 6. Tutup popover setelan secara menyeluruh
      dismissAllOverlays();
      await new Promise((r) => setTimeout(r, 150));

      // Jika popover masih terbuka, klik ulang tombol settingsBtn untuk toggle close
      if (document.querySelector('.cdk-overlay-pane, [role="dialog"], [role="menu"]')) {
        try {
          settingsBtn.click();
        } catch (e) {}
        await new Promise((r) => setTimeout(r, 150));
      }
      dismissAllOverlays();
    }
  } catch (err) {
    console.warn('[Meta-Gen Flow Bridge] ensureBatchViewMode warning:', err);
  }
}

// Helper: Ensure Google Flow is in "Petak" (Grid) view mode before mass downloading
async function ensureGridViewMode() {
  console.log('[Meta-Gen Flow Bridge] Memastikan mode tampilan canvas adalah "Petak" (Grid)...');

  // 0. Direct check for user's explicit selector: id="mat-button-toggle-0" / id="mat-button-toggle-0-button"
  const directIdToggle = document.querySelector('#mat-button-toggle-0, #mat-button-toggle-0-button');
  if (directIdToggle) {
    const isChecked =
      directIdToggle.classList.contains('mat-button-toggle-checked') ||
      directIdToggle.getAttribute('aria-checked') === 'true' ||
      directIdToggle.querySelector('button')?.getAttribute('aria-checked') === 'true';
    if (isChecked) {
      console.log('[Meta-Gen Flow Bridge] Mode "Petak" (Grid) sudah aktif (#mat-button-toggle-0).');
      return true;
    }

    console.log('[Meta-Gen Flow Bridge] Mengalihkan ke mode "Petak" (Grid) via #mat-button-toggle-0...');
    clickMaterialToggle(directIdToggle);
    await new Promise((r) => setTimeout(r, 600));
    return true;
  }

  // 1. Direct check: look for Petak / Grid toggle in DOM (matching user snippet)
  const allToggles = Array.from(document.querySelectorAll('.mat-button-toggle, flow-toggles mat-button-toggle'));
  const petakToggle = allToggles.find((t) => {
    const txt = (t.textContent || '').trim().toLowerCase();
    const icon = t.querySelector('mat-icon')?.textContent?.trim() || '';
    return txt.includes('petak') || txt.includes('grid') || icon === 'dashboard';
  });

  if (petakToggle) {
    const isChecked =
      petakToggle.classList.contains('mat-button-toggle-checked') ||
      petakToggle.querySelector('button')?.getAttribute('aria-checked') === 'true';
    if (isChecked) {
      console.log('[Meta-Gen Flow Bridge] Mode "Petak" (Grid) sudah aktif.');
      return true;
    }

    console.log('[Meta-Gen Flow Bridge] Mengalihkan ke mode "Petak" (Grid)...');
    clickMaterialToggle(petakToggle);
    await new Promise((r) => setTimeout(r, 600));
    return true;
  }

  // 2. Fallback: Check if Settings menu needs to be clicked (e.g. icon settings_2)
  let settingsBtn = document.querySelector(
    'button[aria-label="Setelan" i], button[mattooltip="Lihat setelan" i], button[aria-label*="setelan" i]'
  );
  if (!settingsBtn) {
    const allButtons = Array.from(document.querySelectorAll('button'));
    settingsBtn = allButtons.find((b) => {
      const ic = b.querySelector('mat-icon');
      return ic && (ic.textContent || '').trim() === 'settings_2';
    });
  }

  if (settingsBtn) {
    settingsBtn.click();
    await new Promise((r) => setTimeout(r, 450));

    const popoverToggles = Array.from(
      document.querySelectorAll('.mat-button-toggle, flow-toggles mat-button-toggle, button')
    );
    const pToggle = popoverToggles.find((t) => {
      const txt = (t.textContent || '').trim().toLowerCase();
      const icon = t.querySelector('mat-icon')?.textContent?.trim() || '';
      return txt.includes('petak') || txt.includes('grid') || icon === 'dashboard';
    });

    if (pToggle) {
      clickMaterialToggle(pToggle);
      await new Promise((r) => setTimeout(r, 500));
    }

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0 }));
    await new Promise((r) => setTimeout(r, 200));
  }

  return true;
}

// Helper: Extract prompt text from a tile or row in Google Flow
function extractTilePromptText(tileElement) {
  if (!tileElement) return '';

  // 0. If already tagged with prompt
  const taggedPrompt = tileElement.getAttribute('data-metagen-prompt');
  if (taggedPrompt && taggedPrompt.length > 5) return taggedPrompt;

  // 1. Check Batch Mode full prompt container in the same row
  const row =
    tileElement.closest('.tile-row') ||
    tileElement.closest('flow-batch-row') ||
    tileElement.closest('.batch-row') ||
    tileElement.parentElement;
  if (row) {
    const batchPromptEl = row.querySelector(
      '.prompt-text .text-part, flow-expandable-prompt .text-part, .prompt-text, flow-expandable-prompt, .user-prompt, [data-prompt], .prompt-display'
    );
    if (batchPromptEl && batchPromptEl.textContent.trim().length > 5) {
      return batchPromptEl.textContent.trim();
    }
  }

  // 2. Direct inside tileElement
  const directPrompt = tileElement.querySelector(
    '.prompt-text .text-part, flow-expandable-prompt .text-part, .prompt-text, .user-prompt, [data-prompt], .prompt-display, .prompt-container, div[role="textbox"]'
  );
  if (directPrompt && directPrompt.textContent.trim().length > 5) {
    return directPrompt.textContent.trim();
  }

  // 3. Sibling element beside the tile image
  const siblingPrompt = tileElement.parentElement?.querySelector(
    '.prompt-text, .text-part, flow-expandable-prompt, .footer-title, [data-prompt], .user-prompt'
  );
  if (siblingPrompt && siblingPrompt.textContent.trim().length > 5) {
    return siblingPrompt.textContent.trim();
  }

  // 4. Grid Mode footer title or caption
  const footerTitle = tileElement.querySelector('.footer-title, .title-text, .prompt-caption, span.body-medium');
  if (footerTitle && footerTitle.textContent.trim().length > 5) {
    return footerTitle.textContent.trim();
  }

  // 5. Grid Mode container aria-label (EXCLUDE hardcoded placeholder "Alpaca wearing" or generic labels)
  const ariaLabel = tileElement.getAttribute('aria-label') || '';
  if (
    ariaLabel.trim().length > 5 &&
    !ariaLabel.includes('Kartu yang menampilkan') &&
    !ariaLabel.includes('Alpaca wearing') &&
    !ariaLabel.toLowerCase().includes('alpaca') &&
    !ariaLabel.includes('card') &&
    !ariaLabel.includes('image')
  ) {
    return ariaLabel.trim();
  }

  // 6. Check alt or title on img element
  const imgEl = tileElement.querySelector('img') || (tileElement.tagName === 'IMG' ? tileElement : null);
  if (imgEl) {
    const alt = imgEl.getAttribute('alt') || imgEl.getAttribute('title') || '';
    if (
      alt.trim().length > 10 &&
      !alt.toLowerCase().includes('alpaca') &&
      !alt.includes('card') &&
      !alt.includes('thumbnail')
    ) {
      return alt.trim();
    }
  }

  return '';
}

// Helper: Check if a tile matches the target prompt using semantic keywords & substring
function isTileMatchingTargetPrompt(tileElement, targetPrompt) {
  if (!targetPrompt) return true;
  if (!tileElement) return true;

  // If already tagged with a cardId
  if (tileElement.getAttribute('data-metagen-card-id')) {
    return true;
  }

  const tileText = extractTilePromptText(tileElement).toLowerCase().trim();
  if (!tileText) return true; // fallback if prompt text element is not yet populated

  const cleanTarget = targetPrompt.toLowerCase().trim();

  // Substring match
  if (cleanTarget.includes(tileText) || tileText.includes(cleanTarget.slice(0, 30))) {
    return true;
  }

  // Compare keyword overlap
  const targetWords = cleanTarget
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 3);
  if (targetWords.length === 0) return true;

  const matchedWords = targetWords.filter((w) => tileText.includes(w));
  return matchedWords.length >= 2 || matchedWords.length / targetWords.length >= 0.15;
}

// Helper: Find best matching prompt from list of candidate prompts
function findBestMatchingPrompt(tileElement, candidatePrompts) {
  if (!candidatePrompts || !Array.isArray(candidatePrompts) || candidatePrompts.length === 0) return null;
  const tileText = extractTilePromptText(tileElement).toLowerCase().trim();
  if (!tileText) return null;

  let bestMatch = null;
  let bestScore = -1;

  for (const item of candidatePrompts) {
    const itemPrompt = (item.prompt || '').toLowerCase().trim();
    const itemTitle = (item.title || '').toLowerCase().trim();
    if (!itemPrompt && !itemTitle) continue;

    // Direct substring or prefix match (either direction)
    const p35 = itemPrompt.slice(0, 35);
    const t35 = tileText.slice(0, 35);
    if ((p35 && tileText.includes(p35)) || (t35 && itemPrompt.includes(t35))) {
      return item;
    }
    if (itemPrompt.includes(tileText) || tileText.includes(itemPrompt)) {
      return item;
    }

    // Keyword overlap
    const itemWords = `${itemPrompt} ${itemTitle}`
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3);

    if (itemWords.length === 0) continue;

    // Filter common generic prompt stop-words
    const stopWords = new Set([
      'with', 'from', 'that', 'this', 'have', 'more', 'very', 'into',
      'photorealistic', 'hyperrealistic', 'high', 'quality', 'ultra', 'detailed', '4k', '8k'
    ]);
    const meaningfulWords = itemWords.filter((w) => !stopWords.has(w));
    const wordsToCheck = meaningfulWords.length >= 3 ? meaningfulWords : itemWords;

    const matched = wordsToCheck.filter((w) => tileText.includes(w));
    const score = matched.length / wordsToCheck.length;

    if (score > bestScore && (matched.length >= 3 || (matched.length >= 2 && score >= 0.18))) {
      bestScore = score;
      bestMatch = item;
    }
  }

  return bestMatch;
}

// Helper: Find best matching scene for an Agent Batch multi-scene tile (backward-compatible alias)
function findBestMatchingScene(tileElement, scenes) {
  return findBestMatchingPrompt(tileElement, scenes);
}

// Helper: Convert image to Data URL safely
async function imageToDataUrl(imgEl, preferredDownloadUrl) {
  // Strategy 1: in-page fetch with session cookies
  if (preferredDownloadUrl && preferredDownloadUrl.startsWith('http')) {
    try {
      const response = await fetch(preferredDownloadUrl);
      if (response.ok) {
        const blob = await response.blob();
        return await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
      }
    } catch (fetchErr) {
      console.warn('[Meta-Gen Flow Bridge] Direct fetch failed, trying element source:', fetchErr);
    }
  }

  // Strategy 2: fetch img.src directly
  if (imgEl?.src && imgEl.src.startsWith('http')) {
    try {
      const response = await fetch(imgEl.src);
      if (response.ok) {
        const blob = await response.blob();
        return await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
      }
    } catch (e) {}
  }

  // Strategy 3: Canvas rendering fallback
  try {
    const canvas = document.createElement('canvas');
    canvas.width = imgEl.naturalWidth || imgEl.width || 1024;
    canvas.height = imgEl.naturalHeight || imgEl.height || 1024;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgEl, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.95);
  } catch (canvasErr) {
    console.error('[Meta-Gen Flow Bridge] Canvas export failed:', canvasErr);
    return imgEl?.src || '';
  }
}

// Helper: Check if a button is disabled
function isButtonDisabled(btn) {
  if (!btn) return true;
  return (
    btn.disabled ||
    btn.hasAttribute('disabled') ||
    btn.getAttribute('aria-disabled') === 'true' ||
    btn.classList.contains('disabled') ||
    btn.classList.contains('mat-button-disabled')
  );
}

// Helper: Locate Flow Submit / Generate button
function findFlowSubmitButton() {
  // Strategy 1: Exact inspected selectors from flow.google.com
  const exactCandidates = [
    document.querySelector('flow-generate-icon-button button'),
    document.querySelector('.submit-controls flow-generate-icon-button button'),
    document.querySelector('button.generate-icon-button'),
    document.querySelector('.submit-controls button[type="submit"]'),
    document.querySelector('button[aria-label="Mulai pembuatan" i]'),
    document.querySelector('button[aria-label*="pembuatan" i]'),
    document.querySelector('button[aria-label*="generate" i]'),
    document.querySelector('button[aria-label*="submit" i]'),
  ];
  for (const c of exactCandidates) {
    if (c) return c;
  }

  // Strategy 2: Button inside flow-prompt-box or .submit-controls with mat-icon arrow_forward
  const promptBox = document.querySelector('flow-prompt-box, div.prompt-box-container, .submit-controls');
  if (promptBox) {
    const boxButtons = Array.from(promptBox.querySelectorAll('button'));
    const match = boxButtons.find((b) => {
      const icons = Array.from(b.querySelectorAll('mat-icon, i, span, svg'));
      return icons.some((i) =>
        ['arrow_forward', 'send', 'arrow_upward', 'auto_awesome', 'sparkles'].includes(
          (i.textContent || '').trim().toLowerCase()
        )
      );
    });
    if (match) return match;
  }

  // Strategy 3: Global search across visible buttons
  const allButtons = Array.from(document.querySelectorAll('button')).filter((b) => b.offsetParent !== null);
  return allButtons.find((b) => {
    const icons = Array.from(b.querySelectorAll('mat-icon, i, span, svg'));
    const hasIconMatch = icons.some((i) =>
      ['arrow_forward', 'send', 'arrow_upward', 'auto_awesome', 'sparkles'].includes(
        (i.textContent || '').trim().toLowerCase()
      )
    );
    if (hasIconMatch) return true;

    const btnText = (b.textContent || '').trim().toLowerCase();
    if (['arrow_forward', 'send', 'arrow_upward'].includes(btnText)) return true;

    const aria = (b.getAttribute('aria-label') || '').toLowerCase();
    return (
      aria.includes('pembuatan') ||
      aria.includes('generate') ||
      aria.includes('submit') ||
      aria.includes('send') ||
      aria.includes('kirim')
    );
  });
}

// Helper: Check if Flow is actively generating (icon is 'stop')
function isFlowGenerating() {
  const submitArea = document.querySelector('.submit-controls, flow-generate-icon-button, flow-prompt-box') || document;
  const icons = Array.from(submitArea.querySelectorAll('mat-icon, [role="img"]')).filter((el) => {
    const txt = (el.textContent || '').trim().toLowerCase();
    const type = (el.getAttribute('data-mat-icon-type') || '').toLowerCase();
    return (txt === 'stop' || type === 'stop') && el.offsetParent !== null;
  });
  return icons.length > 0;
}

// Full Pointer Click Event Sequence
function clickSubmitButton(btn) {
  try {
    btn.scrollIntoView({ block: 'center', inline: 'center' });
  } catch (e) {}

  btn.focus();

  // Full pointer & mouse simulation
  btn.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, cancelable: true }));
  btn.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true, cancelable: true }));
  btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, isPrimary: true, button: 0 }));
  btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
  btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, isPrimary: true, button: 0 }));
  btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
  btn.click();

  // If inside a form, also invoke requestSubmit
  if (btn.form) {
    try {
      btn.form.requestSubmit(btn);
    } catch (e) {}
  }
}

// Helper: Locate Google Flow "Try Again" / "Coba lagi" failure button
function findTryAgainButton(scope = document) {
  if (!scope) scope = document;

  // Strategy 1: Specific class and attribute from Google Flow inspected DOM (matching user snippet)
  const specificCandidates = Array.from(
    scope.querySelectorAll(
      'button.try-again-button, .try-again-button, button[flow-button].try-again-button, button[class*="try-again-button"], button[class*="try-again"]'
    )
  ).filter((b) => b && b.offsetParent !== null && !isButtonDisabled(b));

  if (specificCandidates.length > 0) {
    return specificCandidates[specificCandidates.length - 1]; // Pick most recent / relevant
  }

  // Strategy 2: Search buttons for multilingual text "Coba lagi" / "Try again"
  const allButtons = Array.from(scope.querySelectorAll('button, [role="button"]')).filter(
    (b) => b.offsetParent !== null && !isButtonDisabled(b)
  );

  for (const b of allButtons) {
    const labelSpan = b.querySelector('.mdc-button__label') || b;
    const txt = (labelSpan.textContent || b.textContent || '').trim().toLowerCase();
    if (
      txt === 'coba lagi' ||
      txt === 'try again' ||
      txt.includes('coba lagi') ||
      txt.includes('try again') ||
      txt.includes('réessayer') ||
      txt.includes('reintentar') ||
      txt.includes('nochmal versuchen')
    ) {
      return b;
    }
  }

  return null;
}

// Helper: Click "Coba lagi" / "Try again" button with multi-tier pointer simulation, Zone.js, and CDP
function clickTryAgainButton(btn) {
  if (!btn) return false;
  try {
    btn.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
  } catch (e) {}

  btn.focus();

  const rect = btn.getBoundingClientRect();
  const clickX = rect.width > 0 ? Math.round(rect.left + rect.width / 2) : 100;
  const clickY = rect.height > 0 ? Math.round(rect.top + rect.height / 2) : 100;

  const innerTargets = [
    btn.querySelector('.mat-mdc-button-touch-target'),
    btn.querySelector('.mdc-button__label'),
    btn.querySelector('span'),
    btn,
  ].filter(Boolean);

  const eventOpts = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX: clickX,
    clientY: clickY,
  };

  // Tier 1: Full pointer & mouse simulation on child targets and button
  for (const target of innerTargets) {
    target.dispatchEvent(new PointerEvent('pointerover', eventOpts));
    target.dispatchEvent(new PointerEvent('pointerenter', eventOpts));
    target.dispatchEvent(new PointerEvent('pointerdown', { ...eventOpts, isPrimary: true, button: 0 }));
    target.dispatchEvent(new MouseEvent('mousedown', { ...eventOpts, button: 0 }));
    target.dispatchEvent(new PointerEvent('pointerup', { ...eventOpts, isPrimary: true, button: 0 }));
    target.dispatchEvent(new MouseEvent('mouseup', { ...eventOpts, button: 0 }));
    try {
      target.click();
    } catch (e) {}
  }
  btn.click();

  // Tier 2: CDP Hardware-level mouse click via background.js if available
  try {
    if (rect.width > 0 && rect.height > 0 && typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'TRIGGER_CDP_MOUSE_CLICK',
        coords: { x: clickX, y: clickY },
      });
    }
  } catch (e) {}

  return true;
}

// Main Flow Generation Handler
async function handleFlowGeneration(payload) {
  const { cardId, prompt, ratio, ordinal, title, outputCount, mode, videoType } = payload;
  console.log('[Meta-Gen Flow Bridge] Starting generation task for card:', cardId, 'Ordinal:', ordinal, 'prompt length:', prompt?.length);
  showFlowToast('Meta-Gen: Menerima Prompt...', 'Sedang mempersiapkan input di Google Flow...', false);

  // 0. Ensure an active project canvas is open (Auto-clicks "Project baru" if on dashboard)
  await ensureActiveProject();

  // Strict Guard: DO NOT PROCEED IF NOT IN A PROJECT CANVAS!
  if (!window.location.href.includes('/project/')) {
    throw new Error('Gagal membuka project baru di Google Flow. Silakan klik tombol "Project baru" di tab Flow.');
  }

  // 0.5. Ensure Agent Mode is Active (by user rule: kalau sudah di halaman proyek aktifkan mode agent)
  await ensureAgentModeActive();

  // 0.6. Synchronize Aspect Ratio & Flow Settings (16:9, 1:1, 9:16, 4:3, 3:4, output count x1-x4, and mode)
  const targetOutput = outputCount
    ? (outputCount.toString().startsWith('x') ? outputCount : `x${outputCount}`)
    : null;
  await ensureFlowSettings(ratio || '16:9', targetOutput, mode || 'gambar', videoType || null);

  // Dismiss any blocking cookie banner & any lingering overlays
  dismissGoogleCookieBar();
  dismissAllOverlays();

  // 1. Snapshot all existing media items (Baseline) before submitting
  const baselineTokens = new Set();
  document.querySelectorAll('img, video, flow-image-tile img').forEach((el) => {
    const token = getMediaToken(el);
    if (token) baselineTokens.add(token);
  });
  console.log('[Meta-Gen Flow Bridge] Baseline media count:', baselineTokens.size);

  // 2. Locate prompt input (ProseMirror on flow.google.com, Angular flow-prompt-box, or ContentEditable)
  let editor = null;
  const findEditor = () => {
    const editorCandidates = [
      document.querySelector('div.ProseMirror[contenteditable="true"]'),
      document.querySelector('.ProseMirror[contenteditable="true"]'),
      document.querySelector('.ProseMirror'),
      document.querySelector('flow-prompt-box [contenteditable="true"]'),
      document.querySelector('div[role="textbox"][data-slate-editor="true"]'),
      document.querySelector('flow-prompt-box textarea'),
      document.querySelector('[contenteditable="true"]:not([aria-hidden="true"])'),
      document.querySelector('textarea:not([aria-hidden="true"])'),
      document.querySelector('[contenteditable="true"]'),
      document.querySelector('input[type="text"][placeholder*="prompt" i]'),
    ];
    return editorCandidates.find((el) => el && el.offsetParent !== null) || editorCandidates.find(Boolean);
  };

  editor = findEditor();
  if (!editor) {
    const pollStart = Date.now();
    while (Date.now() - pollStart < 6000 && !editor) {
      await new Promise((r) => setTimeout(r, 500));
      editor = findEditor();
    }
  }

  if (!editor) {
    throw new Error('Kotak prompt Google Flow tidak ditemukan. Pastikan Anda berada di halaman project Flow.');
  }

  console.log('[Meta-Gen Flow Bridge] Located prompt editor:', editor);

  // 3. Focus editor and clear previous contents
  dismissAllOverlays();
  editor.focus();
  try {
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch (e) {}

  try {
    editor.dispatchEvent(
      new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        composed: true,
        inputType: 'deleteContentBackward',
      })
    );
  } catch (e) {}
  document.execCommand('delete', false, null);

  // 4. Input Prompt with full Angular & Slate & ProseMirror event sequence
  const targetPrompt = prompt.trim();
  console.log('[Meta-Gen Flow Bridge] Typing prompt into editor...');

  try {
    editor.dispatchEvent(
      new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        composed: true,
        inputType: 'insertText',
        data: targetPrompt,
      })
    );
  } catch (e) {}

  const inserted = document.execCommand('insertText', false, targetPrompt);
  if (!inserted || !(editor.innerText || editor.textContent || '').trim()) {
    if ('value' in editor) {
      editor.value = targetPrompt;
    } else {
      editor.innerText = targetPrompt;
    }
  }

  // Dispatch standard input & change events with composed: true
  editor.dispatchEvent(
    new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      composed: true,
      inputType: 'insertText',
      data: targetPrompt,
    })
  );
  editor.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  editor.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

  console.log(
    '[Meta-Gen Flow Bridge] Prompt populated in isolated world. Current length:',
    (editor.innerText || editor.value || '').length
  );

  // Trigger MAIN WORLD injection via background.js (runs inside Google Flow's native Zone.js)
  try {
    console.log('[Meta-Gen Flow Bridge] Requesting Main World submission from background...');
    chrome.runtime.sendMessage({
      type: 'TRIGGER_MAIN_WORLD_SUBMIT',
      prompt: targetPrompt,
    });
  } catch (mainErr) {
    console.warn('[Meta-Gen Flow Bridge] Main world submit request failed:', mainErr);
  }

  // 5. Ensure all popovers/overlays are thoroughly dismissed so they do not capture click or Enter
  dismissAllOverlays();
  await new Promise((r) => setTimeout(r, 120));

  // Locate Submit Button and wait for Angular to enable it
  let generateBtn = findFlowSubmitButton();
  console.log('[Meta-Gen Flow Bridge] Initial submit button lookup:', generateBtn, 'Disabled:', isButtonDisabled(generateBtn));

  const enableWaitStart = Date.now();
  while (generateBtn && isButtonDisabled(generateBtn) && Date.now() - enableWaitStart < 3500) {
    await new Promise((r) => setTimeout(r, 120));
    generateBtn = findFlowSubmitButton();
  }

  console.log(
    '[Meta-Gen Flow Bridge] Submit button state after wait:',
    generateBtn ? (isButtonDisabled(generateBtn) ? 'STILL DISABLED' : 'ENABLED') : 'NOT FOUND'
  );

  // 6. Submit via Button Click + CDP Hardware-level Dispatch
  let buttonClicked = false;
  let coords = null;

  if (generateBtn) {
    try {
      const rect = generateBtn.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        coords = {
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + rect.height / 2),
        };
        console.log('[Meta-Gen Flow Bridge] Submit button coordinates calculated:', coords);
      }
    } catch (e) {}

    if (isButtonDisabled(generateBtn)) {
      console.warn('[Meta-Gen Flow Bridge] Button remained disabled. Forcing attributes removal...');
      generateBtn.removeAttribute('disabled');
      generateBtn.removeAttribute('aria-disabled');
      generateBtn.classList.remove('mat-button-disabled');
    }

    clickSubmitButton(generateBtn);
    buttonClicked = true;
    console.log('[Meta-Gen Flow Bridge] Button click event sequence fired.');
  }

  // 6.1 Trigger CDP (Chrome DevTools Protocol) hardware click & Enter (isTrusted: true)
  dismissAllOverlays();
  editor.focus();
  try {
    console.log('[Meta-Gen Flow Bridge] Requesting CDP hardware-level submit (isTrusted: true)...');
    chrome.runtime.sendMessage({
      type: 'TRIGGER_CDP_SUBMIT',
      prompt: targetPrompt,
      coords: coords,
    });
  } catch (cdpErr) {
    console.warn('[Meta-Gen Flow Bridge] CDP message dispatch error:', cdpErr);
  }

  // 7. Dual Submit: Also Dispatch ENTER key on the editor!
  // In Google Flow, pressing Enter inside contenteditable directly triggers generation
  await new Promise((r) => setTimeout(r, 200));
  editor.focus();
  const enterDown = new KeyboardEvent('keydown', {
    key: 'Enter',
    code: 'Enter',
    keyCode: 13,
    which: 13,
    charCode: 13,
    bubbles: true,
    cancelable: true,
  });
  const enterPress = new KeyboardEvent('keypress', {
    key: 'Enter',
    code: 'Enter',
    keyCode: 13,
    which: 13,
    charCode: 13,
    bubbles: true,
    cancelable: true,
  });
  const enterUp = new KeyboardEvent('keyup', {
    key: 'Enter',
    code: 'Enter',
    keyCode: 13,
    which: 13,
    charCode: 13,
    bubbles: true,
    cancelable: true,
  });

  editor.dispatchEvent(enterDown);
  editor.dispatchEvent(enterPress);
  editor.dispatchEvent(enterUp);
  console.log('[Meta-Gen Flow Bridge] Enter key sequence fired on editor.');

  showFlowToast('Meta-Gen: Prompt Dikirim!', 'Menunggu proses render gambar Google Flow...', false);

  // 8. Auto-approve any disclaimer/modal (e.g. "Approve", "Accepter", "Got it", "Setuju")
  const acceptStart = Date.now();
  while (Date.now() - acceptStart < 5000) {
    const modalBtn = Array.from(document.querySelectorAll('button')).find((b) => {
      const t = (b.textContent || '').trim();
      return /Accepter|Approve|Setuju|Approva|Got it|Mengerti/i.test(t) && b.offsetParent !== null;
    });
    if (modalBtn) {
      modalBtn.click();
      console.log('[Meta-Gen Flow Bridge] Confirmation modal auto-approved:', modalBtn.textContent);
      break;
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  // 9. Monitor Generation State & Poll DOM for newly rendered media items (Timeout 180s)
  let detectedBatchItems = [];
  const pollStart = Date.now();
  const timeoutMs = 180000;
  let pollIteration = 0;
  let hasObservedStopIcon = false;
  let hasAnnouncedRenderComplete = false;
  let postStopChecks = 0;
  let tryAgainRetries = 0;
  const MAX_TRY_AGAIN_RETRIES = 2; // Auto-retry up to 2 times automatically
  let lastTryAgainTimestamp = 0;

  while (Date.now() - pollStart < timeoutMs) {
    await new Promise((r) => setTimeout(r, 1200));
    pollIteration++;

    const currentlyGenerating = isFlowGenerating();
    if (currentlyGenerating) {
      hasObservedStopIcon = true;
    }

    const elapsedSec = Math.round((Date.now() - pollStart) / 1000);

    // Live Toast feedback based on stop icon
    if (currentlyGenerating) {
      if (pollIteration % 3 === 0) {
        showFlowToast('⏳ Sedang Merender...', `Google Flow sedang memproses (${elapsedSec}d)...`, false);
      }
    } else if (hasObservedStopIcon && !hasAnnouncedRenderComplete) {
      hasAnnouncedRenderComplete = true;
      console.log('[Meta-Gen Flow Bridge] Stop icon cleared! Generation has completed in Flow.');
      showFlowToast('⚡ Render Selesai!', 'Mendeteksi variasi gambar di canvas...', true);
    }

    // 9.1 Detect Google Flow Failure Button ("Coba lagi" / try-again-button)
    // If generation has stopped or after 4s without stop icon, check if try-again-button is present
    if (!currentlyGenerating && elapsedSec >= 4) {
      const tryAgainBtn = findTryAgainButton();
      if (tryAgainBtn && Date.now() - lastTryAgainTimestamp > 6000) {
        lastTryAgainTimestamp = Date.now();
        if (tryAgainRetries < MAX_TRY_AGAIN_RETRIES) {
          tryAgainRetries++;
          console.warn(
            `[Meta-Gen Flow Bridge] Google Flow generation failed (detected 'Coba lagi' button). Executing auto-retry #${tryAgainRetries}/${MAX_TRY_AGAIN_RETRIES}...`
          );
          showFlowToast(
            '⚠️ Flow Gagal Render',
            `Tombol 'Coba lagi' terdeteksi. Mencoba lagi otomatis (${tryAgainRetries}/${MAX_TRY_AGAIN_RETRIES})...`,
            false
          );

          clickTryAgainButton(tryAgainBtn);

          // Reset waiting flags for this fresh attempt
          hasObservedStopIcon = false;
          hasAnnouncedRenderComplete = false;
          postStopChecks = 0;
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        } else {
          console.error(
            `[Meta-Gen Flow Bridge] Google Flow generation failed consistently after ${MAX_TRY_AGAIN_RETRIES} retries with try-again-button.`
          );
          showFlowToast(
            '❌ Google Flow: Gagal Render',
            `Gagal membuat gambar setelah ${MAX_TRY_AGAIN_RETRIES}x 'Coba lagi'. Melaporkan ke Meta-Gen...`,
            false
          );
          throw new Error(
            `Google Flow gagal generate gambar: Muncul tombol 'Coba lagi' (Gagal setelah ${MAX_TRY_AGAIN_RETRIES}x percobaan ulang otomatis).`
          );
        }
      }
    }

    // When rendering stops (or after 25s elapsed without active generation), scan for newly rendered images
    const readyToScan = (!currentlyGenerating && hasObservedStopIcon) || (!currentlyGenerating && elapsedSec > 25);

    if (readyToScan) {
      postStopChecks++;

      // Give DOM 1.2s to fully settle
      await new Promise((r) => setTimeout(r, 1200));

      const candidateMedia = Array.from(
        document.querySelectorAll(
          'flow-grid-tile-container img, flow-image-tile img, flow-video-tile img, flow-asset-tile img, .tile-row img, [class*="tile"] img, img, video'
        )
      ).filter((el) => {
        if (!el.isConnected) return false;
        const src = el.src || el.currentSrc || el.getAttribute('poster') || '';
        if (!src && !el.getAttribute('data-media-id')) return false;
        if (
          src.includes('profile') ||
          src.includes('avatar') ||
          src.includes('icon') ||
          src.includes('logo') ||
          src.includes('data:image/svg')
        ) {
          return false;
        }
        const w = el.naturalWidth || el.videoWidth || el.width || 0;
        const h = el.naturalHeight || el.videoHeight || el.height || 0;
        if (w > 0 && w < 80 && h > 0 && h < 80) return false;
        return true;
      });

      const matchedBatch = [];
      const anyNewBatch = [];

      for (const el of candidateMedia) {
        const token = getMediaToken(el);
        if (token && !baselineTokens.has(token)) {
          const tileContainer =
            el.closest('flow-grid-tile-container') ||
            el.closest('flow-tile-container') ||
            el.closest('flow-image-tile') ||
            el.closest('.tile-row') ||
            el.closest('[data-tile-id]') ||
            el.parentElement;

          const matchesPrompt = isTileMatchingTargetPrompt(tileContainer, targetPrompt);
          const item = {
            img: el,
            token: token,
            tileContainer: tileContainer,
            mediaId: el.getAttribute('data-media-id') || '',
          };

          if (!anyNewBatch.some((x) => x.token === token)) {
            anyNewBatch.push(item);
          }
          if (matchesPrompt && !matchedBatch.some((x) => x.token === token)) {
            matchedBatch.push(item);
          }
        }
      }

      // Priority 1: Semantic match with target prompt
      if (matchedBatch.length > 0) {
        detectedBatchItems = matchedBatch;
        console.log(`[Meta-Gen Flow Bridge] Discovered ${detectedBatchItems.length} matching variation card(s) via prompt match!`);
        break;
      }

      // Priority 2: Fallback to ANY new media tokens rendered after stop icon (guaranteed by FIFO queue)
      if (postStopChecks >= 2 && anyNewBatch.length > 0) {
        detectedBatchItems = anyNewBatch;
        console.log(`[Meta-Gen Flow Bridge] Discovered ${detectedBatchItems.length} variation card(s) via new token fallback!`);
        break;
      }

      // Priority 3: Check if already tagged with this cardId in DOM
      if (postStopChecks >= 3) {
        const taggedTiles = Array.from(document.querySelectorAll(`[data-metagen-card-id="${cardId}"]`));
        if (taggedTiles.length > 0) {
          for (const tile of taggedTiles) {
            const img = tile.querySelector('img, video');
            if (img) {
              const token = getMediaToken(img) || `tagged_${cardId}_${Date.now()}`;
              detectedBatchItems.push({
                img: img,
                token: token,
                tileContainer: tile,
                mediaId: img.getAttribute('data-media-id') || '',
              });
            }
          }
          if (detectedBatchItems.length > 0) {
            console.log(`[Meta-Gen Flow Bridge] Recovered ${detectedBatchItems.length} card(s) already tagged for cardId:`, cardId);
            break;
          }
        }
      }

      // Priority 4: Emergency Canvas Fallback (newest untagged tile)
      if (postStopChecks >= 5) {
        console.warn('[Meta-Gen Flow Bridge] Attempting emergency fallback to newest canvas card...');
        const allContainers = Array.from(
          document.querySelectorAll('flow-grid-tile-container, flow-image-tile, .tile-row')
        );
        const untagged = allContainers.find((t) => {
          const id = t.getAttribute('data-metagen-card-id');
          return !id || id === cardId;
        });
        if (untagged) {
          const img = untagged.querySelector('img, video');
          if (img) {
            const token = getMediaToken(img) || `emergency_${Date.now()}`;
            detectedBatchItems.push({
              img: img,
              token: token,
              tileContainer: untagged,
              mediaId: img.getAttribute('data-media-id') || '',
            });
            break;
          }
        }
      }
    }
  }

  if (detectedBatchItems.length === 0) {
    throw new Error('Waktu habis (Timeout): Gambar tidak muncul di canvas Flow setelah 180 detik.');
  }

  // 10. Check if this generation is an Agent Batch (Multi-Scene) vs Standard Variations
  const isAgentBatch = !!(payload.isAgentBatch || (payload.scenes && payload.scenes.length > 1));
  const scenesList = payload.scenes || [];

  // Check if discovered tiles have distinctly different prompt texts from each other
  const tilePrompts = detectedBatchItems
    .map((item) => extractTilePromptText(item.tileContainer))
    .filter(Boolean);
  const uniqueTilePrompts = new Set(tilePrompts);
  const hasDistinctTilePrompts = uniqueTilePrompts.size > 1;

  const isMultiSceneRun = isAgentBatch || (scenesList.length > 1 && hasDistinctTilePrompts);

  const variationLetters = ['A', 'B', 'C', 'D', 'E', 'F'];
  const sceneMatchCounters = {}; // cardId -> count of items matching this scene

  // If multi-scene, track which items belong to which scene
  const itemSceneAssignments = [];
  const assignedSceneCardIds = new Set();

  if (isMultiSceneRun && scenesList.length > 0) {
    for (let idx = 0; idx < detectedBatchItems.length; idx++) {
      const item = detectedBatchItems[idx];
      let matchedScene = findBestMatchingScene(item.tileContainer, scenesList);

      // If no semantic match, fallback to remaining unassigned scene
      if (!matchedScene) {
        matchedScene = scenesList.find((s) => !assignedSceneCardIds.has(s.cardId)) || scenesList[idx % scenesList.length];
      }

      if (matchedScene) {
        assignedSceneCardIds.add(matchedScene.cardId);
        sceneMatchCounters[matchedScene.cardId] = (sceneMatchCounters[matchedScene.cardId] || 0) + 1;
      }

      itemSceneAssignments.push(matchedScene);
    }
  }

  // Tag items and populate registry
  for (let idx = 0; idx < detectedBatchItems.length; idx++) {
    const item = detectedBatchItems[idx];
    let targetCardId = cardId;
    let targetOrdinal = ordinal || 1;
    let targetTitle = title || '';
    let targetPromptText = prompt;
    let varLetter = '';

    if (isMultiSceneRun && itemSceneAssignments[idx]) {
      const scene = itemSceneAssignments[idx];
      targetCardId = scene.cardId;
      targetOrdinal = scene.ordinal || idx + 1;
      targetTitle = scene.title || '';
      targetPromptText = scene.prompt || prompt;

      // Only assign variation letter (A, B) if multiple images matched the SAME scene
      const totalMatchingThisScene = sceneMatchCounters[scene.cardId] || 1;
      if (totalMatchingThisScene > 1) {
        const currentMatchIdx = (sceneMatchCounters[`${scene.cardId}_seen`] || 0);
        sceneMatchCounters[`${scene.cardId}_seen`] = currentMatchIdx + 1;
        varLetter = variationLetters[currentMatchIdx] || String(currentMatchIdx + 1);
      } else {
        varLetter = ''; // Standalone scene, clean badge like '⚡ MetaGen #1'
      }
    } else {
      // Standard single prompt variation logic
      const isMultiple = detectedBatchItems.length > 1;
      varLetter = isMultiple ? (variationLetters[idx] || String(idx + 1)) : '';
    }

    const cardData = {
      cardId: targetCardId,
      ordinal: targetOrdinal,
      variation: varLetter,
      title: targetTitle,
      prompt: targetPromptText,
      ratio: ratio || '16:9',
      token: item.token,
      mediaId: item.mediaId,
    };

    if (item.tileContainer) {
      tagCardWithPromptData(item.tileContainer, cardData);
      console.log(`[Meta-Gen Flow Bridge] Tagged tile #${cardData.ordinal} (${varLetter || 'Single'}) with token: ${item.token}`);
    }

    savePromptToRegistry(item.token, cardData);
    baselineTokens.add(item.token);
  }

  // 11. Extract All Images Data & Group by CardId
  showFlowToast('Meta-Gen: Gambar Selesai!', `Menyimpan ${detectedBatchItems.length} gambar hasil render...`, true);

  const extractedMediaItems = [];
  for (let idx = 0; idx < detectedBatchItems.length; idx++) {
    const it = detectedBatchItems[idx];
    const itImg = it.img;
    const itMediaId = it.mediaId;
    const itRedirect = (itImg.src || '').match(/media\.getMediaUrlRedirect\?name=([a-f0-9-]+)/);
    const prefUrl = itMediaId
      ? `https://labs.google/fx/api/trpc/media.getMediaUrlRedirect?name=${itMediaId}`
      : itRedirect
      ? `https://labs.google/fx/api/trpc/media.getMediaUrlRedirect?name=${itRedirect[1]}`
      : itImg.src;

    const itBase64 = await imageToDataUrl(itImg, prefUrl);
    const assignedScene = itemSceneAssignments[idx];

    extractedMediaItems.push({
      cardId: assignedScene?.cardId || cardId,
      ordinal: assignedScene?.ordinal || ordinal || 1,
      title: assignedScene?.title || title || '',
      token: it.token,
      dataUrl: itBase64,
      mediaId: itMediaId,
    });
  }

  // Group by cardId for multi-scene support
  const resultsByCard = [];
  const cardGroupMap = new Map();

  for (const item of extractedMediaItems) {
    if (!cardGroupMap.has(item.cardId)) {
      cardGroupMap.set(item.cardId, []);
    }
    cardGroupMap.get(item.cardId).push(item);
  }

  for (const [cId, items] of cardGroupMap.entries()) {
    const first = items[0];
    const variations = items.map((it, i) => ({
      letter: items.length > 1 ? (variationLetters[i] || String(i + 1)) : 'A',
      token: it.token,
      dataUrl: it.dataUrl,
      mediaId: it.mediaId,
    }));

    resultsByCard.push({
      cardId: cId,
      ordinal: first.ordinal,
      title: first.title,
      token: first.token,
      imageDataUrl: variations[0]?.dataUrl || '',
      variations: variations,
      variationsCount: variations.length,
    });
  }

  const primaryItem = resultsByCard[0] || {};
  showFlowToast(
    '✓ Meta-Gen: Selesai!',
    isMultiSceneRun
      ? `${resultsByCard.length} adegan siap di Meta-Gen Studio.`
      : `Prompt #${ordinal || 1} (${extractedMediaItems.length} variasi) siap di Studio.`,
    true
  );

  return {
    success: true,
    isAgentBatch: isMultiSceneRun,
    results: resultsByCard,
    cardId: primaryItem.cardId || cardId,
    ordinal: primaryItem.ordinal || ordinal,
    title: primaryItem.title || title,
    token: primaryItem.token || detectedBatchItems[0]?.token,
    variationsCount: extractedMediaItems.length,
    imageDataUrl: primaryItem.imageDataUrl || extractedMediaItems[0]?.dataUrl || '',
    variations: primaryItem.variations || extractedMediaItems.map((m, i) => ({ letter: variationLetters[i] || 'A', ...m })),
    filename: `Flow_Prompt_${ordinal || '1'}_${Date.now().toString().slice(-4)}.jpg`,
  };
}

// ========================================================
// ⚡ PILAR 3: Mass Downloader 2K/4K Engine
// ========================================================
let isMassDownloading = false;
let downloadedIds = new Set();

// Load download history from local storage
if (typeof chrome !== 'undefined' && chrome.storage?.local) {
  chrome.storage.local.get(['metagen_downloaded_ids'], (res) => {
    if (res.metagen_downloaded_ids && Array.isArray(res.metagen_downloaded_ids)) {
      downloadedIds = new Set(res.metagen_downloaded_ids);
      console.log('[Meta-Gen Flow Bridge] Loaded downloaded IDs count:', downloadedIds.size);
    }
  });
}

function saveDownloadHistory() {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.set({ metagen_downloaded_ids: Array.from(downloadedIds) });
  }
}

function closeAnyOpenMenus() {
  dismissAllOverlays();
}

function getScrollContainer() {
  const cdkScroller = document.querySelector('cdk-virtual-scroll-viewport, .cdk-virtual-scroll-viewport, [cdkvirtualscrollingelement], .cdk-virtual-scrollable');
  if (cdkScroller) return cdkScroller;

  const virtuosoScroller = document.querySelector('[data-testid="virtuoso-scroller"], [data-virtuoso-scroller="true"], .virtuoso-grid-list');
  if (virtuosoScroller) return virtuosoScroller;

  const divs = Array.from(document.querySelectorAll('div, main, section'));
  let best = null;
  let maxDiff = -1;
  for (const div of divs) {
    const diff = div.scrollHeight - div.clientHeight;
    if (diff > 150 && div.clientHeight < 2500 && diff > maxDiff) {
      maxDiff = diff;
      best = div;
    }
  }
  return best || window;
}

function getScrollPos(container) {
  if (!container || container === window) {
    return window.scrollY || document.documentElement.scrollTop;
  }
  return container.scrollTop;
}

function scrollContainerDown(container, px) {
  if (!container || container === window) {
    window.scrollBy({ top: px });
  } else {
    container.scrollTop += px;
  }
}

function filterTopLevelTiles(elements) {
  const validEls = elements.filter((el) => el && el.nodeType === 1);
  return validEls.filter((el) => !validEls.some((other) => other !== el && other.contains(el)));
}

function getAllTilesInDom() {
  const ngTiles = Array.from(document.querySelectorAll('flow-grid-tile-container, flow-tile-container, flow-image-tile, [data-tile-id]'));
  if (ngTiles.length > 0) return filterTopLevelTiles(ngTiles);

  const images = Array.from(document.querySelectorAll('img[src*="flow.google.com/asb/"], img[src*="googleusercontent.com"], img[src*="googleapis.com"], img[data-media-id]'));
  const cards = images.map((img) => img.closest('flow-grid-tile-container, flow-tile-container, flow-image-tile, .tile-row') || img.parentElement).filter(Boolean);
  return filterTopLevelTiles(cards);
}

function getTileIdentifier(tile) {
  if (!tile) return null;
  const cardId = tile.getAttribute('data-metagen-card-id');
  if (cardId) return 'card_' + cardId;

  const token = tile.getAttribute('data-metagen-token');
  if (token) return 'token_' + token;

  const imgWithMediaId = tile.querySelector('img[data-media-id], [data-media-id]') || (tile.hasAttribute('data-media-id') ? tile : null);
  if (imgWithMediaId?.getAttribute('data-media-id')) {
    return 'media_' + imgWithMediaId.getAttribute('data-media-id');
  }
  if (tile.getAttribute('data-tile-id')) return tile.getAttribute('data-tile-id');
  if (tile.getAttribute('data-fad-id')) return tile.getAttribute('data-fad-id');

  const img = tile.querySelector('img') || (tile.tagName === 'IMG' ? tile : null);
  if (img?.src) {
    const clean = img.src.split('?')[0].split('=')[0];
    const segment = clean.split('/').filter(Boolean).pop();
    if (segment && segment.length >= 6) return 'img_' + segment;
  }
  return null;
}

function markTileWithId(tile, id) {
  if (tile && id && !tile.hasAttribute('data-fad-id')) {
    tile.setAttribute('data-fad-id', id);
  }
}

function findTileInDom(tileId) {
  if (!tileId) return null;
  if (tileId.startsWith('card_')) {
    const cId = tileId.replace('card_', '');
    const byCard = document.querySelector(`[data-metagen-card-id="${cId}"]`);
    if (byCard) return byCard;
  }
  if (tileId.startsWith('token_')) {
    const tId = tileId.replace('token_', '');
    const byToken = document.querySelector(`[data-metagen-token="${tId}"]`);
    if (byToken) return byToken;
  }
  if (tileId.startsWith('media_')) {
    const mediaId = tileId.replace('media_', '');
    const img = document.querySelector(`img[data-media-id="${mediaId}"], [data-media-id="${mediaId}"]`);
    if (img) {
      return img.closest('flow-grid-tile-container, flow-tile-container, flow-image-tile, .tile-row') || img.parentElement;
    }
  }
  const byFad = document.querySelector(`[data-fad-id="${tileId}"]`);
  if (byFad) return byFad;

  const byTile = document.querySelector(`[data-tile-id="${tileId}"]`);
  if (byTile) return byTile;

  const all = getAllTilesInDom();
  for (const t of all) {
    if (getTileIdentifier(t) === tileId) {
      markTileWithId(t, tileId);
      return t;
    }
  }
  return null;
}

// Smart Targeted Tile Lookup using Meta-Gen Tracking System (NO zoom, NO scrolling to bottom)
async function findTrackedTile(target) {
  if (!target) return null;

  // 1. Direct match by cardId
  if (target.cardId) {
    const el = document.querySelector(`[data-metagen-card-id="${target.cardId}"]`);
    if (el) return el;
  }

  // 2. Direct match by token
  if (target.token) {
    const el = document.querySelector(`[data-metagen-token="${target.token}"]`);
    if (el) return el;

    const imgs = Array.from(document.querySelectorAll('img, video'));
    for (const img of imgs) {
      if (getMediaToken(img) === target.token || (img.src && img.src.includes(target.token))) {
        const container =
          img.closest('flow-grid-tile-container, flow-tile-container, flow-image-tile, .tile-row, [data-tile-id]') ||
          img.parentElement;
        if (container) return container;
      }
    }
  }

  // 3. Direct match by mediaId
  if (target.mediaId) {
    const img = document.querySelector(`img[data-media-id="${target.mediaId}"], [data-media-id="${target.mediaId}"]`);
    if (img) {
      const container =
        img.closest('flow-grid-tile-container, flow-tile-container, flow-image-tile, .tile-row, [data-tile-id]') ||
        img.parentElement;
      if (container) return container;
    }
  }

  // 4. Match by ordinal
  if (target.ordinal) {
    const el = document.querySelector(`[data-metagen-ordinal="${target.ordinal}"]`);
    if (el) return el;
  }

  // 5. Target has attached tile
  if (target.tile && target.tile.isConnected) {
    return target.tile;
  }

  // 6. Generic ID lookup in findTileInDom
  if (target.id) {
    const generic = findTileInDom(target.id);
    if (generic) return generic;
  }

  // 7. Virtual Scroll Nudge: max 3 gentle 400px nudges (HANYA jika berada sedikit di luar viewport, TIDAK sampai mentok)
  const activeContainer = getScrollContainer();
  let nudgeSteps = 0;
  while (isMassDownloading && nudgeSteps < 3) {
    scrollContainerDown(activeContainer, 400);
    await new Promise((r) => setTimeout(r, 400));
    nudgeSteps++;

    if (target.cardId) {
      const el = document.querySelector(`[data-metagen-card-id="${target.cardId}"]`);
      if (el) return el;
    }
    if (target.token) {
      const el = document.querySelector(`[data-metagen-token="${target.token}"]`);
      if (el) return el;
    }
    if (target.id) {
      const found = findTileInDom(target.id);
      if (found) return found;
    }
  }

  return null;
}

// Backwards-compatible tile finder
async function findAndGetTile(tileId) {
  return findTrackedTile({ id: tileId });
}

// Helper: Extract targets directly from Meta-Gen tracking system
async function getTrackedDownloadTargets(options = {}) {
  try {
    hydrateFlowBadges();
  } catch (e) {}
  await new Promise((r) => setTimeout(r, 200));

  const storageData = await new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(['metagen_flow_registry', 'metagen_agent_scenes'], (res) => resolve(res || {}));
    } else {
      resolve({});
    }
  });

  const registry = storageData.metagen_flow_registry || {};
  const targetsMap = new Map();

  // Strategy 1: Explicit targetCards from Meta-Gen Studio UI
  if (Array.isArray(options.targetCards) && options.targetCards.length > 0) {
    for (const tc of options.targetCards) {
      const cardId = tc.cardId || tc.id;
      if (!cardId) continue;

      let regToken = tc.token || null;
      let regMediaId = tc.mediaId || null;
      for (const [tKey, regItem] of Object.entries(registry)) {
        if (regItem && regItem.cardId === cardId) {
          regToken = regToken || tKey;
          regMediaId = regMediaId || regItem.mediaId;
        }
      }

      targetsMap.set(cardId, {
        id: 'card_' + cardId,
        cardId: cardId,
        ordinal: tc.ordinal,
        title: tc.title || '',
        token: regToken,
        mediaId: regMediaId,
      });
    }
  }

  // Strategy 2: If no explicit targetCards, check elements already tagged in DOM
  if (targetsMap.size === 0) {
    const badgedElements = Array.from(document.querySelectorAll('[data-metagen-card-id], .metagen-flow-badge'));
    for (const el of badgedElements) {
      const container = el.hasAttribute('data-metagen-card-id')
        ? el
        : el.closest('[data-metagen-card-id]') || el.parentElement;
      if (!container) continue;

      const cardId = container.getAttribute('data-metagen-card-id');
      const token = container.getAttribute('data-metagen-token') || getMediaToken(container.querySelector('img, video'));
      const ordinal = container.getAttribute('data-metagen-ordinal');
      const id = cardId ? 'card_' + cardId : (token ? 'token_' + token : getTileIdentifier(container));

      if (id && !targetsMap.has(id)) {
        targetsMap.set(id, {
          id,
          cardId,
          ordinal: ordinal ? parseInt(ordinal, 10) : undefined,
          token,
          tile: container,
        });
      }
    }
  }

  // Strategy 3: Also include items from metagen_flow_registry if targetsMap is still empty
  if (targetsMap.size === 0 && Object.keys(registry).length > 0) {
    for (const [tok, item] of Object.entries(registry)) {
      if (!item) continue;
      const id = item.cardId ? 'card_' + item.cardId : 'token_' + tok;
      if (!targetsMap.has(id)) {
        targetsMap.set(id, {
          id,
          cardId: item.cardId,
          ordinal: item.ordinal,
          title: item.title,
          token: tok,
          mediaId: item.mediaId,
        });
      }
    }
  }

  // Strategy 4: Fallback to visible tiles in DOM without any scrolling
  if (targetsMap.size === 0) {
    const visibleTiles = getAllTilesInDom();
    for (const t of visibleTiles) {
      const id = getTileIdentifier(t);
      if (id && !targetsMap.has(id)) {
        targetsMap.set(id, {
          id,
          tile: t,
        });
      }
    }
  }

  const list = Array.from(targetsMap.values());
  list.sort((a, b) => {
    if (a.ordinal && b.ordinal) return a.ordinal - b.ordinal;
    return 0;
  });

  return list;
}

function findMoreButton(tile) {
  // 1. Angular Material menu trigger
  const ngMoreBtn = tile.querySelector('button[aria-label="More options"], button.mat-mdc-menu-trigger, button[flowhotbarbutton][aria-haspopup="menu"]');
  if (ngMoreBtn) return ngMoreBtn;

  // 2. Button with mat-icon "more_vert"
  const icons = Array.from(tile.querySelectorAll('mat-icon, svg, [data-mat-icon-type]'));
  for (const ic of icons) {
    if ((ic.textContent || '').trim() === 'more_vert' || (ic.getAttribute('aria-label') || '').includes('more')) {
      const parent = ic.closest('button, [role="button"]');
      if (parent) return parent;
    }
  }

  // 3. aria-haspopup="menu"
  const menuBtn = tile.querySelector('button[aria-haspopup="menu"], [role="button"][aria-haspopup="menu"]');
  if (menuBtn) return menuBtn;

  // 4. aria-label with download/options
  const ariaBtn = tile.querySelector('button[aria-label*="more" i], button[aria-label*="menu" i], button[aria-label*="option" i], button[aria-label*="unduh" i], button[aria-label*="download" i]');
  if (ariaBtn) return ariaBtn;

  return tile.querySelector('button, [role="button"]');
}

function findDownloadSubmenuTrigger() {
  // 1. Prioritas utama: Cari tombol 'Download' / 'Unduh' spesifik di dalam panel menu yang sedang terbuka
  const openPanels = Array.from(
    document.querySelectorAll('.mat-mdc-menu-panel, .flow-menu-panel, .cdk-overlay-pane [role="menu"]')
  );
  for (const panel of openPanels) {
    const items = Array.from(
      panel.querySelectorAll('button.mat-mdc-menu-item, [mat-menu-item], flow-menu-item button, [role="menuitem"], button')
    );
    for (const btn of items) {
      const txt = (btn.textContent || '').trim().toLowerCase();
      const icon = (btn.querySelector('mat-icon, svg')?.textContent || '').toLowerCase();
      const hasDownload = txt.includes('download') || txt.includes('unduh') || icon.includes('download') || icon.includes('file_download');
      const isDelete = txt.includes('hapus') || txt.includes('delete') || txt.includes('remove');
      if (hasDownload && !isDelete) {
        return btn;
      }
    }
  }

  // 2. Fallback: Cari di semua item CDK overlay aktif
  const allMenuItems = Array.from(
    document.querySelectorAll('.cdk-overlay-pane button, .cdk-overlay-pane [role="menuitem"], .cdk-overlay-pane flow-menu-item button')
  );
  for (const el of allMenuItems) {
    const txt = (el.textContent || '').trim().toLowerCase();
    const isDelete = txt.includes('hapus') || txt.includes('delete') || txt.includes('remove');
    if ((txt.includes('download') || txt.includes('unduh')) && !isDelete) {
      return el.closest('button, [role="menuitem"]') || el;
    }
  }
  return null;
}

function findResolutionMenuItem(resOptions) {
  // Temukan semua panel menu aktif di dalam overlay Angular CDK
  const openPanels = Array.from(
    document.querySelectorAll('.cdk-overlay-pane .mat-mdc-menu-panel, .flow-menu-panel, [role="menu"]')
  );
  if (openPanels.length === 0) return null;

  // Prioritaskan panel menu paling baru / paling dalam (submenu resolusi)
  const panelsToCheck = [...openPanels].reverse();

  for (const res of resOptions) {
    const cleanRes = (res || '').trim().toLowerCase();
    if (!cleanRes) continue;

    for (const panel of panelsToCheck) {
      // Ambil seluruh button menu di dalam panel
      const buttons = Array.from(
        panel.querySelectorAll('button.mat-mdc-menu-item, [mat-menu-item], flow-menu-item button, button[role="menuitem"]')
      );

      for (const btn of buttons) {
        const labelEl = btn.querySelector('.label');
        const labelText = (labelEl?.textContent || '').trim().toLowerCase();
        const itemTextEl = btn.querySelector('.item-text');
        const itemText = (itemTextEl?.textContent || '').trim().toLowerCase();
        const fullText = (btn.textContent || '').trim().toLowerCase();

        let isMatch = false;
        if (cleanRes === '2k') {
          if (labelText === '2k' || itemText.startsWith('2k') || fullText.includes('2k')) isMatch = true;
        } else if (cleanRes === '4k') {
          if (labelText === '4k' || itemText.startsWith('4k') || fullText.includes('4k')) isMatch = true;
        } else if (cleanRes === '1k' || cleanRes === 'original' || cleanRes === 'asli') {
          if (labelText === '1k' || itemText.startsWith('1k') || fullText.includes('1k') || fullText.includes('original') || fullText.includes('asli')) isMatch = true;
        } else if (cleanRes === '1080p') {
          if (labelText === '1080p' || fullText.includes('1080p')) isMatch = true;
        } else if (cleanRes === '720p') {
          if (labelText === '720p' || fullText.includes('720p')) isMatch = true;
        } else if (labelText === cleanRes || fullText.includes(cleanRes)) {
          isMatch = true;
        }

        if (isMatch) {
          const isDisabled =
            btn.disabled ||
            btn.classList.contains('mat-mdc-menu-item-disabled') ||
            btn.getAttribute('aria-disabled') === 'true' ||
            btn.hasAttribute('disabled');

          if (!isDisabled) {
            console.log('[Meta-Gen Flow Bridge] Target tombol resolusi ditemukan & aktif:', cleanRes, btn);
            return btn;
          } else {
            console.warn('[Meta-Gen Flow Bridge] Tombol resolusi ditemukan tapi dinonaktifkan/perlu upgrade:', cleanRes, btn);
          }
        }
      }
    }
  }

  // Fallback cerdas: Pilih tombol resolusi apa saja yang aktif jika opsi yang diminta terkunci (misal 4K terkunci -> pilih 2K / 1K)
  for (const panel of panelsToCheck) {
    const buttons = Array.from(
      panel.querySelectorAll('button.mat-mdc-menu-item, [mat-menu-item], flow-menu-item button, button[role="menuitem"]')
    );
    for (const btn of buttons) {
      const isDisabled =
        btn.disabled ||
        btn.classList.contains('mat-mdc-menu-item-disabled') ||
        btn.getAttribute('aria-disabled') === 'true' ||
        btn.hasAttribute('disabled');
      if (isDisabled) continue;

      const fullText = (btn.textContent || '').trim().toLowerCase();
      const labelText = (btn.querySelector('.label')?.textContent || '').trim().toLowerCase();
      if (labelText === '2k' || fullText.includes('2k')) return btn;
      if (labelText === '1k' || fullText.includes('1k') || fullText.includes('asli') || fullText.includes('original')) return btn;
    }
  }
  return null;
}

// Alias kompatibilitas mundur
function getAvailableResolutionItem(resOptions) {
  return findResolutionMenuItem(resOptions);
}

async function clickResolutionOption(targetBtn) {
  console.log('[Meta-Gen Flow Bridge] Memulai eksekusi klik presisi pada tombol resolusi:', targetBtn);

  targetBtn.focus();
  targetBtn.scrollIntoView({ block: 'nearest' });

  // 1. Simulasi interaksi pointer & mouse lengkap (Angular Ivy & Zone.js compliant)
  targetBtn.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, cancelable: true }));
  targetBtn.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true, cancelable: true }));
  targetBtn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
  targetBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true }));

  await new Promise((r) => setTimeout(r, 60));

  // 2. Event tekan ke bawah (Pointerdown & Mousedown)
  targetBtn.dispatchEvent(
    new PointerEvent('pointerdown', { bubbles: true, cancelable: true, isPrimary: true, button: 0 })
  );
  targetBtn.dispatchEvent(
    new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, view: window })
  );

  await new Promise((r) => setTimeout(r, 60));

  // 3. Event lepaskan (Pointerup & Mouseup)
  targetBtn.dispatchEvent(
    new PointerEvent('pointerup', { bubbles: true, cancelable: true, isPrimary: true, button: 0 })
  );
  targetBtn.dispatchEvent(
    new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0, view: window })
  );

  // 4. Klik native DOM
  targetBtn.click();

  // 5. Trigger juga elemen teks terdalam (.label / .item-text) jika listener Angular berada di child span
  const innerClickable = targetBtn.querySelector('.label, .item-text, .left-content');
  if (innerClickable && innerClickable !== targetBtn) {
    try {
      innerClickable.click();
    } catch (e) {}
  }

  console.log('[Meta-Gen Flow Bridge] Selesai memicu klik tombol resolusi.');
}

async function processTileDownload(tile, resolutionText, tileId) {
  closeAnyOpenMenus();
  await new Promise((r) => setTimeout(r, 250));

  // Hover tile untuk memunculkan tombol hotbar 3-titik
  const rect = tile.getBoundingClientRect();
  const clientX = rect.left + rect.width / 2;
  const clientY = rect.top + rect.height / 2;
  tile.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, clientX, clientY }));
  tile.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX, clientY }));
  tile.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX, clientY }));
  await new Promise((r) => setTimeout(r, 400));

  const trigger = findMoreButton(tile);
  let menuOpened = false;

  // Coba klik tombol 3-titik bertahap naik ke atas hierarki DOM
  let cur = trigger || tile;
  let lim = 0;
  while (cur && cur !== tile && lim < 5) {
    cur.click();
    await new Promise((r) => setTimeout(r, 400));
    const m = document.querySelector('.mat-mdc-menu-panel, .mat-menu-panel, mat-menu, [role="menu"], [data-radix-menu-content], [data-state="open"]');
    if (m) {
      menuOpened = true;
      break;
    }
    cur = cur.parentElement;
    lim++;
  }

  // Jika klik kiri gagal, coba klik kanan (contextmenu)
  if (!menuOpened) {
    let rTarget = trigger || tile;
    lim = 0;
    while (rTarget && lim < 5) {
      const elRect = rTarget.getBoundingClientRect();
      rTarget.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: elRect.left + elRect.width / 2,
          clientY: elRect.top + elRect.height / 2,
          button: 2,
        })
      );
      await new Promise((r) => setTimeout(r, 400));
      const m = document.querySelector('.mat-mdc-menu-panel, .mat-menu-panel, mat-menu, [role="menu"], [data-radix-menu-content], [data-state="open"]');
      if (m) {
        menuOpened = true;
        break;
      }
      if (rTarget === tile) break;
      rTarget = rTarget.parentElement;
      lim++;
    }
  }

  const menu = document.querySelector('.mat-mdc-menu-panel, .mat-menu-panel, mat-menu, [role="menu"], [data-radix-menu-content], [data-state="open"]');
  if (!menuOpened || !menu) {
    console.warn(`[Meta-Gen Flow Bridge] Gagal membuka menu opsi download untuk tile: ${tileId}`);
    closeAnyOpenMenus();
    return { success: false, reason: 'menu_failed' };
  }

  const resOptions = (resolutionText || '2K, 1080p').split(',').map((s) => s.trim());

  // 1. Cek apakah opsi resolusi sudah langsung tersedia di menu utama
  let targetItem = findResolutionMenuItem(resOptions);

  // 2. Jika belum muncul, cari tombol trigger 'Download' / 'Unduh' untuk membuka submenu
  if (!targetItem) {
    console.log('[Meta-Gen Flow Bridge] Mencari tombol trigger submenu "Download" / "Unduh"...');
    const downloadTrigger = findDownloadSubmenuTrigger();

    if (downloadTrigger) {
      console.log('[Meta-Gen Flow Bridge] Menemukan trigger submenu Download:', downloadTrigger);
      downloadTrigger.focus();
      downloadTrigger.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, cancelable: true }));
      downloadTrigger.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true, cancelable: true }));
      downloadTrigger.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      downloadTrigger.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      downloadTrigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
      downloadTrigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
      downloadTrigger.click();
      downloadTrigger.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0 }));
      downloadTrigger.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));

      // Polling submenu selama hingga 3500ms agar item resolusi ter-render sempurna
      const pollStart = Date.now();
      while (Date.now() - pollStart < 3500) {
        await new Promise((r) => setTimeout(r, 120));
        targetItem = findResolutionMenuItem(resOptions);
        if (targetItem) break;
      }
    } else {
      console.warn('[Meta-Gen Flow Bridge] Trigger submenu Download tidak ditemukan pada menu pertama.');
    }
  }

  if (!targetItem) {
    console.warn(`[Meta-Gen Flow Bridge] Melewati media. Opsi resolusi tidak ditemukan atau terkunci: ${resolutionText}`);
    showFlowToast('Mass Downloader', `Opsi ${resolutionText} tidak ditemukan/terkunci pada media ini`, false);
    closeAnyOpenMenus();
    return { success: false, reason: 'resolution_not_found' };
  }

  const isVideoOrUpscale =
    tile.querySelector('video') !== null ||
    /(1080p|720p|4k|2k|video|mp4|upscaled)/i.test(targetItem.textContent) ||
    /(1080p|720p|4k|2k)/i.test(resolutionText);
  const maxWaitMs = isVideoOrUpscale ? 30000 : 12000;

  console.log(`[Meta-Gen Flow Bridge] Mengklik opsi resolusi: ${targetItem.textContent.trim()} untuk tile ${tileId}`);

  // Promise listener untuk verifikasi handshake download Chrome
  const downloadPromise = new Promise((resolve) => {
    let done = false;
    const onDownload = () => {
      if (!done) {
        done = true;
        cleanup();
        resolve(true);
      }
    };
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        cleanup();
        resolve(false);
      }
    }, maxWaitMs);

    function cleanup() {
      document.removeEventListener('FlowDownloadStarted', onDownload);
      clearTimeout(timer);
    }
    document.addEventListener('FlowDownloadStarted', onDownload);
  });

  // Eksekusi klik pada opsi resolusi terpilih
  await clickResolutionOption(targetItem);

  // Tunggu kepastian verifikasi sinyal unduhan dari Chrome (JANGAN tutup menu secara prematur dengan Escape!)
  const isVerified = await downloadPromise;

  // Tutup menu sisa jika masih ada setelah proses unduh terverifikasi atau timeout
  await new Promise((r) => setTimeout(r, 400));
  closeAnyOpenMenus();

  if (isVerified) {
    downloadedIds.add(tileId);
    saveDownloadHistory();
    console.log(`[Meta-Gen Flow Bridge] Unduhan ${tileId} terverifikasi Chrome & masuk riwayat.`);
    return { success: true };
  } else {
    console.warn(`[Meta-Gen Flow Bridge] Unduhan ${tileId} tidak terdeteksi oleh Chrome setelah ${maxWaitMs / 1000}s.`);
    return { success: false, reason: 'timeout' };
  }
}

// Master Function: Mass Download 2K/4K Engine using Meta-Gen Tracking
async function executeFlowMassDownload({
  resolution = '2K',
  batchDelaySeconds = 2,
  skipDownloaded = true,
  folderName = 'MetaGen_Flow',
  targetCards = null,
} = {}) {
  if (isMassDownloading) {
    console.warn('[Meta-Gen Flow Bridge] Mass download sudah sedang berjalan.');
    return { success: false, error: 'Mass download sudah berjalan.' };
  }

  isMassDownloading = true;
  console.log('[Meta-Gen Flow Bridge] Memulai proses Mass Downloader menggunakan sistem tracking internal Meta-Gen...');

  // Set download subfolder in background
  try {
    chrome.runtime.sendMessage({ type: 'SET_FLOW_DOWNLOAD_FOLDER', folder: folderName });
  } catch (e) {}

  showFlowToast('Mass Downloader 2K', 'Menyiapkan target dari sistem tracking Meta-Gen...', false);

  // Ambil daftar target langsung dari tracking Meta-Gen (tanpa zoom 50% dan tanpa skroll mentok)
  const masterList = await getTrackedDownloadTargets({ targetCards });
  console.log('[Meta-Gen Flow Bridge] Antrean target terdeteksi dari tracking:', masterList.length, masterList);

  if (masterList.length === 0) {
    isMassDownloading = false;
    showFlowToast('Mass Downloader', 'Tidak ada media Meta-Gen yang terdeteksi untuk diunduh.', false);
    return { success: false, count: 0 };
  }

  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;

  for (let i = 0; i < masterList.length; i++) {
    if (!isMassDownloading) break;

    const target = masterList[i];
    const primaryId = target.id || (target.cardId ? 'card_' + target.cardId : 'tile_' + i);

    // Cek apakah item sudah pernah diunduh
    const isAlreadyDownloaded =
      downloadedIds.has(primaryId) ||
      (target.cardId && downloadedIds.has('card_' + target.cardId)) ||
      (target.token && downloadedIds.has('token_' + target.token)) ||
      (target.mediaId && downloadedIds.has('media_' + target.mediaId));

    if (skipDownloaded && isAlreadyDownloaded) {
      skipCount++;
      console.log(`[Meta-Gen Flow Bridge] Melewati ${primaryId} (sudah diunduh sebelumnya).`);
      continue;
    }

    const labelText = target.ordinal ? `Adegan #${target.ordinal}` : `Item (${i + 1}/${masterList.length})`;
    showFlowToast('Mass Downloader 2K', `Mendownload ${labelText} | Berhasil: ${successCount}...`, false);

    const tile = await findTrackedTile(target);
    if (!tile) {
      console.warn(`[Meta-Gen Flow Bridge] Target tile tidak ditemukan di canvas:`, target);
      failCount++;
      continue;
    }

    try {
      tile.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));

    const tileId = getTileIdentifier(tile) || primaryId;
    const res = await processTileDownload(tile, resolution, tileId);

    if (res.success) {
      successCount++;
      downloadedIds.add(primaryId);
      if (target.cardId) downloadedIds.add('card_' + target.cardId);
      if (target.token) downloadedIds.add('token_' + target.token);
      if (target.mediaId) downloadedIds.add('media_' + target.mediaId);
      saveDownloadHistory();
    } else {
      failCount++;
    }

    // Broadcast progress to Meta-Gen Studio
    try {
      chrome.runtime.sendMessage({
        type: 'FLOW_MASS_DOWNLOAD_PROGRESS',
        payload: {
          current: i + 1,
          total: masterList.length,
          saved: successCount,
          skipped: skipCount,
          failed: failCount,
        },
      });
    } catch (e) {}

    // Delay between downloads
    if (isMassDownloading && i < masterList.length - 1) {
      await new Promise((r) => setTimeout(r, (batchDelaySeconds || 2) * 1000));
    }
  }

  isMassDownloading = false;
  showFlowToast('Mass Downloader 2K', `Unduhan Selesai! Berhasil: ${successCount}, Dilewati: ${skipCount}, Gagal: ${failCount}`, true);

  return {
    success: true,
    total: masterList.length,
    saved: successCount,
    skipped: skipCount,
    failed: failCount,
  };
}

// Listen for messages from background.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'FLOW_DOWNLOAD_STARTED') {
    document.dispatchEvent(new CustomEvent('FlowDownloadStarted', { detail: message.item }));
    return true;
  }

  if (message.action === 'FLOW_ENSURE_GRID_MODE') {
    ensureGridViewMode().then((ok) => {
      sendResponse({ success: ok });
    });
    return true;
  }

  if (message.action === 'FLOW_EXECUTE_MASS_DOWNLOAD') {
    executeFlowMassDownload(message.options || message.payload || {})
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // asynchronous response
  }

  if (message.action === 'FLOW_STOP_MASS_DOWNLOAD') {
    isMassDownloading = false;
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'FLOW_PING') {
    sendResponse({
      active: true,
      url: window.location.href,
      hasProject: window.location.href.includes('/project/'),
      hasNewProjectButton: !!findNewProjectButton(),
      isAgentModeActive: isAgentModeActive(),
    });
    return true;
  }

  if (message.action === 'FLOW_ENSURE_PROJECT') {
    ensureActiveProject().then((ok) => {
      sendResponse({ success: ok, url: window.location.href });
    });
    return true;
  }

  if (message.action === 'FLOW_ENSURE_AGENT_MODE') {
    ensureAgentModeActive().then((ok) => {
      sendResponse({ success: ok, isAgentModeActive: isAgentModeActive() });
    });
    return true;
  }

  if (message.action === 'FLOW_START_GENERATION') {
    handleFlowGeneration(message.payload)
      .then((res) => {
        sendResponse(res);
        try {
          chrome.runtime.sendMessage({ type: 'FLOW_GENERATION_DONE', result: res });
        } catch (e) {}
      })
      .catch((err) => {
        console.error('[Meta-Gen Flow Bridge] Generation failed:', err);
        showFlowToast('❌ Meta-Gen: Gagal', err.message, false);
        const errResult = { success: false, error: err.message, cardId: message.payload?.cardId };
        sendResponse(errResult);
        try {
          chrome.runtime.sendMessage({ type: 'FLOW_GENERATION_DONE', result: errResult });
        } catch (e) {}
      });
    return true; // asynchronous response
  }

  if (message.action === 'TRIGGER_SCAN_NOW') {
    scanAndAutoSyncFlowCanvas();
    sendResponse({ active: true });
    return true;
  }
});

// Start Continuous Autonomous Auto-Scanner & Live Badge Observer
scanAndAutoSyncFlowCanvas();
setInterval(scanAndAutoSyncFlowCanvas, 2000);

let flowMutationDebounceTimer = null;
const flowCanvasObserver = new MutationObserver((mutations) => {
  let hasAddedNode = false;
  for (const m of mutations) {
    if (m.addedNodes.length > 0) {
      hasAddedNode = true;
      break;
    }
  }
  if (hasAddedNode) {
    clearTimeout(flowMutationDebounceTimer);
    flowMutationDebounceTimer = setTimeout(() => {
      scanAndAutoSyncFlowCanvas();
    }, 600);
  }
});

if (document.body) {
  flowCanvasObserver.observe(document.body, { childList: true, subtree: true });
} else {
  document.addEventListener('DOMContentLoaded', () => {
    flowCanvasObserver.observe(document.body, { childList: true, subtree: true });
  });
}


