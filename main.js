/* main.js - كلاينت يتعامل مع API و Socket.IO -> تجربة فورية ومحترفة */
const socket = io();

// State
let currentUser = null;
let currentConvId = null;

// Helpers
async function api(path, opts = {}) {
  const res = await fetch(path, { credentials: 'same-origin', ...opts });
  if (res.status === 401) {
    currentUser = null; renderNav(); throw new Error('Not authenticated');
  }
  return res.json();
}

function el(sel) { return document.querySelector(sel); }
function qel(sel) { return document.querySelectorAll(sel); }

function renderNav() {
  const nav = document.getElementById('nav-area');
  nav.innerHTML = '';
  if (!currentUser) {
    const a = document.createElement('a');
    a.className = 'btn btn-outline-light btn-sm';
    a.href = '/auth/google';
    a.innerHTML = '<i class="fa-brands fa-google"></i> تسجيل دخول';
    nav.appendChild(a);
  } else {
    const img = document.createElement('img');
    img.src = currentUser.avatar || '';
    img.width = 36; img.height = 36; img.className = 'rounded-circle me-2';
    const span = document.createElement('span'); span.className = 'text-white me-2'; span.innerText = currentUser.name;
    const btn = document.createElement('button'); btn.className = 'btn btn-sm btn-light'; btn.innerText = 'تسجيل خروج';
    btn.onclick = async () => { await fetch('/auth/logout', { method: 'POST' }); window.location.reload(); };
    nav.appendChild(img); nav.appendChild(span); nav.appendChild(btn);
  }
}

async function loadMe() {
  try {
    const j = await api('/api/me');
    currentUser = j.user;
    renderNav();
    if (currentUser) {
      await loadConversations();
      socket.emit('joinConv', null); // noop - just ensure connected
    }
  } catch (err) {
    console.log('not logged in');
  }
}

async function loadConversations(q = '') {
  if (!currentUser) return;
  const convs = await api('/api/conversations');
  const list = document.getElementById('conversationsList');
  list.innerHTML = '';
  convs.forEach(c => {
    const li = document.createElement('li');
    li.className = 'list-group-item d-flex justify-content-between align-items-center';
    li.innerHTML = `<span>${c.title}</span>
      <div>
        <button class="btn btn-sm btn-outline-secondary me-1" data-id="${c._id}" title="تصدير"><i class="fa-solid fa-file-export"></i></button>
        <button class="btn btn-sm btn-outline-danger" data-id-delete="${c._id}" title="حذف"><i class="fa-solid fa-trash"></i></button>
      </div>`;
    li.onclick = (e) => {
      if (e.target.closest('button')) return;
      selectConversation(c._id, c.title, li);
    };
    // button events
    li.querySelector('[data-id]')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      window.location = `/api/conversations/${c._id}/export`;
    });
    li.querySelector('[data-id-delete]')?.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      if (!confirm('حذف هذه المحادثة؟')) return;
      await api(`/api/conversations/${c._id}`, { method: 'DELETE' });
      await loadConversations();
      if (currentConvId === c._id) { currentConvId = null; document.getElementById('chat').innerHTML = ''; document.getElementById('chatHeader').innerHTML = ''; }
    });
    list.appendChild(li);
  });
}

