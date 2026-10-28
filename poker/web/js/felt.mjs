// Drawing one table: the felt, seats around the oval, hole cards, bets, the dealer button,
// community cards, pots, the action timer and the animations (dealing, chips moving,
// cards turning, folds, the pot going to the winner). The DOM is built once per table and
// updated in place, so animations can run between one view and the next.
import { h, mount, svg, fmt, avatar } from './ui.mjs';
import { cardEl, chipStack } from './cards.mjs';
import { net } from './net.mjs';
import { play } from './sound.mjs';
import { prefs } from './prefs.mjs';

const RING_R = 48;
const RING_C = 2 * Math.PI * RING_R;
const animOn = () => prefs().animations !== 'off' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const speed = () => (prefs().animations === 'fast' ? 0.45 : 1);

export class Felt {
  /** opts: { onSit(seat), big: bool (Big Screen) } */
  constructor(opts = {}) {
    this.opts = opts;
    this.el = h('div', { class: 'stage' });
    this.wrap = h('div', { class: 'felt-wrap' });
    this.felt = h('div', { class: 'felt' }, h('div', { class: 'mark' }, 'Artha Vyūha'));
    this.wrap.appendChild(h('div', { class: 'rail' }, this.felt));
    this.boardEl = h('div', { class: 'board' });
    this.potEl = h('div', { class: 'potline' });
    this.streetEl = h('div', { class: 'street' });
    this.msgEl = h('div', {});
    this.center = h('div', { class: 'felt-center' }, this.streetEl, this.potEl, this.boardEl, this.msgEl);
    this.wrap.appendChild(this.center);
    this.dealer = h('div', { class: 'dealer', 'aria-label': 'Dealer button' }, 'D');
    this.wrap.appendChild(this.dealer);
    this.el.appendChild(this.wrap);
    this.seatEls = []; this.betEls = [];
    this.n = 0;
    this.state = { handId: null, events: 0, shownBoard: 0, bets: {}, resultShown: null, turnSeq: null };
    this.timers = [];
    this.clockTimer = setInterval(() => this.tickClock(), 150);
    window.addEventListener('resize', this.onResize = () => this.layout());
  }
  destroy() { clearInterval(this.clockTimer); window.removeEventListener('resize', this.onResize); this.timers.forEach(clearTimeout); }

  build(n) {
    for (const e of [...this.seatEls, ...this.betEls]) e.remove();
    this.seatEls = []; this.betEls = [];
    for (let s = 0; s < n; s++) {
      const seat = h('div', { class: 'seat empty', 'data-seat': s });
      const bet = h('div', { class: 'bet gone' });
      this.wrap.append(seat, bet);
      this.seatEls.push(seat); this.betEls.push(bet);
    }
    this.n = n;
  }

  /** Where seat s sits, as % of the table box: the viewer's seat is at the bottom. */
  pos(s, k = 1) {
    const r = this.wrap.getBoundingClientRect();
    const portrait = r.height > r.width * 1.05;
    const d = (s - this.hero + this.n) % this.n;
    const a = (Math.PI / 2) + (d * 2 * Math.PI) / this.n;
    const rx = (portrait ? 40 : 45.5) * k; const ry = (portrait ? 45 : 43) * k;
    return { x: 50 + rx * Math.cos(a), y: 50 + ry * Math.sin(a), a };
  }
  layout() {
    if (!this.n) return;
    for (let s = 0; s < this.n; s++) {
      const p = this.pos(s);
      Object.assign(this.seatEls[s].style, { left: `${p.x}%`, top: `${p.y}%` });
      const b = this.pos(s, 0.6);
      if (!this.betEls[s].classList.contains('moving')) Object.assign(this.betEls[s].style, { left: `${b.x}%`, top: `${b.y}%` });
    }
    this.placeDealer();
  }
  placeDealer() {
    if (this.button === null || this.button === undefined || !this.n) { this.dealer.style.display = 'none'; return; }
    const p = this.pos(this.button, 0.74);
    const off = 5.5;
    this.dealer.style.display = '';
    Object.assign(this.dealer.style, { left: `${p.x + off * Math.cos(p.a - Math.PI / 2)}%`, top: `${p.y + off * Math.sin(p.a - Math.PI / 2)}%` });
  }

