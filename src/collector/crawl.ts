// One collection run: newest public sets from the browse pages, plus older sets from DJs whose sets fit the focus.
// Remembers what it has read (as hashes, so no DJ names are stored) so weekly runs only read new sets.
import crypto from 'crypto';
import { parseSetPage, setLinks, browsePageCount } from './parse';
import { addSet, focusShare, type Store } from './aggregate';

export interface CrawlState {
  seenSets: Set<string>;  // hashed set paths already read
  seenDjs: Set<string>;   // hashed DJ names whose profile has been read
}

export interface CrawlOptions {
  fetchPage: (path: string) => Promise<string | null>; // null = could not load (skipped)
  focusArtists: Set<string>;
  minFocusShare: number;  // e.g. 0.3: at least 30% of a set by focus artists
  maxPages: number;       // page budget for this run (politeness)
  seedDjs?: string[];     // DJ profiles to read even if they haven't appeared on the browse pages
  log?: (msg: string) => void;
}

export const hash = (s: string) => crypto.createHash('sha1').update(s.toLowerCase()).digest('hex').slice(0, 16);

export async function crawl(store: Store, state: CrawlState, opts: CrawlOptions) {
  const log = opts.log ?? (() => {});
  let pages = 0;
  let kept = 0;
  let skipped = 0;
  const get = async (path: string) => {
    if (pages >= opts.maxPages) return null;
    pages++;
    return opts.fetchPage(path);
  };

  const focusDjs: string[] = [...(opts.seedDjs ?? [])];
  const readSet = async (link: string) => {
    const id = hash(link);
    if (state.seenSets.has(id)) return;
    const html = await get(link);
    if (html === null) return;
    state.seenSets.add(id);
    const tracks = parseSetPage(html);
    if (tracks.length < 5 || focusShare(tracks, opts.focusArtists) < opts.minFocusShare) {
      skipped++;
      return;
    }
    const dj = link.split('/')[2];
    addSet(store, tracks, hash(dj)); // anonymous id, so each DJ counts once per pair
    kept++;
    if (!focusDjs.includes(dj)) focusDjs.push(dj);
  };

  // 1. Newest sets from every DJ who publishes.
  const first = await get('/playlists/browse');
  if (first !== null) {
    const total = browsePageCount(first);
    let links = setLinks(first);
    for (let page = 1; ; page++) {
      for (const link of links) await readSet(link);
      if (page >= total || pages >= opts.maxPages) break;
      const html = await get(`/playlists/browse/page/${page + 1}`);
      if (html === null) break;
      links = setLinks(html);
    }
  }

  // 2. Older sets from DJs whose sets fit (each DJ's profile is read once, ever).
  for (let i = 0; i < focusDjs.length && pages < opts.maxPages; i++) {
    const dj = focusDjs[i];
    if (state.seenDjs.has(hash(dj))) continue;
    const html = await get(`/playlists/${dj}`);
    if (html === null) continue;
    state.seenDjs.add(hash(dj));
    for (const link of setLinks(html)) await readSet(link);
  }

  log(`read ${pages} pages: kept ${kept} sets, skipped ${skipped} that didn't fit`);
  return { pages, kept, skipped };
}
