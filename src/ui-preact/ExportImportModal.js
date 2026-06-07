// Export / Import matchup modal (Preact). Replaces the vanilla bindExportImportModal
// glue in app.js + the #ei-modal markup. Opened via openExportImport() (called by
// the header's Export/Import button); reads/writes the matchup as shareable text
// through props the app wires in (augmentedState + applyMatchup live in app.js).
import { html, useState, useLayoutEffect, useRef } from './preact.js';
import { createEmitter, useSubscription } from './reactive.js';
import { exportMatchup, importMatchup } from '../data/matchup-text.js';

// Tiny open-state store so the header button can trigger the modal from afar.
const ei = { open: false };
const { subscribe, notify } = createEmitter();
export function openExportImport() { ei.open = true; notify(); }
function close() { ei.open = false; notify(); }

export function ExportImportModal({ augmentedState, applyMatchup }) {
  useSubscription(subscribe);

  const taRef = useRef(null);
  const [status, setStatus] = useState('');
  const [importing, setImporting] = useState(false);

  // Populate + focus the textarea each time the modal opens.
  useLayoutEffect(() => {
    if (!ei.open) return;
    setStatus('');
    setImporting(false);
    if (taRef.current) {
      taRef.current.value = exportMatchup(augmentedState());
      taRef.current.focus();
      taRef.current.select();
    }
  }, [ei.open]);

  if (!ei.open) return null;

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(taRef.current.value);
      setStatus('Copied to clipboard!');
    } catch (err) {
      // Clipboard API may be blocked; fall back to selecting the text.
      taRef.current.select();
      setStatus('Press Ctrl/Cmd+C to copy.');
    }
  };

  const onImport = async () => {
    const parsed = importMatchup(taRef.current.value);
    if (!parsed) {
      setStatus("Couldn't read that — expected an \"Attacker:\" / \"Defender:\" block.");
      return;
    }
    setStatus('Loading…');
    setImporting(true);
    const ok = await applyMatchup(parsed);
    setImporting(false);
    if (ok) close();
    else setStatus('Failed to load — check the Pokémon names are spelled correctly.');
  };

  return html`
    <div class="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
      onClick=${(e) => { if (e.target === e.currentTarget) close(); }}>
      <div class="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col gap-3 p-5">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-extrabold text-cyan-400 flex items-center gap-2">
            <i class="fa-solid fa-right-left"></i> Export / Import Matchup
          </h3>
          <button onClick=${close} class="text-slate-400 hover:text-white text-lg leading-none px-1" title="Close">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <p class="text-[11px] text-slate-400 leading-snug">
          Copy this text to share the matchup, or paste someone else's and hit Import to load it.
        </p>
        <textarea ref=${taRef} spellcheck="false" rows="12"
          class="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-500 resize-y"></textarea>
        <div class="flex items-center justify-between gap-2">
          <span class="text-[11px] text-cyan-400 font-bold min-h-[1rem]">${status}</span>
          <div class="flex gap-2">
            <button onClick=${onCopy} class="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs font-extrabold py-1.5 px-3 rounded-lg transition flex items-center gap-1.5">
              <i class="fa-solid fa-copy"></i> Copy
            </button>
            <button onClick=${onImport} disabled=${importing}
              class="bg-cyan-700 hover:bg-cyan-600 border border-cyan-500/30 text-white text-xs font-extrabold py-1.5 px-3 rounded-lg transition flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed">
              <i class="fa-solid fa-file-import"></i> Import
            </button>
          </div>
        </div>
      </div>
    </div>`;
}
