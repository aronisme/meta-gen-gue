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

// Helper: Find active Meta-Gen tab safely without match-pattern syntax errors with ports
async function findMetaGenTabs(preferredUrl = '') {
  try {
    const allTabs = await chrome.tabs.query({});
    return allTabs.filter((t) => {
      if (!t.url) return false;
      const u = t.url.toLowerCase();
      if (preferredUrl && u.startsWith(preferredUrl.toLowerCase())) return true;
      return (
        u.includes('localhost:3000') ||
        u.includes('127.0.0.1:3000') ||
        u.includes('localhost:') ||
        u.includes('127.0.0.1:') ||
        u.includes('meta-gen-gue.pages.dev') ||
        t.title?.toLowerCase().includes('meta-gen')
      );
    });
  } catch (err) {
    console.warn('[Meta-Gen Extension] Error querying tabs:', err);
    return [];
  }
}

// Send Payload to Meta-Gen Tab (silently in background without stealing focus or switching tabs)
async function sendPayloadToMetaGenTab(payload, targetAppUrl) {
  const tabs = await findMetaGenTabs(targetAppUrl);

  if (tabs.length > 0) {
    const targetTab = tabs.find((t) => t.active) || tabs[0];

    // 1. Inject message into target tab silently
    try {
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
    } catch (err) {
      console.warn('[Meta-Gen Extension] Could not inject script directly:', err);
    }

    // SILENT: Do NOT activate or focus the Meta-Gen tab.
    // The user stays on their current browsing page completely uninterrupted.
    return true;
  } else {
    // If no Meta-Gen tab is open, save to pending queue in storage WITHOUT opening or switching tabs
    const existing = (await chrome.storage.local.get(['pendingQueue'])).pendingQueue || [];
    if (Array.isArray(payload)) {
      existing.push(...payload);
    } else {
      existing.push(payload);
    }
    await chrome.storage.local.set({ pendingQueue: existing });

    // SILENT: Do NOT create a new tab. When the user opens Meta-Gen later,
    // content.js will automatically pick up all pending items from storage.
    return true;
  }
}

// Alias for silent delivery
const sendPayloadToMetaGenTabSilently = sendPayloadToMetaGenTab;

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
    if (tab?.id && !targetImageUrl) {
      try {
        let frameResults = await chrome.scripting.executeScript({
          target: { tabId: tab.id, frameIds: [info.frameId || 0] },
          func: () => {
            return window.__metaGenExtractLastClickedImage
              ? window.__metaGenExtractLastClickedImage()
              : null;
          },
        });

        let extracted = frameResults?.[0]?.result;
        if (extracted?.url) {
          targetImageUrl = extracted.url;
        }

        // If content.js was not ready on this tab, dynamically inject it and retry
        if (!targetImageUrl) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['content.js'],
            });
            await new Promise((r) => setTimeout(r, 100));

            frameResults = await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: () => {
                return window.__metaGenExtractLastClickedImage
                  ? window.__metaGenExtractLastClickedImage()
                  : null;
              },
            });
            extracted = frameResults?.[0]?.result;
            if (extracted?.url) {
              targetImageUrl = extracted.url;
            }
          } catch (e) {}
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

    // Send to Meta-Gen and activate tab
    await sendPayloadToMetaGenTab(payload, targetAppUrl);

    // Show instant feedback on the user's active browsing screen
    await showToastOnActiveTab(tab?.id, dataUrl || targetImageUrl, 'Gambar berhasil dikirim ke Prompt Generator!');

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

let lastMetaGenTabId = null;

