# Network dependency and carrier-compatibility policy

## Purpose
Keep the app usable on Iranian mobile and fixed networks, including when a third-party CDN is unavailable.

## Rules for future changes
1. Critical startup dependencies (authentication SDK, app bootstrap, essential styles and fonts where practical) should be served from the same GitHub Pages origin.
2. A new external host must be recorded with its purpose, whether it is critical, its fallback, and how it was tested on MCI, Irancell, and fixed internet.
3. Do not make authentication or app startup depend on a third-party CDN when a reviewed local asset can be used.
4. Keep third-party resources that are genuinely optional lazy-loaded and provide a graceful failure state.
5. Never cache Supabase/API responses or private trainee data in a service worker as a workaround for connectivity.
6. Do not log credentials, access tokens, phone numbers, trainee data, or request bodies in diagnostics.

## Triage when a user reports that the app does not open
- **Navigation/host failure:** the HTML document itself does not load. Check DNS, TLS, timeout, redirects, and carrier-specific reachability.
- **Static resource failure:** HTML loads, but a JS/CSS/font/image resource fails. Check the failed resource URL and host.
- **JavaScript startup failure:** HTML and resources load, but an exception stops initialization. Check the first console error and stack.
- **Backend/API failure:** the UI loads but authentication or data requests fail. Check request hostname, HTTP status, and timing without exposing secrets.

## Required release checks
- Run the static network-dependency tests.
- Confirm the Pages deployment job succeeded before asking for carrier testing.
- Test the exact deployed build on MCI and Irancell with VPN disabled, then repeat with VPN enabled if results differ.
- Record build SHA, carrier, VPN state, device/browser, URL, and the first visible error.

## Current controlled experiment
The branch `test/local-supabase-sdk-irancell-2026-11-25` serves Supabase JS 2.119.0 locally instead of loading it from jsDelivr/unpkg. This is a TEST-only change. Do not merge it or change the production app until the carrier test and regression checks pass.
