// Results HUD — Preact island rendering the headline result in two layouts from
// the shared DERIVED.model (built by buildResultModel): the desktop pinned bar
// (#results-hud) and the mobile bottom overlay (#mobile-floating-overlay). Mounted
// twice, once per variant. Replaces the DOM-mirroring half of result-summary.js.
import { html, useStore } from './preact.js';
import { DERIVED } from './store.js';

// Badge bg/text/border per verdict tone; speed/move use just a text color.
const BADGE_TONES = {
  emerald: 'bg-emerald-950/60 text-emerald-400 border-emerald-900/30',
  amber: 'bg-amber-950/60 text-amber-400 border-amber-900/30',
  sky: 'bg-sky-950/60 text-sky-400 border-sky-900/30',
  red: 'bg-red-950/60 text-red-400 border-red-900/30',
  slate: 'bg-slate-800 text-slate-400 border-slate-700',
};
const TEXT_TONES = {
  emerald: 'text-emerald-400',
  amber: 'text-amber-400',
  sky: 'text-sky-400',
  red: 'text-red-400',
  slate: 'text-slate-400',
};

function VerdictBadge({ verdict }) {
  if (verdict.roll) {
    return html`
      <div class="flex flex-col items-center justify-center leading-none gap-0.5">
        <span>${verdict.label}</span>
        <span class="text-[10px] font-extrabold opacity-85 tracking-normal font-sans tabular-nums">${verdict.chance != null ? verdict.chance : '(roll)'}</span>
      </div>`;
  }
  return html`<span class="leading-none">${verdict.label}</span>`;
}

function Gauge({ model, h: barH }) {
  return html`
    <div class=${`relative flex-1 ${barH} rounded-full bg-slate-800/80 overflow-hidden ring-1 ring-slate-700/50`}>
      <div class=${`absolute inset-y-0 left-0 opacity-40 transition-all duration-300 ${model.gaugeTier}`} style=${`width:${model.maxFill}%`}></div>
      <div class=${`absolute inset-y-0 left-0 transition-all duration-300 ${model.gaugeTier}`} style=${`width:${model.minFill}%`}></div>
    </div>`;
}

export function ResultsHUD({ variant }) {
  useStore();
  const model = DERIVED.model;
  if (!model) return null;
  const v = model.verdict;
  const mobile = variant === 'mobile';

  const iconWrapBase = mobile
    ? 'flex items-center justify-center w-8 h-8 rounded-lg shrink-0 shadow-inner border'
    : 'flex items-center justify-center w-10 h-10 rounded-xl shrink-0 shadow-inner border';
  const iconBase = mobile ? 'fa-solid text-xs' : 'fa-solid';
  const badgeBase = mobile
    ? 'h-8 px-3 rounded-lg flex items-center justify-center text-[10px] font-black uppercase select-none tracking-wider border'
    : 'h-10 px-4 rounded-lg flex items-center justify-center text-sm font-black uppercase select-none tracking-wider border';
  const matchupCls = mobile
    ? 'text-sm font-medium text-slate-100 truncate leading-tight'
    : 'text-2xl xl:text-3xl font-medium text-slate-100 truncate leading-none';
  const moveCls = mobile
    ? `text-[10px] font-bold truncate leading-none mt-1.5 ${TEXT_TONES[model.moveTone]}`
    : `text-[11px] font-bold truncate leading-none mt-2 ${TEXT_TONES[model.moveTone]}`;
  const pctCls = mobile
    ? 'text-sm font-medium text-slate-100 leading-tight tabular-nums'
    : 'text-2xl xl:text-3xl font-medium text-slate-100 leading-none tabular-nums';
  const speedCls = mobile
    ? `text-[10px] font-extrabold tracking-wide leading-none ${TEXT_TONES[model.speed.tone]}`
    : `text-[11px] font-extrabold tracking-wide leading-none ${TEXT_TONES[model.speed.tone]}`;

  const icon = html`
    <div class=${`${iconWrapBase} ${model.iconTone}`}>
      <i class=${`${iconBase} ${model.iconGlyph}`}></i>
    </div>`;
  const left = html`
    <div class=${mobile ? 'flex items-center gap-2.5 min-w-0' : 'flex items-center gap-4 min-w-0'}>
      ${icon}
      <div class="flex flex-col min-w-0">
        <h2 class=${matchupCls}>${model.matchup}</h2>
        <p class=${moveCls}>${model.moveText}</p>
      </div>
    </div>`;
  const right = html`
    <div class=${mobile ? 'flex items-center gap-3 shrink-0 text-right' : 'flex items-center gap-6 shrink-0'}>
      <div class=${mobile ? 'flex flex-col items-end justify-center gap-1.5' : 'flex flex-col items-end justify-center text-right gap-2'}>
        <span class=${pctCls}>${model.pct}</span>
        <span class=${speedCls}>${model.speed.label}</span>
      </div>
      <div class=${`${badgeBase} ${BADGE_TONES[v.tone]}`}><${VerdictBadge} verdict=${v} /></div>
    </div>`;

  if (mobile) {
    // The #mobile-floating-overlay container supplies rotom-aura + fixed layout.
    return html`
      <div class="flex items-center justify-between gap-3.5">${left}${right}</div>
      <div class="flex items-center"><${Gauge} model=${model} h="h-1.5" /></div>`;
  }
  // Desktop: reproduce the #results-hud inner (sticky wrapper + rotom-aura card).
  return html`
    <div id="results-hud-inner" class="max-w-[1440px] mx-auto px-5 lg:px-6">
      <div class="rotom-aura rounded-2xl">
        <div id="desktop-results-bar" class="rounded-2xl border border-slate-700/80 shadow-xl overflow-hidden bg-slate-900/95 backdrop-blur-md">
          <div class="max-w-[1440px] mx-auto px-6 py-3 flex items-center justify-between gap-6">${left}${right}</div>
          <div class="max-w-[1440px] mx-auto px-6 pb-2.5 flex items-center"><${Gauge} model=${model} h="h-2" /></div>
        </div>
      </div>
    </div>`;
}
