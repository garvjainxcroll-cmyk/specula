// The betting panel. It only offers what the server says is legal right now (legalActions):
// Fold, Check or Call, and Bet / Raise with presets (Small Bet, Big Bet, ½, ⅔, ¾ Pot, Pot,
// Min Raise, All-In), a slider and a number box. Before you confirm it shows the amount,
// what you put in, your stack after, your total in this pot and the pot after.
// The server checks everything again: the panel is a convenience, never the rules.
import { h, mount, fmt, confirmSheet } from './ui.mjs';
import { presetAmount, betSummary, PRESET_BUTTONS } from '../src/engine/presets.mjs';
import { prefs, presets } from './prefs.mjs';

export class BetPanel {
  constructor({ onAct }) {
    this.onAct = onAct;
    this.el = h('div', { class: 'actions idle' });
    this.key = null;
    this.to = null;
    this.busy = false;
  }

  /** Show the panel for `legal` (or a waiting message when legal is null). */
  update(legal, waiting = null) {
    if (!legal) { this.key = null; this.el.className = 'actions idle'; mount(this.el, waiting || h('div', { class: 'waitline muted' }, 'Waiting…')); return; }
    const key = `${legal.handId}:${legal.seq}`;
    const fresh = key !== this.key;
    if (fresh) {
      this.key = key; this.busy = false;
      this.to = legal.canBet || legal.canRaise ? legal.minTo : null;
      this.typed = null;
    }
    this.legal = legal;
    if (fresh || !this.el.querySelector('.mainbtns')) this.draw(fresh); // same decision: leave the panel alone (keeps the slider and typing)
  }

  draw(fresh) {
    const l = this.legal;
    const canSize = l.canBet || l.canRaise;
    const verb = l.canBet ? 'Bet' : 'Raise to';
    const unit = Math.max(1, l.sb || 1);
    const pre = presets();
    const label = (k) => (k === 'small' ? `Small Bet (${pre.small.mode === 'pot' ? `${pre.small.value}%` : `${pre.small.value} BB`})` : k === 'big' ? `Big Bet (${pre.big.mode === 'pot' ? `${pre.big.value}%` : `${pre.big.value} BB`})` : PRESET_BUTTONS.find((b) => b[0] === k)[1]);
    const sizes = canSize ? h('div', { class: 'sizes', role: 'group', 'aria-label': 'Bet size presets' }, PRESET_BUTTONS.map(([k]) => {
      const p = presetAmount(l, k, pre, unit);
      return h('button', { type: 'button', class: p && p.to === this.to ? 'on' : '', disabled: !p, title: p ? `${verb} ${fmt(p.to)}${p.clamped ? ' (kept within the legal range)' : ''}` : null, onclick: () => { this.to = p.to; this.typed = null; this.draw(false); } },
        label(k).replace(/ \(.*\)$/, ''), h('span', { class: 'a' }, p ? fmt(p.to) : '—'));
    })) : null;

    let slider = null; let err = null;
    if (canSize && l.maxTo > l.minTo) {
      const range = h('input', { type: 'range', min: l.minTo, max: l.maxTo, step: 1, value: this.to, 'aria-label': `${verb} amount` });
      range.addEventListener('input', () => {
        let v = Number(range.value);
        if (v !== l.maxTo && v !== l.minTo) v = Math.min(l.maxTo, Math.max(l.minTo, Math.round(v / unit) * unit));
        this.to = v; this.typed = null; num.value = v; this.refreshSummary();
      });
      const num = h('input', { type: 'number', min: l.minTo, max: l.maxTo, step: unit, value: this.typed ?? this.to, inputmode: 'numeric', 'aria-label': 'Custom amount' });
      num.addEventListener('input', () => {
        const v = Number(num.value);
        this.typed = num.value;
        if (Number.isInteger(v) && v >= l.minTo && v <= l.maxTo) { this.to = v; range.value = v; this.bad = null; } else this.bad = `Choose between ${fmt(l.minTo)} and ${fmt(l.maxTo)}`;
        this.refreshSummary();
      });
      slider = h('div', { class: 'slider' }, range, num);
      err = h('div', { class: 'err', 'data-err': '' }, this.bad || '');
    } else if (canSize) {
      this.to = l.maxTo;
    }
    const callLabel = l.canCheck ? 'Check' : `Call ${fmt(l.toCall)}${l.callIsAllIn ? ' · all-in' : ''}`;
    const reason = !canSize && !l.canCheck ? (l.callIsAllIn ? 'Calling puts you all-in' : 'You can call or fold: the betting has not been reopened to you, or nobody can call a raise') : null;
    this.raiseBtn = h('button', { class: 'btn', disabled: !canSize || this.busy, onclick: () => this.go(l.canBet ? 'bet' : 'raise', this.to) });
    this.summaryEl = h('div', { class: 'summary', 'aria-live': 'polite' });
    this.el.className = `actions yours${fresh ? '' : ' still'}`;
    mount(this.el,
      h('div', { class: 'info' },
        l.canCall ? h('span', {}, 'To call ', h('b', {}, fmt(l.toCall))) : h('span', {}, 'Nothing to call'),
        canSize ? h('span', {}, l.canBet ? 'Minimum bet ' : 'Minimum raise to ', h('b', {}, fmt(l.minTo)), l.minTo === l.maxTo ? ' (all-in)' : '') : null,
        h('span', {}, 'Pot ', h('b', {}, fmt(l.pot))),
        h('span', {}, 'Your stack ', h('b', {}, fmt(l.stack)))),
      sizes, slider, err,
      canSize ? this.summaryEl : (reason ? h('div', { class: 'summary' }, reason) : null),
      h('div', { class: 'mainbtns' },
        h('button', { class: 'btn fold', disabled: this.busy, onclick: () => this.fold() }, 'Fold'),
        h('button', { class: 'btn callb', disabled: this.busy, onclick: () => this.go(l.canCheck ? 'check' : 'call') }, callLabel),
        this.raiseBtn));
    this.refreshSummary();
  }

