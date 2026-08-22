# Ishita Gautam — Portfolio (Full-Stack)

A single Express app that serves the portfolio site, a JSON-backed REST API,
a working contact form, and a password-protected admin panel for editing
content without touching code.

## What's actually "backend" here

- `GET /api/content` — everything the site displays (profile, experience,
  projects, skills, achievements, education), read from `data/content.json`.
- `POST /api/contact` — validates and stores every contact-form submission
  in `data/messages.json`, and emails you too if SMTP is configured.
- `/admin.html` + `/api/admin/*` — password-protected CRUD: add/edit/delete
  projects, experience, achievements, and skills; view and clear contact
  messages. Session-cookie auth via `express-session`.

`data/content.json` and `data/messages.json` act as a tiny file-based
database. Every route only talks to the four helper functions at the top of
`server.js` (`loadContent`, `saveContent`, `loadMessages`, `saveMessages`),
so swapping this for MySQL/Postgres later is a contained change, not a rewrite.

## Run it locally

```bash
npm install
cp .env.example .env   # then edit .env — at minimum, set ADMIN_PASSWORD
npm start
```

Visit `http://localhost:3000` for the site, `http://localhost:3000/admin.html`
for the admin panel.

## Deploying (free-tier friendly)

This is one Node service (frontend + API together), so it deploys as a single
web service — no separate frontend/backend hosting needed.

**Render.com** (recommended, generous free tier):
1. Push this folder to a GitHub repo.
2. On Render: New → Web Service → connect the repo.
3. Build command: `npm install`. Start command: `npm start`.
4. Add environment variables from `.env.example` in the Render dashboard
   (`ADMIN_PASSWORD`, `SESSION_SECRET`, and the `SMTP_*` ones if you want
   real emails).
5. Deploy. Your site is live at the URL Render gives you.

**Railway.app** works the same way (connect repo, set env vars, deploy).

## Setting up real contact-form emails (optional)

Without `SMTP_*` env vars, messages are still saved and visible in
`/admin.html` — you just won't get an email notification. To enable email:

1. If using Gmail: turn on 2-Step Verification, then create an
   [App Password](https://myaccount.google.com/apppasswords).
2. Set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER` to your
   Gmail address, `SMTP_PASS` to the app password, and `CONTACT_TO_EMAIL`
   to wherever you want messages sent.

## Editing content without redeploying

Go to `/admin.html`, sign in with `ADMIN_PASSWORD`, and use the tabs to add
or delete projects, experience entries, and achievements, edit skills, and
read/clear contact-form messages. Changes are saved immediately.

## Project structure

```
server.js           Express app + all API/admin routes
data/content.json    Site content ("database")
data/messages.json   Contact form submissions
public/index.html    Portfolio frontend (fetches from /api/content)
public/admin.html    Admin dashboard
public/assets/        Photo and other static assets
```
