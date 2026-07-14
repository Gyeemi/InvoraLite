# E2E smoke scaffolding

InvoraLite uses **Playwright** against the Vite web UI (`localStorage` backend).

Desktop Tauri / WebView2 automation is intentionally out of scope for this scaffolding.

## Commands

```bash
# Install browser once
npx playwright install chromium

# Run smoke suite (starts Vite on :1420)
npm run test:e2e
```

## CI

GitHub Actions job `e2e-smoke` runs after unit tests (see `.github/workflows/ci.yml`).

## What is covered

- App boots past splash without a blank root
- Setup or Login shell becomes visible (browser mode skips license gate)

## Next steps (full E2E)

- Seed a fixture business + admin in `localStorage` before login
- Sale → sales return → purchase return happy path
- Optional: Tauri WebDriver against `tauri:dev` on Windows runners
