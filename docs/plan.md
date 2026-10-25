# Melogen: implementation plan

This plan builds what [idea.md](idea.md) describes using the algorithm in [algorithm.md](algorithm.md).

## Status

Implemented. This plan was the design; where the build departed from it, this section says how, and the sections below
have been corrected to match.

- **Ports come from `profile.ttl`**, not `profile.json`. The Turtle already holds every port (`lv2:port` blocks), so one
  fetch gives the digests, the audio shape and the controls, and a plugin published as Turtle only (as the jigdaw
  specification describes) works. `profile.json` is never fetched.
- **Events are posted a 0.2 s lookahead ahead of the playhead**, not a bar ahead. A processor cannot recall queued events,
  so a short window limits what can still sound after Stop. Stop sends all-notes-off at once and again after the window,
  and a melody started straight afterwards waits for the second one.
- **`SIGMA` is 0.18**, not 0.25, from measuring the distance between unrelated random melodies (median 0.41).
  See algorithm.md section 5.4.
- **The server computes the app shell itself.** `server/shell.js` lists and hashes the app files when it starts, serves the
  list as `/shell.json`, and fills the hash into `sw.js` in place of `__VERSION__`. The service worker's cache version
  therefore follows the files with no build step, and `git pull` then `systemctl restart melogen` is a whole deploy.
- **Extra modules** that the plan did not list: `src/controller.js` (all app logic, no DOM), `src/audio/session.js`
  (instrument choice, load status, control values), `src/audio/engine.js` (AudioContext and current plugin),
  `src/audio/capabilities.js`, `src/keyboard.js`, `src/ga/context.js`, `server/shell.js`.
- **`?debug`** in the URL exposes the running app as `window.melogen`, for inspection from the console.
- **`createApp().dispose()`** removes the listeners the app added to the page.
- **Dev server** is `MELOGEN_DEV=1 npm run serve`: it recomputes the file list on every request, so edits show up without a
  restart. Without it the list is fixed at start, as in production.

### Bugs only a real browser found

These passed every Node test and are worth remembering, because each now has a test that fails without the fix.

1. `{ set: setInterval }` called as `timers.set(...)` throws "Illegal invocation" in a browser. Default timers are wrapped.
2. The first tap on Play did nothing: it starts the instrument loading, the "Loading the instrument" notice appeared above
   the rows and pushed them down, and the pointer came up over the notice instead of the button, so no click was
   delivered. The status line now keeps its space permanently. Separately, the play icon is no longer replaced on every
   render, because replacing a node under a pressed pointer also drops the click.
3. The shell hash was taken on the first request rather than at startup; now it is taken at startup.

## Ground rules

- Vanilla ESM JavaScript. No framework, no bundler and no runtime dependencies. The browser loads `src/` directly.
- **No source file over 500 lines.** Most modules should be well under 200. `npm run check:size` enforces the limit, and
  so does a Vitest test.
- Vitest for tests, with a `jsdom` environment only for the UI tests. Core logic is pure functions that take a seeded RNG.
- Dev dependencies: `vitest` and `jsdom`, nothing else.
- No git commands unless asked.

## Architecture

```
            ┌──────────── ui/ ────────────┐
            │ tabs  settings  interact    │
            │ instrument  rows  icons     │
            └──────┬───────────────┬──────┘
                   │ events        │ render(state)
            ┌──────▼───────────────▼──────┐
            │ app.js  (controller)        │
            │ state/store  state/settings │
            └──┬─────────┬──────────┬─────┘
               │         │          │
        ┌──────▼──┐ ┌────▼────┐ ┌───▼─────────┐
        │  ga/    │ │ music/  │ │  audio/     │
        │ genome  │ │ scales  │ │ jig-loader  │──► chosen Jig AudioWorkletNode
        │ ops     │ │ timing  │ │ player      │
        │ estimate│ │ decode  │ │ instrument  │
        └─────────┘ └────┬────┘ └─────────────┘
                         │
                    ┌────▼────┐
                    │ midi/   │  smf writer, note→event
                    └─────────┘
```

`ga/`, `music/` and `midi/` do not touch the DOM or Web Audio, so they all run in Node under Vitest. `audio/` and `ui/`
are thin layers on top.

## File layout

