export function initPwaFeatures({
  showToast = () => {},
  windowRef = globalThis.window,
  navigatorRef = globalThis.navigator,
  documentRef = globalThis.document,
  setIntervalRef = globalThis.setInterval,
} = {}) {
  if (!windowRef || !navigatorRef || !documentRef) return;

  if ('serviceWorker' in navigatorRef) {
    windowRef.addEventListener('load', async () => {
      try {
        const registration = await navigatorRef.serviceWorker.register('./service-worker.js', {
          scope: './'
        });

        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigatorRef.serviceWorker.controller) {
              newWorker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });

        // Check for updates periodically
        setIntervalRef(() => {
          registration.update().catch(err => console.warn('SW update check failed:', err));
        }, 60000);

        // Handle controller change (new SW ready)
        navigatorRef.serviceWorker.addEventListener('controllerchange', () => {
          showToast('🔄 App wurde aktualisiert', 'success', 1500);
          windowRef.setTimeout(() => {
            windowRef.location.reload();
          }, 300);
        });

        // Listen for messages from Service Worker
        navigatorRef.serviceWorker.addEventListener('message', (event) => {
          if (event.data.type === 'sync-complete') {
            showToast('✅ Daten synchronisiert', 'success', 2000);
          }
        });
      } catch (err) {
        console.warn('Service Worker registration failed:', err);
      }
    });
  }

  let deferredPrompt;
  let installBtn = null;
  const isAppInstalled = () => {
    const isStandalone = Boolean(navigatorRef.standalone);
    const hasMatchMedia = typeof windowRef.matchMedia === 'function';
    const isDisplayStandalone = hasMatchMedia && windowRef.matchMedia('(display-mode: standalone)').matches;
    return isStandalone || isDisplayStandalone;
  };
  const removeInstallButton = () => {
    if (installBtn?.parentElement) {
      installBtn.parentElement.removeChild(installBtn);
    }
    installBtn = null;
  };

  windowRef.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;

    // Show install button
    removeInstallButton();
    installBtn = documentRef.createElement('button');
    installBtn.className = 'btn-primary';
    installBtn.textContent = 'App installieren';
    installBtn.style.cssText = 'position: fixed; bottom: 20px; right: 20px; z-index: 100;';

    installBtn.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          showToast('App installiert!', 'success', 3000);
          removeInstallButton();
        }
        deferredPrompt = null;
      }
    });

    // Only show if not already installed
    if (documentRef.body && !isAppInstalled()) {
      documentRef.body.appendChild(installBtn);
    }
  });

  windowRef.addEventListener('appinstalled', () => {
    removeInstallButton();
    showToast('App erfolgreich installiert!', 'success', 4000);
  });
}