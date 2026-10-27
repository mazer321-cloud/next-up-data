// Song identity used everywhere: different files/edits of the same song share one key.
// Ignores the edit in brackets, accents ("à" = "a"), featured artists and a trailing BPM ("Peru 108").
// Letters from any alphabet count (Greek titles keep their own identity).
const plain = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const word = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, '');

// Library sizes are bounded, and the same tracks are keyed on every track change, so remember results.
const keyCache = new Map<string, string>();
const artistCache = new Map<string, Set<string>>();

export const mainArtist = (artist: string) => word(plain(artist.split(/ ft\.? | feat\.? |,|&| x |\//i)[0] ?? ''));

export function songKey(artist: string, title: string): string {
  const cacheKey = `${artist}\u0000${title}`;
  let key = keyCache.get(cacheKey);
  if (key === undefined) {
    key = `${mainArtist(artist)}|${word(plain(title).replace(/\(.*?\)|\[.*?\]/g, '').trim().replace(/(\D)\s+\d{2,3}$/, '$1'))}`;
    keyCache.set(cacheKey, key);
  }
  return key;
}

/** Every credited artist ("Asake ft. Olamide & Gunna" -> asake, olamide, gunna). */
export function artistsOf(artist: string): Set<string> {
  let set = artistCache.get(artist);
  if (!set) {
    set = new Set(plain(artist).split(/ ft\.? | feat\.? |,|&| x |\/| and /i).map(word).filter(Boolean));
    artistCache.set(artist, set);
  }
  return set;
}
