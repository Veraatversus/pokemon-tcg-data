// Aktionsregister: Ansichten rufen Funktionen anderer Ansichten nur ueber actions.<name>(...) auf.
// app.js registriert beim Start alle Ansichtsfunktionen mit registerActions.
const registry = new Map();

export const actions = new Proxy({}, {
  get(_target, name) {
    if (typeof name !== 'string') return undefined;
    if (!registry.has(name)) throw new Error(`Aktion "${name}" ist nicht registriert`);
    return registry.get(name);
  },
});

/**
 * Registriert Aktionen unter ihrem Namen. Doppelte Registrierung eines Namens wirft.
 * @param {Record<string, Function>} map
 */
export function registerActions(map) {
  for (const [name, fn] of Object.entries(map)) {
    if (registry.has(name)) throw new Error(`Aktion "${name}" ist bereits registriert`);
    registry.set(name, fn);
  }
}
