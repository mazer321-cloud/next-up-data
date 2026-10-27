// Reads public Serato playlist pages (serato.com/playlists): set tracklists, and links to sets.
// Plain string parsing: the pages are simple server-rendered HTML.

export interface PlayedTrack { artist: string; title: string }

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeHtml(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m);
}

/** A set page's tracks in play order. Rows are "Artist - Title"; rows without an artist are skipped. */
export function parseSetPage(html: string): PlayedTrack[] {
  const tracks: PlayedTrack[] = [];
  for (const m of html.matchAll(/class="playlist-trackname">([\s\S]*?)<\/div>/g)) {
    const name = decodeHtml(m[1]).replace(/\s+/g, ' ').trim();
    const split = name.indexOf(' - ');
    if (split <= 0) continue;
    const artist = name.slice(0, split).trim();
    const title = name.slice(split + 3).trim();
    if (artist && title) tracks.push({ artist, title });
  }
  return tracks;
}

const NOT_SETS = new Set(['live', 'browse', 'faqs', 'how-to', 'page']);

/** Links to individual sets ("/playlists/<dj>/<set>") on a browse or profile page, each listed once. */
export function setLinks(html: string): string[] {
  const links = new Set<string>();
  for (const m of html.matchAll(/href="(\/playlists\/[^"/?#]+\/[^"/?#]+)"/g)) {
    const [, , dj, set] = m[1].split('/');
    if (dj === 'browse' || NOT_SETS.has(set)) continue;
    links.add(m[1]);
  }
  return [...links];
}

/** How many browse pages exist ("/playlists/browse/page/50" -> 50); 1 if there are no page links. */
export function browsePageCount(html: string): number {
  const pages = [...html.matchAll(/href="\/playlists\/browse\/page\/(\d+)"/g)].map((m) => Number(m[1]));
  return pages.length ? Math.max(...pages) : 1;
}
