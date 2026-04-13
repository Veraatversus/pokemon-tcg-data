window.TCG_TRACKER_SITE = {
  brandName: "Vera's Pokémon TCG Tracker",
  shortName: 'Pokémon TCG Tracker',
  supportEmail: 'veraatversus+tcg@gmail.com',
  githubUrl: 'https://github.com/Veraatversus/pokemon-tcg-data',
  upstreamUrl: 'https://github.com/PokemonTCG/pokemon-tcg-data',
  homepageUrl: 'https://veraatversus.github.io/pokemon-tcg-data/',
  appUrl: 'https://veraatversus.github.io/pokemon-tcg-data/frontend/tcg-tracker-web/',
  privacyUrl: 'https://veraatversus.github.io/pokemon-tcg-data/privacy.html',
  imprintUrl: 'https://veraatversus.github.io/pokemon-tcg-data/kontakt.html',
  verificationGuideUrl: 'https://github.com/Veraatversus/pokemon-tcg-data/blob/main/docs/GOOGLE_OAUTH_VERIFICATION_GUIDE.md',
  legalOwnerName: 'TODO: Betreibername ergänzen',
  legalAddress: [
    'TODO: Straße und Hausnummer ergänzen',
    'TODO: PLZ Ort ergänzen',
    'Deutschland / EU'
  ],
  lastUpdated: '6. April 2026'
};

(function hydrateSiteMeta() {
  const cfg = window.TCG_TRACKER_SITE;
  if (!cfg) return;

  document.querySelectorAll('[data-site]').forEach((el) => {
    const key = el.dataset.site;
    if (cfg[key]) el.textContent = cfg[key];
  });

  document.querySelectorAll('[data-site-href]').forEach((el) => {
    const key = el.dataset.siteHref;
    if (cfg[key]) el.setAttribute('href', cfg[key]);
  });

  document.querySelectorAll('[data-email]').forEach((el) => {
    el.textContent = cfg.supportEmail;
    if (el.tagName.toLowerCase() === 'a') {
      el.href = `mailto:${cfg.supportEmail}`;
    }
  });

  document.querySelectorAll('[data-owner]').forEach((el) => {
    el.textContent = cfg.legalOwnerName;
  });

  document.querySelectorAll('[data-owner-block]').forEach((el) => {
    el.innerHTML = [cfg.legalOwnerName, ...cfg.legalAddress].join('<br>');
  });

  document.querySelectorAll('[data-last-updated]').forEach((el) => {
    el.textContent = cfg.lastUpdated;
  });

  const placeholderText = [cfg.legalOwnerName, ...(cfg.legalAddress || [])].join(' ');
  const hasPlaceholders = /TODO/i.test(placeholderText);
  const warning = document.getElementById('placeholder-warning');
  if (warning) {
    warning.hidden = !hasPlaceholders;
  }

  const yearTargets = document.querySelectorAll('[data-current-year]');
  yearTargets.forEach((el) => {
    el.textContent = String(new Date().getFullYear());
  });
})();
