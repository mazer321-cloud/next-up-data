// Turns DJ sets into "after song A, how many different DJs played song B" counts. Counting DJs (not sets)
// stops one DJ who repeats the same routine across many sets from looking like a crowd favourite.
// DJs are only ever seen here as anonymous ids (hashes, kept in the private progress file); the published file
// has song keys and counts only.
import { songKey, artistsOf } from '../recommend/key';
import type { PlayedTrack } from './parse';

export interface Store {
  sets: number;
  djs: Set<string>;                             // anonymous DJ ids that contributed
  pairs: Map<string, Map<string, Set<string>>>; // song key -> next song key -> anonymous DJ ids
  names: Map<string, string>;                   // song key -> "Artist - Title" as first seen
}

/** The published file Next Up downloads. Counts are numbers of different DJs. */
export interface CrowdData {
  version: 2;
  updated: string;
  sets: number;
  djs: number;
  next: Record<string, [string, number][]>; // strongest follow-ups first
  names: Record<string, string>;
}

export const emptyStore = (): Store => ({ sets: 0, djs: new Set(), pairs: new Map(), names: new Map() });

export function addSet(store: Store, tracks: PlayedTrack[], djId: string): void {
  const keys = tracks.map((t) => {
    const key = songKey(t.artist, t.title);
    if (!store.names.has(key)) store.names.set(key, `${t.artist} - ${t.title}`);
    return key;
  });
  for (let i = 0; i + 1 < keys.length; i++) {
    const [a, b] = [keys[i], keys[i + 1]];
    if (a === b || !a.includes('|')) continue;
    let after = store.pairs.get(a);
    if (!after) store.pairs.set(a, (after = new Map()));
    let djs = after.get(b);
    if (!djs) after.set(b, (djs = new Set()));
    djs.add(djId);
  }
  store.djs.add(djId);
  store.sets++;
}

export function toDataFile(store: Store, opts: { minCount: number; perSong: number; updated: string }): CrowdData {
  const next: CrowdData['next'] = {};
  const names: CrowdData['names'] = {};
  for (const [a, after] of store.pairs) {
    const top = [...after].map(([b, djs]) => [b, djs.size] as [string, number])
      .filter(([, n]) => n >= opts.minCount)
      .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
      .slice(0, opts.perSong);
    if (!top.length) continue;
    next[a] = top;
    for (const key of [a, ...top.map(([b]) => b)]) names[key] = store.names.get(key) ?? key;
  }
  return { version: 2, updated: opts.updated, sets: store.sets, djs: store.djs.size, next, names };
}

/** Share of a set's tracks by an artist on the focus list (any credited artist counts). */
export function focusShare(tracks: PlayedTrack[], focusArtists: Set<string>): number {
  if (!tracks.length) return 0;
  const hits = tracks.filter((t) => [...artistsOf(t.artist)].some((a) => focusArtists.has(a))).length;
  return hits / tracks.length;
}
