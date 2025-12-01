# Stock Market Analysis App - Architecture & Flow

## Overview
Robust app with Node.js/Express backend fetching Yahoo Finance data, calculating 50-day SMA and 14-day RSI, generating BUY/SELL/HOLD signals. Bloomberg Terminal-styled frontend served statically.

## Mermaid Architecture Flow Diagram

```mermaid
graph TD
    A[Browser: index.html] -->|Enter symbol + Scan Market| B[Fetch /analyze/symbol]
    B --> C[server.js: Express GET /analyze/:symbol]
    C --> D[yahooFinance.quote(symbol).regularMarketPrice]
    C --> E[yahooFinance.historical(symbol, 50 days daily)]
    E --> F[Calc 50-day SMA: avg last 50 closes or available]
    E --> G[Calc 14-day RSI: gains/losses avg, RS=avgGain/avgLoss, RSI=100-100/(1+RS)]
    G --> H[Signal: RSI<30=BUY, >70=SELL, else HOLD]
    H --> I[JSON: {currentPrice, sma50, rsi, signal} + error handling]
    I --> B
    B --> J[Update DOM: Price/SMA/RSI/Signal colored + loading/errors]
```

## Key Components
- **Backend** (`server.js`): Port 3000, CORS, static '.', endpoints with yahoo-finance2, dotenv.
- **Frontend** (`index.html`): Dark/neon green, monospace, JS fetch/DOM.
- **Setup Commands**:
  1. `npm install`
  2. `npm start`
- Open `http://localhost:3000`

## Todo Summary
- [x] Refine plan/todo
- [ ] package.json
- [ ] server.js (SMA/RSI/signal/errors)
- [ ] index.html (style/JS)
- [ ] Document commands (done here)