// Server check (#/status): is the game server here, does its storage work, how fast is it —
// in plain words, with what to do about each problem and a report that can be copied.
import { h, mount, toast } from '../ui.mjs';
import { net } from '../net.mjs';

async function timed(path) {
  const t = performance.now();
  try {
    const res = await fetch(`/api/${path}`, { cache: 'no-store' });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    return { status: res.status, data, ms: Math.round(performance.now() - t) };
  } catch (e) {
    return { status: 0, data: null, ms: Math.round(performance.now() - t), error: String(e.message || e) };
  }
}

export default async function status(app, { band }) {
  const body = h('main', { class: 'narrow page' });
  mount(app, band('status'), body);
  const lines = [];
  const rows = h('div', { class: 'stack' });
  const add = (ok, title, detail, fix = null) => {
    lines.push(`${ok === true ? 'OK  ' : ok === false ? 'FAIL' : 'NOTE'} ${title}${detail ? ` — ${detail}` : ''}${fix ? ` | Fix: ${fix}` : ''}`);
    rows.appendChild(h('div', { class: 'card tight' },
      h('div', { class: 'okline' }, h('span', { class: `mark ${ok === true ? 'up' : ok === false ? 'down' : 'gold'}` }, ok === true ? 'OK' : ok === false ? 'Problem' : 'Note'), h('b', {}, title)),
      detail ? h('p', { class: 'small', style: { margin: '6px 0 0' } }, detail) : null,
      fix ? h('p', { class: 'small', style: { margin: '6px 0 0' } }, h('b', {}, 'What to do: '), fix) : null));
  };
  mount(body, h('div', { class: 'eyebrow' }, 'Artha Vyūha'), h('h1', {}, 'Server check'),
    h('p', { class: 'muted' }, 'Checking the game server and its storage. This takes a few seconds.'), rows);

  lines.push(`Artha Vyūha server check — ${new Date().toISOString()} — ${location.host} — ${navigator.userAgent}`);

  // 1. the server function
  const health = await timed('health');
  if (health.status === 0) {
    add(false, 'This device cannot reach the site’s server', health.error, 'Check the internet connection (Wi-Fi or mobile data) and try again.');
  } else if (health.status === 404 || !health.data) {
    add(false, 'The game server is missing', `The address /api/health answered “${health.status}” instead of the game server.`,
      'This happens when the site was deployed by drag-and-drop and Netlify did not set up the server function. Deploy from GitHub instead: Netlify → Add new project → Import from GitHub → choose the repository → Base directory: poker (DEPLOY.md, Step 1). Practice against bots still works without the server.');
  } else if (health.status >= 500) {
    add(false, `The game server crashed (code ${health.status})`, health.data?.error || '', 'In Netlify open your project → Logs → Functions → api, copy the last red lines and send them, with this report, to whoever maintains the game.');
  } else if (health.data.app !== 'artha') {
    add(false, 'A different app answered', `It says it is “${health.data.app || 'unknown'}”.`, 'In Netlify → Project configuration → Build & deploy, set Base directory to poker and redeploy.');
  } else {
    add(true, 'The game server answers', `Version ${health.data.version}, in ${health.ms} ms. Storage: ${health.data.storage}. Live push: ${health.data.stream ? 'on' : 'off (phones ask about once a second instead — normal on Netlify)'}.`);
    if (health.data.storage === 'memory') add(null, 'Games are kept in memory only', 'They are lost when the server restarts.', 'For real events use Netlify (Blobs) or set ARTHA_DATA_DIR on the Node server.');
  }

  // 2. storage
  if (health.data?.app === 'artha') {
    const st = await timed('selftest');
    if (st.status === 429) add(null, 'Storage check skipped', 'Checked too often — wait a minute and reload this page.');
    else if (!st.data || !st.data.steps) add(false, `The storage check could not run (code ${st.status})`, st.data?.error || st.error || '', 'Reload this page. If it keeps failing, check Netlify → Logs → Functions → api.');
    else {
      const slowest = Math.max(...st.data.steps.map((x) => x.ms));
      for (const x of st.data.steps) {
        if (x.ok) continue;
        if (x.name.includes('simultaneous') && !x.error) add(false, 'Storage: two changes at the same moment were both saved', 'The storage did not protect a table against two phones changing it at once. Under load a click could be lost or a seat given twice.', 'Run this check again. If it fails again, do not run the event on this deploy: send this report to whoever maintains the game.');
        else add(false, `Storage: could not ${x.name}`, x.error || '', 'Netlify Blobs may be switched off or failing for this project. Redeploy once; if it still fails, check Netlify → Logs → Functions → api.');
      }
      if (st.data.ok) add(slowest > 1500 ? null : true, 'Storage works', `Write, read, the protection against two changes at once, and delete all work. Slowest step ${slowest} ms${st.data.region ? ` (server region ${st.data.region})` : ''}.`, slowest > 1500 ? 'Storage is slow right now; the game still works but feels laggy. Try again in a few minutes.' : null);
    }

    // 3. speed of a round trip, as a phone at the table feels it
    const times = [];
    for (let i = 0; i < 5; i++) times.push((await timed('health')).ms);
    times.sort((a, b) => a - b);
    const med = times[2];
    add(med < 800 ? true : null, 'Speed', `A request takes about ${med} ms from this device (fastest ${times[0]} ms, slowest ${times[4]} ms).`, med >= 800 ? 'The connection or the server is slow; tables will feel sluggish. Try nearer the Wi-Fi router, or mobile data.' : null);

    // 4. the clock
    const skew = health.data.now ? Math.round((health.data.now - Date.now()) / 1000) : 0;
    if (Math.abs(skew) > 30) add(null, 'This device’s clock is off', `By about ${Math.abs(skew)} seconds. The game corrects for this, so timers still count down correctly.`);
  }
  if (net.mode === 'single') lines.push('Page mode: single device');

  body.appendChild(h('div', { class: 'stack', style: { marginTop: '18px' } },
    h('h3', {}, 'Report'),
    h('p', { class: 'muted small' }, 'Copy this and send it to whoever maintains the game.'),
    h('textarea', { readonly: true, style: { minHeight: '180px', fontFamily: 'var(--font-mono)', fontSize: '13px' }, onfocus: (e) => e.target.select() }, lines.join('\n')),
    h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: async () => { try { await navigator.clipboard.writeText(lines.join('\n')); toast('Report copied', 'good'); } catch { toast('Select the report and copy it'); } } }, 'Copy the report'),
      h('button', { class: 'btn ghost', onclick: () => location.reload() }, 'Check again'))));
  return null;
}