// Hardware-level CDP dispatch using chrome.debugger (guarantees isTrusted: true)
async function executeCdpSubmission(tabId, promptText, coords) {
  const target = { tabId };
  console.log('[Meta-Gen Background] Attaching chrome.debugger to Flow tab:', tabId);
  try {
    await chrome.debugger.attach(target, '1.3');
  } catch (attachErr) {
    console.warn('[Meta-Gen Background] Debugger attach info:', attachErr.message);
  }

  try {
    // 1. If coordinates of generate button exist, dispatch genuine mouse click via CDP
    if (coords && typeof coords.x === 'number' && typeof coords.y === 'number' && coords.x > 0 && coords.y > 0) {
      console.log('[Meta-Gen Background] Dispatching CDP Mouse Click on Submit Button at:', coords);
      await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: coords.x,
        y: coords.y,
        button: 'left',
        clickCount: 1,
      });
      await new Promise((r) => setTimeout(r, 60));
      await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: coords.x,
        y: coords.y,
        button: 'left',
        clickCount: 1,
      });
      await new Promise((r) => setTimeout(r, 120));
    }

    // 2. Dispatch genuine Enter Key via CDP (isTrusted: true)
    console.log('[Meta-Gen Background] Dispatching CDP Enter Key (isTrusted: true)...');
    await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
      macCharCode: 13,
      unmodifiedText: '\r',
      text: '\r',
      key: 'Enter',
      code: 'Enter',
    });
    await new Promise((r) => setTimeout(r, 60));
    await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
      type: 'keyUp',
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
      macCharCode: 13,
      unmodifiedText: '\r',
      text: '\r',
      key: 'Enter',
      code: 'Enter',
    });

    console.log('[Meta-Gen Background] CDP submission executed successfully!');
    return { success: true };
  } catch (cdpErr) {
    console.error('[Meta-Gen Background] CDP Command error:', cdpErr);
    return { success: false, error: cdpErr.message };
  } finally {
    try {
      await chrome.debugger.detach(target);
      console.log('[Meta-Gen Background] Debugger detached.');
    } catch (detachErr) {
      // Ignore if already detached
    }
  }
}

