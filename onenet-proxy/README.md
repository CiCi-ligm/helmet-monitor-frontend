This folder contains a small Node/Express proxy that accepts navigation text from a browser and forwards it to OneNet (heclouds) as a datapoint.

Why use this proxy?
- OneNet does not support CORS for direct browser requests, and the access key must not be exposed in client code.
- The proxy stores the OneNet Access Key server-side and forwards sanitized datapoints to OneNet.

Files created
- server.js        - Express server that exposes POST /api/log-nav
- package.json     - dependencies and start scripts
- .env.example     - example env file (DO NOT store real keys in repo)
- .gitignore       - ignore node_modules and .env
- README.md        - this file

Usage (local)
1. Copy .env.example to .env and set values:
   cp onenet-proxy/.env.example onenet-proxy/.env
   # Edit onenet-proxy/.env and fill in ONENET_DEVICE_ID and ONENET_ACCESS_KEY

2. Install dependencies and start:
   cd onenet-proxy
   npm install
   npm start

3. Test with curl (if SECRET_TOKEN set, include x-secret header):
   curl -v -X POST http://localhost:3000/api/log-nav \
     -H "Content-Type: application/json" \
     -H "x-secret: your_frontend_secret" \
     -d '{"text":"测试导航文本"}'

Frontend example (plain HTML/JS)
- Add this snippet to your pages (adjust URL if proxy is on different origin):

<script>
const SECRET = 'your_frontend_secret'; // must match SECRET_TOKEN if used
let lastSent = null;
let lastSentAt = 0;
function sendNavText(text) {
  if (!text) return;
  const now = Date.now();
  if (text === lastSent && now - lastSentAt < 2000) return; // debounce 2s
  lastSent = text; lastSentAt = now;

  fetch('/api/log-nav', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-secret': SECRET
    },
    body: JSON.stringify({ text })
  }).catch(err => console.warn('log-nav failed', err));
}

// Listen for link clicks
document.addEventListener('click', (e) => {
  const a = e.target.closest('a');
  if (!a) return;
  const text = (a.textContent || a.getAttribute('title') || a.href).trim();
  sendNavText(text);
});

// Listen for history navigation (SPA)
window.addEventListener('popstate', () => {
  sendNavText(document.title || location.pathname);
});
</script>

Deployment
- Host this Node app on Heroku / Railway / Render / Cloud Run / any Node host.
- Set env vars on the host (ONENET_DEVICE_ID, ONENET_ACCESS_KEY, SECRET_TOKEN).

Security notes
- Do NOT commit real credentials to the repo.
- This simple token is just a basic guard; for production use proper auth (JWT/session) and stronger rate limiting.

If you want, I can open a PR with these files and a short description. Or I can adjust the proxy (different endpoint, additional fields, or add simple logging) — tell me what you'd like next.
