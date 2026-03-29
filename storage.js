// storage.js — تخزين مشفّر للمفاتيح بواسطة Web Crypto (AES-GCM عبر PBKDF2).
// واجهة مبسطة: encryptAndStoreKey(provider, pass, apiKey), decryptKeyWithPassphrase(provider, pass), removeKey(provider)

const STORAGE_PREFIX = 'marr_key_'; // final key: marr_key_google_enc or marr_key_openai_enc
const SALT_PREFIX = 'marr_salt_';

function arrayToBase64(buf){ return btoa(String.fromCharCode(...new Uint8Array(buf))); }
function base64ToArray(b64){ const bin = atob(b64); const arr = new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i); return arr; }

async function generateSalt() {
  const s = crypto.getRandomValues(new Uint8Array(16));
  return arrayToBase64(s);
}

async function deriveKey(passphrase, saltB64) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(passphrase), { name: 'PBKDF2' }, false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name:'PBKDF2', salt: base64ToArray(saltB64), iterations: 200000, hash: 'SHA-256' },
    baseKey,
    { name:'AES-GCM', length: 256 },
    false,
    ['encrypt','decrypt']
  );
}

async function encryptAndStoreKey(provider, passphrase, apiKey) {
  const salt = await generateSalt();
  const key = await deriveKey(passphrase, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ct = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key, enc.encode(apiKey));
  const payload = { salt, iv: arrayToBase64(iv), data: arrayToBase64(ct) };
  localStorage.setItem(STORAGE_PREFIX + provider + '_enc', JSON.stringify(payload));
  return true;
}

async function decryptKeyWithPassphrase(provider, passphrase) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + provider + '_enc');
    if(!raw) return null;
    const payload = JSON.parse(raw);
    const key = await deriveKey(passphrase, payload.salt);
    const iv = base64ToArray(payload.iv);
    const data = base64ToArray(payload.data);
    const dec = await crypto.subtle.decrypt({ name:'AES-GCM', iv }, key, data);
    return new TextDecoder().decode(dec);
  } catch(e){
    console.error('decrypt error', e);
    return null;
  }
}

function removeKey(provider) {
  localStorage.removeItem(STORAGE_PREFIX + provider + '_enc');
}