  /** Draw the table t of view v (the viewer's seat at the bottom). */
  update(v, t) {
    this.view = v; this.t = t;
    this.wrap.dataset.felt = prefs().felt;
    const n = t.seats.length;
    const heroSeat = v.you && v.you.table === t.i ? v.you.seat : (this.hero ?? 0);
    if (n !== this.n) { this.build(n); this.hero = heroSeat; this.layout(); }
    if (heroSeat !== this.hero) { this.hero = heroSeat; this.layout(); }
    const hand = t.hand;
    const st = this.state;
    const newHand = hand && hand.id !== st.handId;
    const firstLook = !this.seenAny; // opening the table mid-hand: show it as it is, no catch-up animation
    this.seenAny = true;
    if (newHand) {
      st.handId = hand.id; st.events = 0; st.shownBoard = 0; st.bets = {}; st.resultShown = null; st.turnSeq = null;
      mount(this.boardEl, Array.from({ length: 5 }, () => h('div', { class: 'slot' })));
      mount(this.msgEl);
      for (const el of this.seatEls) el.classList.remove('winner');
    }
    if (!hand) { mount(this.boardEl, Array.from({ length: 5 }, () => h('div', { class: 'slot' }))); mount(this.msgEl); mount(this.potEl); this.streetEl.textContent = t.handNo ? 'Waiting for the next hand' : 'Waiting for players'; }
    this.button = hand ? hand.button : t.button;
    this.placeDealer();

    // sounds and animations from the new events since the last view
    const events = hand ? hand.log : [];
    const fresh = events.slice(st.events);
    st.events = events.length;
    this.firstLook = firstLook && newHand;
    this.react(fresh, newHand, hand);

    for (let s = 0; s < n; s++) this.drawSeat(s, t.seats[s], hand, v);
    this.drawBets(t, hand, newHand);
    this.drawBoard(hand);
    this.drawPots(hand);
    if (hand) this.streetEl.textContent = hand.status === 'complete' ? (hand.voided ? 'Hand cancelled' : hand.result?.showdown ? 'Showdown' : 'Hand over') : { preflop: 'Pre-flop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown' }[hand.street];
    // your turn
    if (hand && hand.legal && st.turnSeq !== hand.seq) { st.turnSeq = hand.seq; play('turn'); }
    this.tickClock();
  }

  react(fresh, newHand, hand) {
    if (!hand) return;
    const quiet = fresh.length > 40 || this.firstLook; // first look or a reconnect after a long gap: no fireworks
    let deals = 0;
    for (const e of fresh) {
      if (quiet) break;
      if (e.t === 'deal') deals++;
      else if (e.t === 'act') play(e.allIn ? 'allin' : e.type === 'fold' ? 'fold' : e.type === 'check' ? 'check' : 'chip');
      else if (e.t === 'post') play('chip');
    }
    if (deals && animOn()) for (let k = 0; k < deals * 2; k++) play('deal', k * 70 * speed());
    if (newHand && animOn() && !this.firstLook) this.dealAnim(hand);
  }

  dealAnim(hand) {
    const ws = this.wrap.getBoundingClientRect();
    const from = { x: ws.left + ws.width / 2, y: ws.top + ws.height * 0.45 };
    let k = 0;
    for (let round = 0; round < 2; round++) {
      for (const p of hand.log.filter((e) => e.t === 'deal')) {
        const target = this.seatEls[p.seat]?.querySelector('.cards');
        if (!target) continue;
        const r = target.getBoundingClientRect();
        const ghost = h('div', { class: 'fly' }, cardEl('back'));
        ghost.firstChild.style.setProperty('--cw', '34px');
        Object.assign(ghost.style, { left: `${from.x - 17}px`, top: `${from.y - 24}px`, opacity: '0' });
        document.body.appendChild(ghost);
        const delay = k++ * 75 * speed();
        this.timers.push(setTimeout(() => {
          ghost.style.opacity = '1';
          ghost.style.transform = `translate(${r.left + r.width / 2 - from.x}px, ${r.top + r.height / 2 - from.y}px) rotate(${round ? 6 : -6}deg)`;
        }, delay + 20));
        this.timers.push(setTimeout(() => ghost.remove(), delay + 600 * speed()));
      }
    }
  }

