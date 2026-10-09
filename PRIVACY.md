# CatchUp AI Privacy

CatchUp AI is designed around Local Privacy Mode.

## What Happens On Device

- WhatsApp `.txt` files are read in the browser.
- Parsing, message statistics, preview rendering, and task completion state happen in memory.
- AI analysis runs in a browser Web Worker using Transformers.js.
- Analysis results are kept in React state and are cleared by the Clear Session button or page refresh.

## Network Requests

In default Local Privacy Mode:

- The browser may download application assets.
- The browser may download model files from Hugging Face.
- The frontend calls the local app backend for health and metadata validation.
- Raw chat text, parsed messages, summaries, and analysis results are not sent to the backend by the app.
- No Gemini or other cloud AI call is made.

Downloading model weights is not the same as uploading a private conversation. The model files come down to the browser; the transcript stays in the browser worker.

## Backend

The Express backend provides real application infrastructure: health checks, CORS configuration, request validation, and a coordination endpoint. In the default architecture, it does not process or store private chat transcripts.

## Cloud Mode

Gemini Cloud Mode is not implemented. If it is added later, it must be disabled by default, require explicit consent, use a server-side `GEMINI_API_KEY`, and clearly disclose that conversation text leaves the device.

## Storage

CatchUp AI does not persist imported transcripts by default. It does not write chats to localStorage, IndexedDB, cookies, or the backend. Browser caches may store downloaded model files.

## Clear Session

Use Clear Session to remove the imported chat and generated report from the current UI state. Refreshing the page also clears the in-memory session.

## Guarantees and Limits

CatchUp AI can control its own code path, but cannot control browser extensions, operating-system telemetry, network inspection tools, or screenshots. Review exported chats before importing them, especially if they contain sensitive personal data.
