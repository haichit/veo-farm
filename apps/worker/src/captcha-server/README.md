# Captcha Server

Local HTTP + Socket.IO bridge that lets the worker request reCAPTCHA Enterprise tokens from a real browser session. Replaces 2captcha/Anti-Captcha — talks to a custom Chrome extension running inside the same Brave/Chrome that we use for token extraction.

## Architecture

```
worker (api-client.ts)
   │  HTTP GET /captcha?action=VIDEO_GENERATION
   ▼
captcha-server (Express :3456)
   │  Socket.IO emit("server:request-captcha")
   ▼
Chrome extension (injected into labs.google tab)
   │  grecaptcha.enterprise.execute(SITE_KEY, {action})
   ▼
extension emits "client:captcha-solved" { token }
   │
   ▼
HTTP response { captcha: <token> }
```

## Run

```bash
# Terminal 1 — captcha server
pnpm tsx src/captcha-server/server.ts

# Terminal 2 — main worker (auto-launches Brave with extension loaded)
pnpm worker:dev
```

Set in `.env`:

```
BRAVE_PATH="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
# or
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
CAPTCHA_PORT=3456
CAPTCHA_MODE=auto    # auto | real_chrome | brave
```

## Endpoints

- `GET /captcha?action=IMAGE_GENERATION|VIDEO_GENERATION` → `{ captcha: <token> }`
- `GET /health` → `{ status, mode, connectedClients, pendingRequests, clients[] }`
- `POST /force-refresh` → reload all extension tabs (rotate session)

## Extension files

- `manifest.json` — MV3, host permissions for labs.google + localhost
- `background.js` — settings storage
- `content.js` — injects scripts + bridges page <-> background
- `injected.js` — runs in page context, calls `grecaptcha.enterprise.execute`
- `socket.io.min.js` — vendored Socket.IO v4.7.5 client
- `popup.html/.js/.css` — settings UI

## Manual testing

```bash
# Health
curl http://localhost:3456/health

# Force a captcha solve (requires Brave open with labs.google tab + extension loaded)
curl 'http://localhost:3456/captcha?action=IMAGE_GENERATION'
```