  drawSeat(s, seat, hand, v) {
    const el = this.seatEls[s];
    const big = this.opts.big;
    if (!seat) {
      el.className = 'seat empty';
      const canSit = !big && this.opts.onSit && !v.you && v.kind !== 'tournament' && v.status === 'open';
      mount(el, canSit ? h('button', { class: 'sitbtn', onclick: () => this.opts.onSit(s) }, 'Sit here') : h('span', { class: 'sitbtn ghost' }, 'Empty'));
      return;
    }
    const inHand = seat.inHand;
    const acting = hand && hand.status === 'betting' && hand.toAct === s;
    const won = hand && hand.status === 'complete' && this.state.resultShown && hand.result?.pots.some((p) => p.winners.some((w) => w.seat === s && w.amount > 0));
    const mucked = hand && hand.status === 'complete' && this.state.resultShown && inHand && !seat.folded && !seat.shown && !seat.isYou;
    el.className = ['seat', seat.isYou ? 'you' : '', acting ? 'acting' : '', seat.folded ? 'folded' : '', !inHand && hand ? 'out' : '', won ? 'winner' : '', mucked ? 'mucked' : ''].filter(Boolean).join(' ');
    // cards
    let cardsEl = el.querySelector('.cards');
    const sig = JSON.stringify([hand?.id, seat.cards, seat.folded]);
    if (!cardsEl || cardsEl.dataset.sig !== sig) {
      const wasBacks = cardsEl && cardsEl.dataset.backs === '1';
      const list = seat.cards || [];
      const nc = h('div', { class: 'cards', 'data-sig': sig, 'data-backs': list.every((c) => c === 'back') ? '1' : '0' },
        list.map((c) => cardEl(c, { cls: wasBacks && c !== 'back' ? 'flip' : (cardsEl ? '' : 'deal') })));
      if (cardsEl) cardsEl.replaceWith(nc); else el.prepend(nc);
      cardsEl = nc;
    }
    // highlight winning cards
    const best = this.state.resultShown ? this.bestCards(hand) : null;
    cardsEl.querySelectorAll('.pcard').forEach((c) => c.classList.toggle('hi', !!best && best.has(c.dataset.c) && won));
    // plate
    let plate = el.querySelector('.plate');
    const tags = [];
    if (seat.bot) tags.push(h('span', { class: 'badge bot', title: `Computer player (${seat.bot})` }, 'Bot'));
    if (seat.sittingOut) tags.push(h('span', { class: 'badge dim' }, seat.busted ? 'Busted' : 'Sitting out'));
    else if (seat.away) tags.push(h('span', { class: 'badge dim' }, 'Away'));
    if (seat.waitBB && !inHand) tags.push(h('span', { class: 'badge dim' }, 'Waits for BB'));
    if (seat.leaving) tags.push(h('span', { class: 'badge dim' }, 'Leaving'));
    const plateNew = h('div', { class: 'plate' },
      h('span', { style: { position: 'relative' } }, avatar(seat.avatar, { bot: !!seat.bot }), this.ring(s, acting)),
      h('div', { class: 'who' }, h('div', { class: 'nm' }, h('b', {}, seat.isYou ? `${seat.name} (you)` : seat.name)), h('div', { class: 'stk' }, seat.allIn && hand?.status === 'betting' ? 'All-in' : fmt(seat.stack))));
    if (plate) plate.replaceWith(plateNew); else el.appendChild(plateNew);
    el.querySelector('.tags')?.remove();
    if (tags.length) el.appendChild(h('div', { class: 'tags' }, tags));
    // last action label
    for (const sel of ['.act', '.myhand', '.clock', '.pos']) el.querySelector(sel)?.remove();
    const posTag = hand && hand.status === 'betting' && hand.street === 'preflop' && seat.inHand ? (s === hand.sbSeat ? 'SB' : s === hand.bbSeat ? 'BB' : null) : null;
    if (posTag) el.appendChild(h('div', { class: 'pos', title: posTag === 'SB' ? 'Small blind' : 'Big blind' }, posTag));
    const lab = this.actLabel(seat, hand, won);
    if (lab) el.appendChild(h('div', { class: `act ${lab.cls}` }, lab.text));
    else if (seat.isYou && seat.myHand && !seat.folded && hand?.status === 'betting') el.appendChild(h('div', { class: 'myhand' }, seat.myHand));
    if (acting) el.appendChild(h('div', { class: 'clock', 'data-clock': s }, ''));
  }

  ring(s, acting) {
    if (!acting) return null;
    return svg('svg', { class: 'ring', viewBox: '0 0 100 100', 'data-ring': s }, svg('circle', { cx: 50, cy: 50, r: RING_R, 'stroke-dasharray': RING_C, 'stroke-dashoffset': 0 }));
  }

