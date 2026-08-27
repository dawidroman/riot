# Riot Fest Schedule PWA

A dependency-free, mobile-first schedule for the September 19–21, 2025 Riot Fest lineup. It supports installable PWA behavior, offline schedule access, stage filters, favorites, festival-local live status, and keyboard-accessible settings.

## Run locally

The app loads its CSV with `fetch`, so serve the repository over HTTP instead of opening `index.html` as a local file:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`. To exercise service-worker behavior, use `localhost` or HTTPS.

No dependency installation or build step is required. JavaScript uses browser APIs and the tests use Node's built-in test runner.

## Schedule data

The app reads `sample-schedule.csv` with these required columns:

```csv
Day,Date,Stage,Time,Artist
Friday,2025-09-19,Riot Stage,3:00pm - 3:40pm,Honey Revenge
Sunday,2025-09-21,Rebel Stage,2:30pm - 3:30pm,"The Ataris (Album Play: So Long, Astoria)"
```

- `Day` is the human-readable weekday from the published lineup.
- `Date` must be a valid ISO date in `YYYY-MM-DD` format.
- `Stage`, `Time`, and `Artist` must not be empty.
- `Time` must be a start and end separated by ` - ` or ` – `; 12-hour AM/PM and 24-hour times are accepted.
- Standard RFC 4180 quoting is supported, including commas inside quoted fields, doubled quotes, and CRLF line endings.
- Every row must contain exactly the same number of fields as the header.

Festival days and stage filters are derived from the data. Dates are sorted chronologically and become `Day 1`, `Day 2`, and `Day 3`. The URLs `?day=1`, `?day=2`, and `?day=3` select those derived days. Without a valid query value, the current festival day is selected when the date matches in `America/Chicago`; otherwise the first day is shown.

## Favorites and live status

Favorites remain in the existing `riot-festival-favorites` local-storage key. Live, upcoming, and finished states compare both the event's ISO date and its time in `America/Chicago`; an event is live from its start minute up to, but not including, its end minute.

## Offline and updates

Service worker version 1.5.0 installs the local app shell as one versioned cache. Schedule requests use network-first behavior:

1. A successful network response is shown and saved for offline use.
2. If the network fails, the most recently saved CSV is returned.
3. If no saved CSV exists, the UI presents an explicit unavailable/offline state.

“Check for schedule updates” requests a service-worker update and then fetches the CSV without the HTTP cache. It does not delete caches, unregister the service worker, clear storage, or reload the page. The last confirmed network fetch is stored separately as `riot-festival-last-schedule-update`; cached responses never advance it.

The install promotion appears only after the browser fires `beforeinstallprompt`. iOS users can install through Share → Add to Home Screen.

## Validation

Run the dependency-free automated checks:

```bash
node --check app.js
node --check sw.js
node --test tests/*.test.js
git diff --check
```

The tests cover quoted and malformed CSV input, row validation, time parsing, stable sorting, timezone/date-aware live status, time boundaries, and URL day selection.

For a manual browser pass, verify:

- keyboard focus is trapped inside About, Escape closes it, and focus returns to the About button;
- favorite state persists after reload and focus remains usable after toggling;
- the toolbar remains sticky and stage filters scroll horizontally on a narrow viewport;
- online/offline, empty, error, and cached-schedule states are understandable;
- the “Live now” shortcut appears only while viewing the active festival day;
- install promotion remains hidden unless the browser provides a real install prompt.

## Deploy to Cloudflare Pages

Wrangler authentication must already be configured for the target Cloudflare account. Deploy this directory to the staging Pages project with the branch named explicitly:

```bash
npx wrangler pages deploy . \
  --project-name riot-festival-schedule-staging \
  --branch feat/schedule-reliability-ux
```

This creates a staging/preview deployment only. Production uses the separate `riot-festival-schedule` project and is intentionally outside this workflow.

## Project structure

```text
.
├── app.js                 # Parsing, schedule logic, rendering, and interactions
├── icons/
│   ├── icon.svg           # Code-native icon source
│   └── icon-*x*.png       # Generated PWA raster assets
├── index.html             # Application shell and accessible dialog
├── manifest.json          # PWA metadata and day shortcuts
├── sample-schedule.csv    # 2025 lineup data
├── styles.css             # Responsive layout and visual states
├── sw.js                  # Offline shell and network-first schedule cache
├── tests/app.test.js      # Node test suite
└── wrangler.toml          # Cloudflare configuration
```
