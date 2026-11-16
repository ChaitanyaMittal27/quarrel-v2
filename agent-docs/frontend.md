# Frontend

- **The UI port is deferred to the last slice.** Until then `ui/` is a minimal Vite page with an
  API health line (and, in 1E, a throwaway debug page). Don't port v1 UI files early.
- `ui/src/lib/api.ts` is the **only** place the UI talks to the backend. Responses are parsed
  with the contract schemas from `@quarrel/shared/contract`.
- **Single-flight refresh** (in `api.ts`): on `SESSION_EXPIRED`, concurrent callers share one
  `POST /api/session/refresh`, then retry once. Don't add a second refresh path.
- Don't send `Content-Type: application/json` on bodiless POSTs (the API answers 400).
- Dev: Vite on 5173 proxies `/api` and `/socket.io` (with WebSockets) to the API on 4000.
- At the UI port: `docs/inventory.md` lists every v1 UI file, the Next.js -> Vite swaps and the
  decisions (Tailwind via `@tailwindcss/vite`, react-router routes `/`, `/share`, `/settings`).
