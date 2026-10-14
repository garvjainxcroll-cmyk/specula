// The website's routes, as in SPECULA: Home /, How to Play #/learn, Team Desk #/desk,
// Big Screen #/display and the host console #/host. Moving between the live screens
// reloads the page, so each starts clean.
import { refreshGame } from './site.mjs';

const ROUTES = { '': 'home', learn: 'learn', desk: 'desk', display: 'display', host: 'host', admin: 'host' };
const LIVE = new Set(['desk', 'display', 'host']);
const app = document.getElementById('app');
let mode = null;
let unmount = null;

const routeName = () => ROUTES[location.hash.replace(/^#\/?/, '').split(/[/?]/)[0]] ?? 'home';

async function render() {
  const next = routeName();
  if (next === mode) return; // a sub-page (#/desk/portfolio…) is handled by the view itself
  if (mode !== null && (LIVE.has(mode) || LIVE.has(next))) { location.reload(); return; }
  try { unmount?.(); } catch { /* ignore */ }
  unmount = null;
  mode = next;
  document.body.dataset.mode = next;
  if (next === 'display') document.documentElement.dataset.theme = 'dark';
  try {
    const mod = await import(`./views/${next}.mjs`);
    if (mode !== next) return;
    unmount = (await mod.default(app)) || null;
  } catch (e) {
    console.error(e);
    app.replaceChildren(Object.assign(document.createElement('p'), { className: 'boot', textContent: `Something went wrong: ${e.message}. Reload the page.` }));
  }
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', render);
refreshGame();
render();
