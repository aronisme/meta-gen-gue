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

// Helper: Hydrate existing badges from registry for recycled virtual scroll tiles
function hydrateFlowBadges() {
  if (!chrome?.storage?.local) return;
  try {
    chrome.storage.local.get(['metagen_flow_registry', 'metagen_agent_scenes'], (res) => {
      const reg = res.metagen_flow_registry || {};
      const agentScenes = res.metagen_agent_scenes || [];

      document.querySelectorAll('img, video, flow-image-tile img').forEach(async (el) => {
        const token = getMediaToken(el);
        if (!token) return;

        const tileContainer =
          el.closest('flow-grid-tile-container') ||
          el.closest('flow-tile-container') ||
          el.closest('flow-image-tile') ||
          el.closest('.tile-row') ||
          el.closest('[data-tile-id]') ||
          el.parentElement;
        if (!tileContainer) return;

        // 1. Direct restore from registry
        if (reg[token]) {
          if (!tileContainer.querySelector('.metagen-flow-badge')) {
            tagCardWithPromptData(tileContainer, reg[token]);
          }
          return;
        }

        // 2. Discover unbadged tile matching active agent scenes (e.g. if user pasted to Agent manually)
        if (!tileContainer.querySelector('.metagen-flow-badge') && agentScenes.length > 0) {
          const matchedScene = findBestMatchingScene(tileContainer, agentScenes);
          if (matchedScene) {
            const cardData = {
              cardId: matchedScene.cardId,
              ordinal: matchedScene.ordinal,
              variation: '',
              title: matchedScene.title || '',
              prompt: matchedScene.prompt || '',
              token: token,
              mediaId: el.getAttribute('data-media-id') || '',
            };
            tagCardWithPromptData(tileContainer, cardData);
            savePromptToRegistry(token, cardData);

            // Notify Meta-Gen Studio tab about discovered card image
            try {
              const dataUrl = await imageToDataUrl(el);
              chrome.runtime.sendMessage({
                type: 'FLOW_CARD_DISCOVERED',
                result: {
                  cardId: matchedScene.cardId,
                  ordinal: matchedScene.ordinal,
                  token: token,
                  imageDataUrl: dataUrl,
                },
              });
            } catch (e) {}
          }
        }
      });
    });
  } catch (e) {}
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

// Helper: Ensure Google Flow has an active project open (auto-clicks "Project baru" if on dashboard)
async function ensureActiveProject() {
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

// Helper: Inspect current setting trigger button summary
function getCurrentFlowSettings() {
  const triggerBtn = document.querySelector(
    'button.settings-trigger-button, button[aria-label="Pemicu setelan" i], button[aria-label*="setelan" i]'
  );
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
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
  const backdrop = document.querySelector('.cdk-overlay-backdrop');
  if (backdrop) backdrop.click();

  await new Promise((r) => setTimeout(r, 250));

  // If overlay is still present in DOM, toggle trigger button again to dismiss
  if (document.querySelector('flow-prompt-box-settings, .settings-content-overlay')) {
    try {
      triggerBtn.click();
    } catch (e) {}
  }

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
        await new Promise((r) => setTimeout(r, 400));
      }

      // 6. Tutup popover setelan dengan tombol Escape
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
      document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0 }));
      await new Promise((r) => setTimeout(r, 250));
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
  const row = tileElement.closest('.tile-row') || tileElement.closest('flow-batch-row') || tileElement.parentElement;
  if (row) {
    const batchPromptEl = row.querySelector(
      '.prompt-text .text-part, flow-expandable-prompt .text-part, .prompt-text, flow-expandable-prompt'
    );
    if (batchPromptEl && batchPromptEl.textContent.trim().length > 5) {
      return batchPromptEl.textContent.trim();
    }
  }

  // 2. Direct inside tileElement
  const directPrompt = tileElement.querySelector(
    '.prompt-text .text-part, flow-expandable-prompt .text-part, .prompt-text'
  );
  if (directPrompt && directPrompt.textContent.trim().length > 5) {
    return directPrompt.textContent.trim();
  }

  // 3. Grid Mode footer title
  const footerTitle = tileElement.querySelector('.footer-title');
  if (footerTitle && footerTitle.textContent.trim().length > 5) {
    return footerTitle.textContent.trim();
  }

  // 4. Grid Mode container aria-label (EXCLUDE hardcoded placeholder "Alpaca wearing" or generic labels)
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

  const tileText = extractTilePromptText(tileElement).toLowerCase();
  if (!tileText) return true; // fallback if prompt text element is not yet populated

  const cleanTarget = targetPrompt.toLowerCase();

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

