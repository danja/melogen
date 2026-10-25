# Melogen: the algorithm

Melogen breeds monophonic melodies and basslines with an interactive genetic algorithm (IGA). There is no fitness function
in code: the fitness is the user's votes. A melody is stored as a genome, decoded to notes for playback and MIDI export, and
changed by crossover and mutation between generations.

This document covers the genome, how genomes are decoded, how the first generation is made, the hidden population and how
fitness is estimated for melodies the user has not heard, selection, crossover and mutation. [plan.md](plan.md) covers how
it is built.

## 1. Constraints from the idea

- One instrument and one voice: a single line, whether melody or bass.
- Settings: octave, bars (default 8), time signature (default 4/4), tempo (default 120 bpm), crossover rate, mutation rate.
  These were added after the idea was discussed: **key root**, **scale** and a **Melody/Bass mode**.
- Each round shows 5 rows. A row has Play, three vote buttons (− 0 +) and Download (.mid).
- The population is **bigger than the 5 rows**. Melodies the user has not rated get an estimated fitness.

## 2. Musical frame

| Term | Definition |
|---|---|
| Step | A sixteenth note. All timing is on this grid |
| `stepsPerBar` | `numerator × 16 / denominator`: 4/4 → 16, 3/4 → 12, 6/8 → 12, 7/8 → 14 |
| `L` (genome length) | `bars × stepsPerBar`: 8 bars of 4/4 → 128 |
| Scale | An ordered list of semitone offsets inside an octave, e.g. major `[0,2,4,5,7,9,11]`, minor pentatonic `[0,3,5,7,10]`, chromatic `[0..11]` |
| Degree | An index into the scale extended over several octaves. Degree 0 is the root at the selected octave |
| `D` (degree range) | `scale.length × spanOctaves`. Melody: span 2 octaves. Bass: span 1.5 octaves, rounded up to whole degrees |

Pitches are stored as **degrees**, not MIDI note numbers. Two things follow:

1. Every mutation stays in key, because no gene can name a note outside the scale.
2. Changing the key, scale or octave in Settings re-decodes the whole population without changing a genome. The user can
   breed a line in C major and then hear it in D dorian.

Decoding a degree to MIDI:

```
octaveOffset = floor(degree / scale.length)
midi = 12 × (octave + 1) + root + 12 × octaveOffset + scale[degree mod scale.length]
```

Here `octave` is the Settings octave in scientific notation, so C4 = 60. The default is octave 4 for Melody and octave 2
for Bass.

## 3. Genome

A genome is a fixed-length array of `L` step genes plus a small header:

```js
{
  id: 'g7-12',          // generation-index; for display and lineage
  steps: [ { kind, degree, velocity }, ... ],   // length L
  parents: ['g6-3', 'g6-9'] | [],
  origin: 'random' | 'crossover' | 'mutation' | 'elite' | 'immigrant'
}
```

Each step gene:

| Field | Values | Meaning |
|---|---|---|
| `kind` | `NOTE` \| `HOLD` \| `REST` | `NOTE` starts a new note. `HOLD` extends the sounding note by one step. `REST` is silence |
| `degree` | `0 … D-1` | Pitch, read only when `kind = NOTE` |
| `velocity` | `0 … 3` | Accent level, mapped to MIDI 60 / 80 / 100 / 120 |

All three fields are kept on every step, including `HOLD` and `REST`, where they are ignored. A pitch that is silent now
can come back if a mutation turns the step into a `NOTE` again. A `HOLD` after a `REST`, or at step 0, decodes as a `REST`.

The array is stored as three typed arrays (`Uint8Array` each for kind, degree and velocity), so cloning, distance and
storage are cheap. A 128-step genome is 384 bytes.

### Why a fixed-length step grid

- Crossover at bar boundaries is index arithmetic, and bars cut from one parent line up with the other parent.
- Distance between two genomes compares steps at the same index.
- The other option, a variable-length list of `(pitch, duration)` events, models melody more naturally. But crossover
  needs alignment, and a single mutation can shift every later note out of the bar.

### Decoding

