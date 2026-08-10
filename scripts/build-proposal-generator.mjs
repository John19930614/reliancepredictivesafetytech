// Builds lib/proposals/generator-html.ts from assets/proposal-generator-v15.html.
// Injects a postMessage bridge INSIDE the generator's IIFE so the embedded copy
// can exchange full form state (fields + phase/service line items) with the
// Proposals workspace. The standalone file behavior is unchanged — the bridge
// no-ops when the page is not inside an iframe.
//
// Run after replacing the asset with a new generator version:
//   node scripts/build-proposal-generator.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sourcePath = join(root, "assets", "proposal-generator-v15.html");
const outPath = join(root, "lib", "proposals", "generator-html.ts");

const bridge = `
/* --- Platform bridge (injected by scripts/build-proposal-generator.mjs) --- */
(function(){
  if (window.parent === window) return; // standalone file: bridge disabled
  // Mark the document as embedded. The asset's CSS hides the standalone
  // Save Draft / Load Draft / Download HTML controls when this class is set,
  // and their handlers bail out on it: localStorage drafts are per-origin
  // rather than per-proposal (so Load Draft would pull another client's
  // details into this proposal), and Download HTML dumps the whole document
  // including the control panel and the internal pricing catalog.
  function markEmbedded(){ if (document.body) document.body.classList.add('embedded'); }
  markEmbedded();
  document.addEventListener('DOMContentLoaded', markEmbedded);
  function collectFullState(){
    const fields = {};
    document.querySelectorAll('input,select,textarea').forEach((el)=>{
      if (!el.id) return;
      if (el.closest('.item')) return; // phase/service rows captured separately
      fields[el.id] = el.type === 'checkbox' ? el.checked : el.value;
    });
    return { v: 1, fields, phases: collectItems('phase','phase'), services: collectItems('service','service') };
  }
  function applyFullState(state){
    if (!state || typeof state !== 'object') return;
    const fields = state.fields || {};
    Object.entries(fields).forEach(([k, v])=>{
      const el = $(k);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = Boolean(v);
      else el.value = v == null ? '' : String(v);
    });
    if (Array.isArray(state.phases)) {
      $('phases').innerHTML = '';
      state.phases.forEach((p)=>{ addPhase(p.key, p.qty, p.price, p.desc); });
    }
    if (Array.isArray(state.services)) {
      $('services').innerHTML = '';
      state.services.forEach((s)=>{
        const div = addService(s.key, s.qty, s.price, s.desc);
        if (s.name && s.name !== ((serviceOptions[s.key] || {}).name || '')) div.dataset.customName = s.name;
      });
    }
    update();
  }
  window.addEventListener('message', (e)=>{
    if (e.origin !== window.location.origin) return;
    const msg = e.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'proposal:load') { applyFullState(msg.state); setStatus('Loaded from platform.'); pushPreview(); }
    if (msg.type === 'proposal:collect') { window.parent.postMessage({ type: 'proposal:state', state: collectFullState() }, window.location.origin); }
  });
  // Live preview push.
  //
  // SEPARATE message type from 'proposal:state' on purpose: the parent matches
  // each 'proposal:state' against its FIFO of outstanding collect requests, and
  // an unrequested reply on that channel would consume the slot belonging to a
  // save. 'proposal:preview' is fire-and-forget and only ever feeds the
  // parent's rendered document.
  //
  // Debounced because the generator's own handler runs update() on every
  // keystroke; posting each one would re-render the whole document per
  // character. 250ms is below the threshold where typing feels disconnected
  // from the preview.
  var previewTimer = null;
  function pushPreview(){
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(function(){
      previewTimer = null;
      try { window.parent.postMessage({ type: 'proposal:preview', state: collectFullState() }, window.location.origin); }
      catch (err) { /* a closed or navigated parent is not an error worth surfacing */ }
      pushHeight();
    }, 250);
  }
  // Content-height reporting, so the parent can size the iframe to the panel
  // and the form scrolls with the page instead of inside a nested frame.
  // body.embedded .panel is static (no inner scroll area) for the same reason.
  var lastHeight = 0;
  function pushHeight(){
    var doc = document.documentElement;
    var height = doc ? Math.ceil(doc.scrollHeight) : 0;
    if (height <= 0 || Math.abs(height - lastHeight) <= 4) return; // ignore subpixel jitter
    lastHeight = height;
    try { window.parent.postMessage({ type: 'proposal:height', height: height }, window.location.origin); }
    catch (err) { /* parent gone: nothing to size */ }
  }
  var resizeTimer = null;
  window.addEventListener('resize', function(){
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function(){ resizeTimer = null; pushHeight(); }, 200);
  });
  document.addEventListener('input', pushPreview, true);
  document.addEventListener('change', pushPreview, true);
  // Adding or removing a phase/service row is a click, and the row is created
  // synchronously by the asset's own handler, so a task tick is enough.
  document.addEventListener('click', function(e){
    if (e.target && e.target.closest && e.target.closest('[data-action]')) setTimeout(pushPreview, 0);
  }, true);
  document.addEventListener('click', (e)=>{
    const a = e.target.closest('[data-action="save"]');
    if (!a) return;
    window.parent.postMessage({ type: 'proposal:save', state: collectFullState() }, window.location.origin);
  });
  window.addEventListener('DOMContentLoaded', ()=>{
    window.parent.postMessage({ type: 'proposal:ready' }, window.location.origin);
    pushPreview();
    pushHeight();
  });
})();
/* --- end platform bridge --- */
`;

const html = readFileSync(sourcePath, "utf8");

// The asset carries an explicit sentinel comment inside the generator's IIFE.
// It is replaced by the bridge, which therefore lands somewhere it can reach
// $, collectItems, addPhase, addService, update and setStatus. A sentinel is
// used instead of searching for the IIFE closer `})();` because that sequence
// can legitimately appear elsewhere in a future asset, and a wrong-place
// injection would fail silently.
const ANCHOR = "/* BRIDGE_INJECTION_POINT */";
const anchor = html.indexOf(ANCHOR);
if (anchor === -1) {
  throw new Error(
    `Bridge anchor ${ANCHOR} not found in ${sourcePath}. Add it verbatim on its own line immediately before the generator IIFE's closing \`})();\` and re-run.`,
  );
}
if (html.indexOf(ANCHOR, anchor + ANCHOR.length) !== -1) {
  throw new Error(
    `Bridge anchor ${ANCHOR} appears more than once in ${sourcePath}. Exactly one occurrence is required — remove the duplicates and re-run.`,
  );
}
const injected = html.slice(0, anchor) + bridge + "\n" + html.slice(anchor + ANCHOR.length);

const out = `// AUTO-GENERATED by scripts/build-proposal-generator.mjs from assets/proposal-generator-v15.html.
// Do not edit by hand — edit the asset and re-run the script.
export const proposalGeneratorHtml: string = ${JSON.stringify(injected)};
`;

writeFileSync(outPath, out);
console.log(`Wrote ${outPath} (${Math.round(out.length / 1024)} KB)`);