// Helper: Find best matching scene for an Agent Batch multi-scene tile
function findBestMatchingScene(tileElement, scenes) {
  if (!scenes || !Array.isArray(scenes) || scenes.length === 0) return null;
  const tileText = extractTilePromptText(tileElement).toLowerCase();
  if (!tileText) return null;

  let bestScene = null;
  let bestScore = -1;

  for (const scene of scenes) {
    const scenePrompt = (scene.prompt || '').toLowerCase();
    const sceneTitle = (scene.title || '').toLowerCase();

    // Direct substring or inclusion
    if (scenePrompt && (tileText.includes(scenePrompt.slice(0, 35)) || scenePrompt.includes(tileText.slice(0, 35)))) {
      return scene;
    }

    // Keyword overlap
    const sceneWords = `${scenePrompt} ${sceneTitle}`
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3);

    if (sceneWords.length === 0) continue;

    const matched = sceneWords.filter((w) => tileText.includes(w));
    const score = matched.length / sceneWords.length;

    if (score > bestScore && (matched.length >= 2 || score >= 0.15)) {
      bestScore = score;
      bestScene = scene;
    }
  }

  return bestScene;
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

  // Dismiss any blocking cookie banner & Ensure Batch View Mode
  dismissGoogleCookieBar();
  await ensureBatchViewMode();

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

  // 5. Locate Submit Button and wait for Angular to enable it
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
let massDownloaderOriginalZoom = '';

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
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true }));
  document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0 }));
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
  const imgWithMediaId = tile.querySelector('img[data-media-id], [data-media-id]') || (tile.hasAttribute('data-media-id') ? tile : null);
  if (imgWithMediaId?.getAttribute('data-media-id')) {
    return 'media_' + imgWithMediaId.getAttribute('data-media-id');
  }
  if (tile.getAttribute('data-tile-id')) return tile.getAttribute('data-tile-id');
  if (tile.getAttribute('data-fad-id')) return tile.getAttribute('data-fad-id');
  if (tile.getAttribute('data-metagen-token')) return tile.getAttribute('data-metagen-token');

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