// Handle Messages from Content Script or Popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TRIGGER_CDP_SUBMIT') {
    const tabId = sender.tab?.id;
    const promptText = message.prompt || '';
    const coords = message.coords || null;
    if (tabId) {
      executeCdpSubmission(tabId, promptText, coords)
        .then((res) => sendResponse(res))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true; // async sendResponse
    }
  }

  if (message.type === 'FLOW_GENERATION_DONE') {
    const res = message.result;
    if (lastMetaGenTabId) {
      chrome.scripting.executeScript({
        target: { tabId: lastMetaGenTabId },
        func: (data) => {
          window.postMessage({ type: 'METAGEN_FLOW_GEN_RESULT', payload: data }, '*');
        },
        args: [res],
      }).catch(() => {});
    }
    return true;
  }

  if (message.type === 'REGISTER_AGENT_SCENES') {
    const scenes = message.payload?.scenes || [];
    chrome.storage.local.set({ metagen_agent_scenes: scenes });
    return true;
  }

  if (message.type === 'SYNC_ACTIVE_PROMPTS') {
    if (sender.tab?.id) {
      lastMetaGenTabId = sender.tab.id;
    }
    const prompts = message.payload?.prompts || [];
    chrome.storage.local.set({ metagen_session_prompts: prompts });

    // Instantly notify any active Flow tabs to run prompt matching scan
    chrome.tabs.query({ url: ['https://labs.google/*', 'https://flow.google.com/*'] }).then((tabs) => {
      for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, { action: 'TRIGGER_SCAN_NOW' }).catch(() => {});
      }
    }).catch(() => {});
    return true;
  }

  if (message.type === 'OPEN_METAGEN_STUDIO') {
    (async () => {
      const targetAppUrl = await getTargetAppUrl();
      const tabs = await findMetaGenTabs(targetAppUrl);
      if (tabs.length > 0) {
        chrome.tabs.update(tabs[0].id, { active: true }).catch(() => {});
      } else {
        chrome.tabs.create({ url: targetAppUrl }).catch(() => {});
      }
    })();
    return true;
  }

  if (message.type === 'OMNIGENT_IN_PAGE_COMMAND') {
    const prompt = String(message.prompt || '');
    const lower = prompt.toLowerCase();

    (async () => {
      try {
        if (lower.includes('scan') || lower.includes('render') || lower.includes('download')) {
          const res = await fetch('http://127.0.0.1:45678/scan-downloads?limit=10', {
            signal: AbortSignal.timeout(2500),
          });
          if (res.ok) {
            const data = await res.json();
            const count = data.files?.length || 0;
            sendResponse({
              success: true,
              result: `Terdeteksi <strong>${count} file 2K</strong> di folder Downloads/MetaGen_Flow. Semua file siap diaudit QC dan diproses metadata.`,
            });
            return;
          }
        }

        if (lower.includes('qc') || lower.includes('kualitas')) {
          sendResponse({
            success: true,
            result: `Inspeksi QC aktif: Standar resmi Adobe Stock mewajibkan resolusi <strong>4.0 MP - 100.0 MP</strong>, batas ukuran file <strong>45 MB</strong>, bebas watermark dan cacat AI.`,
          });
          return;
        }

        if (lower.includes('prompt') || lower.includes('midjourney') || lower.includes('flux')) {
          sendResponse({
            success: true,
            result: `Rekomendasi prompt: <em>${prompt}, commercial studio lighting, pristine textures, 85mm f/1.4 lens, clean composition, high key backdrop --ar 16:9 --v 6.1</em>`,
          });
          return;
        }

        sendResponse({
          success: true,
          result: `Perintah diterima oleh Omnigent Live Coworker. Tugas "${prompt}" tercatat di jurnal studio.`,
        });
      } catch (err) {
        sendResponse({
          success: true,
          result: `Omnigent memproses: "${prompt}". Untuk eksekusi penuh disk lokal, pastikan Local Bridge (:45678) aktif.`,
        });
      }
    })();
    return true; // async sendResponse
  }

  if (message.type === 'FLOW_LOGIN_REQUIRED') {
    console.warn('[Meta-Gen Background] Google Flow requires login. Activating Flow tab...');
    if (sender.tab?.id) {
      chrome.tabs.update(sender.tab.id, { active: true }).catch(() => {});
    }
    if (lastMetaGenTabId) {
      chrome.scripting.executeScript({
        target: { tabId: lastMetaGenTabId },
        func: () => {
          window.postMessage({
            type: 'METAGEN_FLOW_GEN_RESULT',
            payload: {
              success: false,
              requiresLogin: true,
              error: 'Sesi Google Flow belum login atau telah berakhir. Tab Flow telah dibuka di browser Anda. Silakan login terlebih dahulu.',
            },
          }, '*');
        },
      }).catch(() => {});
    }
    return true;
  }

  if (message.type === 'FLOW_CARD_DISCOVERED') {
    const res = message.result;
    (async () => {
      try {
        const tabs = await findMetaGenTabs();
        for (const targetTab of tabs) {
          chrome.scripting
            .executeScript({
              target: { tabId: targetTab.id },
              func: (data) => {
                window.postMessage({ type: 'METAGEN_FLOW_CARD_DISCOVERED', payload: data }, '*');
              },
              args: [res],
            })
            .catch(() => {});
        }
      } catch (err) {
        console.warn('[Meta-Gen Background] Error broadcasting FLOW_CARD_DISCOVERED:', err);
      }
    })();
    return true;
  }

  if (message.type === 'SET_FLOW_DOWNLOAD_FOLDER') {
    currentFlowDownloadFolder = message.folder || 'MetaGen_Flow';
    return true;
  }

  if (message.type === 'TRIGGER_FLOW_MASS_DOWNLOAD') {
    if (sender.tab?.id) {
      lastMetaGenTabId = sender.tab.id;
    }
    const folder = message.folder || 'MetaGen_Flow';
    currentFlowDownloadFolder = folder;

    (async () => {
      try {
        const tabs = await chrome.tabs.query({
          url: ['https://labs.google/*', 'https://flow.google.com/*'],
        });

        if (!tabs || tabs.length === 0) {
          sendResponse({
            success: false,
            error: 'Tab Google Flow tidak ditemukan. Harap buka Google Flow terlebih dahulu.',
          });
          return;
        }

        const flowTab = tabs.find((t) => t.active) || tabs[0];

        // Ensure flow-bridge.js is injected
        let isBridgeReady = false;
        try {
          const ping = await chrome.tabs.sendMessage(flowTab.id, { action: 'FLOW_PING' });
          if (ping?.active) isBridgeReady = true;
        } catch (e) {
          isBridgeReady = false;
        }

        if (!isBridgeReady) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: flowTab.id },
              files: ['flow-bridge.js'],
            });
            await new Promise((r) => setTimeout(r, 400));
          } catch (injectErr) {
            console.warn('[Meta-Gen Extension] Script injection warning:', injectErr);
          }
        }

        console.log('[Meta-Gen Extension] Forwarding FLOW_EXECUTE_MASS_DOWNLOAD to Flow tab:', flowTab.id);
        const flowResponse = await chrome.tabs.sendMessage(flowTab.id, {
          action: 'FLOW_EXECUTE_MASS_DOWNLOAD',
          options: {
            ...(message.payload || {}),
            folderName: folder,
          },
        });

        sendResponse(flowResponse || { success: true });
      } catch (err) {
        console.error('[Meta-Gen Extension] Error triggering mass download:', err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true; // async sendResponse
  }

  if (message.type === 'STOP_FLOW_MASS_DOWNLOAD') {
    chrome.tabs.query({ url: ['https://labs.google/*', 'https://flow.google.com/*'] }, (tabs) => {
      for (const t of tabs) {
        chrome.tabs.sendMessage(t.id, { action: 'FLOW_STOP_MASS_DOWNLOAD' }).catch(() => {});
      }
    });
    return true;
  }

  if (message.type === 'FLOW_MASS_DOWNLOAD_PROGRESS') {
    if (lastMetaGenTabId) {
      chrome.scripting.executeScript({
        target: { tabId: lastMetaGenTabId },
        func: (p) => {
          window.postMessage({ type: 'METAGEN_FLOW_MASS_DOWNLOAD_PROGRESS', payload: p }, '*');
        },
        args: [message.payload],
      }).catch(() => {});
    }
    return true;
  }

  if (message.type === 'TRIGGER_MAIN_WORLD_CLICK_NEW_PROJECT') {
    const tabId = sender.tab?.id;
    if (tabId) {
      chrome.scripting
        .executeScript({
          target: { tabId },
          world: 'MAIN',
          func: () => {
            console.log('[Meta-Gen MainWorld] Looking for New Project button in MAIN world...');
            const btn =
              document.querySelector('button.new-project-button, .new-project-button') ||
              Array.from(document.querySelectorAll('button')).find((b) => {
                const txt = (b.textContent || '').toLowerCase();
                return txt.includes('project baru') || txt.includes('new project') || txt.includes('proyek baru');
              });
            if (btn) {
              console.log('[Meta-Gen MainWorld] Clicking New Project button inside MAIN world (Zone.js)...');
              btn.click();
            }
          },
        })
        .catch(() => {});
    }
    return true;
  }

  if (message.type === 'TRIGGER_CDP_MOUSE_CLICK') {
    const tabId = sender.tab?.id;
    const coords = message.coords;
    if (tabId && coords && typeof coords.x === 'number' && typeof coords.y === 'number') {
      const target = { tabId };
      (async () => {
        try {
          await chrome.debugger.attach(target, '1.3');
        } catch (e) {}
        try {
          await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
            type: 'mousePressed',
            x: coords.x,
            y: coords.y,
            button: 'left',
            clickCount: 1,
          });
          await new Promise((r) => setTimeout(r, 60));
          await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            x: coords.x,
            y: coords.y,
            button: 'left',
            clickCount: 1,
          });
          console.log('[Meta-Gen Background] Dispatched CDP mouse click at:', coords);
        } catch (err) {
          console.warn('[Meta-Gen Background] CDP mouse click warning:', err);
        }
      })();
    }
    return true;
  }

  if (message.type === 'TRIGGER_MAIN_WORLD_CLICK_AGENT_MODE') {
    const tabId = sender.tab?.id;
    if (tabId) {
      chrome.scripting
        .executeScript({
          target: { tabId },
          world: 'MAIN',
          func: () => {
            console.log('[Meta-Gen MainWorld] Looking for Agent Mode toggle button in MAIN world...');
            const btn =
              document.querySelector('flow-agent-mode-toggle-chip button, button.agent-mode-chip') ||
              Array.from(document.querySelectorAll('button')).find((b) => {
                const txt = (b.textContent || '').toLowerCase();
                return txt === 'agen' || txt === 'agent' || b.closest('flow-agent-mode-toggle-chip');
              });
            if (btn) {
              const chip = btn.closest('flow-agent-mode-toggle-chip');
              const isChecked = chip?.classList.contains('checked') || btn.getAttribute('aria-pressed') === 'true';
              if (!isChecked) {
                console.log('[Meta-Gen MainWorld] Clicking Agent Mode toggle button inside MAIN world (Zone.js)...');
                const target = btn.querySelector('.agent-mode-chip-label, span') || btn;
                target.click();
                btn.click();
              } else {
                console.log('[Meta-Gen MainWorld] Agent Mode is already checked in MAIN world.');
              }
            }
          },
        })
        .catch(() => {});
    }
    return true;
  }

  if (message.type === 'TRIGGER_MAIN_WORLD_SUBMIT') {
    const tabId = sender.tab?.id;
    const promptText = message.prompt || '';
    if (tabId) {
      chrome.scripting
        .executeScript({
          target: { tabId: tabId },
          world: 'MAIN',
          func: (text) => {
            console.log('[Meta-Gen MainWorld] Executing prompt insertion and click in MAIN world (Zone.js)...');

            // 1. Dismiss cookie bar if present
            const cookieBar = document.querySelector('#glue-cookie-notification-bar-1, .glue-cookie-notification-bar');
            if (cookieBar) {
              const rejectBtn = cookieBar.querySelector(
                'button.glue-cookie-notification-bar__reject, button[aria-label*="reject" i], button'
              );
              if (rejectBtn) rejectBtn.click();
              else cookieBar.remove();
            }

            // 2. Locate editor (ProseMirror on flow.google.com)
            const editor =
              document.querySelector('div.ProseMirror[contenteditable="true"]') ||
              document.querySelector('.ProseMirror') ||
              document.querySelector('flow-prompt-box [contenteditable="true"]') ||
              document.querySelector('[contenteditable="true"]');

            if (editor) {
              editor.focus();

              // Try ProseMirror native view transaction
              const pmView = editor.pmViewDesc?.editorView;
              if (pmView && pmView.state && pmView.dispatch) {
                try {
                  const tr = pmView.state.tr.replaceWith(
                    0,
                    pmView.state.doc.content.size,
                    pmView.state.schema.text(text)
                  );
                  pmView.dispatch(tr);
                  console.log('[Meta-Gen MainWorld] Updated ProseMirror document model via pmView.dispatch!');
                } catch (pmErr) {
                  console.warn('[Meta-Gen MainWorld] pmView dispatch failed:', pmErr);
                }
              }

              // Also populate via selection + execCommand
              try {
                const sel = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(editor);
                sel.removeAllRanges();
                sel.addRange(range);
                document.execCommand('delete', false, null);
                document.execCommand('insertText', false, text);
              } catch (cmdErr) {}

              // Fire input and change events
              editor.dispatchEvent(
                new InputEvent('beforeinput', { bubbles: true, composed: true, inputType: 'insertText', data: text })
              );
              editor.dispatchEvent(
                new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: text })
              );
              editor.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
              editor.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            }

            // 3. Click the submit button inside Zone.js after brief tick
            setTimeout(() => {
              const btn =
                document.querySelector('flow-generate-icon-button button') ||
                document.querySelector('button.generate-icon-button') ||
                document.querySelector('.submit-controls flow-generate-icon-button button') ||
                document.querySelector('.submit-controls button[type="submit"]') ||
                document.querySelector('button[aria-label="Mulai pembuatan" i]') ||
                document.querySelector('button[aria-label*="pembuatan" i]');

              if (btn) {
                btn.removeAttribute('disabled');
                btn.removeAttribute('aria-disabled');
                btn.classList.remove('mat-button-disabled');
                btn.focus();

                // Trigger full pointer events
                const targets = [
                  btn.querySelector('.mat-mdc-button-touch-target'),
                  btn.querySelector('mat-icon'),
                  btn,
                  btn.closest('flow-generate-icon-button'),
                ].filter(Boolean);

                targets.forEach((t) => {
                  try {
                    t.dispatchEvent(
                      new PointerEvent('pointerdown', { bubbles: true, composed: true, isPrimary: true, button: 0 })
                    );
                    t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true, button: 0 }));
                    t.dispatchEvent(
                      new PointerEvent('pointerup', { bubbles: true, composed: true, isPrimary: true, button: 0 })
                    );
                    t.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, composed: true, button: 0 }));
                    t.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, view: window }));
                  } catch (e) {}
                });

                btn.click();
                console.log('[Meta-Gen MainWorld] Submit button clicked inside Zone.js!');

                // If form exists
                if (btn.form) {
                  try {
                    btn.form.requestSubmit(btn);
                  } catch (e) {}
                }
              }

              // Dual trigger: Enter keypress on editor
              if (editor) {
                editor.dispatchEvent(
                  new KeyboardEvent('keydown', {
                    key: 'Enter',
                    code: 'Enter',
                    keyCode: 13,
                    which: 13,
                    charCode: 13,
                    bubbles: true,
                    composed: true,
                  })
                );
                editor.dispatchEvent(
                  new KeyboardEvent('keypress', {
                    key: 'Enter',
                    code: 'Enter',
                    keyCode: 13,
                    which: 13,
                    charCode: 13,
                    bubbles: true,
                    composed: true,
                  })
                );
                editor.dispatchEvent(
                  new KeyboardEvent('keyup', {
                    key: 'Enter',
                    code: 'Enter',
                    keyCode: 13,
                    which: 13,
                    charCode: 13,
                    bubbles: true,
                    composed: true,
                  })
                );
                console.log('[Meta-Gen MainWorld] Enter key dispatched inside Zone.js!');
              }
            }, 250);
          },
          args: [promptText],
        })
        .then(() => sendResponse({ success: true }))
        .catch((err) => {
          console.error('[Meta-Gen Extension] Main world script execution failed:', err);
          sendResponse({ success: false, error: err.message });
        });
      return true; // async sendResponse
    }
  }

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

  // Handle Flow Generation from Meta-Gen Tab (FIFO Queue System)
  if (message.type === 'EXECUTE_FLOW_GEN') {
    const metaGenTabId = sender.tab?.id;
    lastMetaGenTabId = metaGenTabId || lastMetaGenTabId;
    enqueueFlowGeneration(message.payload, metaGenTabId, sendResponse);
    return true; // asynchronous queue handling
  }

  // Handle Mass Downloader 2K/4K Messages
  if (message.type === 'SET_FLOW_DOWNLOAD_FOLDER') {
    currentFlowDownloadFolder = message.folder || 'MetaGen_Flow';
    sendResponse({ success: true, folder: currentFlowDownloadFolder });
    return true;
  }


  if (message.type === 'STOP_FLOW_MASS_DOWNLOAD') {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({ url: ['*://flow.google.com/*', '*://labs.google/fx/*'] });
        for (const tab of tabs) {
          chrome.tabs.sendMessage(tab.id, { action: 'FLOW_STOP_MASS_DOWNLOAD' }).catch(() => {});
        }
        sendResponse({ success: true });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }

  if (message.type === 'FLOW_MASS_DOWNLOAD_PROGRESS') {
    if (lastMetaGenTabId) {
      chrome.scripting
        .executeScript({
          target: { tabId: lastMetaGenTabId },
          func: (data) => {
            window.postMessage({ type: 'METAGEN_FLOW_MASS_DOWNLOAD_PROGRESS', payload: data }, '*');
          },
          args: [message.payload],
        })
        .catch(() => {});
    }
    return true;
  }
});