```
notes = []
for i in 0..L-1:
  g = steps[i]
  if g.kind == NOTE: close current note; open {startStep:i, lengthSteps:1, midi:degreeToMidi(g.degree), vel:g.velocity}
  if g.kind == HOLD and a note is open: current.lengthSteps += 1
  else if g.kind == HOLD: treat as REST
  if g.kind == REST: close current note
close current note
```

The decoder outputs `{startStep, lengthSteps, midi, velocity}` records. Playback converts them to seconds with
`stepSeconds = 60 / tempo / 4`. MIDI export converts them to ticks (480 PPQ, 120 ticks per step). Notes are slightly
detached: the note-off comes 5% of a step early, so repeated notes on the same pitch retrigger cleanly.

## 4. The first generation

Uniform random genes sound like noise and waste the user's first votes. The first generation, and every immigrant
(§7.4), is drawn from a biased generator with simple musical priors that depend on the mode. Each genome:

1. **Picks a motif length** of 1 or 2 bars and a **form** from `AAAA`, `AABA`, `ABAB`, `AABB` or `ABAC`, chosen at random.
2. **Generates each distinct section** (A, B, C):
   - **Rhythm.** Each step is a `NOTE` with probability `pOnset(stepPosition)`. Downbeats are more likely than beats, and
     beats more likely than off-beats. Otherwise the step is a `HOLD` (probability `pHold`) or a `REST`.
     Melody: average density about 0.45 onsets per step. Bass: about 0.3, with a strong downbeat bias.
   - **Pitch.** A random walk over degrees. Melody: a step of ±1 with probability 0.6, ±2 with 0.25, a leap of 3–5 with
     0.15. Bass: favours chord tones (degrees 0, 2 and 4 of the scale, plus the octave), with leaps more common. The walk
     is reflected at 0 and `D-1`.
   - **Velocity.** Downbeats get 2–3 and the rest 1–2.
3. **Builds the bars** from the form. A repeated section is copied, then given a light variation with probability 0.5:
   one point mutation, or a transposition of ±1–2 degrees.
4. **Ends** with a note on a chord tone (degree 0, 2 or 4) held to the end of the last bar, with probability 0.7. This
   gives a cadence.

All randomness goes through one seeded PRNG (mulberry32), so runs reproduce and the tests are deterministic.

## 5. Hidden population and estimated fitness

### 5.1 Sizes

| Parameter | Default | Notes |
|---|---|---|
| `N` population | 20 | Settable from 10 to 50 |
| `K` shown per round | 5 | Fixed by the UI |
| Rounds per generation | 1 or more | After rating a round the user can press **More** to hear 5 more from the same generation, or **Evolve** to breed |

### 5.2 Ratings

Each melody in the current generation is either **unrated** or rated −1, 0 or +1. Unrated is not the same as 0. A 0 says
"heard it, neutral" and counts as evidence. Votes can be changed until the user presses Evolve.

Every rated genome also goes into an **archive** of `(genome, rating, generation)`, capped at 200 entries with the oldest
dropped first. The archive lets the estimator use what the user liked in earlier generations.

### 5.3 Distance

`d(a, b)` lies in [0, 1] and combines three components, each normalised to [0, 1]:

- **Rhythm** `dR`: Hamming distance between the onset patterns (`kind = NOTE`), divided by `L`.
- **Pitch** `dP`: for each step where both genomes have a sounding note, `|pitchA − pitchB| / D`, averaged. If no step
  sounds in both, `dP = 1`. Comparing the pitch that is sounding, not only the onsets, means held notes count.
- **Contour** `dC`: the fraction of consecutive note pairs whose direction (up, same, down) differs, after both note lists
  are resampled to the same number of points (16). This catches two melodies with the same shape in different registers.

`d = 0.4·dR + 0.35·dP + 0.25·dC`. These weights are starting values, kept in one constants module so they can be tuned.

### 5.4 Estimating fitness

For a genome `x` with no rating, a kernel-weighted average of the ratings it resembles (Nadaraya–Watson regression),
shrunk towards a prior:

```
w_i   = exp(-(d(x, x_i) / σ)²) · γ^(age_i)        over every rated genome i (this generation + archive)
f̂(x)  = (Σ w_i·r_i + λ·prior(x)) / (Σ w_i + λ)
u(x)  = λ / (Σ w_i + λ)                          uncertainty in [0, 1]
```

- `σ = 0.18` sets how alike two melodies must be before one's rating counts for the other. It is set from measurement: the
  median distance between two unrelated random melodies is 0.41 (10th to 90th percentile 0.33 to 0.49), so at this σ an
  unrelated rating weighs about 0.5%, while a child sharing half its bars with a rated parent (distance about 0.2) still
  weighs about 30%. At σ = 0.25 an unrelated rating still carried about 7%, which blurred the estimate.
- `γ = 0.7` per generation discounts older votes. Taste moves as the population moves.
- `λ = 0.5` sets how strongly the estimate is pulled to the prior when there is little nearby evidence.
- `prior(x)` is the mean fitness of `x`'s parents in the previous generation, using their actual rating where they had
  one and their estimate otherwise. For random genomes and immigrants it is 0.

A rated genome's fitness is its rating. The kernel is used only for unrated genomes.

### 5.5 Which 5 to show

The first round of a generation, and every **More**, picks `K` unrated genomes. Each pick should be informative and
likely to be good, and the five should differ from each other.

1. Score each unrated genome by an upper confidence bound: `s(x) = f̂(x) + κ·u(x)`, with `κ = 0.6`.
2. Pick the highest-scoring genome. Then pick greedily by `s(x) + β·min_j d(x, chosen_j)` with `β = 0.5`, so the five
   are spread across the population rather than five near-copies.
3. If an elite (§7.1) is in the generation, it may take at most one slot, and only as a reference. Its earlier rating is
   shown pre-filled and can be changed.

When every genome has been rated, **More** is disabled.

## 6. Selection

When the user presses **Evolve**:

1. Each genome's fitness `F(x)` is its rating if rated and `f̂(x)` otherwise.
2. **Exclusion.** Genomes rated −1 are never parents. A − vote is an instruction and should not be watered down by chance.
3. **Parents** are chosen by tournament: draw 3 at random from the eligible genomes and keep the one with the highest `F`.
   Ties are broken at random. Tournament selection is used rather than roulette because `F` can be negative.
4. If fewer than 2 genomes are eligible, for example because everything heard was −1, the next generation is mostly
   immigrants (§7.4).

## 7. Building the next generation

The next generation's `N` slots are filled in this order.

### 7.1 Elitism

Every genome rated +1 is copied unchanged, up to `E = 2`. If more than 2 were rated +1, two are chosen at random. If none
were, the unrated genome with the highest `f̂` is copied, provided `f̂ > 0.3`. Elites keep their rating in the archive, so
the estimator still has an anchor.

### 7.2 Offspring

Repeat until `N − E − I` children exist, where `I` is the number of immigrants:

1. Pick parents A and B by tournament, with B ≠ A where possible.
2. With probability **crossover rate** (Setting, default 0.7), the child is `crossover(A, B)`. Otherwise it is a clone of A.
3. Apply `mutate(child, mutation rate)` (Setting, default 0.1).
4. If the child is identical to a genome already in the generation (distance 0), mutate it again, up to 3 times.

### 7.3 Crossover

One operator is chosen at random for each child:

| Operator | Weight | Description |
|---|---|---|
| Bar one-point | 0.4 | Choose a bar boundary `c`. The child takes bars `[0, c)` from A and `[c, bars)` from B |
| Bar two-point | 0.3 | Choose two bar boundaries. The child takes the middle section from B and the rest from A |
| Bar uniform | 0.2 | Each bar comes from A or B with probability 0.5 |
| Beat one-point | 0.1 | As bar one-point, but the cut can fall on any beat. This allows finer recombination |

Cuts are aligned to bars or beats so that phrases are not split mid-figure. A `HOLD` at the first step after a cut that
follows a `REST` decodes as a rest (§3). The child is therefore always valid and needs no repair.

### 7.4 Immigrants

`I = max(1, round(0.1·N))` fresh genomes from the §4 generator, to stop the population converging too early. If fewer
than 2 genomes were eligible as parents, `I = N − E`.

