import { h, mount } from '../ui.mjs';
import { ECONOMIES, ECON_ORDER } from '../../src/config/economies.mjs';

export const QUARTER_STEPS = [
  ['The Data Drops', 'The round’s figures for all six economies appear on every screen.'],
  ['The Window Opens', 'A ten-minute clock starts on every device and the desk unlocks.'],
  ['Trade and Forecast', 'Buy, sell — with a trading note on why — and enter the round’s forecast.'],
  ['Stay Alert', 'A crisis may break at any moment. Prices react at once.'],
  ['The Market Settles', 'At zero the desk locks, central banks act and prices reset.'],
  ['Results', 'Your own profit and loss, and the reasons, appear on your desk. Standings stay sealed until the end.'],
];
export const START_STATS = [
  ['₹1,000 Cr', 'Fund value, all in cash'], ['3×', 'Most you may hold, against fund value'], ['100%', 'Risk limit, shown live on the desk'],
  ['0.10%', 'Cost of a trade, in calm markets'], ['6', 'Rounds, one trading window each'], ['10 min', 'Trading window each round'],
  ['6', 'Forecasts, one a round'], ['₹', 'Every price and value is in rupees'],
];

export default function home(app, { band }) {
  mount(app,
    band(''),
    h('section', { class: 'hero' }, h('div', { class: 'art', 'aria-hidden': 'true' }), h('div', { class: 'inner' },
      h('div', { class: 'eyebrow' }, 'Copia et Inopia · Round 3'),
      h('h1', {}, 'Specula'),
      h('p', { class: 'lead', style: { fontStyle: 'italic' } }, 'Six economies. Forty-four markets. Six rounds.'),
      h('p', { class: 'lead' }, 'SPECULA, Latin for watchtower and the root of speculation, is a live macroeconomic trading simulation. Each team runs an investment fund. Six invented economies grow, slow, overheat and break on their own, and your fund trades their bonds, shares, currencies and commodities as they do.'),
      h('div', { class: 'row', style: { marginTop: '24px' } },
        h('a', { class: 'btn lg', href: '#/desk' }, 'Join your fund'),
        h('a', { class: 'btn lg ghost', href: '#/learn', style: { color: '#d8b870' } }, 'How to play'),
        h('a', { class: 'btn lg ghost', href: '#/practice', style: { color: '#d8b870' } }, 'Practice first')))),
    h('main', { class: 'wrap', style: { padding: '32px 16px 64px' } },
      h('div', { class: 'eyebrow' }, 'The World'),
      h('div', { class: 'grid g3', style: { marginTop: '12px' } }, ECON_ORDER.map((e) => h('div', { class: 'card tight' },
        h('h3', { style: { margin: 0 } }, ECONOMIES[e].name), h('div', { class: 'muted', style: { fontStyle: 'italic' } }, `${ECONOMIES[e].title} · ${ECONOMIES[e].currency}`)))),
      h('h2', {}, 'Every Fund Starts Equal'),
      h('div', { class: 'big-stats' }, START_STATS.map(([b, s]) => h('div', { class: 's' }, h('b', {}, b), h('span', { class: 'muted small' }, s)))),
      h('p', { class: 'muted', style: { marginTop: '12px' } }, 'Positions, prices and fund values carry over from round to round: the six rounds are one continuous story.'),
      h('h2', {}, 'How Every Round Works'),
      h('ol', { class: 'step-list' }, QUARTER_STEPS.map(([t, d]) => h('li', {}, h('h4', { style: { marginTop: 0 } }, t), h('span', { class: 'small' }, d)))),
      h('hr'),
      h('div', { class: 'row muted small' }, 'For the hall: ', h('a', { href: '#/display' }, 'Big Screen'), ' · ', h('a', { href: '#/admin' }, 'Event Head console'))));
}