// FIFO Queue State & Storage
const flowGenerationQueue = [];
let isFlowQueueActive = false;

// Enqueue Task and trigger Queue Worker
function enqueueFlowGeneration(payload, metaGenTabId, sendResponse) {
  const isDuplicate = flowGenerationQueue.some((item) => item.payload?.cardId === payload?.cardId);
  if (!isDuplicate) {
    flowGenerationQueue.push({ payload, metaGenTabId });
  }

  console.log(
    '[Meta-Gen Flow Queue] Enqueued card:',
    payload?.cardId,
    'Ordinal:',
    payload?.ordinal,
    'Queue Length:',
    flowGenerationQueue.length
  );

  // Send immediate ack to sender
  sendResponse({ success: true, enqueued: true, queueLength: flowGenerationQueue.length });

  // Broadcast updated queue state to Meta-Gen tab
  notifyQueueState(metaGenTabId);

  // Trigger processor
  if (!isFlowQueueActive) {
    processFlowQueue();
  }
}

// Broadcast queue update to Meta-Gen Web App
async function notifyQueueState(metaGenTabId) {
  const targetId = metaGenTabId || lastMetaGenTabId;
  if (!targetId) return;

  const queueInfo = {
    queueLength: flowGenerationQueue.length,
    activeCardId: flowGenerationQueue[0]?.payload?.cardId || null,
    queuedCardIds: flowGenerationQueue.map((item) => item.payload?.cardId).filter(Boolean),
  };

  try {
    await chrome.scripting.executeScript({
      target: { tabId: targetId },
      func: (info) => {
        window.postMessage(
          {
            type: 'METAGEN_FLOW_QUEUE_UPDATE',
            payload: info,
          },
          '*'
        );
      },
      args: [queueInfo],
    });
  } catch (err) {}
}