```
index.html
manifest.webmanifest
sw.js                         service worker: app shell + plugin files
styles/main.css
icons/                        PWA icons (192, 512, maskable)
config.js                     DEFAULT_PLUGIN (strandz.it monochord), CATALOGUE_URL
src/
  app.js                      wires state ↔ ui ↔ audio; ~200
  util/rng.js                 mulberry32, pick, weighted, shuffle; ~60
  music/scales.js             scale table, degreeToMidi, degree range; ~80
  music/timing.js             stepsPerBar, stepSeconds, beat/downbeat tests; ~60
  music/decode.js             genome → notes; ~60
  ga/constants.js             every tunable value from algorithm.md §10; ~40
  ga/genome.js                create/clone/equal/serialize, typed arrays; ~120
  ga/generate.js              motif/form random generator, mode priors; ~200
  ga/distance.js              rhythm, pitch, contour, weighted d; ~120
  ga/estimate.js              kernel fitness, uncertainty, prior; ~100
  ga/archive.js               capped rated history with ages; ~60
  ga/choose.js                pick K to show (UCB + diversity); ~80
  ga/select.js                exclusion, tournament; ~60
  ga/crossover.js             four bar/beat operators; ~100
  ga/mutate.js                point + segment operators; ~180
  ga/evolve.js                build next generation (elite, offspring, immigrants, dedup); ~150
  ga/population.js            generation object, ratings, rounds, resize-on-settings; ~150
  midi/events.js              notes → [{frame, bytes}], panic messages; ~60
  midi/smf.js                 SMF format 0 writer (VLQ, meta, track); ~140
  audio/integrity.js          sha384 via SubtleCrypto, compare to SRI string; ~40
  audio/ttl.js                tokenizer/parser for the generated-profile Turtle subset; ~200
  audio/profile.js            triples → {resources+digests, registeredName, shape, requires, ports}; all from profile.ttl; ~125
  audio/catalogue.js          fetch index.json, filter to MIDI-driven instruments; ~60
  audio/plugin-choice.js      stored IRI (seeded on first load), ?plugin= override, per-plugin values key; ~60
  audio/jig-loader.js         fetch, verify, addModule, construct, init, await ready, dispose; ~180
  audio/player.js             schedule one melody, stop, loop, playing-row callback; ~120
  audio/instrument.js         param get/set via node.parameters, persist values; ~80
  state/settings.js           defaults, validation, clamping; ~100
  state/store.js              localStorage load/save with try/catch, versioned; ~80
  ui/dom.js                   tiny h() helper, event delegation; ~60
  ui/icons.js                 inline SVG: play, stop, minus, zero, plus, download; ~60
  ui/tabs.js                  three-tab shell, remembers tab; ~60
  ui/settings-view.js         form for all settings; ~180
  ui/interact-view.js         5 rows + More / Evolve / New + generation counter; ~200
  ui/instrument-view.js       plugin picker (catalogue + custom IRI) + controls from profile ports; ~200
  ui/download.js              Blob → <a download>; ~30
server/
  serve.js                    entry: reads env, starts http server; ~50
  static.js                   GET/HEAD file handler: mime map, traversal guard, cache headers; ~150
  headers.js                  security + cache header policy per path; ~50
bin/
  check-size.js               fails if any src/**/*.js or server/**/*.js > 500 lines; ~30
deploy/
  melogen.service             systemd unit (see Deployment)
  nginx/melogen.conf          location block for the strandz.it server block
tests/                        mirrors src/; fixtures/ holds real profile.ttl files (monochord, pulse, sam, mop, drumkit, ferrite) and a trimmed index.json
```

## Choosing and loading the instrument

The user picks the instrument plugin. The default is Monochord on strandz.it, `https://strandz.it/jigdaw/plugins/monochord/`.
strandz.it sends `Access-Control-Allow-Origin: *` (checked 2026-10-25), so the browser can fetch from it directly and no
proxy is needed.

### The choice

- **Catalogue.** The Instrument tab fetches `https://strandz.it/jigdaw/plugins/index.json`. It lists the entries with
  `web: true`, `roles` including `Instrument` and `accepts` including `Midi`. Today these are 8-Bit 8asterd, Canticle,
  DrumKit, Moka, Monochord, Mop, Pulse and Sam. Each entry is shown by `label`, with its `comment` and `cautions`.
