# LLM At Home

A premium chat interface for your local LLM powered by **LM Studio** + **Cloudflare Tunnel**.

![Dark glassmorphism chat UI](https://img.shields.io/badge/UI-Dark%20Glassmorphism-7c5bf5) ![LM Studio](https://img.shields.io/badge/Backend-LM%20Studio-blue) ![Vercel](https://img.shields.io/badge/Deploy-Vercel-black)

## Features

- 🌙 Dark mode with glassmorphism design
- 💬 Real-time streaming responses
- ⚙️ Settings panel — configure your tunnel URL, model, temperature
- 📜 Chat history saved in browser
- 📋 Code block copy buttons & markdown rendering
- 🛑 Stop generation mid-response
- 📱 Fully responsive

## Setup

### 1. Run LM Studio
Start LM Studio and load your model. Enable the local server (default port `1234`).

### 2. Expose with Cloudflare Tunnel
```bash
cloudflared tunnel --url http://localhost:1234
```
Copy the generated `*.trycloudflare.com` URL.

### 3. Configure the Chat
Open the app → **Settings** → paste your tunnel URL → **Test Connection** → **Save**.

## Development

```bash
# Run locally with CORS proxy
node server.js
# Open http://localhost:3000
```

## Deployment (Vercel)

The app deploys to Vercel with a serverless CORS proxy at `/api/proxy`.

```bash
vercel
```

## Tech Stack

- Vanilla HTML/CSS/JS — no frameworks
- Node.js CORS proxy (local dev)
- Vercel Serverless Functions (production)
- OpenAI-compatible API (LM Studio)
