// server.js - بروكسي بسيط لحفظ مفتاح الـ API واستدعاء Google Generative API من الخادم.
// تحذير: قم بتشغيل هذا الخادم على بيئة آمنة، واستخدم HTTPS، واحمِ ADMIN_TOKEN.
// الاستخدام:
//   ADMIN_TOKEN=secret node server.js
//
// endpoints:
//   POST /set-key   -> body { apiKey }  مع هيدر x-admin-token
//   POST /generate -> يعتمد على الجسم المرسل: يعيد طلبًا إلى Google مع مفتاح محفوظ

const express = require('express');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(bodyParser.json({ limit: '1mb' }));

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'change_this';
const KEY_FILE = path.resolve(__dirname, 'stored_api_key.txt'); // بسيط: يخزن المفتاح في ملف نصي (يمكن تغييره إلى DB)

// حماية بسيطة: تحقق من توكن الإدارة
app.post('/set-key', (req, res) => {
  const token = req.headers['x-admin-token'];
  if(!token || token !== ADMIN_TOKEN) return res.status(403).json({ error: 'forbidden' });
  const { apiKey } = req.body;
  if(!apiKey) return res.status(400).json({ error: 'no apiKey' });
  fs.writeFileSync(KEY_FILE, apiKey, { encoding: 'utf8' });
  return res.json({ ok: true });
});

app.post('/generate', async (req, res) => {
  // اقرأ المفتاح من الملف
  if(!fs.existsSync(KEY_FILE)) return res.status(500).json({ error: 'no key configured' });
  const apiKey = fs.readFileSync(KEY_FILE, 'utf8').trim();
  const model = process.env.MODEL || 'gemini-flash-latest';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(req.body) });
    const data = await r.text();
    res.status(r.status).send(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'proxy error' });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, ()=> console.log(`MARR proxy running on ${PORT}`));