  actLabel(seat, hand, won) {
    if (!hand) return null;
    if (hand.status === 'complete') {
      if (won) { const amt = hand.result.pots.reduce((a, p) => a + p.winners.filter((w) => w.seat === seat.seat).reduce((x, w) => x + w.amount, 0), 0); return { cls: 'win', text: `Wins ${fmt(amt)}` }; }
      if (seat.shown && seat.hand && this.state.resultShown) return { cls: '', text: seat.hand.desc.split(',')[0] };
      return null;
    }
    const l = seat.last;
    if (!l || !seat.inHand) return null;
    const lastActStreet = [...hand.log].reverse().find((e) => e.t === 'act' && e.seat === seat.seat)?.street;
    if (l.type !== 'fold' && !l.allIn && lastActStreet !== hand.street) return null; // a new betting round
    if (l.allIn) return { cls: 'allin', text: `All-in ${fmt(l.to)}` };
    return { cls: l.type, text: { fold: 'Fold', check: 'Check', call: 'Call', bet: `Bet ${fmt(l.to)}`, raise: `Raise ${fmt(l.to)}` }[l.type] };
  }

  bestCards(hand) {
    const set = new Set();
    for (const pot of hand?.result?.pots || []) for (const w of pot.winners) for (const c of w.best || []) set.add(typeof c === 'number' ? '23456789TJQKA'[c >> 2] + 'cdhs'[c & 3] : c);
    return set;
  }

  drawBets(t, hand, newHand) {
    const st = this.state;
    for (let s = 0; s < this.n; s++) {
      const seat = t.seats[s];
      const bet = hand && hand.status === 'betting' && seat ? seat.bet : 0;
      const el = this.betEls[s];
      const prev = st.bets[s] || 0;
      if (bet > 0) {
        mount(el, chipStack(bet), h('span', {}, fmt(bet)));
        el.classList.remove('gone');
        if (bet > prev && animOn() && !newHand) this.chipFly(this.seatEls[s], el);
      } else if (prev > 0 && animOn()) {
        // the round ended: chips slide into the middle
        const p = this.pos(s, 0.6);
        el.classList.add('moving');
        Object.assign(el.style, { left: '50%', top: '42%' });
        el.classList.add('gone');
        this.timers.push(setTimeout(() => { el.classList.remove('moving'); Object.assign(el.style, { left: `${p.x}%`, top: `${p.y}%` }); }, 520));
      } else el.classList.add('gone');
      st.bets[s] = bet;
    }
  }

  chipFly(fromEl, toEl) {
    const a = fromEl.getBoundingClientRect(); const b = toEl.getBoundingClientRect();
    const g = h('div', { class: 'fly' }, chipStack(1, 1));
    Object.assign(g.style, { left: `${a.left + a.width / 2 - 10}px`, top: `${a.top + a.height / 2 - 10}px` });
    document.body.appendChild(g);
    requestAnimationFrame(() => { g.style.transform = `translate(${b.left + 10 - a.left - a.width / 2}px, ${b.top + b.height / 2 - a.top - a.height / 2}px)`; g.style.opacity = '0.2'; });
    this.timers.push(setTimeout(() => g.remove(), 560 * speed()));
  }

  drawBoard(hand) {
    if (!hand) return;
    const st = this.state;
    const want = hand.board.length;
    if (st.shownBoard >= want) { if (hand.status === 'complete') this.showResult(hand); return; }
    if (st.pacing) return;
    if (this.firstLook) {
      const slots = this.boardEl.children;
      for (let i = 0; i < want; i++) slots[i].replaceWith(cardEl(hand.board[i]));
      st.shownBoard = want;
      if (hand.status === 'complete') this.showResult(hand);
      return;
    }
    // reveal street by street (a run-out arrives all at once: show it one card-group at a time)
    const step = () => {
      const h2 = this.t?.hand;
      if (!h2 || h2.id !== hand.id) { st.pacing = false; return; }
      const cur = st.shownBoard;
      const target = cur < 3 ? 3 : cur + 1;
      const slots = this.boardEl.children;
      for (let i = cur; i < Math.min(target, h2.board.length); i++) {
        const c = cardEl(h2.board[i], { cls: animOn() ? 'flip' : '' });
        if (animOn()) c.style.animationDelay = `${(i - cur) * 110 * speed()}ms`;
        slots[i].replaceWith(c);
      }
      play('flip');
      st.shownBoard = Math.min(target, h2.board.length);
      if (st.shownBoard < h2.board.length) this.timers.push(setTimeout(step, (h2.runout ? 1200 : 450) * speed()));
      else { st.pacing = false; if (h2.status === 'complete') this.timers.push(setTimeout(() => this.showResult(this.t.hand), 500 * speed())); }
    };
    if (want > 0) { st.pacing = true; step(); }
  }

