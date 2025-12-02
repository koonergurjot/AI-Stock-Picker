# AI Stock Picker

[![Render](https://img.shields.io/badge/Deploy-Render-blue)](https://render.com/deploy?&nbsp;[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)&nbsp;[![Node.js](https://img.shields.io/badge/Node.js-v18-green.svg)](https://nodejs.org/)

A robust stock market analysis app with 50-day SMA and RSI (14-period, Wilder's method) signals powered by Yahoo Finance.

## 🚀 Demo

![Demo GIF](demo.gif)

*(Screen recording of `localhost:3000` - record your own after `npm start`!)*

## ✨ Features

- **Real-time Analysis**: Fetch latest quotes & historical data
- **Technical Indicators**:
  - 50-day Simple Moving Average (SMA)
  - 14-day Relative Strength Index (RSI)
- **Trading Signals**: Buy (RSI<30), Sell (RSI>70), Hold
- **Performance**: Node-cache (15min TTL), Winston logging
- **Production Ready**: Health endpoint (`/health`), `PORT` env support, CORS
- **Frontend**: Clean static UI (`public/index.html`)

## 📖 Quick Start

```bash
git clone <repo>
cd ai-stock-picker
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000)

**Test API**: `curl http://localhost:3000/analyze/AAPL`

## 🛠️ API Endpoints

| Endpoint | Description | Example |
|----------|-------------|---------|
| `GET /` | Static UI | `http://localhost:3000` |
| `GET /analyze/:symbol` | Analysis | `/analyze/TSLA` → `{currentPrice, sma50, rsi, signal}` |
| `GET /health` | Health check | `{status: 'ok'}` |

## 🌐 Deployment (5min 🚀)

### Render (Recommended - Free Tier)
1. [render.com](https://render.com) → New → Web Service → Connect GitHub
2. **Build Command**: `npm install`
3. **Start Command**: `npm start`
4. Auto-deploys on git push!

### Others
- **Railway**: Same as Render
- **Vercel/Fly.io**: Works (serverless compatible)

## 📁 Project Structure
## 🤖 Roo AI Auto-Push Workflow

### Flow
```
Roo (Code mode) → Edits files
                ↓
`npm run deploy` (or `git add . && git commit -m "msg"`)
                ↓
pre-commit: `npm test` ✅
                ↓
post-commit: `git push origin main`
                ↓
GitHub: main updated + [CI](.github/workflows/ci.yml) runs tests
```

### Quick Deploy
```bash
npm run deploy
```
- Adds all changes
- Commits as "Auto-update by Roo" (author: Roo AI)
- Pushes automatically

### Notes
- **Git Config**: `user.name="Roo AI"` (local repo)
- **Auth Setup** (if push prompts credentials):
  1. GitHub → Settings → Developer settings → Personal access tokens → Fine-grained token (repo: Contents, Metadata read/write)
  2. `git remote set-url origin https://YOUR_USERNAME:ghp_XXXXXXXXXX@github.com/koonergurjot/AI-Stock-Picker.git`
  - **Preferred**: SSH keys (`ssh-keygen`, add public key to GitHub → SSH and GPG keys)

**Test**: Edit a file → `npm run deploy` → Check GitHub main branch.


```
├── src/server.js      # Express API + indicators
├── public/            # Static UI
├── tests/             # Jest tests
├── .husky/            # Git hooks
├── docs/plan.md       # Original plan
├── README.md
├── LICENSE
└── package.json
```

## 🔍 Topics

nodejs, express, stock-analysis, rsi, sma, finance, yahoo-finance, deployment, ai-stock-picker

## 📄 License

MIT License - see [LICENSE](LICENSE)

## 🚀 Deployment to Cloudflare Pages

### 1. Install Wrangler
```bash
npm install -g wrangler
```
(or `npm i -D wrangler` for project-local installation)

### 2. Local Testing
```bash
npm run dev:pages
```
This opens a local dev server. Test the API endpoint: `/api/analyze/AAPL`.

### 3. Deploy
```bash
npm run deploy
```
Uploads your project to Cloudflare Pages. Requires authentication via `wrangler login` first.

### Note
Ensure your Cloudflare account is linked and the project name in [`wrangler.toml`](wrangler.toml) matches your Pages project name.
## Cloudflare Pages GitHub Auto-Deploy Setup

1. Log in to [Cloudflare dashboard](https://dash.cloudflare.com).

2. Navigate to **Pages** > **Create a project** > **Connect to Git** > **Authorize GitHub** > Select this repo (**AI Stock Picker**).

3. **Production branch**: `main`.

4. **Framework preset**: None.

5. **Build command**: (leave blank; [`wrangler.toml`](wrangler.toml) handles).

6. **Build output directory**: `public`.

7. Click **"Save and Deploy"**.

Pages project created/linked; future pushes to `main` auto-trigger builds/deploys (uses [`cloudflare.toml`](cloudflare.toml)/[`wrangler.toml`](wrangler.toml)).

**Note**: First deploy creates Pages URL (e.g., `ai-stock-picker.pages.dev`). Test: make change, `git commit` (triggers husky test+push), check **Pages deployments tab**.

## Roo Auto-Update Workflow

- After Roo/code mode changes: `npm run push:roo` (adds, tests, commits, pushes to main).
- Triggers: husky (test+push redundant but safe), GitHub Actions CI, Cloudflare Pages auto-build/deploy.
- Alternative: `git add . && git commit -m "Update"` (uses husky).