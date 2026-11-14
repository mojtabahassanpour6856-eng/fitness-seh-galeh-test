# Android offline preview test

This is a standalone, non-production harness. It does not load Supabase, does not authenticate real accounts, and contains no trainee/payment data. The test-login button stores only the minimal safe-shell marker shape used by the experimental production change.

## Test in both Android Chrome and installed PWA
1. Open the GitHub Pages preview over HTTPS.
2. While online, tap "ثبت ورود آزمایشی".
3. Confirm the demo authenticated panel appears.
4. Close the page/app fully, enable Airplane mode, and reopen it.
5. Expected: branded limited shell and offline notice; no demo private panel or navigation.
6. Disable Airplane mode. Expected: online health check succeeds and demo authenticated panel returns.
7. Tap test logout, close the app, enable Airplane mode, and reopen.
8. Expected: login panel remains; limited shell is not granted without the marker.
9. Repeat the close/reopen/offline/reconnect cycle three times.

## Limitation
This validates Android Chrome/PWA installation, Service Worker shell caching, local marker handling, and restricted UI behavior. It does not replace integration testing of production finishLogin, Supabase session restoration, real coach/trainee accounts, or the full application. Those remain separate release gates.