  showResult(hand) {
    const st = this.state;
    if (!hand || hand.status !== 'complete' || st.resultShown === hand.id) return;
    st.resultShown = hand.id;
    const res = hand.result;
    if (!res) return;
    if (res.voided) { mount(this.msgEl, h('div', { class: 'winmsg' }, 'Hand cancelled — everyone has their chips back')); return; }
    const lines = [];
    for (const [i, pot] of res.pots.entries()) {
      const names = pot.winners.filter((w) => w.amount > 0).map((w) => w.name);
      if (!names.length) continue;
      const label = res.pots.length > 1 ? (i === 0 ? 'Main pot: ' : `Side pot ${i}: `) : '';
      const hand2 = pot.winners[0].hand;
      lines.push(`${label}${names.join(' and ')} ${names.length > 1 ? 'split' : 'wins'} ${fmt(pot.amount)}${hand2 ? ` — ${hand2}` : ''}`);
    }
    mount(this.msgEl, lines.length ? h('div', { class: 'winmsg' }, lines.map((l, k) => h('div', {}, l, k < lines.length - 1 ? null : null))) : null);
    // highlight the winning five cards on the board
    const best = this.bestCards(hand);
    if (best.size) for (const c of this.boardEl.querySelectorAll('.pcard')) { c.classList.toggle('hi', best.has(c.dataset.c)); c.classList.toggle('dim', !best.has(c.dataset.c)); }
    // the pot goes to the winners
    if (animOn()) {
      for (const pot of res.pots) for (const w of pot.winners) {
        const to = this.seatEls[w.seat];
        if (!to) continue;
        const a = this.potEl.getBoundingClientRect(); const b = to.getBoundingClientRect();
        const g = h('div', { class: 'fly' }, chipStack(w.amount, 4));
        Object.assign(g.style, { left: `${a.left + a.width / 2 - 20}px`, top: `${a.top}px` });
        document.body.appendChild(g);
        requestAnimationFrame(() => { g.style.transition = `transform ${0.8 * speed()}s cubic-bezier(.2,.7,.2,1), opacity ${0.8 * speed()}s`; g.style.transform = `translate(${b.left + b.width / 2 - a.left - a.width / 2}px, ${b.top + b.height / 2 - a.top}px)`; g.style.opacity = '0'; });
        this.timers.push(setTimeout(() => g.remove(), 900 * speed()));
      }
    }
    if (res.pots.some((p) => p.winners.some((w) => w.amount > 0))) play('win');
    if (this.t) for (let s = 0; s < this.n; s++) this.drawSeat(s, this.t.seats[s], hand, this.view);
  }

  drawPots(hand) {
    if (!hand) return;
    const pots = hand.pots || [];
    const kids = [];
    if (hand.status === 'betting') {
      kids.push(h('span', { class: 'pot total', title: 'Everything in the middle, including bets in front of players' }, h('span', { class: 'lbl' }, 'Pot'), fmt(hand.pot)));
      if (pots.length > 1) pots.forEach((p, i) => kids.push(h('span', { class: 'pot', title: `${p.eligible.length} players can win this` }, chipStack(p.amount, 2), h('span', { class: 'lbl' }, i === 0 ? 'Main' : `Side ${i}`), fmt(p.amount))));
    } else if (hand.result && !this.state.resultShown) {
      kids.push(h('span', { class: 'pot total' }, h('span', { class: 'lbl' }, 'Pot'), fmt(hand.pot)));
    }
    mount(this.potEl, kids);
  }

  tickClock() {
    const hand = this.t?.hand;
    if (!hand || hand.status !== 'betting' || hand.deadline === null) return;
    const now = net.now();
    const base = hand.turnAt + hand.actionMs;
    const left = hand.deadline - now;
    let frac; let low;
    if (now < base) { frac = (base - now) / hand.actionMs; low = base - now < 5000 && hand.deadline - base < 1000; } else { frac = (hand.deadline - now) / Math.max(1, hand.deadline - base); low = true; }
    frac = Math.max(0, Math.min(1, frac));
    const ring = this.wrap.querySelector(`[data-ring="${hand.toAct}"]`);
    if (ring) { ring.classList.toggle('low', low); ring.firstChild.setAttribute('stroke-dashoffset', String(RING_C * (1 - frac))); }
    const clock = this.wrap.querySelector(`[data-clock="${hand.toAct}"]`);
    if (clock) {
      const secs = Math.max(0, Math.ceil((now >= base ? left : base - now) / 1000));
      clock.textContent = now >= base ? `Bank ${secs}` : String(secs);
      clock.classList.toggle('low', low);
      if (hand.legal && secs <= 5 && secs > 0 && this.lastTick !== secs) { this.lastTick = secs; play('tick'); }
    }
  }
}
