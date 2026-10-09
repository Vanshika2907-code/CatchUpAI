# CatchUp AI

CatchUp AI is a privacy-first web app for catching up on exported WhatsApp chats. Import a `.txt` export, review local parsing stats, then generate a friendly report with summaries, important updates, decisions, action items, unanswered questions, priority labels, and supporting evidence.

## Features

- React + TypeScript + Vite frontend.
- Node.js + Express + TypeScript backend for health, validation, and app infrastructure.
- WhatsApp `.txt` parsing in the browser with multiline and system-message support.
- Local Privacy Mode by default: transcript analysis runs in a browser Web Worker with Transformers.js.
- WebGPU is requested when available, with WASM fallback.
- Zod validation for backend requests and model JSON output.
- Prioritized “Things you shouldn't miss” list with filters, completion toggles, expansion, evidence, and copy actions.
- Root-level `prompt.md` is imported by the app as the canonical prompt source.

## Technology

- Frontend: React, TypeScript, Vite, Lucide icons.
- Backend: Express, Helmet, CORS, Zod.
- Local AI: `@huggingface/transformers` with `Xenova/flan-t5-small`.
- Tests: Vitest.

## Install

```bash
npm install
```

On Windows PowerShell with script execution disabled, use `npm.cmd install`.

## Development

```bash
npm run dev
```

Frontend: `http://127.0.0.1:5173`

Backend: `http://127.0.0.1:8787`

Health check:

```bash
curl http://127.0.0.1:8787/api/health
```

## Tests and Build

```bash
npm test
npm run build
```

## Model Download Behavior

The app downloads model weights from Hugging Face into the browser cache. This is different from uploading private chat content: the browser requests model files, then your imported transcript is analyzed in the local worker. The app does not use Gemini or another remote AI service in Local Privacy Mode.

## Browser Compatibility

Use a modern Chromium-based browser for the best WebGPU experience. If WebGPU is unavailable, Transformers.js can use WASM, but analysis may be slower and some devices may run out of memory.

## Privacy Notes

See [PRIVACY.md](./PRIVACY.md). The backend intentionally receives only metadata in default mode. It does not receive raw chat messages, summaries, or analysis results.

## Deployment

This project has both a static frontend and an Express backend. Deploying only the Vite `dist/` folder will not run the backend.

Recommended options:

- Frontend: Vercel or Netlify static site.
- Backend: Render, Railway, Fly.io, or another Node host.
- Set `CORS_ORIGIN` to the deployed frontend origin.

Important: Local Privacy Mode remains privacy-preserving only when transcript analysis stays in the browser. Do not move analysis to a remote backend unless you clearly disclose that chats leave the user’s device.

## GitHub Publishing

```bash
git init
git add .
git commit -m "Build CatchUp AI local-first MVP"
git branch -M main
git remote add origin <your-repo-url>
git push -u origin main
```

## Known Limitations

- The small local model may occasionally fail to return valid JSON for complex chats. The app reports this instead of fabricating results.
- Very large exports should be split by date range.
- Optional Gemini Cloud Mode is not implemented because the default MVP prioritizes local privacy.
