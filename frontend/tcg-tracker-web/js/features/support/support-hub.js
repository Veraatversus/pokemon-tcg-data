const SUPPORT_CHANNEL_META = Object.freeze({
  bug: {
    title: 'Bug melden',
    fallbackMessage: 'Bug-Formular noch nicht hinterlegt - ich öffne vorerst die Kontaktseite.'
  },
  feature: {
    title: 'Feature wünschen',
    fallbackMessage: 'Feature-Formular noch nicht hinterlegt - ich öffne vorerst die Kontaktseite.'
  },
  access: {
    title: 'Zugang beantragen',
    fallbackMessage: 'Access-Formular noch nicht hinterlegt - ich öffne vorerst die Kontaktseite.'
  }
});

function isConfiguredSupportUrl(url) {
  return Boolean(url) && !/replace|todo|example/i.test(String(url));
}

function resolveSupportTarget(kind, supportConfig = {}, baseHref = '') {
  const directUrl = String(supportConfig?.channels?.[kind] || '').trim();
  const fallbackUrl = String(supportConfig?.fallbackUrls?.[kind] || '../kontakt.html#projektkontakt').trim();
  return {
    directUrl,
    fallbackUrl: new URL(fallbackUrl, baseHref).toString()
  };
}

export function createSupportHubController({
  dom,
  supportConfig,
  showToast,
  windowRef = globalThis.window,
} = {}) {
  function openSupportHubDialog() {
    dom.supportHubDialog?.showModal();
  }

  function openSupportChannel(kind) {
    const safeKind = SUPPORT_CHANNEL_META[kind] ? kind : 'feature';
    const meta = SUPPORT_CHANNEL_META[safeKind];
    const { directUrl, fallbackUrl } = resolveSupportTarget(safeKind, supportConfig, windowRef.location.href);
    const targetUrl = isConfiguredSupportUrl(directUrl) ? directUrl : fallbackUrl;

    dom.supportHubDialog?.close();
    windowRef.open(targetUrl, '_blank', 'noopener,noreferrer');

    if (!isConfiguredSupportUrl(directUrl)) {
      showToast(meta.fallbackMessage, 'info', 5200);
    }
  }

  return {
    openSupportHubDialog,
    openSupportChannel,
  };
}