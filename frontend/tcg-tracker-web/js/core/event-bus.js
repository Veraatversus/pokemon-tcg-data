/**
 * Centralized Event Bus for decoupled communication.
 * Provides a single point for publishing and subscribing to application events.
 *
 * Usage:
 *   eventBus.on('quick-filters-changed', (detail) => { ... })
 *   eventBus.emit('quick-filters-changed', { filter, sort })
 *   eventBus.off('event-name', handler)
 */

class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  /**
   * Subscribe to an event.
   * @param {string} eventName - Event name
   * @param {Function} handler - Callback function(detail)
   * @returns {Function} - Unsubscribe function
   */
  on(eventName, handler) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, []);
    }
    this.listeners.get(eventName).push(handler);

    // Return unsubscribe function for convenience
    return () => this.off(eventName, handler);
  }

  /**
   * Subscribe to an event once.
   * @param {string} eventName - Event name
   * @param {Function} handler - Callback function(detail)
   */
  once(eventName, handler) {
    const wrapper = (detail) => {
      handler(detail);
      this.off(eventName, wrapper);
    };
    this.on(eventName, wrapper);
  }

  /**
   * Unsubscribe from an event.
   * @param {string} eventName - Event name
   * @param {Function} handler - Handler to remove
   */
  off(eventName, handler) {
    if (!this.listeners.has(eventName)) return;
    const handlers = this.listeners.get(eventName);
    const idx = handlers.indexOf(handler);
    if (idx >= 0) handlers.splice(idx, 1);
    if (handlers.length === 0) this.listeners.delete(eventName);
  }

  /**
   * Emit an event to all subscribers.
   * @param {string} eventName - Event name
   * @param {*} detail - Event detail/data
   */
  emit(eventName, detail = null) {
    if (!this.listeners.has(eventName)) return;
    const handlers = this.listeners.get(eventName);
    for (const handler of handlers) {
      try {
        handler(detail);
      } catch (error) {
        console.error(`EventBus error in ${eventName}:`, error);
      }
    }
  }

  /**
   * Clear all listeners for an event (or all if no name given).
   * @param {string} eventName - Event name (optional)
   */
  clear(eventName = null) {
    if (eventName) {
      this.listeners.delete(eventName);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Get count of listeners for debugging.
   * @param {string} eventName - Event name (optional)
   * @returns {number}
   */
  listenerCount(eventName) {
    if (!eventName) return this.listeners.size;
    return (this.listeners.get(eventName) || []).length;
  }
}

// Singleton instance
export const eventBus = new EventBus();

/**
 * Bridge between centralized eventBus and native browser events.
 * This allows subscribing to browser events through the eventBus.
 *
 * Usage:
 *   bridgeWindowEvent('hashchange', eventBus, 'route-changed')
 *   eventBus.on('route-changed', (e) => { ... })
 */
export function bridgeWindowEvent(nativeEventName, targetBus, busEventName) {
  window.addEventListener(nativeEventName, (e) => {
    targetBus.emit(busEventName, e);
  });
}

/**
 * Bridge between browser element events and eventBus.
 *
 * Usage:
 *   bridgeElementEvent(dom.selector, 'change', eventBus, 'set-selected')
 *   eventBus.on('set-selected', () => { ... })
 */
export function bridgeElementEvent(element, nativeEventName, targetBus, busEventName) {
  if (!element) return;
  element.addEventListener(nativeEventName, (e) => {
    targetBus.emit(busEventName, e);
  });
}
