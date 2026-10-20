# My Home v4

Mobile property comparison app: https://kodama-clark.github.io/my-home/

Private property data lives only in `kodama-clark/my-home-ranking`. This public repository contains the application shell and generic tests, never actual property records or credentials.

Build: `node build.mjs` (no dependencies). Publish the generated index.html plus sw.js, manifest.webmanifest, icon.svg. The existing Pages workflow deploys exactly those files.

Verify: `node --test tests/*.test.mjs`. The private-data contract test uses the optional adjacent private checkout; tests otherwise use synthetic fixtures. Browser visual QA and the owner's Android token permissions require their respective runtime.

Features: paginated lists/new/favorites/history, explicit detail screen, maximum-three comparison, full property and research editing, per-property visits, durable local cache and edit queue, SHA merge/retry with conflict resolution, non-destructive backup import, automatic refresh, privacy-safe service worker.