// Queue Worker Loop (Sequential FIFO)
async function processFlowQueue() {
  if (isFlowQueueActive || flowGenerationQueue.length === 0) return;
  isFlowQueueActive = true;

  while (flowGenerationQueue.length > 0) {
    const currentTask = flowGenerationQueue[0];
    const { payload, metaGenTabId } = currentTask;

    console.log(
      '[Meta-Gen Flow Queue] Processing task for card:',
      payload?.cardId,
      'Ordinal:',
      payload?.ordinal,
      'Remaining:',
      flowGenerationQueue.length
    );

    chrome.action.setBadgeText({ text: `Q:${flowGenerationQueue.length}` });
    chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });

    // Notify tab of the currently active card
    await notifyQueueState(metaGenTabId);

    try {
      await executeSingleFlowGeneration(payload, metaGenTabId);
    } catch (err) {
      console.error('[Meta-Gen Flow Queue] Task error for card:', payload?.cardId, err);
      chrome.action.setBadgeText({ text: 'ERR' });
      chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
      setTimeout(() => chrome.action.setBadgeText({ text: '' }), 3000);

      const errPayload = {
        success: false,
        cardId: payload?.cardId,
        error: err.message,
      };

      if (metaGenTabId) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: metaGenTabId },
            func: (res) => {
              window.postMessage({ type: 'METAGEN_FLOW_GEN_RESULT', payload: res }, '*');
            },
            args: [errPayload],
          });
        } catch (e) {}
      }
    } finally {
      // Remove finished task from queue
      flowGenerationQueue.shift();
      await notifyQueueState(metaGenTabId);

      // Safe cooling pause between prompt tasks (2.5s) to guarantee Flow editor is clean
      if (flowGenerationQueue.length > 0) {
        console.log('[Meta-Gen Flow Queue] Cooling 2.5s before next task in queue...');
        await new Promise((r) => setTimeout(r, 2500));
      }
    }
  }

  isFlowQueueActive = false;
  chrome.action.setBadgeText({ text: '' });
  console.log('[Meta-Gen Flow Queue] All queue tasks have been processed.');
}

