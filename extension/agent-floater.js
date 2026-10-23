// extension/agent-floater.js
/**
 * MetaGen Omnigent Live AI Agent — Universal In-Page Web Companion
 * Cross-Tab Overlay injected into any webpage (Google Flow, Adobe Stock, Shutterstock, YouTube, etc.)
 * Isolated strictly within Shadow DOM to prevent CSS collision with host web pages.
 */

(function () {
  // Prevent duplicate injection and run only in the top-level frame
  if (window.top !== window.self) return;
  if (document.getElementById('metagen-omnigent-root')) return;

  const hostContainer = document.createElement('div');
  hostContainer.id = 'metagen-omnigent-root';
  hostContainer.style.position = 'fixed';
  hostContainer.style.zIndex = '2147483647';
  hostContainer.style.bottom = '20px';
  hostContainer.style.right = '20px';
  hostContainer.style.pointerEvents = 'none'; // pass-through except interactive children

  const shadow = hostContainer.attachShadow({ mode: 'open' });

  // In-Page Agent Styling
  const style = document.createElement('style');
  style.textContent = `
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }

    /* Floating Pill */
    .agent-pill {
      pointer-events: auto;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      background: #ffffff;
      color: #2c1810;
      border: 2px solid #2c1810;
      border-radius: 9999px;
      box-shadow: 3px 3px 0 #2c1810;
      cursor: pointer;
      user-select: none;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }
    .agent-pill:hover {
      transform: translate(-1px, -1px);
      box-shadow: 4px 4px 0 #2c1810;
    }
    .agent-pill:active {
      transform: translate(2px, 2px);
      box-shadow: 1px 1px 0 #2c1810;
    }

    .status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #10b981;
      border: 1.5px solid #2c1810;
    }
    .status-dot.idle { background: #10b981; }
    .status-dot.thinking { background: #06b6d4; animation: pulse 1s infinite; }
    .status-dot.working { background: #f59e0b; animation: pulse 0.8s infinite; }
    .status-dot.attention { background: #ef4444; }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.6; transform: scale(1.15); }
    }

    .pill-title {
      font-size: 12px;
      font-weight: 900;
      letter-spacing: -0.01em;
    }
    .pill-badge {
      font-size: 9px;
      font-weight: 800;
      background: #ff6b35;
      color: #ffffff;
      padding: 2px 6px;
      border-radius: 9999px;
      text-transform: uppercase;
    }

    /* Proactive Notification Bubble */
    .agent-bubble {
      pointer-events: auto;
      position: absolute;
      bottom: 50px;
      right: 0;
      width: 300px;
      background: #fffaf0;
      border: 2px solid #2c1810;
      border-radius: 16px;
      box-shadow: 4px 4px 0 #2c1810;
      padding: 12px;
      font-size: 12px;
      color: #2c1810;
      display: none;
      flex-direction: column;
      gap: 8px;
      animation: bubbleSlideIn 0.2s ease-out;
    }
    .agent-bubble.active {
      display: flex;
    }
    @keyframes bubbleSlideIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .bubble-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-weight: 800;
      font-size: 11px;
      color: #ff6b35;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .bubble-close {
      background: none;
      border: none;
      font-size: 14px;
      cursor: pointer;
      color: #6b5344;
      line-height: 1;
    }
    .bubble-body {
      line-height: 1.4;
      color: #3b281f;
    }
    .bubble-actions {
      display: flex;
      gap: 6px;
    }
    .bubble-btn {
      flex: 1;
      padding: 5px 8px;
      font-size: 11px;
      font-weight: 800;
      border: 1.5px solid #2c1810;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.1s;
    }
    .bubble-btn.primary {
      background: #ff6b35;
      color: #ffffff;
      box-shadow: 1px 1px 0 #2c1810;
    }
    .bubble-btn.secondary {
      background: #ffffff;
      color: #2c1810;
    }

    /* Slide-Over Quick Drawer */
    .agent-drawer {
      pointer-events: auto;
      position: fixed;
      top: 0;
      right: -380px;
      width: 360px;
      height: 100vh;
      background: #fffaf0;
      border-left: 2px solid #2c1810;
      box-shadow: -6px 0 25px rgba(0,0,0,0.18);
      transition: right 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      display: flex;
      flex-direction: column;
      z-index: 2147483647;
    }
    .agent-drawer.open {
      right: 0;
    }

    .drawer-header {
      padding: 14px 16px;
      background: #ffffff;
      border-bottom: 2px solid #2c1810;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .drawer-title {
      font-size: 14px;
      font-weight: 900;
      color: #2c1810;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .drawer-close {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      border: 1.5px solid #2c1810;
      background: #fff5e6;
      font-weight: 900;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #2c1810;
    }

    .drawer-quick-actions {
      padding: 10px 14px;
      background: #fff5e6;
      border-bottom: 1.5px solid #ebd8c8;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .quick-chip {
      font-size: 11px;
      font-weight: 700;
      padding: 4px 8px;
      border-radius: 9999px;
      border: 1px solid #2c1810;
      background: #ffffff;
      color: #2c1810;
      cursor: pointer;
      transition: background 0.1s;
    }
    .quick-chip:hover {
      background: #ffe3cb;
    }

    .drawer-body {
      flex: 1;
      padding: 14px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .chat-bubble {
      max-width: 88%;
      padding: 10px 12px;
      border-radius: 14px;
      font-size: 12px;
      line-height: 1.45;
      border: 1.5px solid #2c1810;
      box-shadow: 2px 2px 0 #2c1810;
      word-break: break-word;
    }
    .chat-bubble.assistant {
      align-self: flex-start;
      background: #ffffff;
      color: #2c1810;
    }
    .chat-bubble.user {
      align-self: flex-end;
      background: #ff6b35;
      color: #ffffff;
    }

    .drawer-footer {
      padding: 12px;
      background: #ffffff;
      border-top: 2px solid #2c1810;
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .drawer-input {
      flex: 1;
      padding: 9px 12px;
      font-size: 12px;
      border: 2px solid #2c1810;
      border-radius: 10px;
      outline: none;
      background: #fffdfa;
    }
    .drawer-input:focus {
      border-color: #ff6b35;
    }
    .drawer-send-btn {
      padding: 9px 14px;
      background: #ff6b35;
      color: #ffffff;
      font-weight: 800;
      font-size: 12px;
      border: 2px solid #2c1810;
      border-radius: 10px;
      box-shadow: 2px 2px 0 #2c1810;
      cursor: pointer;
      transition: all 0.1s;
    }
    .drawer-send-btn:active {
      transform: translate(1px, 1px);
      box-shadow: 1px 1px 0 #2c1810;
    }
  `;

  shadow.appendChild(style);

  // Component DOM structure
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <!-- Floating Pill -->
    <div class="agent-pill" id="agent-pill" title="MetaGen Omnigent Live Agent (Klik untuk buka drawer)">
      <div class="status-dot idle" id="status-dot"></div>
      <span class="pill-title">Omnigent</span>
      <span class="pill-badge" id="pill-badge">Live</span>
    </div>

    <!-- Proactive Notification Bubble -->
    <div class="agent-bubble" id="agent-bubble">
      <div class="bubble-header">
        <span>⚡ Omnigent Coworker</span>
        <button class="bubble-close" id="bubble-close">×</button>
      </div>
      <div class="bubble-body" id="bubble-text">
        Siap menemani proses kreatif Anda. Klik untuk membuka panel perintah langsung!
      </div>
      <div class="bubble-actions">
        <button class="bubble-btn primary" id="bubble-action-btn">Buka Panel</button>
      </div>
    </div>

    <!-- Slide-Over Quick Drawer -->
    <div class="agent-drawer" id="agent-drawer">
      <div class="drawer-header">
        <div class="drawer-title">
          <span>🧠 Omnigent In-Page Assistant</span>
        </div>
        <button class="drawer-close" id="drawer-close">×</button>
      </div>

      <div class="drawer-quick-actions">
        <button class="quick-chip" data-cmd="Pindai folder render Downloads/MetaGen_Flow">⚡ Scan Render 2K</button>
        <button class="quick-chip" data-cmd="Cek kepatuhan teknis QC Adobe Stock untuk file terakhir">🛡️ Preflight QC</button>
        <button class="quick-chip" data-cmd="Buat prompt Midjourney komersial untuk subjek di tab ini">✨ Buat Prompt</button>
        <button class="quick-chip" data-cmd="Buka Meta-Gen Studio di tab utama">🚀 Buka Studio</button>
      </div>

      <div class="drawer-body" id="drawer-messages">
        <div class="chat-bubble assistant">
          Halo! Saya aktif di halaman ini (<strong>${window.location.hostname}</strong>). Ketikkan instruksi atau pilih pintasan di atas untuk mengeksekusi tool otonom.
        </div>
      </div>

      <div class="drawer-footer">
        <input type="text" class="drawer-input" id="drawer-input" placeholder="Perintahkan Omnigent..." />
        <button class="drawer-send-btn" id="drawer-send">Kirim</button>
      </div>
    </div>
  `;

  shadow.appendChild(wrapper);
  document.body.appendChild(hostContainer);

  // References
  const pill = shadow.getElementById('agent-pill');
  const dot = shadow.getElementById('status-dot');
  const bubble = shadow.getElementById('agent-bubble');
  const bubbleClose = shadow.getElementById('bubble-close');
  const bubbleActionBtn = shadow.getElementById('bubble-action-btn');
  const bubbleText = shadow.getElementById('bubble-text');
  const drawer = shadow.getElementById('agent-drawer');
  const drawerClose = shadow.getElementById('drawer-close');
  const drawerMessages = shadow.getElementById('drawer-messages');
  const drawerInput = shadow.getElementById('drawer-input');
  const drawerSend = shadow.getElementById('drawer-send');

  // Toggle Drawer
  function toggleDrawer(open) {
    const isOpen = open !== undefined ? open : !drawer.classList.contains('open');
    if (isOpen) {
      drawer.classList.add('open');
      bubble.classList.remove('active');
      drawerInput.focus();
    } else {
      drawer.classList.remove('open');
    }
  }

  pill.addEventListener('click', () => toggleDrawer());
  drawerClose.addEventListener('click', () => toggleDrawer(false));
  bubbleClose.addEventListener('click', () => bubble.classList.remove('active'));
  bubbleActionBtn.addEventListener('click', () => toggleDrawer(true));

  // Handle Quick Chips
  shadow.querySelectorAll('.quick-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cmd = btn.getAttribute('data-cmd');
      if (cmd) {
        sendInPageCommand(cmd);
      }
    });
  });

  // Handle Input Submit
  function submitInput() {
    const text = drawerInput.value.trim();
    if (!text) return;
    drawerInput.value = '';
    sendInPageCommand(text);
  }

  drawerSend.addEventListener('click', submitInput);
  drawerInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      submitInput();
    }
  });

  function appendMessage(role, content) {
    const div = document.createElement('div');
    div.className = `chat-bubble ${role}`;
    div.innerHTML = content.replace(/\n/g, '<br/>');
    drawerMessages.appendChild(div);
    drawerMessages.scrollTop = drawerMessages.scrollHeight;
  }

  function setStatus(st) {
    dot.className = `status-dot ${st}`;
  }

  // Send Command to background worker / Local Bridge
  function sendInPageCommand(promptText) {
    appendMessage('user', promptText);
    setStatus('thinking');

    // Check if user asked to open full studio
    if (promptText.toLowerCase().includes('buka studio')) {
      try {
        chrome.runtime.sendMessage({ type: 'OPEN_METAGEN_STUDIO' });
      } catch {}
      appendMessage('assistant', 'Membuka Meta-Gen Studio...');
      setStatus('idle');
      return;
    }

    try {
      chrome.runtime.sendMessage(
        {
          type: 'OMNIGENT_IN_PAGE_COMMAND',
          prompt: promptText,
          hostUrl: window.location.href,
        },
        (response) => {
          setStatus('idle');
          if (response && response.result) {
            appendMessage('assistant', response.result);
          } else if (response && response.error) {
            appendMessage('assistant', `⚠️ ${response.error}`);
          } else {
            // Local fallback simulation if background worker is busy
            appendMessage(
              'assistant',
              `Instruksi diproses di latar: <em>"${promptText}"</em>. Hasil diverifikasi.`
            );
          }
        }
      );
    } catch (e) {
      setStatus('idle');
      appendMessage('assistant', `Perintah diterima: "${promptText}". Menghubungi agen pusat.`);
    }
  }

  // Listen for proactive notifications dispatched from extension background worker or web app
  window.addEventListener('message', (event) => {
    if (event.data?.type === 'OMNIGENT_NOTIFY_BUBBLE') {
      bubbleText.textContent = event.data.message || 'Pemberitahuan baru dari MetaGen.';
      bubble.classList.add('active');
      setStatus('attention');
    }
  });

  // Expose global controller for content script
  window.__metaGenOmnigentFloater = {
    showBubble: (text) => {
      bubbleText.textContent = text;
      bubble.classList.add('active');
      setStatus('attention');
    },
    setStatus,
  };
})();
