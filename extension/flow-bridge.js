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
    chrome.storage.local.get(['metagen_flow_registry'], (res) => {
      const reg = res.metagen_flow_registry;
      if (!reg || Object.keys(reg).length === 0) return;

      document.querySelectorAll('img, video, flow-image-tile img').forEach((el) => {
        const token = getMediaToken(el);
        if (token && reg[token]) {
          const tileContainer =
            el.closest('flow-grid-tile-container') ||
            el.closest('flow-tile-container') ||
            el.closest('flow-image-tile') ||
            el.closest('.tile-row') ||
            el.closest('[data-tile-id]') ||
            el.parentElement;
          if (tileContainer && !tileContainer.querySelector('.metagen-flow-badge')) {
            tagCardWithPromptData(tileContainer, reg[token]);
          }
        }
      });
    });
  } catch (e) {}
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
  const { cardId, prompt, ratio, ordinal, title } = payload;
  console.log('[Meta-Gen Flow Bridge] Starting generation task for card:', cardId, 'Ordinal:', ordinal, 'prompt length:', prompt?.length);
  showFlowToast('Meta-Gen: Menerima Prompt...', 'Sedang mempersiapkan input di Google Flow...', false);

  // 0. Dismiss any blocking cookie banner & Ensure Batch View Mode
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
  const editor = editorCandidates.find((el) => el && el.offsetParent !== null) || editorCandidates.find(Boolean);

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

  // 10. Tag ALL Discovered Variations in Google Flow DOM & Add ALL to Baseline
  const isMultiple = detectedBatchItems.length > 1;
  const variationLetters = ['A', 'B', 'C', 'D', 'E', 'F'];

  for (let idx = 0; idx < detectedBatchItems.length; idx++) {
    const item = detectedBatchItems[idx];
    const varLetter = isMultiple ? (variationLetters[idx] || String(idx + 1)) : '';

    const cardData = {
      cardId: cardId,
      ordinal: ordinal || 1,
      variation: varLetter,
      title: title || '',
      prompt: prompt,
      ratio: ratio || '16:9',
      token: item.token,
      mediaId: item.mediaId,
    };

    if (item.tileContainer) {
      tagCardWithPromptData(item.tileContainer, cardData);
      console.log(`[Meta-Gen Flow Bridge] Tagged tile #${cardData.ordinal} (${varLetter || 'Single'}) with token: ${item.token}`);
    }

    savePromptToRegistry(item.token, cardData);

    // CRITICAL: Consume token into baselineTokens so next prompts will NEVER touch it!
    baselineTokens.add(item.token);
  }

  // 11. Extract All Variations Data to Return to Meta-Gen Studio
  showFlowToast('Meta-Gen: Gambar Selesai!', `Menyimpan ${detectedBatchItems.length} variasi gambar #${ordinal || 1}...`, true);

  const variationsList = [];
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
    variationsList.push({
      letter: isMultiple ? (variationLetters[idx] || String(idx + 1)) : 'A',
      token: it.token,
      dataUrl: itBase64,
      mediaId: itMediaId,
    });
  }

  const primaryItem = detectedBatchItems[0];
  const primaryDataUrl = variationsList[0]?.dataUrl || '';

  showFlowToast('✓ Meta-Gen: Selesai!', `Prompt #${ordinal || 1} (${variationsList.length} variasi) siap di Studio.`, true);

  return {
    success: true,
    cardId: cardId,
    ordinal: ordinal,
    title: title,
    token: primaryItem.token,
    variationsCount: variationsList.length,
    imageDataUrl: primaryDataUrl,
    variations: variationsList,
    filename: `Flow_Prompt_${ordinal || '1'}_${Date.now().toString().slice(-4)}.jpg`,
  };
}

// Listen for messages from background.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'FLOW_PING') {
    sendResponse({ active: true, url: window.location.href });
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


