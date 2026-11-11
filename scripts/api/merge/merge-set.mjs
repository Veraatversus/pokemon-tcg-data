// Kanonisches v3-Set: pokemontcg-kompatible Oberfelder + i18n.de, ids, aliases (Spec §6).
import { resolveSetImages } from './images.mjs';

const compact = (obj) => {
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
};
const toNumber = (v) => {
  const n = typeof v === 'number' ? v : Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : null;
};

// Name: pt, sonst TCGdex EN, sonst erste vorhandene Sprache (z. B. franzoesische McDonald's-Sets).
const anyName = (langs) => (langs ? langs.en ?? Object.values(langs).find((v) => typeof v === 'string') : undefined);

export function mergeSet({ canonicalSetId, registrySet, ptSet = null, tcgdexSet = null, cardCount, assetsIndex, cardmarketTracker }) {
  const td = tcgdexSet;
  const tdImages = td ? resolveSetImages(assetsIndex, { lang: 'en', serieId: td.serieId, setId: td.id }) : {};
  const images = compact({
    logo: tdImages.logo ?? ptSet?.images?.logo,
    symbol: tdImages.symbol ?? ptSet?.images?.symbol,
  });
  const deLogo = td ? resolveSetImages(assetsIndex, { lang: 'de', serieId: td.serieId, setId: td.id }).logo : undefined;
  const de = compact({ name: td?.name?.de, images: deLogo ? { logo: deLogo } : undefined });
  // Synthetisierte pt-Sets (Kartendatei ohne Set-Eintrag, z. B. mep) haben nur die Id als Namen:
  // Name und gedruckte Gesamtzahl kommen dann aus TCGdex, nie die nackte Id.
  const synth = ptSet?.synthesized === true;
  const ptName = synth ? undefined : ptSet?.name;
  // Offizielle Zahl 0/fehlend (z. B. Promo-Sets ohne Zaehlung): Kartenzahl statt 0.
  const tdOfficial = td?.cardCountOfficial > 0 ? td.cardCountOfficial : undefined;
  const ptPrinted = synth ? tdOfficial ?? cardCount : ptSet?.printedTotal;
  const ptId = registrySet?.pokemontcg ?? ptSet?.id ?? null;
  const trackerId = ptId ? toNumber(cardmarketTracker?.bySetId?.[ptId]) : null;

  return compact({
    id: canonicalSetId,
    name: ptName ?? anyName(td?.name),
    series: ptSet?.series ?? td?.serieName?.en ?? undefined,
    printedTotal: ptPrinted ?? td?.cardCountOfficial ?? cardCount,
    total: cardCount,
    releaseDate: ptSet?.releaseDate ?? (td?.releaseDate ? td.releaseDate.replaceAll('-', '/') : undefined),
    ptcgoCode: ptSet?.ptcgoCode ?? td?.abbreviationOfficial ?? undefined,
    images: Object.keys(images).length ? images : undefined,
    i18n: Object.keys(de).length ? { de } : undefined,
    ids: {
      pokemontcg: ptId,
      tcgdex: registrySet?.tcgdex ?? td?.id ?? null,
      cardmarket: td?.cardmarketId ?? trackerId ?? null,
      tcgplayer: td?.tcgplayerId ?? null,
    },
    aliases: [...(registrySet?.aliases ?? [])],
  });
}
