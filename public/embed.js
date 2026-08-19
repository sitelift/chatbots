(function () {
  'use strict';

  var VERSION = '0.1.0';
  var ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var DEFAULT_COLOR = '#0f172a';
  var styleInjected = false;
  var instance = null;

  var CSS = [
    '.sitelift-root, .sitelift-root * { box-sizing: border-box; }',
    '.sitelift-root { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.45; color: #1e293b; text-align: left; }',
    '.sitelift-root button { font-family: inherit; font-size: inherit; }',
    '.sitelift-root button:focus { outline: none; }',
    '.sitelift-bubble { position: fixed; bottom: 20px; z-index: 2147483000; width: 56px; height: 56px; border-radius: 50%; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #ffffff; background: var(--sitelift-brand, #0f172a); box-shadow: 0 4px 14px rgba(15, 23, 42, 0.25); transition: transform 0.15s ease, box-shadow 0.15s ease; }',
    '.sitelift-bubble:hover { transform: scale(1.06); box-shadow: 0 6px 20px rgba(15, 23, 42, 0.32); }',
    '.sitelift-bubble-bottom-right { right: 20px; }',
    '.sitelift-bubble-bottom-left { left: 20px; }',
    '.sitelift-panel { position: fixed; bottom: 88px; z-index: 2147483000; width: 380px; max-width: calc(100vw - 40px); height: 560px; max-height: calc(100vh - 110px); background: #ffffff; border-radius: 16px; box-shadow: 0 12px 40px rgba(15, 23, 42, 0.2); display: flex; flex-direction: column; overflow: hidden; opacity: 0; visibility: hidden; transform: translateY(14px) scale(0.98); transform-origin: bottom right; transition: opacity 0.18s ease, transform 0.18s ease, visibility 0.18s; }',
    '.sitelift-panel-bottom-right { right: 20px; }',
    '.sitelift-panel-bottom-left { left: 20px; transform-origin: bottom left; }',
    '.sitelift-panel.sitelift-open { opacity: 1; visibility: visible; transform: translateY(0) scale(1); }',
    '.sitelift-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; color: #ffffff; background: var(--sitelift-brand, #0f172a); flex-shrink: 0; }',
    '.sitelift-header-title { font-weight: 600; font-size: 15px; }',
    '.sitelift-close { background: transparent; border: none; cursor: pointer; color: inherit; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 8px; opacity: 0.85; padding: 0; }',
    '.sitelift-close:hover { background: rgba(255, 255, 255, 0.15); opacity: 1; }',
    '.sitelift-messages { flex: 1 1 auto; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; background: #f8fafc; }',
    '.sitelift-msg { max-width: 82%; padding: 10px 14px; border-radius: 14px; word-wrap: break-word; overflow-wrap: break-word; white-space: pre-wrap; }',
    '.sitelift-msg-assistant { align-self: flex-start; background: #ffffff; color: #1e293b; border: 1px solid #e2e8f0; border-bottom-left-radius: 4px; }',
    '.sitelift-msg-user { align-self: flex-end; background: var(--sitelift-brand, #0f172a); color: #ffffff; border-bottom-right-radius: 4px; }',
    '.sitelift-msg-error { align-self: flex-start; background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; font-size: 13px; }',
    '.sitelift-typing { display: inline-flex; align-items: center; gap: 4px; align-self: flex-start; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; border-bottom-left-radius: 4px; padding: 12px 14px; }',
    '.sitelift-dot { width: 6px; height: 6px; border-radius: 50%; background: #94a3b8; animation: sitelift-blink 1.2s infinite ease-in-out; }',
    '.sitelift-dot:nth-child(2) { animation-delay: 0.15s; }',
    '.sitelift-dot:nth-child(3) { animation-delay: 0.3s; }',
    '@keyframes sitelift-blink { 0%, 80%, 100% { opacity: 0.25; } 40% { opacity: 1; } }',
    '.sitelift-composer { display: flex; align-items: flex-end; gap: 8px; padding: 12px; border-top: 1px solid #e2e8f0; background: #ffffff; flex-shrink: 0; }',
    '.sitelift-input { flex: 1 1 auto; border: 1px solid #e2e8f0; border-radius: 20px; padding: 10px 14px; font-size: 14px; font-family: inherit; resize: none; outline: none; background: #ffffff; color: #1e293b; max-height: 120px; }',
    '.sitelift-input:focus { border-color: var(--sitelift-brand, #0f172a); }',
    '.sitelift-input:disabled { background: #f1f5f9; color: #94a3b8; }',
    '.sitelift-send { border: none; border-radius: 50%; width: 40px; height: 40px; cursor: pointer; color: #ffffff; background: var(--sitelift-brand, #0f172a); display: flex; align-items: center; justify-content: center; flex-shrink: 0; padding: 0; }',
    '.sitelift-send:hover { filter: brightness(1.08); }',
    '.sitelift-send:disabled { opacity: 0.5; cursor: not-allowed; }',
    '.sitelift-notice { padding: 12px 14px; border-radius: 12px; background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; font-size: 13px; }'
  ].join('');

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }

  function storageSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) {}
  }

  function visitorKey(id) { return 'sitelift:visitorId:' + id; }
  function conversationKey(id) { return 'sitelift:conversationId:' + id; }

  function randomToken(len) {
    var bytes = new Uint8Array(len);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      for (var i = 0; i < len; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    }
    var token = '';
    for (var j = 0; j < len; j += 1) token += ID_ALPHABET[bytes[j] % ID_ALPHABET.length];
    return token;
  }

  function generateVisitorId() { return 'v_' + randomToken(22); }

  function loadVisitorId(chatbotId, provided) {
    var key = visitorKey(chatbotId);
    if (provided) { storageSet(key, provided); return provided; }
    var existing = storageGet(key);
    if (existing) return existing;
    var fresh = generateVisitorId();
    storageSet(key, fresh);
    return fresh;
  }

  function injectStyle() {
    if (styleInjected) return;
    if (document.getElementById('sitelift-style')) { styleInjected = true; return; }
    var style = document.createElement('style');
    style.id = 'sitelift-style';
    style.textContent = CSS;
    document.head.appendChild(style);
    styleInjected = true;
  }

  function errorText(status) {
    if (status === 429) return "You're sending messages too fast. Please wait a moment.";
    if (status === 502) return "Sorry, I couldn't reach the assistant right now.";
    if (status === 410) return 'This chat is currently offline.';
    return 'Something went wrong. Please try again.';
  }

  function Widget(config) {
    this.chatbotId = config.chatbotId;
    this.position = config.position;
    this.origin = config.origin;
    this.visitorId = config.visitorId;
    this.conversationId = storageGet(conversationKey(config.chatbotId));
    this.sending = false;
    this.isOpen = false;
    this.root = null;
    this.bubble = null;
    this.panel = null;
    this.title = null;
    this.messages = null;
    this.input = null;
    this.sendBtn = null;
    this.typingEl = null;
  }

  Widget.prototype.build = function () {
    injectStyle();

    var root = el('div', 'sitelift-root');
    root.style.setProperty('--sitelift-brand', DEFAULT_COLOR);

    var bubble = el('button', 'sitelift-bubble sitelift-bubble-' + this.position);
    bubble.setAttribute('type', 'button');
    bubble.setAttribute('aria-label', 'Open chat');
    bubble.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';

    var panel = el('div', 'sitelift-panel sitelift-panel-' + this.position);
    panel.setAttribute('role', 'dialog');

    var header = el('div', 'sitelift-header');
    var title = el('div', 'sitelift-header-title', 'Chat');
    var close = el('button', 'sitelift-close');
    close.setAttribute('type', 'button');
    close.setAttribute('aria-label', 'Close chat');
    close.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    header.appendChild(title);
    header.appendChild(close);

    var messages = el('div', 'sitelift-messages');

    var composer = el('div', 'sitelift-composer');
    var input = el('textarea', 'sitelift-input');
    input.setAttribute('placeholder', 'Type your message');
    input.setAttribute('rows', '1');
    input.disabled = true;
    var send = el('button', 'sitelift-send');
    send.setAttribute('type', 'button');
    send.setAttribute('aria-label', 'Send message');
    send.disabled = true;
    send.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
    composer.appendChild(input);
    composer.appendChild(send);

    panel.appendChild(header);
    panel.appendChild(messages);
    panel.appendChild(composer);

    root.appendChild(bubble);
    root.appendChild(panel);
    document.body.appendChild(root);

    this.root = root;
    this.bubble = bubble;
    this.panel = panel;
    this.title = title;
    this.messages = messages;
    this.input = input;
    this.sendBtn = send;

    var self = this;
    bubble.addEventListener('click', function () { self.toggle(); });
    close.addEventListener('click', function () { self.close(); });
    send.addEventListener('click', function () { self.send(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); self.send(); }
    });
    input.addEventListener('input', function () { self.autoGrow(); });
  };

  Widget.prototype.boot = function () {
    var self = this;
    fetch(this.origin + '/api/chatbots/' + this.chatbotId, { headers: { Accept: 'application/json' } })
      .then(function (res) {
        if (res.status === 410) { self.disable(); return; }
        if (!res.ok) { self.destroy(); return; }
        res.json().then(function (data) {
          if (data && data.enabled === false) { self.disable(); return; }
          self.activate(data);
        }, function () { self.offline(); });
      })
      .catch(function () { self.offline(); });
  };

  Widget.prototype.activate = function (data) {
    this.title.textContent = data.name || 'Chat';
    this.root.style.setProperty('--sitelift-brand', data.brandColor || DEFAULT_COLOR);
    if (data.welcomeMessage) this.addMessage('assistant', data.welcomeMessage);
    this.input.disabled = false;
    this.sendBtn.disabled = false;
  };

  Widget.prototype.disable = function () {
    this.showNotice('This chat is currently unavailable. Please check back later.');
  };

  Widget.prototype.offline = function () {
    this.showNotice("We couldn't reach the assistant. Please check your connection and try again.");
  };

  Widget.prototype.showNotice = function (text) {
    this.messages.textContent = '';
    this.messages.appendChild(el('div', 'sitelift-notice', text));
    this.input.disabled = true;
    this.sendBtn.disabled = true;
  };

  Widget.prototype.addMessage = function (role, text) {
    var cls = 'sitelift-msg sitelift-msg-' + role;
    var node = el('div', cls, text);
    this.messages.appendChild(node);
    this.scrollToBottom();
  };

  Widget.prototype.showTyping = function () {
    var node = el('div', 'sitelift-typing');
    node.appendChild(el('span', 'sitelift-dot'));
    node.appendChild(el('span', 'sitelift-dot'));
    node.appendChild(el('span', 'sitelift-dot'));
    this.typingEl = node;
    this.messages.appendChild(node);
    this.scrollToBottom();
  };

  Widget.prototype.hideTyping = function () {
    if (this.typingEl && this.typingEl.parentNode) this.typingEl.parentNode.removeChild(this.typingEl);
    this.typingEl = null;
  };

  Widget.prototype.scrollToBottom = function () {
    this.messages.scrollTop = this.messages.scrollHeight;
  };

  Widget.prototype.send = function () {
    var self = this;
    if (this.sending || this.input.disabled) return;
    var content = this.input.value.replace(/^\s+|\s+$/g, '');
    if (!content) return;
    this.addMessage('user', content);
    this.input.value = '';
    this.autoGrow();
    this.showTyping();
    this.sending = true;
    this.sendBtn.disabled = true;

    var body = { visitorId: this.visitorId, content: content };
    if (this.conversationId) body.conversationId = this.conversationId;

    fetch(this.origin + '/api/chat/' + this.chatbotId + '/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (res) {
      if (res.ok) {
        res.json().then(function (data) {
          self.conversationId = data.conversationId;
          storageSet(conversationKey(self.chatbotId), data.conversationId);
          self.hideTyping();
          self.addMessage('assistant', data.reply);
          self.finishSend();
        }, function () {
          self.hideTyping();
          self.addMessage('error', errorText(res.status));
          self.finishSend();
        });
        return;
      }
      self.hideTyping();
      self.addMessage('error', errorText(res.status));
      self.finishSend();
    }).catch(function () {
      self.hideTyping();
      self.addMessage('error', "Sorry, I couldn't reach the assistant. Please try again.");
      self.finishSend();
    });
  };

  Widget.prototype.finishSend = function () {
    this.sending = false;
    if (!this.input.disabled) this.sendBtn.disabled = false;
    this.input.focus();
  };

  Widget.prototype.autoGrow = function () {
    this.input.style.height = 'auto';
    this.input.style.height = Math.min(this.input.scrollHeight, 120) + 'px';
  };

  Widget.prototype.open = function () {
    this.panel.classList.add('sitelift-open');
    this.isOpen = true;
    this.scrollToBottom();
    if (!this.input.disabled) this.input.focus();
  };

  Widget.prototype.close = function () {
    this.panel.classList.remove('sitelift-open');
    this.isOpen = false;
  };

  Widget.prototype.toggle = function () {
    if (this.isOpen) this.close(); else this.open();
  };

  Widget.prototype.destroy = function () {
    if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
    this.root = null;
  };

  function findBootScript() {
    var scripts = document.getElementsByTagName('script');
    for (var i = scripts.length - 1; i >= 0; i -= 1) {
      if (scripts[i].getAttribute && scripts[i].getAttribute('data-chatbot-id')) return scripts[i];
    }
    return null;
  }

  var bootScript = document.currentScript || findBootScript();

  function start() {
    if (!bootScript) return;
    var chatbotId = bootScript.getAttribute('data-chatbot-id') || '';
    if (!chatbotId) return;
    var position = bootScript.getAttribute('data-position') || 'bottom-right';
    if (position !== 'bottom-left' && position !== 'bottom-right') position = 'bottom-right';
    var providedVisitor = bootScript.getAttribute('data-visitor-id') || null;
    var origin = bootScript.src ? new URL(bootScript.src).origin : window.location.origin;
    var visitorId = loadVisitorId(chatbotId, providedVisitor);
    var widget = new Widget({ chatbotId: chatbotId, position: position, origin: origin, visitorId: visitorId });
    widget.build();
    widget.boot();
    instance = widget;
  }

  function init() {
    if (instance) return instance;
    start();
    return instance;
  }

  window.SiteLift = {
    version: VERSION,
    init: init,
    destroy: function () { if (instance) { instance.destroy(); instance = null; } },
    open: function () { if (instance) instance.open(); },
    close: function () { if (instance) instance.close(); }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
