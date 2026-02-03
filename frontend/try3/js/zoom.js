/**
 * Pinch-to-Zoom Module
 * Provides touch-based zoom functionality for mobile devices
 */

class ZoomController {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.currentScale = 1;
    this.minScale = 0.75;
    this.maxScale = 2.5;
    this.initialDistance = 0;
    this.initialScale = 1;
    
    this.init();
  }

  init() {
    if (!this.container) {
      console.warn('[Zoom] Container not found');
      return;
    }

    // Apply initial transform
    this.container.style.transformOrigin = 'top left';
    this.container.style.transition = 'transform 0.2s ease-out';

    // Touch event listeners for pinch-to-zoom
    this.container.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: true });
    this.container.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: true });
    this.container.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: true });

    // Create zoom controls
    this.createZoomControls();
  }

  handleTouchStart(e) {
    if (e.touches.length === 2) {
      this.initialDistance = this.getDistance(e.touches[0], e.touches[1]);
      this.initialScale = this.currentScale;
      this.container.style.transition = 'none';
    }
  }

  handleTouchMove(e) {
    if (e.touches.length === 2) {
      const currentDistance = this.getDistance(e.touches[0], e.touches[1]);
      const scale = (currentDistance / this.initialDistance) * this.initialScale;
      this.setScale(scale);
    }
  }

  handleTouchEnd(e) {
    if (e.touches.length < 2) {
      this.container.style.transition = 'transform 0.2s ease-out';
    }
  }

  getDistance(touch1, touch2) {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  setScale(scale) {
    // Clamp scale between min and max
    this.currentScale = Math.max(this.minScale, Math.min(this.maxScale, scale));
    this.applyTransform();
    this.updateZoomDisplay();
  }

  applyTransform() {
    this.container.style.transform = `scale(${this.currentScale})`;
  }

  updateZoomDisplay() {
    const zoomPercent = document.getElementById('zoom-percent');
    if (zoomPercent) {
      zoomPercent.textContent = `${Math.round(this.currentScale * 100)}%`;
    }
  }

  zoomIn() {
    this.setScale(this.currentScale + 0.25);
  }

  zoomOut() {
    this.setScale(this.currentScale - 0.25);
  }

  resetZoom() {
    this.setScale(1);
  }

  createZoomControls() {
    // Check if controls already exist
    if (document.getElementById('zoom-controls')) return;

    const controls = document.createElement('div');
    controls.id = 'zoom-controls';
    controls.className = 'zoom-controls';
    controls.innerHTML = `
      <button id="zoom-out" class="zoom-btn" title="Verkleinern">−</button>
      <span id="zoom-percent" class="zoom-display">100%</span>
      <button id="zoom-in" class="zoom-btn" title="Vergrößern">+</button>
      <button id="zoom-reset" class="zoom-btn" title="Zurücksetzen">⟲</button>
    `;

    // Insert into main container instead of cards-section
    const mainContainer = document.getElementById('main-container');
    const cardsContainer = document.getElementById('cards-container');
    
    if (mainContainer && cardsContainer) {
      mainContainer.insertBefore(controls, cardsContainer);
    } else {
      console.warn('[Zoom] Could not find container to insert zoom controls');
      return;
    }

    // Add event listeners with null checks
    const zoomIn = document.getElementById('zoom-in');
    const zoomOut = document.getElementById('zoom-out');
    const zoomReset = document.getElementById('zoom-reset');
    
    if (zoomIn) zoomIn.addEventListener('click', () => this.zoomIn());
    if (zoomOut) zoomOut.addEventListener('click', () => this.zoomOut());
    if (zoomReset) zoomReset.addEventListener('click', () => this.resetZoom());
  }
}

// Export singleton instance
let zoomInstance = null;

export function initZoom(containerId = 'cards-container') {
  if (!zoomInstance) {
    zoomInstance = new ZoomController(containerId);
  }
  return zoomInstance;
}

export function getZoomInstance() {
  return zoomInstance;
}
