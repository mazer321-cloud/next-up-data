import { describe, it, expect } from 'vitest';
import { parseSetPage, setLinks, browsePageCount } from '../src/collector/parse';
import { emptyStore, addSet, toDataFile, focusShare } from '../src/collector/aggregate';

// Made-up pages in the same format as serato.com/playlists (real pages are not copied into this public repo).
const row = (name: string) =>
  `<div class="playlist-track ">\n  <div class="playlist-tracktime">00:00:00</div>\n  <div class="playlist-trackname">\n    ${name}\t\t\t\t</div>\n</div>`;
const SET = [row('Stevie Wonder - Signed, Sealed, Delivered I&#039;m Yours'), row('Martha Reeves &amp; The Vandellas - Heatwave'), row(''), row('Jason Mraz - Im Yours')].join('');
const PROFILE = '<a href="/playlists/Some_DJ"></a><a href="/playlists/Some_DJ/wedding-one"></a><a href="/playlists/Some_DJ/wedding-one"></a><a href="/playlists/Some_DJ/live"></a><a href="/playlists/faqs"></a>';
const BROWSE = '<a href="/playlists/DJ_A/27-10-2026"></a><a href="/playlists/DJ_B/live"></a><a href="/playlists/browse/page/2"></a><a href="/playlists/browse/page/50"></a>';

describe('reading Serato playlist pages', () => {
  it('reads a set in play order, decoding HTML and skipping blank rows', () => {
    expect(parseSetPage(SET)).toEqual([
      { artist: 'Stevie Wonder', title: "Signed, Sealed, Delivered I'm Yours" },
      { artist: 'Martha Reeves & The Vandellas', title: 'Heatwave' },
      { artist: 'Jason Mraz', title: 'Im Yours' },
    ]);
  });

  it('splits on the first " - " only, and keeps rows with no artist out', () => {
    expect(parseSetPage(row('Rema - Calm Down - Clean'))).toEqual([{ artist: 'Rema', title: 'Calm Down - Clean' }]);
    expect(parseSetPage(row('Just a title'))).toEqual([]);
  });

  it('finds set links once each, without profile, live, browse or help pages', () => {
    expect(setLinks(PROFILE)).toEqual(['/playlists/Some_DJ/wedding-one']);
    expect(setLinks(BROWSE)).toEqual(['/playlists/DJ_A/27-10-2026']);
    expect(browsePageCount(BROWSE)).toBe(50);
  });
});

describe('turning sets into "played next" counts', () => {
  const set = (...names: string[]) => names.map((n) => ({ artist: n.split(':')[0], title: n.split(':')[1] }));

  it('counts each song-to-next-song step, merging versions of the same song', () => {
    const store = emptyStore();
    addSet(store, set('Asake:Lonely At The Top', 'Burna Boy:Last Last', 'Rema:Calm Down'));
    addSet(store, set('Asake:Lonely At The Top (Intro Clean)', 'Burna Boy ft. Someone:Last Last (Dirty)'));
    const data = toDataFile(store, { minCount: 1, perSong: 10, updated: '2026-10-27' });
    expect(data.sets).toBe(2);
    expect(data.next['asake|lonelyatthetop']).toEqual([['burnaboy|lastlast', 2]]);
    expect(data.next['burnaboy|lastlast']).toEqual([['rema|calmdown', 1]]);
  });

  it('skips a song followed by another version of itself, and counts a pair once per set', () => {
    const store = emptyStore();
    addSet(store, set('A:One', 'A:One (Clean)', 'B:Two', 'A:One', 'B:Two'));
    const data = toDataFile(store, { minCount: 1, perSong: 10, updated: 'x' });
    expect(data.next['a|one']).toEqual([['b|two', 1]]);
    expect(data.next['b|two']).toEqual([['a|one', 1]]);
  });

  it('keeps only the strongest follow-ups per song and drops one-offs when asked', () => {
    const store = emptyStore();
    for (let i = 0; i < 3; i++) addSet(store, set('A:One', 'B:Two'));
    addSet(store, set('A:One', 'C:Three'));
    addSet(store, set('A:One', 'D:Four'));
    expect(toDataFile(store, { minCount: 2, perSong: 10, updated: 'x' }).next['a|one']).toEqual([['b|two', 3]]);
    expect(toDataFile(store, { minCount: 1, perSong: 2, updated: 'x' }).next['a|one']).toHaveLength(2);
  });

  it('stores no DJ names or links, only song keys, counts and a display name per song', () => {
    const store = emptyStore();
    addSet(store, set('Asake:Lonely At The Top', 'Burna Boy:Last Last'));
    const data = toDataFile(store, { minCount: 1, perSong: 10, updated: 'x' });
    expect(Object.keys(data).sort()).toEqual(['names', 'next', 'sets', 'updated', 'version']);
    expect(data.names['asake|lonelyatthetop']).toBe('Asake - Lonely At The Top');
  });
});

describe('focus on the kind of sets that match', () => {
  it('measures how much of a set is by artists on the focus list', () => {
    const focus = new Set(['asake', 'burnaboy', 'rema']);
    const tracks = [
      { artist: 'Asake', title: 'x' }, { artist: 'Burna Boy ft. Ed Sheeran', title: 'y' },
      { artist: 'Someone Else', title: 'z' }, { artist: 'Another', title: 'w' },
    ];
    expect(focusShare(tracks, focus)).toBe(0.5);
    expect(focusShare([], focus)).toBe(0);
  });
});
