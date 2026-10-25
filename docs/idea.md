# Melogen

Melody/bassline generator which uses a genetic algorithm on the sequences (a genetic encoding of melodies will be needed).

Built as a responsive PWA. 

The user will act as the selection mechanism, ranking a selection of the melodies each generation. There will be crossover and mutation between each generation.

Sounds will be played through a Jig plugin, default /home/danny/github/jigdaw/plugins/monochord

## Usage

Three tabs : one for settings : octave selector, number of bars (default 8), time signature (4/4), tempo (default 120 bpm), crossover rate, mutation rate; one for interaction; one for instrument settings.

The user is presented with 5 rows of buttons, each corresponding to a different melody. When the user presses Play (a green arrow icon), it plays the melody. Next to play are - 0 + buttons for voting, as well as a button for download. Clicking download will give the user a .mid file of the corresponding melody. 

* make it very modular, no source files over 500 lines
* use Vitest for testing
* build in vanilla ESM Javascript
* git commands forbidden unless asked for