- **Custom IRI.** A text field takes any plugin IRI, such as a local jigdaw dev server or another host. It is validated by
  loading it. If the load fails, the error is shown and the previous plugin is kept.
- **Persistence.** On first load, if `localStorage` has no `melogen.plugin` key, the default IRI is written to it
  straight away. After that the stored IRI is always used, and choosing a plugin overwrites it. `?plugin=<iri>` in the URL
  overrides it for one session only and is not saved. Storage access is wrapped in try/catch. Without storage the default
  is used every time.
- **Instrument values** are saved per plugin, under `melogen.instrument.<iri>`, so switching back to a plugin restores its
  settings.
- **Switching** stops playback, disconnects and disposes the old node (posting `{ type: 'dispose' }`), loads the new
  plugin, and then rebuilds the Instrument tab's controls.

### The loader

Based on jigdaw `src/host/Instantiate.js`, rewritten small. Given a plugin IRI `base`:

1. Fetch `base + 'profile.ttl'`. It is the authoritative description. Read from it:
   - each resource block's `jig:location` and `jig:integrity` (sha384 SRI string), for the module and the processor;
   - `jig:registeredName`, `jig:audioOutputs`, `jig:outputChannels` and `trn:requires`.

   Refuse the plugin if it does not require `jig:MidiEvents`, or if any resource it names has no digest.
2. Read the control ports from the same `profile.ttl` (`lv2:port` blocks: symbol, name, default, range, group, unit,
   enumeration scale points). There is no second fetch.
3. Fetch the processor and the module, resolving each location against `base`. Hash the bytes with
   `crypto.subtle.digest('SHA-384')` and compare them with the digest from `profile.ttl`. On a mismatch, refuse the plugin
   and name the file. Nothing unverified is run.
4. `addModule(blobURL)` from the verified bytes, never from the URL, so the bytes that were checked are the bytes that
   run. Construct `AudioWorkletNode(ctx, registeredName, { numberOfInputs: 0, numberOfOutputs: audioOutputs,
   outputChannelCount: [outputChannels] })`.
5. Post `{ type: 'init', module: wasmBuffer, sampleRate, quantum: 128 }`, transferring the buffer (a buffer, never a
   compiled `WebAssembly.Module`). Await `{ type: 'ready' }` with a 30 s timeout. On `{ type: 'error', fatal }`, fail with
   the message.
6. Connect to `ctx.destination`.

The AudioContext is created on the first user gesture: the first Play, or the Instrument tab's "Enable audio" button.
Until then the play buttons show a loading state.

### Reading profile.ttl

The profiles are generated by jigdaw `bin/write-profile.js`, so their layout is regular. `audio/ttl.js` is a small
tokenizer for the subset of Turtle those files use, not a regular expression over the text:

- `@prefix` and `@base` lines;
- subject blocks (`<>` or `<#frag>`), with predicate-object lists separated by `;` and objects separated by `,`;
- IRIs, prefixed names, string literals and numbers;
- comments.

It returns a list of triples, and `audio/profile.js` reads the values listed above from them. Tests run it against copies
of real profiles in `tests/fixtures/`: Monochord, plus at least two other instruments from the catalogue. Anything outside
the subset, such as nested blank nodes or collections, is a parse error with a line number, never silently skipped. If a
digest cannot be found, the load fails.

### Local plugins

In development, `server/serve.js` can also mount a local jigdaw `plugins/` folder at `/plugins/`, set by the
`JIGDAW_PLUGINS` env variable. A plugin being edited in jigdaw can then be tried by entering
`http://localhost:47219/plugins/<name>/` as the custom IRI. The mount is off unless the variable is set, and the
production unit does not set it.

## Deployment

The app is served at **https://strandz.it/melogen/** by a small Node server on loopback, with the existing strandz.it
nginx in front of it. This is the same arrangement as jigdaw (`deploy/jigdaw.service` on port 6011 and
`deploy/nginx/jigdaw.conf`), so both are run and debugged the same way.

### Port

**47219** on `127.0.0.1`, set by `PORT` and `HOST` with these as defaults. It is well clear of jigdaw's 6011 and of the
common dev ports. Only nginx is published. Run `ss -ltn | grep 47219` on the host before the first start, to confirm the
port is free.

