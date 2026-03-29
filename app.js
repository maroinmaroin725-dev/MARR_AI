// app.js - منطق الواجهة، إدارة المحادثات، إرسال الطلبات (محلي أو عبر بروكسي)
// يعتمد على storage.js (encrypt/decrypt/storePlain/getPlain)

//
// DOM elements
//
const chatArea = document.getElementById('chat-area');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const typingEl = document.getElementById('typing');
const chatListEl = document.getElementById('chat-list');
const newChatBtn = document.getElementById('new-chat-btn');
const settingsOpenBtn = document.getElementById('settings-open');
const modalBackdrop = document.getElementById('modal-backdrop');
const modalClose = document.getElementById('modal-close');
const saveSettingsBtn = document.getElementById('save-settings');
const storageMethod = document.getElementById('storage-method');
const encPass = document.getElementById('enc-pass');
const storeKeyEncryptedBtn = document.getElementById('store-key-encrypted');
const apiKeyPlain = document.getElementById('api-key-plain');
const storePlainBtn = document.getElementById('store-key-plain');
const proxyUrl = document.getElementById('proxy-url');
const storeKeyServerBtn = document.getElementById('store-key-server');
const adminToken = document.getElementById('admin-token');
const exportBtn = document.getElementById('export-chats');
const importBtn = document.getElementById('import-chats');
const importFile = document.getElementById('import-file');
const clearStorageBtn = document.getElementById('clear-storage');
const searchInput = document.getElementById('search-input');
const providerSelect = document.getElementById('provider-select');
const openaiKeyInput = document.getElementById('openai-key');
const storeOpenAIPlainBtn = document.getElementById('store-openai-plain');

const SETTINGS_KEY = 'marr_front_settings_v1';
const CHATS_KEY = 'marr_chats_v1';
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// marked + DOMPurify + highlight
marked.setOptions({ breaks: true });
function renderMd(md) {
  const raw = marked.parse(md || '');
  const sanitized = DOMPurify.sanitize(raw, {ALLOWED_ATTR:['href','target','class']});
  const container = document.createElement('div');
  container.innerHTML = sanitized;
  container.querySelectorAll('pre code').forEach((block) => {
    try { hljs.highlightElement(block); } catch(e) {}
  });
  return container.innerHTML;
}

