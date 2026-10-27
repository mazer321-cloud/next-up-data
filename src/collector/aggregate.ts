// Turns DJ sets into "after song A, DJs played song B" counts. Only song keys and counts are kept:
// no DJ names, set names or links end up in the published data.
import { songKey, artistsOf } from '../recommend/key';
import type { PlayedTrack } from './parse';

export interface Store {
  sets: number;
  pairs: Map<string, Map<string, number>>; // song key -> next song key -> number of sets
  names: Map<string, string>;              // song key -> "Artist - Title" as first seen
}

/** The published file Next Up downloads. */
export interface CrowdData {
  version: 1;
  updated: string;
  sets: number;
  next: Record<string, [string, number][]>; // strongest follow-ups first
  names: Record<string, string>;
}

export const emptyStore = (): Store => ({ sets: 0, pairs: new Map(), names: new Map() });

export function addSet(store: Store, tracks: PlayedTrack[]): void {
  const keys = tracks.map((t) => {
    const key = songKey(t.artist, t.title);
    if (!store.names.has(key)) store.names.set(key, `${t.artist} - ${t.title}`);
    return key;
  });
  const seen = new Set<string>(); // each A->B step counts once per set, however often it was repeated
  for (let i = 0; i + 1 < keys.length; i++) {
    const [a, b] = [keys[i], keys[i + 1]];
    if (a === b || !a.includes('|') || seen.has(`${a}\u0000${b}`)) continue;
    seen.add(`${a}\u0000${b}`);
    let after = store.pairs.get(a);
    if (!after) store.pairs.set(a, (after = new Map()));
    after.set(b, (after.get(b) ?? 0) + 1);
  }
  store.sets++;
}

export function toDataFile(store: Store, opts: { minCount: number; perSong: number; updated: string }): CrowdData {
  const next: CrowdData['next'] = {};
  const names: CrowdData['names'] = {};
  for (const [a, after] of store.pairs) {
    const top = [...after].filter(([, n]) => n >= opts.minCount)
      .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
      .slice(0, opts.perSong);
    if (!top.length) continue;
    next[a] = top;
    for (const key of [a, ...top.map(([b]) => b)]) names[key] = store.names.get(key) ?? key;
  }
  return { version: 1, updated: opts.updated, sets: store.sets, next, names };
}

/** Share of a set's tracks by an artist on the focus list (any credited artist counts). */
export function focusShare(tracks: PlayedTrack[], focusArtists: Set<string>): number {
  if (!tracks.length) return 0;
  const hits = tracks.filter((t) => [...artistsOf(t.artist)].some((a) => focusArtists.has(a))).length;
  return hits / tracks.length;
}
