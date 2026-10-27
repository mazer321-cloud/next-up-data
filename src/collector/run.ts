// Command line: node out/collector/run.js --data <folder> [--max-pages 1500] [--min-count 1]
// Reads <folder>/state.json (progress + full counts), crawls, then writes state.json and transitions.json there.
// Focus artists and seed DJs come from collector/focus-artists.json and collector/seeds.json in the repo.
import fs from 'fs';
import path from 'path';
import { crawl } from './crawl';
import { emptyStore, toDataFile, type Store } from './aggregate';

const BASE = 'https://serato.com';
const USER_AGENT = 'NextUpCollector/0.1 (+https://github.com/mazer321-cloud/next-up-data)';
const DELAY_MS = 3000; // one page every 3 seconds at most

interface SavedState {
  sets: number;
  pairs: Record<string, Record<string, number>>;
  names: Record<string, string>;
  seenSets: string[];
  seenDjs: string[];
}

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const value = i >= 0 ? process.argv[i + 1] : fallback;
  if (value === undefined) throw new Error(`missing --${name}`);
  return value;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let lastRequest = 0;
async function fetchPage(pagePath: string): Promise<string | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const wait = lastRequest + DELAY_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
    try {
      const res = await fetch(BASE + pagePath, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(120_000) });
      if (res.status === 404) return null;
      if (res.ok) return await res.text();
      console.error(`[collect] ${pagePath}: HTTP ${res.status}`);
      if (res.status === 429 || res.status >= 500) await sleep(30_000); // back off if the site is busy
    } catch (err) {
      console.error(`[collect] ${pagePath}: ${(err as Error).message}`);
    }
  }
  return null;
}

function load(file: string): { store: Store; seenSets: Set<string>; seenDjs: Set<string> } {
  if (!fs.existsSync(file)) return { store: emptyStore(), seenSets: new Set(), seenDjs: new Set() };
  const s = JSON.parse(fs.readFileSync(file, 'utf8')) as SavedState;
  const pairs = new Map(Object.entries(s.pairs).map(([a, after]) => [a, new Map(Object.entries(after))]));
  return { store: { sets: s.sets, pairs, names: new Map(Object.entries(s.names)) }, seenSets: new Set(s.seenSets), seenDjs: new Set(s.seenDjs) };
}

function save(file: string, store: Store, seenSets: Set<string>, seenDjs: Set<string>) {
  const s: SavedState = {
    sets: store.sets,
    pairs: Object.fromEntries([...store.pairs].map(([a, after]) => [a, Object.fromEntries(after)])),
    names: Object.fromEntries(store.names),
    seenSets: [...seenSets],
    seenDjs: [...seenDjs],
  };
  fs.writeFileSync(file, JSON.stringify(s));
}

async function main() {
  const dataDir = arg('data');
  const repoDir = path.join(__dirname, '..', '..', 'collector');
  const focusArtists = new Set(JSON.parse(fs.readFileSync(path.join(repoDir, 'focus-artists.json'), 'utf8')) as string[]);
  const seedDjs = JSON.parse(fs.readFileSync(path.join(repoDir, 'seeds.json'), 'utf8')) as string[];
  const statePath = path.join(dataDir, 'state.json');
  const { store, seenSets, seenDjs } = load(statePath);
  const before = store.sets;

  const result = await crawl(store, { seenSets, seenDjs }, {
    fetchPage,
    focusArtists,
    minFocusShare: 0.3,
    maxPages: Number(arg('max-pages', '1500')),
    seedDjs,
    log: (m) => console.log(`[collect] ${m}`),
  });

  fs.mkdirSync(dataDir, { recursive: true });
  save(statePath, store, seenSets, seenDjs);
  const data = toDataFile(store, { minCount: Number(arg('min-count', '1')), perSong: 15, updated: new Date().toISOString().slice(0, 10) });
  fs.writeFileSync(path.join(dataDir, 'transitions.json'), JSON.stringify(data));
  console.log(`[collect] ${store.sets - before} new sets (${store.sets} total), ${Object.keys(data.next).length} songs with follow-ups; pages read: ${result.pages}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
