import { Marker, type Map as MlMap } from 'maplibre-gl';
import { pointAt, type MeasuredLine } from '../../lib/geo';
import { formatClock } from '../../lib/format';

const TRUCK_SVG = `
<svg width="20" height="38" viewBox="0 0 20 38" aria-hidden="true">
  <rect x="2.5" y="12" width="15" height="25" rx="2" fill="var(--truck-trailer)" stroke="var(--truck-stroke)" stroke-width="1"/>
  <line x1="5" y1="17" x2="15" y2="17" stroke="var(--truck-stroke)" stroke-opacity=".35"/>
  <line x1="5" y1="22" x2="15" y2="22" stroke="var(--truck-stroke)" stroke-opacity=".35"/>
  <line x1="5" y1="27" x2="15" y2="27" stroke="var(--truck-stroke)" stroke-opacity=".35"/>
  <line x1="5" y1="32" x2="15" y2="32" stroke="var(--truck-stroke)" stroke-opacity=".35"/>
  <rect x="4" y="1.5" width="12" height="9.5" rx="3" fill="var(--truck-cab)" stroke="var(--truck-stroke)" stroke-width="1"/>
  <rect x="5.5" y="3" width="9" height="3" rx="1" fill="var(--truck-stroke)" fill-opacity=".55"/>
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
