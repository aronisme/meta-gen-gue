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

  // Handle Flow Generation from Meta-Gen Tab
  if (message.type === 'EXECUTE_FLOW_GEN') {
    (async () => {
      const metaGenTabId = sender.tab?.id;
      lastMetaGenTabId = metaGenTabId || lastMetaGenTabId;
      const payload = message.payload;

      chrome.action.setBadgeText({ text: 'FLOW' });
      chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });

      try {
        const flowUrlPatterns = [
          '*://flow.google.com/project/*',
          '*://flow.google.com/*',
          '*://labs.google/fx/tools/flow*',
          '*://labs.google/fx/*/tools/flow*',
        ];

        let tabs = await chrome.tabs.query({ url: flowUrlPatterns });
        // Prioritize tab that currently has a project open (e.g. flow.google.com/project/...)
        let flowTab =
          tabs.find((t) => t.url && t.url.includes('/project/') && !t.discarded) ||
          tabs.find((t) => !t.discarded) ||
          tabs[0];

        if (!flowTab) {
          // Open Flow tab if not open yet
          console.log('[Meta-Gen Extension] Opening Google Flow tab (flow.google.com)...');
          flowTab = await chrome.tabs.create({
            url: 'https://flow.google.com/',
            active: true,
          });

          // Wait until page is completely loaded
          await new Promise((resolve) => {
            const listener = (tabId, info) => {
              if (tabId === flowTab.id && info.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
              }
            };
            chrome.tabs.onUpdated.addListener(listener);
            setTimeout(resolve, 20000); // 20s safety fallback
          });

          // Give Flow SPA 4 seconds to hydrate
          await new Promise((r) => setTimeout(r, 4000));
        } else {
          // Focus existing Flow tab so user can see progress
          await chrome.tabs.update(flowTab.id, { active: true });
          await new Promise((r) => setTimeout(r, 800));
        }

        // Ensure flow-bridge.js is active on the target tab (handles tabs opened before extension reload)
        let isBridgeReady = false;
        try {
          const ping = await chrome.tabs.sendMessage(flowTab.id, { action: 'FLOW_PING' });
          if (ping?.active) isBridgeReady = true;
        } catch (e) {
          isBridgeReady = false;
        }

        if (!isBridgeReady) {
          console.log('[Meta-Gen Extension] Injecting flow-bridge.js dynamically into Flow tab...');
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

        // Send task to flow-bridge.js
        console.log('[Meta-Gen Extension] Sending generation task to Flow tab:', flowTab.id);
        const flowResponse = await chrome.tabs.sendMessage(flowTab.id, {
          action: 'FLOW_START_GENERATION',
          payload: payload,
        });

        if (flowResponse && flowResponse.success) {
          chrome.action.setBadgeText({ text: 'IMG✓' });
          chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
          setTimeout(() => chrome.action.setBadgeText({ text: '' }), 4000);

          // Return result to Meta-Gen web tab
          if (metaGenTabId) {
            try {
              await chrome.scripting.executeScript({
                target: { tabId: metaGenTabId },
                func: (res) => {
                  window.postMessage(
                    {
                      type: 'METAGEN_FLOW_GEN_RESULT',
                      payload: res,
                    },
                    '*'
                  );
                },
                args: [flowResponse],
              });
            } catch (postErr) {
              console.warn('[Meta-Gen Extension] Could not post to Meta-Gen tab directly:', postErr);
            }
          }

          sendResponse(flowResponse);
        } else {
          throw new Error(flowResponse?.error || 'Gagal generate gambar di Flow');
        }
      } catch (err) {
        console.error('[Meta-Gen Extension] Flow generation error:', err);
        chrome.action.setBadgeText({ text: 'ERR' });
        chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
        setTimeout(() => chrome.action.setBadgeText({ text: '' }), 3000);

        const errorPayload = {
          success: false,
          cardId: payload?.cardId,
          error: err.message,
        };

        if (metaGenTabId) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: metaGenTabId },
              func: (res) => {
                window.postMessage(
                  {
                    type: 'METAGEN_FLOW_GEN_RESULT',
                    payload: res,
                  },
                  '*'
                );
              },
              args: [errorPayload],
            });
          } catch {}
        }

        sendResponse(errorPayload);
      }
    })();
    return true;
  }
});
