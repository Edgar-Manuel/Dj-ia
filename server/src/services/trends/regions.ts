export const GLOBAL_REGION = 'global';

/**
 * Deezer's public API has no country-parameterized chart endpoint — the
 * documented way to get a per-country Top 100 is its editorial "Top
 * <Country>" playlists, which have stable ids. Resolved by hand via
 * `/search/playlist?q=Top+<Country>` and verified live on 2026-07-19.
 * Extend the same way; regions missing here fall back to the global chart.
 */
export const REGION_PLAYLISTS: ReadonlyMap<string, string> = new Map([
  ['es', '1116190041'], // Top Spain
  ['us', '1313621735'], // Top USA
  ['fr', '1109890291'], // Top France
  ['de', '1111143121'], // Top Germany
  ['gb', '1111142221'], // Top UK
  ['mx', '1111142361'], // Top Mexico
  ['br', '1111141961'], // Top Brazil
  ['ar', '1279119721'], // Top Argentina
  ['co', '1116188451'], // Top Colombia
  ['it', '1116187241'], // Top Italy
  ['nl', '1266971851'], // Top Netherlands
  ['cl', '1279119121'], // Top Chile
  ['pe', '1362518525'], // Top Peru
  ['pt', '1362519755'], // Top Portugal
  ['jp', '1362508955'], // Top Japan
  ['pl', '1266972311'], // Top Poland
  ['se', '1313620305'], // Top Sweden
  ['be', '1266968331'], // Top Belgium
  ['ca', '1652248171'], // Top Canada
  ['ie', '1313619455'], // Top Ireland
  ['ch', '1313617925'], // Top Switzerland
]);

const REGION_LABELS: Readonly<Record<string, string>> = {
  global: 'Global',
  es: 'España',
  us: 'Estados Unidos',
  fr: 'Francia',
  de: 'Alemania',
  gb: 'Reino Unido',
  mx: 'México',
  br: 'Brasil',
  ar: 'Argentina',
  co: 'Colombia',
  it: 'Italia',
  nl: 'Países Bajos',
  cl: 'Chile',
  pe: 'Perú',
  pt: 'Portugal',
  jp: 'Japón',
  pl: 'Polonia',
  se: 'Suecia',
  be: 'Bélgica',
  ca: 'Canadá',
  ie: 'Irlanda',
  ch: 'Suiza',
};

export function resolveRegionLabel(region: string): string {
  return REGION_LABELS[region] ?? region.toUpperCase();
}

export function supportedRegions(): string[] {
  return [GLOBAL_REGION, ...REGION_PLAYLISTS.keys()];
}