// Execute Single Generation Task on Google Flow Tab
async function executeSingleFlowGeneration(payload, metaGenTabId) {
  const flowUrlPatterns = [
    '*://flow.google.com/project/*',
    '*://flow.google.com/*',
    '*://labs.google/fx/tools/flow*',
    '*://labs.google/fx/*/tools/flow*',
  ];

  let tabs = await chrome.tabs.query({ url: flowUrlPatterns });
  let flowTab =
    tabs.find((t) => t.url && t.url.includes('/project/') && !t.discarded) ||
    tabs.find((t) => !t.discarded) ||
    tabs[0];

  if (!flowTab) {
    console.log('[Meta-Gen Extension] Opening Google Flow tab in background (flow.google.com)...');
    flowTab = await chrome.tabs.create({
      url: 'https://flow.google.com/',
      active: false,
    });

    await new Promise((resolve) => {
      const listener = (tabId, info) => {
        if (tabId === flowTab.id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
      setTimeout(resolve, 20000);
    });

    // Check if redirected to login page
    const updatedTab = await chrome.tabs.get(flowTab.id).catch(() => null);
    if (updatedTab && (updatedTab.url?.includes('accounts.google.com') || updatedTab.url?.includes('ServiceLogin'))) {
      console.warn('[Meta-Gen Extension] Google Flow requires login. Activating tab...');
      await chrome.tabs.update(flowTab.id, { active: true });
      if (metaGenTabId) {
        chrome.scripting.executeScript({
          target: { tabId: metaGenTabId },
          func: () => {
            window.postMessage({
              type: 'METAGEN_FLOW_GEN_RESULT',
              payload: {
                success: false,
                requiresLogin: true,
                error: 'Sesi Google Flow belum login atau telah berakhir. Tab Flow telah dibuka di browser Anda. Silakan login terlebih dahulu.',
              },
            }, '*');
          },
        }).catch(() => {});
      }
      return { success: false, requiresLogin: true, error: 'Sesi Google Flow belum login.' };
    }

    await new Promise((r) => setTimeout(r, 4000));
  } else {
    // If tab already exists, check if it's currently on login page
    if (flowTab.url && (flowTab.url.includes('accounts.google.com') || flowTab.url.includes('ServiceLogin'))) {
      console.warn('[Meta-Gen Extension] Google Flow tab is on login page. Activating tab...');
      await chrome.tabs.update(flowTab.id, { active: true });
      if (metaGenTabId) {
        chrome.scripting.executeScript({
          target: { tabId: metaGenTabId },
          func: () => {
            window.postMessage({
              type: 'METAGEN_FLOW_GEN_RESULT',
              payload: {
                success: false,
                requiresLogin: true,
                error: 'Sesi Google Flow belum login atau telah berakhir. Tab Flow telah dibuka di browser Anda. Silakan login terlebih dahulu.',
              },
            }, '*');
          },
        }).catch(() => {});
      }
      return { success: false, requiresLogin: true, error: 'Sesi Google Flow belum login.' };
    }

    // Silent Background Mode: Do NOT switch active tab to Flow! User stays in Meta-Gen Studio.
    await new Promise((r) => setTimeout(r, 100));
  }

  // Ensure flow-bridge.js is active
  let isBridgeReady = false;
  try {
    const ping = await chrome.tabs.sendMessage(flowTab.id, { action: 'FLOW_PING' });
    if (ping?.active) isBridgeReady = true;
  } catch (e) {
    isBridgeReady = false;
  }

  if (!isBridgeReady) {
    console.log('[Meta-Gen Extension] Injecting flow-bridge.js into Flow tab...');
    try {
      await chrome.scripting.executeScript({
        target: { tabId: flowTab.id },
        files: ['flow-bridge.js'],
      });
      await new Promise((r) => setTimeout(r, 400));
    } catch (injectErr) {
      console.warn('[Meta-Gen Extension] Script injection warning:', injectErr);
    }
  }

  console.log('[Meta-Gen Extension] Dispatching generation to Flow tab:', flowTab.id, 'Card:', payload.cardId);
  const flowResponse = await chrome.tabs.sendMessage(flowTab.id, {
    action: 'FLOW_START_GENERATION',
    payload: payload,
  });

  if (flowResponse && flowResponse.success) {
    chrome.action.setBadgeText({ text: 'IMG✓' });
    chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 4000);

    if (metaGenTabId) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: metaGenTabId },
          func: (res) => {
            window.postMessage({ type: 'METAGEN_FLOW_GEN_RESULT', payload: res }, '*');
          },
          args: [flowResponse],
        });
      } catch (postErr) {
        console.warn('[Meta-Gen Extension] Could not post to Meta-Gen tab directly:', postErr);
      }
    }
    return flowResponse;
  } else {
    throw new Error(flowResponse?.error || 'Gagal generate gambar di Flow');
  }
}

// ==========================================
// 2K/4K Mass Downloader Routing & Handshake
// ==========================================
let currentFlowDownloadFolder = 'MetaGen_Flow';

chrome.downloads.onCreated.addListener((downloadItem) => {
  // Broadcast download_started event to all active Flow tabs
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, { action: 'FLOW_DOWNLOAD_STARTED', item: downloadItem }).catch(() => {});
    }
  });
});

chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  // Only route downloads initiated from Google Flow / Labs
  const isGoogleFlow =
    (item.referrer && (item.referrer.includes('labs.google') || item.referrer.includes('flow.google.com'))) ||
    (item.url &&
      (item.url.includes('labs.google') ||
        item.url.includes('flow.google.com') ||
        item.url.includes('googleusercontent.com') ||
        item.url.includes('googleapis.com')));

  if (isGoogleFlow && currentFlowDownloadFolder && currentFlowDownloadFolder.trim() !== '') {
    const folder = currentFlowDownloadFolder.trim().replace(/^[\/\\]+|[\/\\]+$/g, '');
    suggest({ filename: `${folder}/${item.filename}` });
  } else {
    suggest({ filename: item.filename });
  }
});

