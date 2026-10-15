import { Marker, type Map as MlMap } from 'maplibre-gl';
import { pointAt, type MeasuredLine } from '../../lib/geo';
import { formatClock } from '../../lib/format';

/**
 * Modern top-down aerodynamic semi-truck SVG:
 * - Sleeper cab with aerodynamic roof fairing, windshield, side mirrors
 * - Fifth wheel hitch connection
 * - 53ft trailer with ribbed roof lines, rear door latches, and red taillights
 * - Subtle halo drop-shadow filter
 */
const TRUCK_SVG = `
<svg width="24" height="46" viewBox="0 0 24 46" aria-hidden="true" style="overflow:visible; filter: drop-shadow(0 3px 6px rgba(0,0,0,0.55));">
  <!-- Subtle route beacon halo -->
  <circle cx="12" cy="23" r="20" fill="none" stroke="#FFA62B" stroke-width="1.2" stroke-opacity="0.35" stroke-dasharray="3 3"/>
  
  <!-- 53ft Trailer (Rear) -->
  <rect x="4.5" y="15" width="15" height="29" rx="2" fill="#E2E5EA" stroke="#1A1D23" stroke-width="1.2"/>
  
  <!-- Trailer roof corrugation/rib lines -->
  <line x1="6.5" y1="19" x2="17.5" y2="19" stroke="#9EA3AE" stroke-width="0.8"/>
  <line x1="6.5" y1="24" x2="17.5" y2="24" stroke="#9EA3AE" stroke-width="0.8"/>
  <line x1="6.5" y1="29" x2="17.5" y2="29" stroke="#9EA3AE" stroke-width="0.8"/>
  <line x1="6.5" y1="34" x2="17.5" y2="34" stroke="#9EA3AE" stroke-width="0.8"/>
  <line x1="6.5" y1="39" x2="17.5" y2="39" stroke="#9EA3AE" stroke-width="0.8"/>

  <!-- Rear safety bumper & taillights -->
  <rect x="5.5" y="42.5" width="3.2" height="1.2" fill="#E53E3E"/>
  <rect x="15.3" y="42.5" width="3.2" height="1.2" fill="#E53E3E"/>

  <!-- Fifth-wheel hitch pivot -->
  <rect x="10.5" y="12.5" width="3" height="3.5" rx="0.8" fill="#2D3748"/>

  <!-- Cab Side Mirrors -->
  <rect x="3.2" y="6" width="1.6" height="3.2" rx="0.5" fill="#2D3748"/>
  <rect x="19.2" y="6" width="1.6" height="3.2" rx="0.5" fill="#2D3748"/>

  <!-- Sleeper Cab (Front) -->
  <path d="M 5.5 13 L 5.5 5 C 5.5 3 7 1.8 12 1.8 C 17 1.8 18.5 3 18.5 5 L 18.5 13 Z" fill="#FFA62B" stroke="#1A1D23" stroke-width="1.2"/>

  <!-- Windshield -->
  <path d="M 7 4.8 Q 12 3.6 17 4.8 L 16.2 7.2 Q 12 6.2 7.8 7.2 Z" fill="#1A202C"/>

  <!-- Dual Headlights -->
  <rect x="6.2" y="2" width="2.2" height="1.2" rx="0.5" fill="#FFFBEB"/>
  <rect x="15.6" y="2" width="2.2" height="1.2" rx="0.5" fill="#FFFBEB"/>
</svg>`;

/** Custom SVG truck that drives along the selected route with a live ETA label. */
export class TruckAnimator {
  private readonly el: HTMLDivElement;
  private readonly rot: HTMLDivElement;
  private readonly label: HTMLDivElement;
  private readonly marker: Marker;
  private line: MeasuredLine | null = null;
  private departure = 0;
  private durationSec = 0;
  private miles = 0;
  private t = 0;
  private raf = 0;
  private last = 0;
  private lastLabel = 0;
  private enabled = true;
  private attached = false;

  constructor(
    private readonly map: MlMap,
    private readonly reducedMotion: boolean,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'truck-marker';
    this.el.innerHTML = `<div class="truck-rot" style="transform-origin:50% 50%">${TRUCK_SVG}</div><div class="truck-label"></div>`;
    this.rot = this.el.firstElementChild as HTMLDivElement;
    this.label = this.el.lastElementChild as HTMLDivElement;
    this.marker = new Marker({ element: this.el, anchor: 'center' });
  }

  setRoute(line: MeasuredLine, departureIso: string, durationSec: number, miles: number): void {
    this.line = line;
    this.departure = new Date(departureIso).getTime();
    this.durationSec = durationSec;
    this.miles = miles;
    this.t = 0;
    this.place(0);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (on) this.start();
    else this.stop(true);
  }

  start(): void {
    if (!this.line || !this.enabled) return;
    if (!this.attached) {
      this.marker.addTo(this.map);
      this.attached = true;
    }
    this.place(this.t);
    if (this.reducedMotion) return;
    cancelAnimationFrame(this.raf);
    this.last = performance.now();
    const loopMs = Math.min(26_000, Math.max(12_000, this.miles * 14));
    const tick = (now: number) => {
      const dt = now - this.last;
      this.last = now;
      this.t = (this.t + dt / loopMs) % 1;
      this.place(this.t);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(detach = false): void {
    cancelAnimationFrame(this.raf);
    if (detach && this.attached) {
      this.marker.remove();
      this.attached = false;
    }
  }

  private place(t: number): void {
    if (!this.line || this.line.coords.length < 2) return;
    const { pos, bearing } = pointAt(this.line, t);
    this.marker.setLngLat([pos[1], pos[0]]);
    this.rot.style.transform = `rotate(${bearing.toFixed(1)}deg)`;
    const now = performance.now();
    if (now - this.lastLabel > 120) {
      this.lastLabel = now;
      const eta = new Date(this.departure + t * this.durationSec * 1000);
      this.label.textContent = `${formatClock(eta)} · mi ${Math.round(t * this.miles)}`;
    }
  }
}
