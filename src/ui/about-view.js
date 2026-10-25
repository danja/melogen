// The About tab: what Melogen is and how it works, in plain words. Static.

import { h } from './dom.js'
import { REPO_URL, JIG_SPEC_URL } from '../../config.js'

const link = (href, text) => h('a', { href, target: '_blank', rel: 'noopener' }, text)

export function createAboutView () {
  const el = h('section', { class: 'about-page' },
    h('p', { class: 'lead' },
      'Melogen breeds short melodies and basslines. You are the judge: it plays you five, you vote on them, and the next ' +
      'batch is bred from the ones you liked.'),

    h('h2', {}, 'How it works'),
    h('ol', {},
      h('li', {}, h('strong', {}, 'Start. '),
        'Twenty random melodies are made. They are not noise: each is built from a short motif that repeats in a pattern ' +
        'such as AABA, with the strong beats favoured, and every note is in the key and scale you chose.'),
      h('li', {}, h('strong', {}, 'Listen and vote. '),
        'Press play on a row, then vote − (dislike), 0 (neutral) or + (like). You only hear five at a time. For the others, ' +
        'Melogen guesses how you would vote from how much each one resembles melodies you have already rated, and shows ' +
        'you the ones that look promising or that it knows least about. ',
        h('em', {}, 'More'), ' brings the next five.'),
      h('li', {}, h('strong', {}, 'Evolve. '),
        'Parents are chosen from the melodies you did not dislike, and better-liked ones are more likely to be picked. ' +
        'Crossover swaps whole bars between two parents. Mutation makes small changes: nudging a note, changing the ' +
        'rhythm, or transposing, repeating, inverting or reversing a bar. Your favourite is carried over unchanged, and ' +
        'a few fresh random melodies are mixed in so the population does not get stuck.'),
      h('li', {}, h('strong', {}, 'Repeat. '),
        'Each generation should sound more like what you like. Download any melody as a .mid file to use elsewhere.')),

    h('h2', {}, 'Settings worth knowing'),
    h('ul', {},
      h('li', {}, 'Melodies are stored as positions in the scale, so changing the key, scale, octave or tempo replays the ' +
        'same melodies differently without starting over.'),
      h('li', {}, 'A higher mutation rate gives bigger changes between generations; a higher crossover rate mixes parents more.'),
      h('li', {}, 'Changing the time signature starts a new population, because the melodies cannot be mapped across.'),
      h('li', {}, 'Keys: 1 to 5 play a row, then − 0 + vote on the one playing, and Space stops it.')),

    h('h2', {}, 'The sound'),
    h('p', {},
      'Sound comes from a Jig, a plugin format native to the web. A Jig is just a web address: fetching it installs it. ' +
      'Its description lists every file with a checksum, and Melogen checks each file against its checksum before running ' +
      'anything. The Instrument tab lets you pick another Jig, or paste the address of any other. Read the ',
      link(JIG_SPEC_URL, 'Jig plugin specification'), '.'),

    h('h2', {}, 'Your data'),
    h('p', {},
      'Everything stays in your browser: your settings, votes and melodies are saved locally and never sent anywhere. ' +
      'The only things fetched from the network are the instrument files. After the first visit the app works offline.'),

    h('h2', {}, 'Source'),
    h('p', {}, 'Melogen is open source under the MIT licence. ', link(REPO_URL, 'Code and issues on GitHub'), '.'))

  return { el }
}
