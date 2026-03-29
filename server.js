/**
 * server.js
 * تطبيق متكامل (جميع النماذج والـ routes والجلسات داخل هذا الملف)
 * لا مجلدات؛ كل شيء منسق في الجذر.
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const axios = require('axios');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Basic config & env validation
const PORT = process.env.PORT || 3000;
if (!process.env.MONGO_URI) {
  console.error('MONGO_URI missing in .env — fill .env from .env.example');
  process.exit(1);
}
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.warn('Google OAuth variables missing; login via Google will not work until set.');
}

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// ----- Schemas (all here, no separate files) -----
const { Schema } = mongoose;

const UserSchema = new Schema({
  googleId: { type: String, unique: true },
  displayName: String,
  email: String,
  avatar: String
}, { timestamps: true });
const User = mongoose.model('User', UserSchema);

const ConversationSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, default: 'محادثة جديدة' },
  pinned: { type: Boolean, default: false },
  deleted: { type: Boolean, default: false }
}, { timestamps: true });
const Conversation = mongoose.model('Conversation', ConversationSchema);

const MessageSchema = new Schema({
  conversation: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['user', 'ai'], required: true },
  text: { type: String, required: true },
  meta: { type: Schema.Types.Mixed }
}, { timestamps: true });
const Message = mongoose.model('Message', MessageSchema);

// ----- Middlewares -----
app.use(helmet());
app.use(express.json({ limit: '64kb' })); // limit body size
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: true, credentials: true }));

// Rate limiter (basic)
const limiter = rateLimit({ windowMs: 10 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
app.use(limiter);

// Sessions stored in MongoDB
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7, httpOnly: true, sameSite: 'lax' }
});
app.use(sessionMiddleware);

// Passport (Google OAuth)
app.use(passport.initialize());
app.use(passport.session());

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID || 'MISSING',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'MISSING',
  callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
  try {
    let user = await User.findOne({ googleId: profile.id });
    if (!user) {
      user = await User.create({
        googleId: profile.id,
        displayName: profile.displayName,
        email: profile.emails?.[0]?.value,
        avatar: profile.photos?.[0]?.value
      });
    }
    return done(null, user);
  } catch (err) {
    return done(err);
  }
}));

passport.serializeUser((user, done) => done(null, user._id));
passport.deserializeUser(async (id, done) => {
  try {
    const u = await User.findById(id);
    done(null, u);
  } catch (err) { done(err); }
});

// Wrap session for socket.io
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

// Simple auth-check middleware
function ensureAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Not authenticated' });
}

// ----- Socket.IO realtime updates -----
io.on('connection', (socket) => {
  const req = socket.request;
  const user = req.session?.passport?.user;
  if (!user) {
    // unauthenticated sockets are allowed but limited
    socket.emit('info', { message: 'connected (unauthenticated)' });
    return;
  }
  // join room for user to receive conversation updates
  socket.join(`user:${user}`);
  socket.emit('info', { message: 'connected', userId: user });
  // client can join conversation rooms
  socket.on('joinConv', (convId) => {
    socket.join(`conv:${convId}`);
  });
  socket.on('leaveConv', (convId) => {
    socket.leave(`conv:${convId}`);
  });
});

// ----- Routes: Auth -----
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    // redirect to app (SPA)
    res.redirect('/');
  }
);

app.post('/auth/logout', (req, res) => {
  req.logout(() => {
    req.session.destroy(() => res.json({ ok: true }));
  });
});

// ----- API -----
app.get('/api/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({ user: { id: req.user._id, name: req.user.displayName, email: req.user.email, avatar: req.user.avatar } });
});

// Conversations
app.get('/api/conversations', ensureAuth, async (req, res) => {
  const convs = await Conversation.find({ user: req.user._id, deleted: false }).sort({ updatedAt: -1 });
  res.json(convs);
});

app.post('/api/conversations', ensureAuth, async (req, res) => {
  const title = (req.body.title || 'محادثة جديدة').slice(0, 200);
  const conv = await Conversation.create({ user: req.user._id, title });
  res.json(conv);
});

app.delete('/api/conversations/:id', ensureAuth, async (req, res) => {
  const conv = await Conversation.findById(req.params.id);
  if (!conv || conv.user.toString() !== req.user._id.toString()) return res.status(403).json({ error: 'Forbidden' });
  conv.deleted = true;
  await conv.save();
  // notify via socket
  io.to(`user:${req.user._id}`).emit('conversation:deleted', { id: conv._id });
  res.json({ ok: true });
});

// Export conversation (JSON)
app.get('/api/conversations/:id/export', ensureAuth, async (req, res) => {
  const conv = await Conversation.findById(req.params.id);
  if (!conv || conv.user.toString() !== req.user._id.toString()) return res.status(403).json({ error: 'Forbidden' });
  const msgs = await Message.find({ conversation: conv._id }).sort({ createdAt: 1 });
  res.setHeader('Content-Disposition', `attachment; filename=conversation-${conv._id}.json`);
  res.json({ conversation: conv, messages: msgs });
});

// Messages: list
app.get('/api/conversations/:id/messages', ensureAuth, async (req, res) => {
  const conv = await Conversation.findById(req.params.id);
  if (!conv || conv.user.toString() !== req.user._id.toString()) return res.status(403).json({ error: 'Forbidden' });
  const msgs = await Message.find({ conversation: conv._id }).sort({ createdAt: 1 });
  res.json(msgs);
});

// Send message: save user message, call Gemini, save AI reply, emit via socket
app.post('/api/conversations/:id/messages', ensureAuth, async (req, res) => {
  try {
    const conv = await Conversation.findById(req.params.id);
    if (!conv || conv.user.toString() !== req.user._id.toString()) return res.status(403).json({ error: 'Forbidden' });
    const text = String(req.body.text || '').trim().slice(0, 2000);
    if (!text) return res.status(400).json({ error: 'Missing text' });

    // Save user message
    const userMsg = await Message.create({ conversation: conv._id, user: req.user._id, role: 'user', text });

    // Update conversation timestamp
    conv.updatedAt = new Date();
    await conv.save();

    // Notify user (and conversation room) about user's message
    io.to(`user:${req.user._id}`).emit('message', { conversationId: conv._id, message: userMsg });
    io.to(`conv:${conv._id}`).emit('message', { conversationId: conv._id, message: userMsg });

    // Prepare Gemini request body
    const apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent';
    const body = { contents: [{ parts: [{ text }] }] };
    const headers = { 'Content-Type': 'application/json', 'X-goog-api-key': process.env.GOOGLE_API_KEY || '' };

    // Call Gemini (server-side)
    let aiText = '';
    try {
      const apiRes = await axios.post(apiUrl, body, { headers, timeout: 30000 });
      const data = apiRes.data;
      if (data?.candidates && Array.isArray(data.candidates) && data.candidates[0]?.content) {
        const content = data.candidates[0].content;
        aiText = content?.[0]?.text || JSON.stringify(content);
      } else if (data?.output?.[0]?.content?.[0]?.text) {
        aiText = data.output[0].content[0].text;
      } else {
        aiText = JSON.stringify(data);
      }
    } catch (apiErr) {
      console.error('Gemini API error:', apiErr?.response?.data || apiErr.message);
      aiText = 'عذراً، حدث خطأ أثناء توليد الرد من الذكاء الاصطناعي.';
    }

    // Save AI message
    const aiMsg = await Message.create({ conversation: conv._id, user: req.user._id, role: 'ai', text: aiText });

    // Emit AI message — we also simulate incremental streaming by sending chunks
    io.to(`user:${req.user._id}`).emit('message', { conversationId: conv._id, message: aiMsg });
    io.to(`conv:${conv._id}`).emit('message', { conversationId: conv._id, message: aiMsg });

    res.json({ user: userMsg, ai: aiMsg });
  } catch (err) {
    console.error('/messages error:', err);
    res.status(500).json({ error: 'Server error', details: String(err) });
  }
});

// Search messages (simple)
app.get('/api/search', ensureAuth, async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json([]);
  const msgs = await Message.find({ user: req.user._id, text: { $regex: q, $options: 'i' } }).limit(200);
  res.json(msgs);
});

// Serve static files from root (index.html, style.css, main.js exist in root)
// Use explicit paths to avoid folder usage
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/style.css', (req, res) => res.sendFile(path.join(__dirname, 'style.css')));
app.get('/main.js', (req, res) => res.sendFile(path.join(__dirname, 'main.js')));

// Health
app.get('/healthz', (req, res) => res.json({ ok: true }));

// Start server
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));