  refreshSummary() {
    const l = this.legal;
    if (!l || !(l.canBet || l.canRaise) || !this.summaryEl) return;
    const errEl = this.el.querySelector('[data-err]');
    if (errEl) errEl.textContent = this.bad && this.typed !== null ? this.bad : '';
    const invalid = this.typed !== null && this.bad;
    const s = betSummary(l, this.to);
    const verb = l.canBet ? 'Bet' : 'Raise to';
    mount(this.summaryEl,
      h('span', {}, s.allIn ? 'All-in ' : `${verb} `, h('b', {}, fmt(s.to))),
      h('span', {}, 'puts in ', h('b', {}, fmt(s.add))),
      h('span', {}, 'stack after ', h('b', {}, fmt(s.stackAfter))),
      h('span', {}, 'your total this hand ', h('b', {}, fmt(s.committedAfter))),
      h('span', {}, 'pot after ', h('b', {}, fmt(s.potAfter))));
    this.raiseBtn.disabled = !!invalid || this.busy;
    mount(this.raiseBtn, s.allIn ? 'All-in ' : `${verb} `, h('span', { class: 'amt' }, fmt(s.to)));
  }

  async fold() {
    if (this.legal.canCheck && prefs().confirmFold) {
      const yes = await confirmSheet('Fold instead of checking?', 'You can check for free. Fold your hand anyway?', 'Fold', 'Keep my hand');
      if (!yes) return;
    }
    this.go('fold');
  }

  async go(type, to) {
    if (this.busy) return;
    this.busy = true;
    for (const b of this.el.querySelectorAll('button')) b.disabled = true;
    const ok = await this.onAct(type, to, this.legal);
    if (!ok) { this.busy = false; this.draw(false); }
  }
}