async function createConversation() {
  const title = prompt('اسم المحادثة (اختياري):', 'محادثة جديدة');
  const res = await api('/api/conversations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
  await loadConversations();
  selectConversation(res._id, res.title);
}

async function selectConversation(id, title, liEl) {
  currentConvId = id;
  document.getElementById('chatHeader').innerHTML = `<div><h6 class="mb-0">${title}</h6><div class="small-muted">المحادثة: ${id}</div></div>
    <div><button id="exportBtn" class="btn btn-sm btn-outline-secondary">تصدير</button></div>`;
  document.getElementById('exportBtn').onclick = () => window.location = `/api/conversations/${id}/export`;
  // join socket room
  socket.emit('joinConv', id);
  await loadMessages(id);
}

async function loadMessages(convId) {
  const msgs = await api(`/api/conversations/${convId}/messages`);
  const chat = document.getElementById('chat');
  chat.innerHTML = '';
  msgs.forEach(m => appendMessage(m.role, m.text, m.createdAt));
  chat.scrollTop = chat.scrollHeight;
}

function appendMessage(role, text, time) {
  const chat = document.getElementById('chat');
  const div = document.createElement('div');
  div.className = 'msg ' + (role === 'user' ? 'user' : 'ai');
  const bubble = document.createElement('div'); bubble.className = 'bubble'; bubble.innerText = text;
  div.appendChild(bubble);
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

// Chat send
document.getElementById('chatForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('inputText');
  const text = input.value.trim();
  if (!text) return;
  if (!currentConvId) return alert('اختر محادثة أو أنشئ واحدة أولاً');
  appendMessage('user', text);
  input.value = '';
  // show placeholder for AI
  appendMessage('ai', 'جاري توليد رد الذكاء الاصطناعي...');
  try {
    const res = await api(`/api/conversations/${currentConvId}/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text })
    });
    // replace last AI placeholder with actual text
    const chat = document.getElementById('chat');
    const lastAi = chat.querySelector('.msg.ai:last-child .bubble');
    if (lastAi) lastAi.innerText = res.ai.text;
    else appendMessage('ai', res.ai.text);
  } catch (err) {
    console.error(err);
    const chat = document.getElementById('chat');
    const lastAi = chat.querySelector('.msg.ai:last-child .bubble');
    if (lastAi) lastAi.innerText = 'حدث خطأ عند الاتصال بالخادم.';
    else appendMessage('ai', 'حدث خطأ عند الاتصال بالخادم.');
  }
});

// New conv button
document.getElementById('newConvBtn').addEventListener('click', createConversation);

// Export all (simple: export each conv)
document.getElementById('exportAllBtn').addEventListener('click', async () => {
  if (!confirm('ستُحمّل كل المحادثات كملفات منفصلة. متابعة؟')) return;
  const convs = await api('/api/conversations');
  convs.forEach(c => { window.open(`/api/conversations/${c._id}/export`, '_blank'); });
});

// Search
document.getElementById('searchInput').addEventListener('input', async (e) => {
  const q = e.target.value.trim();
  if (!q) { await loadConversations(); return; }
  try {
    const results = await api(`/api/search?q=${encodeURIComponent(q)}`);
    // show messages found as "temporary" conversation list
    const list = document.getElementById('conversationsList'); list.innerHTML = '';
    results.forEach(m => {
      const li = document.createElement('li'); li.className = 'list-group-item';
      li.innerHTML = `<div><strong>${m.role === 'user' ? 'أنت' : 'AI'}</strong>: ${m.text.slice(0,120)}</div><div class="small-muted">${new Date(m.createdAt).toLocaleString()}</div>`;
      li.onclick = async () => {
        await loadConversations();
        // open the conversation where the message belongs
        selectConversation(m.conversation, 'محادثة (نتيجة بحث)');
      };
      list.appendChild(li);
    });
  } catch (err) { console.error(err); }
});

// Socket events for real-time updates
socket.on('connect', () => console.log('socket connected'));
socket.on('info', (d) => console.log('info', d));
socket.on('message', (payload) => {
  // payload: { conversationId, message }
  if (payload.conversationId === currentConvId) {
    appendMessage(payload.message.role, payload.message.text, payload.message.createdAt);
  } else {
    // show a subtle notification (e.g., update conversation list)
    loadConversations();
  }
});
socket.on('conversation:deleted', (d) => {
  loadConversations();
  if (currentConvId === d.id) { currentConvId = null; document.getElementById('chat').innerHTML = ''; document.getElementById('chatHeader').innerHTML = ''; }
});

// Init
(async () => { await loadMe(); })();
```*