### 7.5 Mutation

The mutation rate `m` (Setting, 0 to 1) scales two kinds of operator.

**Point operators.** Each step is tested independently with probability `m / 4`, then one operator is applied:

| Operator | Weight | Effect |
|---|---|---|
| Pitch nudge | 0.35 | degree ± 1 (bounded) |
| Pitch leap | 0.10 | degree ± 2–5 (bounded) |
| Toggle onset | 0.20 | `NOTE` ↔ `HOLD` (split or merge a note) |
| Toggle rest | 0.15 | `REST` ↔ `NOTE` (with the step's stored degree) |
| Velocity | 0.20 | velocity ± 1 (bounded) |

**Segment operators.** Each bar is tested with probability `m / 2`, then one operator is applied to that bar:

| Operator | Weight | Effect |
|---|---|---|
| Transpose | 0.30 | Every degree in the bar ± 1–3, keeping the bar's shape |
| Copy bar | 0.25 | Overwrite the bar with another bar of the same genome. This builds motif repetition, which listeners tend to reward |
| Invert | 0.15 | Reflect degrees around the bar's first pitch |
| Retrograde | 0.10 | Reverse the bar's note order, keeping its rhythm |
| Rhythm shift | 0.20 | Rotate the bar's genes by ±1 or ±2 steps |

At the default `m = 0.1`, a 128-step, 8-bar genome expects about 3 point changes and 0.4 bar changes per child. That is
enough to hear the difference from the parent while keeping its character. All bounded values are clamped to their range,
not wrapped, because a wrapped degree would jump two octaves.

## 8. When the user changes settings mid-run

| Setting | Effect on the population |
|---|---|
| Tempo, octave, key, scale | None. They only change decoding and playback |
| Mode (Melody/Bass) | Only future random genomes and immigrants follow the new mode's priors. The default octave also changes. Existing genomes are kept |
| Bars | Genomes are resized. Shorter: truncate. Longer: append copies of the existing bars, cycling through them in order |
| Time signature | `stepsPerBar` changes, so the genomes cannot be mapped meaningfully. After a confirmation dialog, a new population is created |
| Population size N | Applied at the next Evolve. A larger N is filled with immigrants. A smaller N drops the genomes with the lowest `F` |
| Crossover / mutation rate | Applied at the next Evolve |

The degree range `D` depends on the scale length and mode. If it shrinks, stored degrees are clamped when decoded and the
genome itself is left unchanged.

## 9. Playback and export

- **Playback.** Decoded notes become MIDI note-on and note-off messages, `{ frame, bytes }`. `frame` is an absolute
  stream position, `startFrame + seconds × sampleRate`, with `startFrame` taken from `context.currentTime` plus 50 ms of
  lookahead. The events are posted to the chosen instrument's node as `{ type: 'events', events }`, as described in
  jigdaw `docs/messaging.md`. They are posted a short lookahead (0.2 s) ahead of the playhead rather than all at once, because a
  processor's queue is bounded and the limit differs between plugins (Monochord's is 512), and because queued events
  cannot be recalled. Starting another row, or pressing Stop, sends note-off for every note plus CC 123 (all notes off),
  once immediately and again when the posted window has passed; a melody started straight afterwards waits for that.
- **Export.** A Standard MIDI File, format 0, 480 PPQ, with tempo, time signature and key signature meta events, then the
  notes on channel 1. The filename is `melogen-g{generation}-{index}.mid`.

## 10. Constants

Every tunable value above lives in one module (`src/ga/constants.js`) and is passed into functions, not imported deep in
them, so tests can override any value:

```
N=20 K=5 E=2 IMMIGRANT_FRACTION=0.1 TOURNAMENT=3
SIGMA=0.18 GAMMA=0.7 LAMBDA=0.5 KAPPA=0.6 BETA=0.5 ARCHIVE_MAX=200
DIST_WEIGHTS={rhythm:0.4, pitch:0.35, contour:0.25}
POINT_RATE_FACTOR=0.25 SEGMENT_RATE_FACTOR=0.5
```
