require('dotenv').config();

const express = require('express');
const cors = require('cors');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

const CONTENT_PATH = path.join(__dirname, 'data', 'content.json');
const MESSAGES_PATH = path.join(__dirname, 'data', 'messages.json');

// ---------- tiny JSON "database" helpers ----------
// Swap these for a real DB (MySQL/Postgres/Mongo) later — every route below
// only talks to these four functions, so the storage layer is a drop-in swap.
function loadContent() {
  return JSON.parse(fs.readFileSync(CONTENT_PATH, 'utf-8'));
}
function saveContent(content) {
  fs.writeFileSync(CONTENT_PATH, JSON.stringify(content, null, 2));
}
function loadMessages() {
  return JSON.parse(fs.readFileSync(MESSAGES_PATH, 'utf-8'));
}
function saveMessages(messages) {
  fs.writeFileSync(MESSAGES_PATH, JSON.stringify(messages, null, 2));
}

// ---------- middleware ----------
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 4, // 4 hours
    httpOnly: true,
    sameSite: 'lax'
  }
}));

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'Not authenticated' });
}

// ============================================================
// PUBLIC API — read-only, powers the portfolio frontend
// ============================================================

app.get('/api/content', (req, res) => {
  res.json(loadContent());
});

// Contact form: validates, stores every submission, and emails you
// if SMTP env vars are configured (falls back to storage-only otherwise).
app.post('/api/contact', async (req, res) => {
  const { name, email, message } = req.body || {};

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email, and message are all required.' });
  }
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    return res.status(400).json({ error: 'That email address doesn\'t look valid.' });
  }
  if (message.length > 4000) {
    return res.status(400).json({ error: 'Message is too long.' });
  }

  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    name: String(name).slice(0, 200),
    email: String(email).slice(0, 200),
    message: String(message).slice(0, 4000),
    receivedAt: new Date().toISOString(),
    read: false
  };

  const messages = loadMessages();
  messages.unshift(entry);
  saveMessages(messages);

  let emailSent = false;
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
      await transporter.sendMail({
        from: `"Portfolio Contact Form" <${process.env.SMTP_USER}>`,
        to: process.env.CONTACT_TO_EMAIL || process.env.SMTP_USER,
        replyTo: entry.email,
        subject: `Portfolio message from ${entry.name}`,
        text: entry.message
      });
      emailSent = true;
    } catch (err) {
      console.error('Email send failed (message was still saved):', err.message);
    }
  }

  res.json({ ok: true, emailSent });
});

// ============================================================
// ADMIN AUTH
// ============================================================

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  const expected = process.env.ADMIN_PASSWORD || 'changeme';
  if (password === expected) {
    req.session.isAdmin = true;
    return res.json({ ok: true });
  }
  return res.status(401).json({ error: 'Incorrect password.' });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/admin/session', (req, res) => {
  res.json({ loggedIn: !!(req.session && req.session.isAdmin) });
});

// ============================================================
// ADMIN API — protected CRUD over content.json + messages.json
// ============================================================

app.get('/api/admin/content', requireAdmin, (req, res) => {
  res.json(loadContent());
});

app.put('/api/admin/profile', requireAdmin, (req, res) => {
  const content = loadContent();
  content.profile = { ...content.profile, ...req.body };
  saveContent(content);
  res.json({ ok: true, profile: content.profile });
});

app.put('/api/admin/education', requireAdmin, (req, res) => {
  const content = loadContent();
  content.education = { ...content.education, ...req.body };
  saveContent(content);
  res.json({ ok: true, education: content.education });
});

app.put('/api/admin/skills', requireAdmin, (req, res) => {
  const content = loadContent();
  content.skills = req.body || {};
  saveContent(content);
  res.json({ ok: true, skills: content.skills });
});

// Generic helpers for id-keyed arrays: experience, projects, achievements
function makeArrayCrud(section, idPrefix) {
  app.post(`/api/admin/${section}`, requireAdmin, (req, res) => {
    const content = loadContent();
    const item = { id: `${idPrefix}-${Date.now().toString(36)}`, ...req.body };
    content[section].push(item);
    saveContent(content);
    res.json({ ok: true, item });
  });

  app.put(`/api/admin/${section}/:id`, requireAdmin, (req, res) => {
    const content = loadContent();
    const idx = content[section].findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    content[section][idx] = { ...content[section][idx], ...req.body, id: req.params.id };
    saveContent(content);
    res.json({ ok: true, item: content[section][idx] });
  });

  app.delete(`/api/admin/${section}/:id`, requireAdmin, (req, res) => {
    const content = loadContent();
    const before = content[section].length;
    content[section] = content[section].filter(i => i.id !== req.params.id);
    saveContent(content);
    res.json({ ok: true, removed: before - content[section].length });
  });
}

makeArrayCrud('experience', 'exp');
makeArrayCrud('projects', 'proj');
makeArrayCrud('achievements', 'ach');

// Contact messages: view + delete
app.get('/api/admin/messages', requireAdmin, (req, res) => {
  res.json(loadMessages());
});

app.delete('/api/admin/messages/:id', requireAdmin, (req, res) => {
  const messages = loadMessages();
  const filtered = messages.filter(m => m.id !== req.params.id);
  saveMessages(filtered);
  res.json({ ok: true, removed: messages.length - filtered.length });
});

app.patch('/api/admin/messages/:id/read', requireAdmin, (req, res) => {
  const messages = loadMessages();
  const msg = messages.find(m => m.id === req.params.id);
  if (!msg) return res.status(404).json({ error: 'Not found' });
  msg.read = true;
  saveMessages(messages);
  res.json({ ok: true });
});

// ============================================================
// Fallback: serve index.html for the root (static middleware
// already handles all other files in /public, including /admin.html)
// ============================================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Portfolio server running at http://localhost:${PORT}`);
  if (!process.env.ADMIN_PASSWORD) {
    console.warn('⚠️  ADMIN_PASSWORD not set — using default "changeme". Set it in .env before deploying.');
  }
});