### Server (`server/`)

Node's built-in `http`, `fs` and `path` only, with no dependencies, so the deploy needs no `npm install`. It runs the same
in development (`npm run serve`) and in production.

- Serves the repository's static files (`index.html`, `manifest.webmanifest`, `sw.js`, `config.js`, `styles/`, `icons/`,
  `src/`) from its root. It serves an allowlist of those paths and nothing else. `tests/`, `docs/`, `server/`,
  `deploy/`, `node_modules/` and dotfiles return 404.
- Accepts GET and HEAD only, and answers anything else with 405. Paths are resolved, then checked to still be under the
  root, so `..` and encoded traversal are rejected.
- Mime map: `.html`, `.js` (`text/javascript`), `.css`, `.json`, `.webmanifest` (`application/manifest+json`), `.svg`,
  `.png`, `.ico`. The app serves no `.wasm` or `.ttl` of its own, because those come from the plugin origin.
- Caching: `index.html`, `sw.js` and `manifest.webmanifest` get `Cache-Control: no-cache`, so a deploy is picked up on
  the next visit. Everything else gets `max-age=3600`. The service worker's versioned cache handles offline use.
- Headers: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a
  `Content-Security-Policy` of `default-src 'self'; connect-src 'self' https:; script-src 'self' blob:;
  worker-src 'self' blob:; style-src 'self'; img-src 'self' data:`. `blob:` is needed because the verified processor
  bytes are loaded with `addModule(blobURL)`. `connect-src https:` lets a custom plugin IRI on another host be fetched.
  No CORS headers are sent: nothing else needs to read Melogen cross-origin.
- `GET /healthz` returns `200 ok`, for checking the service is up after a restart.
- Logs one line per request to stdout, which journald captures (`journalctl -u melogen`).
- Handles SIGTERM by closing the server and exiting, so `systemctl stop` is clean.

### Base path

The browser sees `/melogen/...`. With the trailing slash on `proxy_pass`, nginx strips the prefix, so the server sees
`/...`. To work under any prefix:

- Every URL in `index.html`, the manifest, `sw.js` and `src/` is **relative**: `./src/app.js`, never `/src/app.js`.
- The manifest sets `"start_url": "./"` and `"scope": "./"`. The service worker is registered as
  `navigator.serviceWorker.register('./sw.js')`, so its scope becomes `/melogen/`, and it caches its shell with relative
  URLs.
- `/melogen` without the slash is redirected to `/melogen/` by nginx, because relative URLs resolve wrongly without it.
- A test greps `index.html`, `manifest.webmanifest`, `sw.js` and `src/**/*.js` for root-absolute paths (`"/`, `'/`, and
  `url(/`) and fails if it finds any.

Since the app is now on strandz.it, the default plugin at `https://strandz.it/jigdaw/plugins/monochord/` is
**same-origin** in production, so the default plugin no longer depends on CORS.

### `deploy/melogen.service`

```ini
# deploy/melogen.service
#
# Install to /etc/systemd/system/melogen.service, then:
#   sudo systemctl daemon-reload && sudo systemctl enable --now melogen
#
# Binds to loopback only; nginx publishes it at https://strandz.it/melogen/.

[Unit]
Description=Melogen
Documentation=https://strandz.it/melogen/
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/home/github/melogen
Environment=NODE_ENV=production
Environment=PORT=47219
Environment=HOST=127.0.0.1
ExecStart=/usr/bin/node server/serve.js
Restart=on-failure
RestartSec=5

# Serves static files and needs nothing else.
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=
ProtectKernelTunables=yes
ProtectControlGroups=yes
RestrictAddressFamilies=AF_INET AF_INET6

[Install]
WantedBy=multi-user.target
```

`WorkingDirectory` follows jigdaw's `/home/github/<name>` layout. Confirm the checkout path on the server before
installing the unit.

### `deploy/nginx/melogen.conf`

This is included in the existing `server { server_name strandz.it; ... }` block, next to `jigdaw.conf`:

```nginx
location = /melogen {
    return 301 /melogen/;
}

location /melogen/ {
    # Trailing slash strips /melogen/, so the app serves at its own root.
    proxy_pass http://127.0.0.1:47219/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

The security headers come from the app, as listed above. The block uses no `add_header`, so nothing is sent twice and the
server block's headers are unaffected.

### Updating a deploy

`git pull` in `/home/github/melogen`, then `sudo systemctl restart melogen`. Bump the service worker's cache version in
`sw.js` with every release that changes the shell. A `npm run release` script would do this; it is optional and can be
left for Phase 8.

## Phases

Each phase ends with its tests passing and every file under 500 lines.

### Phase 0: scaffold
- `package.json` (`"type": "module"`, scripts `test`, `serve`, `check:size`), `vitest.config.js`, `.editorconfig`.
- `bin/check-size.js` and its test.
- An empty `index.html` that loads `src/app.js`.

### Phase 1: music core
- `util/rng.js`, `music/scales.js`, `music/timing.js`, `ga/genome.js`, `music/decode.js`.
- Tests: degree→MIDI for several scales and octaves; `stepsPerBar` for 4/4, 3/4, 6/8, 7/8; decode rules (HOLD after REST,
  HOLD at step 0, a last note running to the end); genome serialise round-trip.

### Phase 2: MIDI
- `midi/smf.js` and `midi/events.js`.
- Tests: VLQ encoding against known vectors; a decoded genome writes an SMF whose header, track length and events parse
  back correctly with a small test-only reader; tempo and time signature meta bytes; note-offs never come before their
  note-ons; panic messages.

### Phase 3: GA engine
- `ga/constants.js`, `generate.js`, `distance.js`, `estimate.js`, `archive.js`, `choose.js`, `select.js`, `crossover.js`,
  `mutate.js`, `evolve.js`, `population.js`.
- Tests, all with a fixed seed:
  - Generator: every genome is valid; degrees lie in `[0, D)`; onset density per mode falls in the expected band over 200
    samples; forms repeat their sections.
  - Distance: `d(a,a)=0`; symmetry; bounded in [0, 1]; a transposed copy is closer than a random genome.
  - Estimate: a genome next to a +1 rating gets a high `f̂` and low `u`; one far from all ratings gets roughly its prior
    and `u ≈ 1`; age discounting works.
  - Choose: returns K distinct unrated genomes; diversity term spreads choices; at most one elite.
  - Select: genomes rated −1 are never chosen; tournament favours higher F over many draws.
  - Crossover: the child's bars each come from one parent; length is preserved.
  - Mutate: `m=0` is the identity; values stay in range; the observed change rate matches §7.5 within tolerance.
  - Evolve: population size N is kept; elites are carried over unchanged; there are no duplicates; all-negative votes
    give mostly immigrants.
  - **Simulated-user test:** a scripted rater votes +1 for genomes near a hidden target melody and −1 for the rest.
    Over 15 generations, the mean distance to the target must drop. This is the main check that selection, estimation and
    the operators work together.

### Phase 4: audio
- `audio/integrity.js`, `ttl.js`, `profile.js`, `catalogue.js`, `plugin-choice.js`, `jig-loader.js`, `player.js`,
  `instrument.js`; `server/` (needed now for manual testing; hardened in Phase 8).
- Tests (Node, with fake `fetch`, `AudioWorkletNode`, `port` and `localStorage`):
  - TTL parser on the Monochord fixture and two other instrument fixtures, with digests and locations extracted correctly;
    unsupported syntax fails with a line number;
  - a digest mismatch is rejected, and a missing digest is rejected;
  - plugin choice: an empty store is seeded with the strandz.it Monochord IRI on first load; a stored IRI wins over the
    default; `?plugin=` overrides without being saved; throwing storage falls back to the default;
  - catalogue filtering against a fixture `index.json`;
  - the init message carries a transferable ArrayBuffer and not a Module; ready timeout; dispose on switch;
  - player event frames for a known melody at 120 bpm; Stop sends a note-off for every note plus CC 123.
- Manual check: `npm run serve`, open the page in Chrome, Firefox and on a phone. Press Play and hear Monochord, then
  switch to Pulse and back.

### Phase 5: UI
- `ui/*`, `state/*`, `app.js`, `styles/main.css`.
- **Interaction tab:** a generation number and a round indicator (for example "Gen 4 · round 2 · 10/20 heard"), then 5
  rows. Each row has ▶ Play/■ Stop (green), − 0 + as a segmented toggle (tap again to clear), and ⬇ Download. Below the
  rows: **More** (5 more from this generation), **Evolve** and **New population**. Evolve is disabled until at least one
  vote is cast.
- **Settings tab:** Mode (Melody/Bass), key root, scale, octave, bars (default 4), time signature (4/4, 3/4, 6/8, 5/4,
  7/8), tempo (default 120), crossover rate (0.7), mutation rate (0.1), population size (20), Loop playback. The
  confirmation for a time-signature change happens here.
- **Instrument tab:** at the top, the plugin picker: a catalogue select, a custom IRI field with a Load button, and the
  loaded plugin's label, comment and cautions. Below it, controls generated from the profile's ports, grouped by `group`:
  a select for enumerations and a slider with a value readout otherwise. Each control has a reset-to-default button and a short audition button that
  plays a middle C. Values are saved.
- Layout: mobile-first. Touch targets are 44 px or larger, rows wrap cleanly at 320 px, and there is no horizontal scroll.
  Light and dark themes use CSS custom properties.
- jsdom tests: tabs switch; vote toggles update the state; Evolve's enabled state; settings validation clamps values;
  instrument controls render from the fixture ports.

### Phase 6: persistence and PWA
- `state/store.js` saves settings, instrument values, the current population, ratings, the archive, the generation number
  and the RNG state under one versioned key. All storage access is wrapped in try/catch, and the app works without
  storage.
- `manifest.webmanifest` and icons. `sw.js` caches the app shell, cache-first with versioned cache names. Plugin files
  are cached after they pass the integrity check, so the app works offline after the first load. The stored plugin IRI
  itself is written on first load by `audio/plugin-choice.js` (Phase 4), not here.
- Tests: store round-trip; migrating or discarding an old version; corrupted JSON falls back to defaults.

### Phase 7: polish
- Highlight the row that is playing, and add a playhead progress bar.
- Optional lineage display: "child of #3 × #7".
- Keyboard shortcuts: 1–5 to play a row, then −, 0 and + to vote on the row playing.
- README with usage and the `?plugin=` override.

### Phase 8: deployment
- Finish `server/` to the Deployment spec: allowlist, headers, CSP, `/healthz`, SIGTERM.
- Write `deploy/melogen.service` and `deploy/nginx/melogen.conf` as given above.
- Tests: start the server on an ephemeral port in Vitest and check that:
  - `/` serves `index.html` with `no-cache`, and `.js` is served as `text/javascript`;
  - `/../package.json`, `/%2e%2e/`, `/tests/x`, `/docs/plan.md` and `/.git/config` all return 404;
  - POST returns 405, and `/healthz` returns 200;
  - the CSP header is present.

  The no-root-absolute-paths test also belongs here.
- Manual: run behind a local nginx with the same location block at `/melogen/`, then install on strandz.it and check that
  the PWA installs, works offline after the first load, and loads Monochord from the same origin.

## Risks and open points

| Risk | Mitigation |
|---|---|
| The hidden-population estimate is not good enough, so the user hears poor offspring | The simulated-user test in Phase 3; the constants are tunable; the UCB `κ` term makes sure uncertain genomes do get heard |
| User fatigue: rating takes time | The motif-based generator gives a decent start, elitism stops progress being lost, and Loop plus keyboard voting make rating faster |
| AudioWorklet unavailable or failing on some phones | The loader reports a clear error. A fallback oscillator synth could be added later, but is not in scope now |
| The `profile.ttl` format changes | The subset parser is tested against several real profiles and fails with a line number on anything it does not understand. A missing digest fails the load rather than skipping verification |
| strandz.it is down or drops CORS | The service worker caches the verified plugin files, so a plugin that has loaded once keeps working. A custom IRI can point at a local or mirrored copy |
| A chosen plugin is not a pitched instrument (DrumKit, for example) or has a narrow note range | It is allowed, and its `cautions` are shown in the picker. Out-of-range notes are the plugin's to ignore |
| Queue limits differ between plugins (Monochord's is 512 events) | The player posts only the next 0.2 s of events rather than the whole melody, so no plugin's queue overflows; a `dropped` message is logged |
| Voice count and note stealing | Melogen is monophonic, so this does not apply. A note's release tail overlaps the next note, which is the instrument's natural behaviour |