async function findAndGetTile(tileId) {
  let tile = findTileInDom(tileId);
  if (tile) return tile;

  const activeContainer = getScrollContainer();
  let lastTop = -1;
  let noChange = 0;

  while (isMassDownloading) {
    scrollContainerDown(activeContainer, 350);
    await new Promise((r) => setTimeout(r, 500));

    tile = findTileInDom(tileId);
    if (tile) return tile;

    const currentTop = getScrollPos(activeContainer);
    if (currentTop === lastTop) {
      noChange++;
      if (noChange >= 6) {
        if (activeContainer === window) window.scrollTo({ top: 0 });
        else activeContainer.scrollTop = 0;
        await new Promise((r) => setTimeout(r, 1000));
        break;
      }
    } else {
      noChange = 0;
    }
    lastTop = currentTop;
  }
  return findTileInDom(tileId);
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

function getAvailableResolutionItem(resOptions) {
  const allItems = Array.from(
    document.querySelectorAll(
      '.mat-mdc-menu-item, [mat-menu-item], flow-menu-item button, [role="menuitem"], .mat-menu-item, [data-radix-collection-item], button'
    )
  );

  for (const res of resOptions) {
    const cleanRes = res.trim().toLowerCase();
    if (!cleanRes) continue;

    for (const el of allItems) {
      const txt = el.textContent.trim().toLowerCase();
      const labelEl = el.querySelector('.label, .item-text, span, .mat-mdc-menu-item-text');
      const labelTxt = labelEl ? labelEl.textContent.trim().toLowerCase() : '';

      let isMatch = false;
      if (cleanRes === '2k' && (txt.includes('2k') || labelTxt.includes('2k'))) isMatch = true;
      else if (cleanRes === '4k' && (txt.includes('4k') || labelTxt.includes('4k'))) isMatch = true;
      else if (cleanRes === '1k' && (txt.includes('1k') || labelTxt.includes('1k') || txt.includes('original') || txt.includes('asli'))) isMatch = true;
      else if (cleanRes === '1080p' && txt.includes('1080p')) isMatch = true;
      else if (cleanRes === '720p' && txt.includes('720p')) isMatch = true;
      else if (txt.includes(cleanRes) || labelTxt.includes(cleanRes)) isMatch = true;

      if (isMatch) {
        const isDisabled =
          el.disabled ||
          el.classList.contains('mat-mdc-menu-item-disabled') ||
          el.getAttribute('aria-disabled') === 'true' ||
          el.hasAttribute('disabled');
        if (!isDisabled) {
          console.log('[Meta-Gen Flow Bridge] Match resolution item found:', txt, el);
          return el;
        }
      }
    }
  }

  // Fallback ke resolusi apa saja yang aktif
  for (const el of allItems) {
    const txt = el.textContent.trim().toLowerCase();
    const isDisabled =
      el.disabled ||
      el.classList.contains('mat-mdc-menu-item-disabled') ||
      el.getAttribute('aria-disabled') === 'true';
    if (
      !isDisabled &&
      (txt.includes('2k') || txt.includes('4k') || txt.includes('1k') || txt.includes('original') || txt.includes('asli') || txt.includes('upscaled'))
    ) {
      console.log('[Meta-Gen Flow Bridge] Fallback resolution item found:', txt, el);
      return el;
    }
  }
  return null;
}

async function processTileDownload(tile, resolutionText, tileId) {
  closeAnyOpenMenus();
  await new Promise((r) => setTimeout(r, 250));

  // Hover tile to reveal controls
  const rect = tile.getBoundingClientRect();
  const clientX = rect.left + rect.width / 2;
  const clientY = rect.top + rect.height / 2;
  tile.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, clientX, clientY }));
  tile.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX, clientY }));
  tile.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX, clientY }));
  await new Promise((r) => setTimeout(r, 400));

  const trigger = findMoreButton(tile);
  let menuOpened = false;

  // Try clicking trigger up 5 levels (left click)
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

  // Try right click (contextmenu) up 5 levels if left click failed
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
  let targetItem = getAvailableResolutionItem(resOptions);

  // If resolutions not directly in first menu, look for "Download" / "Unduh" trigger
  if (!targetItem) {
    console.log('[Meta-Gen Flow Bridge] Mencari tombol "Download" / "Unduh" pada menu pertama...');
    const allMenuItems = Array.from(
      document.querySelectorAll(
        '.mat-mdc-menu-item, [mat-menu-item], flow-menu-item, [role="menuitem"], .mat-menu-item, button, span.label, span.item-text'
      )
    );

    let downloadTrigger = null;
    for (const el of allMenuItems) {
      const txt = el.textContent.trim().toLowerCase();
      const hasDownloadText =
        txt.includes('download') ||
        txt.includes('unduh') ||
        el.querySelector('mat-icon')?.textContent?.toLowerCase().includes('download');
      const isDelete = txt.includes('hapus') || txt.includes('delete') || txt.includes('remove');

      if (hasDownloadText && !isDelete) {
        downloadTrigger = el.closest('button, [role="menuitem"], flow-menu-item') || el;
        break;
      }
    }

    if (downloadTrigger) {
      console.log('[Meta-Gen Flow Bridge] Menemukan trigger submenu Download:', downloadTrigger);
      downloadTrigger.focus();
      downloadTrigger.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      downloadTrigger.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      downloadTrigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
      downloadTrigger.click();
      downloadTrigger.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));

      await new Promise((r) => setTimeout(r, 700));

      // Cari kembali opsi resolusi di submenu yang baru terbuka
      targetItem = getAvailableResolutionItem(resOptions);
    }
  }

  if (!targetItem) {
    console.warn(`[Meta-Gen Flow Bridge] Melewati media. Opsi resolusi tidak ditemukan atau terkunci: ${resolutionText}`);
    closeAnyOpenMenus();
    return { success: false, reason: 'resolution_not_found' };
  }

  const isVideoOrUpscale =
    tile.querySelector('video') !== null ||
    /(1080p|720p|4k|2k|video|mp4|upscaled)/i.test(targetItem.textContent) ||
    /(1080p|720p|4k|2k)/i.test(resolutionText);
  const maxWaitMs = isVideoOrUpscale ? 25000 : 10000;

  console.log(`[Meta-Gen Flow Bridge] Mengklik opsi resolusi: ${targetItem.textContent.trim()} untuk tile ${tileId}`);

  // Listen for Chrome download start handshake
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

  // Eksekusi klik pada opsi resolusi terpilih (persis seperti flow 2k downloader)
  targetItem.focus();
  targetItem.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  targetItem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  targetItem.click();
  targetItem.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));

  await new Promise((r) => setTimeout(r, 350));
  closeAnyOpenMenus();

  const isVerified = await downloadPromise;
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

