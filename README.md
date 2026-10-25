# Melogen

Breed melodies and basslines by ear. A genetic algorithm proposes five melodies; you vote on them with − 0 +; the next
generation is bred from what you liked. You are the fitness function. Any melody can be downloaded as a `.mid` file.

It is a responsive PWA in vanilla ES modules, with no runtime dependencies and no build step. Sound comes from a
[Jig](https://strandz.it/jigdaw/) plugin, Monochord by default, which you can change on the Instrument tab.

- How the genetic algorithm works: [docs/algorithm.md](docs/algorithm.md)
- How it is built, and what changed on the way: [docs/plan.md](docs/plan.md)

## Using it

1. **Interact.** Press ▶ on a row to hear it, then vote: − dislike, 0 neutral, + like. Votes can be changed or cleared.
   **More** shows five more from the same generation (you hear five at a time out of twenty; the rest are estimated from
   how much they resemble what you have voted on). **Evolve** breeds the next generation. Keys: `1`–`5` play a row, then
   `-` `0` `+` vote on the one playing, `Space` stops.
2. **Settings.** Melody or bass, key, scale, octave, bars (8), time signature (4/4), tempo (120), crossover rate,
   mutation rate, population size, loop. Changing the time signature starts a new population (it asks first).
3. **Instrument.** Pick any instrument from the jigdaw catalogue, or paste the address of any Jig plugin. The controls are
   built from the plugin's own description. Your choice and its settings are remembered.

The session (settings, votes, population) is kept in `localStorage`. After the first visit the app works offline.

## The instrument

On first load the default, `https://strandz.it/jigdaw/plugins/monochord/`, is written to `localStorage`. Add
`?plugin=<address>` to the URL to use another for one session without saving it.

Nothing is run until it has been checked: the plugin's `profile.ttl` gives a SHA-384 digest for its processor and
WebAssembly module, and the files are hashed in the browser and compared before they are loaded. A plugin that needs
something Melogen does not provide (a transport, say) is refused before any code is fetched.

## Running it

```sh
npm install        # only needed for the tests (vitest, jsdom)
npm run serve      # http://127.0.0.1:47219/
MELOGEN_DEV=1 npm run serve    # re-reads the file list on every request, for development
JIGDAW_PLUGINS=/path/to/jigdaw/plugins npm run serve    # also serve a local plugins folder at /plugins/
npm test
npm run check:size # no source file over 500 lines
```

`PORT` and `HOST` set where it listens (default `127.0.0.1:47219`, loopback only). Append `?debug` to the URL to expose the
running app as `window.melogen` in the console.

## Deploying

Served at `https://strandz.it/melogen/` by nginx in front of the Node server:

1. Needs Node 18 or newer (the server uses no newer APIs). Check out into `/home/github/melogen` (or edit `WorkingDirectory` in the unit).
2. `sudo cp deploy/melogen.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now melogen`
3. Include `deploy/nginx/melogen.conf` in the `server { server_name strandz.it; }` block and reload nginx.
4. To update: `git pull`, then `sudo systemctl restart melogen`. The server hashes the app files at start and the service
   worker's cache version follows, so there is no cache to bump.

`curl localhost:47219/healthz` answers `ok`; logs are in `journalctl -u melogen`.

## Layout

```
index.html  manifest.webmanifest  sw.js  config.js  styles/  icons/
src/
  ga/       genome, generation, distance, fitness estimate, selection, crossover, mutation, population
  music/    scales, timing, genome -> notes
  midi/     MIDI events for a plugin, Standard MIDI File writer
  audio/    Turtle parser, profile reader, integrity check, plugin loader, player, instrument session
  state/    settings, localStorage
  ui/       tabs, the three views, helpers
  controller.js  app.js  main.js  keyboard.js
server/     the static server and the app-shell list
deploy/     systemd unit, nginx location
tests/      Vitest; mirrors src/
```

MIT licence.
