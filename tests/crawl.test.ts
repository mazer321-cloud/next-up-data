import { describe, it, expect } from 'vitest';
import { crawl, hash, type CrawlState } from '../src/collector/crawl';
import { emptyStore, toDataFile } from '../src/collector/aggregate';

// A tiny fake serato.com: two browse pages, a profile, and sets.
const setHtml = (rows: string[]) => rows.map((r) => `<div class="playlist-trackname">${r}</div>`).join('');
const afro = ['Asake - Lonely At The Top', 'Burna Boy - Last Last', 'Rema - Calm Down', 'Wizkid - Essence', 'Davido - Unavailable'];
const techno = ['Nobody - Track 1', 'Nobody - Track 2', 'Nobody - Track 3', 'Nobody - Track 4', 'Nobody - Track 5'];
const site: Record<string, string> = {
  '/playlists/browse': '<a href="/playlists/DJ_Afro/s1"></a><a href="/playlists/DJ_Techno/t1"></a><a href="/playlists/browse/page/2"></a>',
  '/playlists/browse/page/2': '<a href="/playlists/DJ_Afro/s1"></a>',
  '/playlists/DJ_Afro': '<a href="/playlists/DJ_Afro/s1"></a><a href="/playlists/DJ_Afro/old"></a><a href="/playlists/DJ_Afro/live"></a>',
  '/playlists/DJ_Techno': '<a href="/playlists/DJ_Techno/t2"></a>',
  '/playlists/DJ_Afro/s1': setHtml(afro),
  '/playlists/DJ_Afro/old': setHtml([...afro].reverse()),
  '/playlists/DJ_Techno/t1': setHtml(techno),
  '/playlists/DJ_Techno/t2': setHtml(techno),
};
const focusArtists = new Set(['asake', 'burnaboy', 'rema', 'wizkid', 'davido']);
const fresh = (): CrawlState => ({ seenSets: new Set(), seenDjs: new Set() });

function fakeFetch(requested: string[]) {
  return async (path: string) => {
    requested.push(path);
    return site[path] ?? null;
  };
}

describe('a collection run', () => {
  it('keeps sets that fit the focus, then reads older sets from those DJs only', async () => {
    const requested: string[] = [];
    const store = emptyStore();
    const result = await crawl(store, fresh(), { fetchPage: fakeFetch(requested), focusArtists, minFocusShare: 0.3, maxPages: 100 });
    expect(result.kept).toBe(2); // s1 + old
    expect(result.skipped).toBe(1); // t1
    expect(requested).toContain('/playlists/DJ_Afro');
    expect(requested).not.toContain('/playlists/DJ_Techno'); // never read a non-focus DJ's profile
    expect(requested.filter((p) => p === '/playlists/DJ_Afro/s1')).toHaveLength(1); // each set read once
    expect(toDataFile(store, { minCount: 1, perSong: 5, updated: 'x' }).next['asake|lonelyatthetop']).toEqual([['burnaboy|lastlast', 1]]);
  });

  it('skips everything already read on an earlier run', async () => {
    const state = fresh();
    await crawl(emptyStore(), state, { fetchPage: fakeFetch([]), focusArtists, minFocusShare: 0.3, maxPages: 100 });
    const requested: string[] = [];
    const store = emptyStore();
    const second = await crawl(store, state, { fetchPage: fakeFetch(requested), focusArtists, minFocusShare: 0.3, maxPages: 100 });
    expect(second.kept).toBe(0);
    expect(requested.every((p) => p.includes('/browse'))).toBe(true); // only the browse pages, to look for new sets
  });

  it('stops at the page budget', async () => {
    const requested: string[] = [];
    await crawl(emptyStore(), fresh(), { fetchPage: fakeFetch(requested), focusArtists, minFocusShare: 0.3, maxPages: 2 });
    expect(requested).toHaveLength(2);
  });

  it('remembers sets and DJs as hashes, not names', async () => {
    const state = fresh();
    await crawl(emptyStore(), state, { fetchPage: fakeFetch([]), focusArtists, minFocusShare: 0.3, maxPages: 100 });
    expect(state.seenDjs.has(hash('DJ_Afro'))).toBe(true);
    expect([...state.seenSets, ...state.seenDjs].join(' ')).not.toMatch(/afro|techno/i);
  });
});