// Master Function: Mass Download 2K/4K Engine
async function executeFlowMassDownload({ resolution = '2K', batchDelaySeconds = 2, skipDownloaded = true, folderName = 'MetaGen_Flow' } = {}) {
  if (isMassDownloading) {
    console.warn('[Meta-Gen Flow Bridge] Mass download sudah sedang berjalan.');
    return { success: false, error: 'Mass download sudah berjalan.' };
  }

  isMassDownloading = true;
  console.log('[Meta-Gen Flow Bridge] Memulai proses Mass Downloader 2K pada kanvas...');

  // Set download subfolder in background
  try {
    chrome.runtime.sendMessage({ type: 'SET_FLOW_DOWNLOAD_FOLDER', folder: folderName });
  } catch (e) {}

  // STEP 1: Pre-scan dengan zoom 50%
  massDownloaderOriginalZoom = document.body.style.zoom || '';
  document.body.style.zoom = '50%';
  await new Promise((r) => setTimeout(r, 700));

  showFlowToast('Mass Downloader 2K', 'Memindai seluruh aset di galeri...', false);

  const uniqueIds = new Set();
  const activeContainer = getScrollContainer();
  let lastTop = -1;
  let noChange = 0;

  if (activeContainer === window) window.scrollTo({ top: 0 });
  else activeContainer.scrollTop = 0;
  await new Promise((r) => setTimeout(r, 900));

  while (isMassDownloading) {
    const currentTiles = getAllTilesInDom();
    for (const t of currentTiles) {
      const id = getTileIdentifier(t);
      if (id) {
        markTileWithId(t, id);
        uniqueIds.add(id);
      }
    }

    scrollContainerDown(activeContainer, 500);
    await new Promise((r) => setTimeout(r, 300));

    const curTop = getScrollPos(activeContainer);
    if (curTop === lastTop) {
      noChange++;
      if (noChange >= 10) break; // Reached bottom
    } else {
      noChange = 0;
    }
    lastTop = curTop;
  }

  // Restore normal zoom
  document.body.style.zoom = massDownloaderOriginalZoom;
  await new Promise((r) => setTimeout(r, 600));

  const masterList = Array.from(uniqueIds);
  console.log('[Meta-Gen Flow Bridge] Scan selesai! Total unik:', masterList.length);

  if (masterList.length === 0) {
    isMassDownloading = false;
    showFlowToast('Mass Downloader', 'Tidak ada media ditemukan di canvas.', false);
    return { success: false, count: 0 };
  }

  // STEP 2: Scroll back to top
  if (activeContainer === window) window.scrollTo({ top: 0 });
  else activeContainer.scrollTop = 0;
  await new Promise((r) => setTimeout(r, 1200));

  // STEP 3: Iterate and Download
  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;

  for (let i = 0; i < masterList.length; i++) {
    if (!isMassDownloading) break;

    const tileId = masterList[i];
    if (skipDownloaded && downloadedIds.has(tileId)) {
      skipCount++;
      continue;
    }

    showFlowToast('Mass Downloader 2K', `Mendownload (${i + 1}/${masterList.length}) | Berhasil: ${successCount}...`, false);

    const tile = await findAndGetTile(tileId);
    if (!tile) {
      failCount++;
      continue;
    }

    try {
      tile.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {}
    await new Promise((r) => setTimeout(r, 700));

    const res = await processTileDownload(tile, resolution, tileId);
    if (res.success) {
      successCount++;
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
});

// Auto-hydrate badges on load & periodically for virtual scrolling
hydrateFlowBadges();
setInterval(hydrateFlowBadges, 3500);


