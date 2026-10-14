import type { Checkpoint } from '../../types';
import { RISK_TOKENS, riskVar } from '../../lib/tokens';
import { formatEta } from '../../lib/format';

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

/** Popup markup for a checkpoint (rendered by MapLibre outside React). */
export function checkpointPopupHtml(cp: Checkpoint): string {
  const tok = RISK_TOKENS[cp.risk_level];
  const eta = formatEta(cp.eta);
  const stat = (label: string, value: string) =>
    `<div><div class="eyebrow" style="font-size:9px">${label}</div><div class="num" style="font-size:13px;font-weight:600">${value}</div></div>`;
  const reasons = cp.reasons
    .map((r) => `<li style="margin:2px 0">${esc(r)}</li>`)
    .join('');
  return `
  <div style="min-width:232px;font-family:'Manrope Variable',sans-serif">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px">
      <div>
        <div class="eyebrow">Checkpoint</div>
        <div class="num" style="font-size:18px;font-weight:600;line-height:1.1">mi ${Math.round(cp.mile)}</div>
      </div>
      <span style="display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:999px;font:600 10px 'JetBrains Mono Variable',monospace;letter-spacing:.06em;color:${riskVar(cp.risk_level)};background:${riskVar(cp.risk_level, 0.14)};border:1px solid ${riskVar(cp.risk_level, 0.4)}">
        <span aria-hidden="true">${tok.glyph}</span>${esc(cp.risk_level.toUpperCase())}
      </span>
    </div>
    <div class="num" style="font-size:11px;color:rgb(var(--muted));margin-bottom:10px">ETA ${eta.day} ${eta.time}</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:8px 0;border-top:1px solid var(--hairline);border-bottom:1px solid var(--hairline)">
      ${stat('Wind', `${cp.wind_mph.toFixed(0)}<span style="font-size:10px;color:rgb(var(--muted))"> mph</span>`)}
      ${stat('Rain', `${cp.rain_in_hr.toFixed(2)}<span style="font-size:10px;color:rgb(var(--muted))"> in/h</span>`)}
      ${stat('Snow', `${cp.snow_in_hr.toFixed(2)}<span style="font-size:10px;color:rgb(var(--muted))"> in/h</span>`)}
    </div>
    <ul style="margin:8px 0 0;padding-left:14px;font-size:11.5px;line-height:1.4">${reasons}</ul>
    ${
      cp.load_escalated
        ? `<div style="margin-top:8px;font:600 10px 'JetBrains Mono Variable',monospace;letter-spacing:.08em;color:rgb(var(--accent))">LOAD RULE APPLIED</div>`
        : ''
    }
    ${
      cp.forecast_warning
        ? `<div style="margin-top:6px;font-size:10.5px;color:rgb(var(--muted))">${esc(cp.forecast_warning)}</div>`
        : ''
    }
  </div>`;
}
