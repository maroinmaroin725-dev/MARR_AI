// storage.js
// مسؤول عن تخزين/استرجاع مفتاح API بطريقة آمنة (تشفير AES-GCM عبر Web Crypto)
// وظائف متاحة:
//  - encryptAndStoreKey(passphrase, apiKey)
//  - decryptKeyWithPassphrase(passphrase) => apiKey or null
//  - storePlainKey(apiKey)
//  - getPlainKey()
//  - removeStoredKey()
// التخزين: localStorage يتم استخدامه، والبيانات المشفرة محفوظة تحت KEY_ENC

const KEY_ENC = 'marr_api_key_enc_v1';
const KEY_PLAIN = 'marr_api_key_plain_v1';
const SALT_KEY = 'marr_api_salt_v1';

async function generateSalt() {
  const array = crypto.getRandomValues(new Uint8Array(16));
  return arrayToBase64(array);
}

function arrayToBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function base64ToArray(b64) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
  return arr;
}

async function deriveKey(passphrase, saltB64) {
  const enc = new TextEncoder();
  const passKey = await crypto.subtle.importKey('raw', enc.encode(passphrase), {name:'PBKDF2'}, false, ['deriveKey']);
  const salt = base64ToArray(saltB64);
  return crypto.subtle.deriveKey(
    { name:'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' },
    passKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt','decrypt']
  );
}

async function encryptAndStoreKey(passphrase, apiKey) {
  const salt = await generateSalt();
  const key = await deriveKey(passphrase, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(apiKey));
  const payload = {
    salt,
    iv: arrayToBase64(iv),
    data: arrayToBase64(ciphertext)
  };
  localStorage.setItem(KEY_ENC, JSON.stringify(payload));
  return true;
}

async function decryptKeyWithPassphrase(passphrase) {
  try {
    const raw = localStorage.getItem(KEY_ENC);
    if(!raw) return null;
    const payload = JSON.parse(raw);
    const key = await deriveKey(passphrase, payload.salt);
    const iv = base64ToArray(payload.iv);
    const data = base64ToArray(payload.data);
    const decrypted = await crypto.subtle.decrypt({ name:'AES-GCM', iv }, key, data);
    const dec = new TextDecoder().decode(decrypted);
    return dec;
  } catch (e) {
    console.error('decrypt error', e);
    return null;
  }
}

function storePlainKey(apiKey) {
  localStorage.setItem(KEY_PLAIN, apiKey);
}
function getPlainKey() {
  return localStorage.getItem(KEY_PLAIN) || '';
}
function removeStoredKey() {
  localStorage.removeItem(KEY_ENC);
  localStorage.removeItem(KEY_PLAIN);
}