//
// Settings load/save and UI toggles
//
function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    if(s.storageMethod) storageMethod.value = s.storageMethod;
    if(s.proxyUrl) proxyUrl.value = s.proxyUrl;
    if(s.provider) providerSelect.value = s.provider;
    if(s.openaiKeyPlain) openaiKeyInput.value = s.openaiKeyPlain;
  } catch(e) {}
  toggleSettingsRows();
}
function saveSettings() {
  const s = {
    storageMethod: storageMethod.value,
    proxyUrl: proxyUrl.value,
    provider: providerSelect.value,
    openaiKeyPlain: openaiKeyInput.value || ''
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  showToast('تم حفظ إعدادات الواجهة');
  closeModal();
}
function toggleSettingsRows() {
  const method = storageMethod.value;
  document.querySelectorAll('.encrypted-row').forEach(el => el.style.display = method === 'encrypted-local' ? 'flex' : 'none');
  document.querySelectorAll('.plain-row').forEach(el => el.style.display = method === 'plain-local' ? 'flex' : 'none');
  document.querySelectorAll('.server-row').forEach(el => el.style.display = method === 'server-proxy' ? 'flex' : 'none');
}

//
// Toast
//
function showToast(msg, t=2000){
  const d = document.createElement('div');
  d.textContent = msg;
  d.style.position='fixed';
  d.style.left='50%';
  d.style.transform='translateX(-50%)';
  d.style.bottom='24px';
  d.style.background='rgba(0,0,0,0.7)';
  d.style.color='#fff';
  d.style.padding='8px 12px';
  d.style.borderRadius='8px';
  d.style.zIndex=9999;
  document.body.appendChild(d);
  setTimeout(()=> d.remove(), t);
}

//
// Chats state and functions
//
let chats = [];
let activeChatId = null;

function loadChats() {
  try { chats = JSON.parse(localStorage.getItem(CHATS_KEY) || '[]'); } catch(e){ chats = []; }
  renderChatList();
}
function saveChats() { localStorage.setItem(CHATS_KEY, JSON.stringify(chats)); renderChatList(); }
function createNewChat(title='محادثة جديدة') {
  const id = 'c_' + Date.now();
  const chat = { id, title, messages: [], created: Date.now(), pinned:false };
  chats.unshift(chat);
  saveChats();
  openChat(id);
}
function openChat(id) {
  activeChatId = id;
  renderChatList();
  const chat = chats.find(c=>c.id===id);
  chatArea.innerHTML = '';
  if(!chat) return;
  chat.messages.forEach(m => appendMessageToUI(m.role, m.text, m.ts));
}
function appendMessageToChat(role, text) {
  if(!activeChatId) createNewChat();
  const chat = chats.find(c=>c.id===activeChatId);
  const msg = { role, text, ts: Date.now() };
  chat.messages.push(msg);
  saveChats();
  appendMessageToUI(role, text, msg.ts);
}
function renameChat(id, title) {
  const c = chats.find(x=>x.id===id); if(c){ c.title = title; saveChats(); }
}
function deleteChat(id) {
  if(!confirm('حذف المحادثة نهائياً؟')) return;
  chats = chats.filter(c=>c.id!==id);
  saveChats();
  if(activeChatId === id) { chatArea.innerHTML=''; activeChatId=null; if(chats[0]) openChat(chats[0].id); }
}

//
// Render chat list and message UI (with copy buttons & appear animation)
//
function renderChatList(filter='') {
  chatListEl.innerHTML = '';
  const list = chats.filter(c => c.title.includes(filter) || (c.messages && c.messages.some(m => m.text.includes(filter))));
  list.forEach(c => {
    const el = document.createElement('div');
    el.className = 'chat-item' + (c.id===activeChatId ? ' active' : '');
    el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;">
      <div style="font-weight:600;">${escapeHtml(c.title)}</div>
      <div class="small">${new Date(c.created).toLocaleDateString('ar-EG')}</div>
    </div>`;
    el.addEventListener('click', ()=> openChat(c.id));
    el.addEventListener('contextmenu', (e)=> {
      e.preventDefault();
      showChatContextMenu(c, e.clientX, e.clientY);
    });
    chatListEl.appendChild(el);
  });
}

function showChatContextMenu(chat, x, y) {
  const menu = document.createElement('div');
  menu.style.position='fixed'; menu.style.left=x+'px'; menu.style.top=y+'px'; menu.style.zIndex=9999;
  menu.style.background='var(--panel)'; menu.style.border='1px solid var(--glass)'; menu.style.padding='6px'; menu.style.borderRadius='8px';
  menu.innerHTML = `<div style="padding:6px;cursor:pointer;">إعادة تسمية</div><div style="padding:6px;cursor:pointer;">حذف</div><div style="padding:6px;cursor:pointer;">تصدير</div>`;
  menu.children[0].addEventListener('click', ()=> {
    const title = prompt('اكتب عنوان المحادثة:', chat.title);
    if(title) renameChat(chat.id, title);
    menu.remove();
  });
  menu.children[1].addEventListener('click', ()=> { deleteChat(chat.id); menu.remove(); });
  menu.children[2].addEventListener('click', ()=> { exportSingleChat(chat.id); menu.remove(); });
  document.body.appendChild(menu);
  document.addEventListener('click', ()=> menu.remove(), { once: true });
}

function appendMessageToUI(role, text, ts=Date.now()) {
  const wrapper = document.createElement('div'); wrapper.className = 'message' + (role==='user' ? ' you' : '');
  const avatar = document.createElement('div'); avatar.className = 'avatar ' + (role==='user' ? 'user-avatar' : 'ai-avatar');
  avatar.innerHTML = role==='user' ? '<i class="fa-solid fa-user"></i>' : '<i class="fa-solid fa-bolt"></i>';

  const bubble = document.createElement('div'); bubble.className = 'bubble new'; // add new for animation
  bubble.innerHTML = renderMd(text);

  // tools (copy)
  const tools = document.createElement('div'); tools.className = 'msg-tools';
  const copyBtn = document.createElement('button'); copyBtn.className = 'msg-tool-btn'; copyBtn.title = 'نسخ النص';
  copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i>';
  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(()=> showToast('تم نسخ النص'));
  });

  const copyPlainBtn = document.createElement('button'); copyPlainBtn.className = 'msg-tool-btn'; copyPlainBtn.title = 'نسخ بدون تنسيق';
  copyPlainBtn.innerHTML = '<i class="fa-solid fa-file-lines"></i>';
  copyPlainBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    // strip markdown to plain text by creating temporary element and reading textContent of sanitized HTML
    const tmp = document.createElement('div');
    tmp.innerHTML = DOMPurify.sanitize(marked.parse(text));
    navigator.clipboard.writeText(tmp.textContent || tmp.innerText || text).then(()=> showToast('تم النسخ كنص عادي'));
  });

  tools.appendChild(copyBtn);
  tools.appendChild(copyPlainBtn);
  bubble.appendChild(tools);

  const meta = document.createElement('div'); meta.className='meta'; meta.textContent = new Date(ts).toLocaleTimeString('ar-EG', {hour:'2-digit',minute:'2-digit'});
  bubble.appendChild(meta);

  wrapper.appendChild(avatar); wrapper.appendChild(bubble);
  chatArea.appendChild(wrapper);
  chatArea.scrollTop = chatArea.scrollHeight;

  // remove animation class after short time
  setTimeout(()=> bubble.classList.remove('new'), 800);
}

function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

//
// Export/Import
//
function exportChats() {
  const data = JSON.stringify({ exportedAt: Date.now(), chats }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'marr_chats_export.json'; a.click(); URL.revokeObjectURL(url);
}
function exportSingleChat(id) {
  const c = chats.find(x=>x.id===id);
  if(!c) return;
  const data = JSON.stringify(c, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `${c.title.replace(/\s+/g,'_')}.json`; a.click(); URL.revokeObjectURL(url);
}
function importChatsFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const obj = JSON.parse(e.target.result);
      if(Array.isArray(obj.chats)) {
        chats = obj.chats.concat(chats);
      } else if(obj.id && obj.messages) {
        chats.unshift(obj);
      }
      saveChats();
      showToast('تم استيراد المحادثات');
    } catch(err){ showToast('ملف غير صالح'); }
  };
  reader.readAsText(file);
}

//
// Helper: retrieve API key according to chosen storage method (works for both Google & OpenAI keys)
//
async function resolveStoredApiKey() {
  const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  const method = settings.storageMethod || storageMethod.value;
  // priority: openai-key if provider openai and openaiKeyPlain present
  const provider = settings.provider || providerSelect.value || 'google';
  if(provider === 'openai') {
    // try stored openai key in settings plain
    if(settings.openaiKeyPlain) return settings.openaiKeyPlain;
    // otherwise fall through to stored generic key
  }

  if(method === 'plain-local') {
    return getPlainKey();
  } else if(method === 'encrypted-local') {
    const pass = sessionStorage.getItem('marr_enc_pass') || encPass.value;
    if(!pass) {
      const p = prompt('أدخل كلمة مرور التشفير لفك المفتاح:');
      if(!p) return null;
      sessionStorage.setItem('marr_enc_pass', p);
    }
    const key = await decryptKeyWithPassphrase(sessionStorage.getItem('marr_enc_pass') || encPass.value);
    return key;
  } else {
    // server-proxy doesn't expose key to client
    return null;
  }
}

//
// sendMessage(): supports Google and OpenAI providers (client-side). For server proxy use, follow proxy path.
//
async function sendMessage() {
  const text = userInput.value.trim(); if(!text) return;
  if(!activeChatId) createNewChat();
  appendMessageToChat('user', text);
  userInput.value = '';
  typingEl.style.display = 'inline-block';
  sendBtn.disabled = true;

  const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  const provider = settings.provider || providerSelect.value || 'google';
  const method = settings.storageMethod || storageMethod.value;

  try {
    // If using server proxy and provider is Google, call proxy /generate (proxy must be configured)
    if(method === 'server-proxy') {
      const proxy = settings.proxyUrl || proxyUrl.value;
      if(!proxy) throw new Error('حدد عنوان بروكسي في الإعدادات');
      const url = proxy.replace(/\/$/,'') + '/generate';
      const payload = {
        contents: [{ parts: [{ text }] }],
        systemInstruction: { parts: [{ text: 'أنت MARR، تحدث بالعربية الفصحى وباحترام. إذا طُلب كوداً قدمه منسقاً.' }] },
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
      };
      const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      if(!res.ok) throw new Error('خطأ في الخادم البروكسي');
      const data = await res.json();
      const aiText = extractAiText(data);
      appendMessageToChat('ai', aiText);
      return;
    }

    // Else resolve key locally (may return null for server-proxy)
    const apiKey = await resolveStoredApiKey();
    if(!apiKey) throw new Error('لا يوجد مفتاح API متاح أو يتطلب استخدام بروكسي');

    if(provider === 'google') {
      const model = (settings.model || 'gemini-flash-latest');
      const url = `${API_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const payload = {
        contents: [{ parts: [{ text }] }],
        systemInstruction: { parts: [{ text: 'أنت MARR، تحدث بالعربية الفصحى وباحترام. إذا طُلب كوداً قدمه منسقاً.' }] },
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
      };
      const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      if(!res.ok) {
        const t = await res.text(); console.error('api error', t);
        appendMessageToChat('ai', `عذراً، خطأ في استجابة الـ API (${res.status}).`);
      } else {
        const data = await res.json();
        const aiText = extractAiText(data);
        appendMessageToChat('ai', aiText);
      }
    } else if(provider === 'openai') {
      // OpenAI Chat Completions
      const model = (settings.openaiModel || 'gpt-3.5-turbo');
      const url = 'https://api.openai.com/v1/chat/completions';
      const payload = {
        model,
        messages: [
          { role: 'system', content: 'أنت MARR، تحدث بالعربية الفصحى وباحترام. إذا طُلب كوداً قدمه منسقاً.' },
          { role: 'user', content: text }
        ],
        max_tokens: 1024,
        temperature: 0.7
      };
      const res = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization': `Bearer ${apiKey}` }, body: JSON.stringify(payload) });
      if(!res.ok) {
        const txt = await res.text();
        console.error('OpenAI error', res.status, txt);
        appendMessageToChat('ai', `عذراً، خطأ من OpenAI (${res.status}).`);
      } else {
        const data = await res.json();
        const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        appendMessageToChat('ai', content || 'لم يتم الحصول على نص من OpenAI');
      }
    } else {
      throw new Error('مزود غير مدعوم');
    }

  } catch (err) {
    console.error(err);
    appendMessageToChat('ai', 'عذراً، لم نستطع معالجة الطلب: ' + (err.message || err));
  } finally {
    typingEl.style.display='none'; sendBtn.disabled=false;
  }
}

function extractAiText(data) {
  try {
    if(data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
      return data.candidates[0].content.parts.map(p=>p.text).join('\n');
    } else if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
      return data.choices[0].message.content;
    } else if (data.output && Array.isArray(data.output) && data.output[0] && data.output[0].content) {
      return JSON.stringify(data.output[0].content);
    } else {
      return 'استجابة غير متوقعة من الخادم.';
    }
  } catch(e) { return 'خطأ في تحليل الاستجابة.'; }
}

//
// Event bindings
//
sendBtn.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', (e)=> { if(e.key==='Enter') sendMessage(); });
newChatBtn.addEventListener('click', ()=> createNewChat());
settingsOpenBtn.addEventListener('click', ()=> { modalBackdrop.style.display='flex'; modalBackdrop.setAttribute('aria-hidden','false'); });
modalClose.addEventListener('click', ()=> { modalBackdrop.style.display='none'; modalBackdrop.setAttribute('aria-hidden','true'); });
saveSettingsBtn.addEventListener('click', saveSettings);
storageMethod.addEventListener('change', toggleSettingsRows);
storeKeyEncryptedBtn.addEventListener('click', async ()=> {
  const pass = encPass.value || prompt('أدخل كلمة مرور للتشفير (لا تحفظها للآخرين):');
  if(!pass) return showToast('كلمة مرور مطلوبة');
  const api = prompt('أدخل مفتاح الـ API الآن:');
  if(!api) return showToast('مفتاح مطلوب');
  await encryptAndStoreKey(pass, api);
  showToast('تم حفظ المفتاح مشفراً');
});
storePlainBtn.addEventListener('click', ()=> {
  const api = apiKeyPlain.value || prompt('أدخل مفتاح الـ API ليتم حفظه محلياً (غير آمن):');
  if(!api) return;
  storePlainKey(api);
  showToast('تم حفظ المفتاح محلياً (غير آمن)');
});
storeKeyServerBtn.addEventListener('click', async ()=> {
  const proxy = proxyUrl.value || prompt('أدخل عنوان الخادم البروكسي:');
  const token = adminToken.value || prompt('أدخل التوكن الإداري للتوثيق');
  const api = prompt('أدخل مفتاح الـ API ليُرفع للخادم');
  if(!proxy || !token || !api) return showToast('مطلوب: بروكسي + توكن + مفتاح');
  try {
    const res = await fetch(proxy.replace(/\/$/,'') + '/set-key', {
      method:'POST',
      headers: {'Content-Type':'application/json', 'x-admin-token': token},
      body: JSON.stringify({ apiKey: api })
    });
    if(!res.ok) throw new Error('fail');
    showToast('تم رفع المفتاح إلى الخادم');
  } catch(e) { showToast('فشل رفع المفتاح إلى الخادم'); }
});

storeOpenAIPlainBtn.addEventListener('click', ()=> {
  const k = openaiKeyInput.value || prompt('أدخل مفتاح OpenAI:');
  if(!k) return;
  const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  s.openaiKeyPlain = k;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  showToast('تم حفظ مفتاح OpenAI في الإعدادات (محلي)');
});

exportBtn.addEventListener('click', exportChats);
importBtn.addEventListener('click', ()=> importFile.click());
importFile.addEventListener('change', (e)=> { if(e.target.files && e.target.files[0]) importChatsFile(e.target.files[0]); });
clearStorageBtn.addEventListener('click', ()=> { if(confirm('حذف كل المحادثات؟')) { localStorage.removeItem(CHATS_KEY); chats=[]; renderChatList(); chatArea.innerHTML=''; showToast('تم الحذف'); }});
searchInput.addEventListener('input', (e)=> renderChatList(e.target.value));

// init
(function init(){
  loadSettings();
  try{ chats = JSON.parse(localStorage.getItem(CHATS_KEY) || '[]'); }catch(e){ chats = []; }
  if(!chats.length) createNewChat('المحادثة الرئيسية');
  else openChat(chats[0].id);
})();