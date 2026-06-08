// Interactive Optimizer — Preact sub-panel of the center column. Mode tabs +
// OHKO/2HKO target buttons + suggestion cards. Cards come pre-computed from
// DERIVED.optimizer (filled by runOptimizations); "Apply All" writes the spread
// to STATE. Replaces createOptionCardHTML/createImpossibleOptionCardHTML +
// bindApplyButtonsListeners.
import { html } from './preact.js';
import { STATE, DERIVED, update } from './store.js';
import { formatNatureDisplayName } from '../ui/render.js';

function applyCard(card) {
  update((s) => {
    if (card.type === 'survival') {
      s.defender.sps.hp = card.hp;
      if (card.stat === 'def') {
        s.defender.sps.def = card.def;
        s.defender.sps.spd = 0;
      } else {
        s.defender.sps.spd = card.def;
        s.defender.sps.def = 0;
      }
      if (card.nature) s.defender.nature = card.nature;
    } else {
      if (card.stat === 'atk') {
        s.attacker.sps.atk = card.sp;
        s.attacker.sps.spa = 0;
      } else {
        s.attacker.sps.spa = card.sp;
        s.attacker.sps.atk = 0;
      }
      if (card.nature) s.attacker.nature = card.nature;
    }
  });
}

function OptionCard({ card }) {
  const nat = formatNatureDisplayName(card.nature);
  if (card.impossible) {
    return html`
      <div class="border rounded-xl p-3 flex flex-col gap-1.5 opacity-40 cursor-not-allowed text-left bg-slate-800/10 border-slate-800/50">
        <div class="flex justify-between items-start">
          <div>
            <div class="text-[9px] text-slate-500 uppercase font-bold tracking-wider">${card.title}</div>
            <div class="text-xs font-bold text-slate-400 mt-0.5">Nature: <span>${nat}</span></div>
          </div>
          <span class="text-[9px] text-slate-500 font-bold border border-slate-800 px-1.5 py-0.5 rounded-lg shrink-0">Impossible</span>
        </div>
        <p class="text-[9px] text-slate-500 italic border-t border-slate-800/30 pt-1">Requires > 66 SP to achieve survival/KO</p>
      </div>`;
  }
  const isSurvival = card.theme === 'blue';
  const themeText = isSurvival ? 'text-blue-400' : 'text-amber-400';
  const themeBg = isSurvival
    ? 'bg-blue-950/25 border-blue-900/40 hover:border-blue-800/60'
    : 'bg-amber-950/25 border-amber-900/40 hover:border-amber-800/60';
  const themeBtn = isSurvival
    ? 'bg-blue-600 hover:bg-blue-500 focus:ring-blue-800'
    : 'bg-amber-600 hover:bg-amber-500 focus:ring-amber-800';
  const spread = isSurvival
    ? `${card.hp} HP / ${card.def} ${card.statName}`
    : `${card.sp} ${card.statName.toUpperCase()}`;
  return html`
    <div class=${`border rounded-xl p-3 flex flex-col gap-2 transition text-left ${themeBg}`}>
      <div class="flex justify-between items-start gap-3">
        <div>
          <div class="text-[9px] text-slate-400 uppercase font-extrabold tracking-wider">${card.title}</div>
          <div class="text-xs font-black text-white mt-0.5">Nature: <span class=${themeText}>${nat}</span></div>
        </div>
        <button onClick=${() => applyCard(card)}
          class=${`${themeBtn} text-white text-[9px] font-bold py-1 px-2 rounded-lg transition shrink-0`}>Apply All</button>
      </div>
      <div class="flex justify-between items-center text-[10px] border-t border-slate-800 pt-1.5 text-slate-400 font-mono">
        <span>Spread: <span class="font-bold text-slate-200">${spread}</span></span>
        <span>Total: <span class="font-bold text-slate-200">${card.total} SP</span></span>
      </div>
    </div>`;
}

export function OptimizerPanel() {
  const survival = STATE.mode === 'survival';
  const { notPossible, cards } = DERIVED.optimizer;

  const tabBase =
    'flex-1 text-center py-1.5 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5';
  const offCls = survival
    ? `${tabBase} text-slate-400 hover:text-white`
    : `${tabBase} bg-amber-600 text-white shadow`;
  const survCls = survival
    ? `${tabBase} bg-blue-600 text-white shadow`
    : `${tabBase} text-slate-400 hover:text-white`;

  const ohko = STATE.targetKO === 'ohko';
  const targetOn =
    'bg-amber-600 hover:bg-amber-500 text-white font-bold py-2 rounded-xl border border-amber-500/30 transition';
  const targetOff =
    'bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2 rounded-xl border border-slate-700 transition';

  const optionsBody = notPossible
    ? html`<div class="text-xs text-slate-500 italic p-4 text-center border border-slate-800 rounded-xl bg-slate-800/20">${survival ? 'Survival is impossible even with maximum defensive Nature & allocations' : 'Secure KO is impossible even with maximum offensive Nature & allocations'}</div>`
    : cards.length === 0
      ? html`<div class="text-xs text-slate-500 italic p-2 text-center">Select Pokémon & Move to see ${survival ? 'survival' : 'offense'} options</div>`
      : cards.map((c) => html`<${OptionCard} card=${c} />`);

  return html`
    <div class="bg-gradient-to-b from-slate-800 to-slate-900 border border-slate-700 border-t-2 border-t-amber-500/80 rounded-2xl p-5 shadow-xl flex flex-col min-h-[250px] pokemon-card">
      <div class="flex flex-col gap-3">
        <div class="bg-slate-900/50 border border-slate-700 rounded-xl p-1 flex w-full">
          <button class=${offCls} onClick=${() =>
            update((s) => {
              s.mode = 'offensive';
            })}>
            <i class="fa-solid fa-hand-fist"></i> Attacking
          </button>
          <button class=${survCls} onClick=${() =>
            update((s) => {
              s.mode = 'survival';
            })}>
            <i class="fa-solid fa-shield-halved"></i> Survival
          </button>
        </div>

        ${
          !survival &&
          html`
          <div class="flex flex-col gap-3">
            <label class="block text-xs font-bold text-slate-400 uppercase flex text-left">Target Outcome</label>
            <div class="grid grid-cols-2 gap-2 text-xs">
              <button class=${ohko ? targetOn : targetOff} onClick=${() =>
                update((s) => {
                  s.targetKO = 'ohko';
                })}>Guaranteed OHKO</button>
              <button class=${!ohko ? targetOn : targetOff} onClick=${() =>
                update((s) => {
                  s.targetKO = '2hko';
                })}>Guaranteed 2HKO</button>
            </div>
          </div>`
        }

        <div class="flex flex-col gap-3.5">
          <div class="text-xs font-bold text-slate-400 uppercase tracking-wider text-left">Suggested Options:</div>
          <div class="flex flex-col gap-3">${optionsBody}</div>
        </div>
      </div>
    </div>`;
}

// CenterPanel wrapper — the three sub-panels mounted into #panel-center.
import { ModifiersPanel } from './ModifiersPanel.js';
import { MovePanel } from './MovePanel.js';
import { useStore } from './preact.js';
export function CenterPanel() {
  useStore();
  return html`<${ModifiersPanel} /><${MovePanel} /><${OptimizerPanel} />`;
}
