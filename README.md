# Next Up data

Song-to-song data used by the Next Up DJ app to suggest what to play next.

- `transitions.json`: for each song, the songs DJs most often played straight after it, with how many sets that happened in.
- `state.json`: the collector's progress (full counts, plus hashes of sets already read).

Built weekly from public DJ playlists. Only song names and counts are stored: no DJ names, set names or links.

## How it's collected

`.github/workflows/collect.yml` runs every Monday. It reads newly published public DJ sets (one page every 3 seconds, at most 1,500 pages a run), keeps the sets where at least 30% of tracks are by artists in `collector/focus-artists.json` (UK event, urban, Afrobeats and Caribbean music), and adds up which song followed which.

```
npm ci
npm test
npm run collect      # updates transitions.json and state.json here
```
