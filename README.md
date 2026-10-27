# Next Up data

Song-to-song data used by the Next Up DJ app to suggest what to play next.

- `transitions.json`: for each song, the songs DJs most often played straight after it, with how many sets that happened in.
- `state.json`: the collector's progress (full counts, plus hashes of sets already read).

Built weekly from public DJ playlists. Only song names and counts are stored: no DJ names, set names or links.
