// The website: investors at /#/ (sign in, then the broker app), the host at /#/host.
import { startInvestor } from './investor.mjs';
import { startHost } from './host.mjs';

const root = document.getElementById('app');
const isHost = () => location.hash.startsWith('#/host');
let mode = null;

function boot() {
  const next = isHost() ? 'host' : 'inv';
  if (next === mode) return;
  if (mode !== null) { location.reload(); return; } // switching between host and investor: start clean
  mode = next;
  document.body.dataset.mode = next;
  if (next === 'host') startHost(root); else startInvestor(root);
}
window.addEventListener('hashchange', boot);
boot();
