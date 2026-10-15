// How to Play: the rules in plain words.
import { h } from '../dom.mjs';
import { rs } from '../fmt.mjs';
import { STOCKS, START_CASH } from '../../src/stocks.mjs';
import { band } from '../site.mjs';

const S = (id, title, ...body) => h('section', { id }, h('h2', { text: title }), ...body);
const P = (text) => h('p', { text });

export default function learn(app) {
  app.replaceChildren(
    band('learn'),
    h('main', { class: 'narrow page' },
      h('p', { class: 'eyebrow', text: 'How to Play' }),
      h('h1', { text: 'The Rules', style: { margin: '6px 0 12px' } }),
      h('p', { class: 'lead', text: 'Your team runs a trading desk. Start with ₹10,00,000 in cash, trade ten listed companies while their prices move, and finish with as much as you can.' }),
      h('nav', { class: 'toc', 'aria-label': 'On this page' }, [['join', 'Joining'], ['stocks', 'The stocks'], ['trading', 'Trading'], ['money', 'Your money'], ['news', 'Updates'], ['loans', 'Loans'], ['end', 'The end']].map(([id, t]) => h('a', { href: `#/learn`, onclick: (e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); }, text: t }))),
      S('join', 'Joining your team',
        P('The host creates the game and gives every team a private code of six letters and numbers. Open Team Desk, type your team’s code and your name, and you are in.'),
        P('Every member of a team can sign in on their own phone or laptop. You all see the same desk: the same cash, the same shares. Any member’s order is the team’s order, so talk to each other.'),
        P('Keep the code private: anyone with it can trade for your team. If it leaks, ask the host for a new code; everyone then joins again with it.')),
      S('stocks', 'The ten stocks',
        h('div', { class: 'scroll-x' }, h('table', { class: 'tbl' },
          h('thead', {}, h('tr', {}, ['Ticker', 'Company', 'Sector', 'Listed at'].map((x, i) => h('th', { class: i === 3 ? 'num' : '', text: x })))),
          h('tbody', {}, STOCKS.map((s) => h('tr', {}, h('td', {}, h('span', { class: 'tk', text: s.t })), h('td', { text: s.name }), h('td', { class: 'muted', text: s.sector }), h('td', { class: 'num', text: rs(s.base) })))))),
        P('Prices move every second while the market is open, and stand still while it is closed. Each stock wanders around its listed price; news and events can push it up or down from there. Prices move in steps of ₹0.05.')),
      S('trading', 'Trading',
        P('Choose a stock in the watchlist and press Buy or Sell. Orders are market orders: they fill at the live price the moment they reach the market, in whole shares. There is no brokerage.'),
        P('You can only spend the cash you have, and only sell shares your team holds (no short selling). Orders are accepted only while the market is open.'),
        h('div', { class: 'example' }, h('p', { class: 'eyebrow', text: 'Example' }), P('NEXO is at ₹271.35. Buying 100 shares costs ₹27,135.00. If NEXO rises to ₹280.00, those shares are worth ₹28,000.00: ₹865.00 of profit, though you only lock it in when you sell.'))),
      S('money', 'Your money',
        h('ul', {},
          h('li', {}, h('b', { text: 'Cash' }), ': what you can spend now.'),
          h('li', {}, h('b', { text: 'Total liquidable money' }), ': cash plus what your shares would sell for right now. It changes every second with the prices.'),
          h('li', {}, h('b', { text: 'Net worth' }), ': liquidable money, plus loans owed to your team, minus loans your team owes.'),
          h('li', {}, h('b', { text: 'Total P&L' }), `: net worth minus the ${rs(START_CASH)} you started with.`)),
        P('Your desk shows only your own team. No team can see another team’s money or shares.')),
      S('news', 'Updates',
        P('The host posts news and announcements in the Updates tab, numbered in the order they were posted. A new update also pops up on your screen. Read them: news can move the market.')),
      S('loans', 'Loans',
        P('The host can move money from one team to another as a loan, at an interest rate and with a deadline. The money arrives at once, and both teams are told.'),
        P('At the deadline the website takes the loan plus interest from the borrowing team and pays it to the lender, automatically, and tells both teams. If the borrower does not have enough cash then, its shares are sold at that moment’s price to cover it.'),
        h('div', { class: 'example' }, h('p', { class: 'eyebrow', text: 'Example' }), P('₹50,000 at 10% for 30 minutes: the borrower gets ₹50,000 now and repays ₹55,000 thirty minutes later.'))),
      S('end', 'The end',
        P('When the host ends the game, the market closes for good and every loan still running is repaid with its full interest. The team with the highest net worth wins.'),
        P('Standings stay sealed during the game. The host reveals them at the end, on the Big Screen and on every desk.')),
      h('div', { class: 'row', style: { marginTop: '32px' } }, h('a', { class: 'btn lg', href: '#/desk', text: 'Join your team' }))));
}
