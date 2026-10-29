// PDF reports in the JACO CORP 2026 identity: a navy band with the crest and a gold rule,
// clean tables that repeat their header across pages, simple bar charts, and a footer on
// every page saying where the figures come from (official result version, or DRAFT).
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { CREST_PNG_BASE64 } from './crest-data.mjs';

const NAVY = rgb(0.043, 0.102, 0.18);
const GOLD = rgb(0.847, 0.722, 0.439);
const GOLD_TEXT = rgb(0.478, 0.361, 0.118);
const INK = rgb(0.12, 0.13, 0.15);
const MUTED = rgb(0.37, 0.33, 0.27);
const ZEBRA = rgb(0.973, 0.957, 0.925);
const LINE = rgb(0.85, 0.8, 0.71);
const RED = rgb(0.64, 0.21, 0.16);
const GREEN = rgb(0.11, 0.42, 0.3);
export const PALETTE = [rgb(0.043, 0.102, 0.18), rgb(0.847, 0.722, 0.439), rgb(0.33, 0.47, 0.62), rgb(0.62, 0.42, 0.28), rgb(0.42, 0.55, 0.42)];

const W = 595.28; const H = 841.89; const M = 44;

export class PdfReport {
  static async create(opts) { const r = new PdfReport(opts); await r.init(); return r; }
  constructor({ title, subtitle = '', eventName = 'JACO CORP 2026', round = 'Round 4 — International Business Expansion', source = '', draft = false, generated = '', notice = '', landscape = false }) {
    Object.assign(this, { title, subtitle, eventName, round, source, draft, generated, notice });
    this.pw = landscape ? H : W; this.ph = landscape ? W : H;
  }
  async init() {
    this.pdf = await PDFDocument.create();
    this.pdf.setTitle(`${this.eventName} — ${this.title}`);
    this.pdf.setAuthor('JACO CORP 2026 Event Control');
    this.pdf.setCreator('JACO CORP Round 4 Control');
    this.f = {
      serif: await this.pdf.embedFont(StandardFonts.TimesRoman), serifB: await this.pdf.embedFont(StandardFonts.TimesRomanBold),
      sans: await this.pdf.embedFont(StandardFonts.Helvetica), sansB: await this.pdf.embedFont(StandardFonts.HelveticaBold),
      sansI: await this.pdf.embedFont(StandardFonts.HelveticaOblique),
    };
    this.charset = new Set(this.f.sans.getCharacterSet());
    this.crest = await this.pdf.embedPng(Buffer.from(CREST_PNG_BASE64, 'base64'));
    this.newPage(true);
  }
  /** Standard fonts speak WinAnsi only: map the few symbols we use, drop the rest. */
  t(s) {
    const str = String(s ?? '')
      .replace(/₹\s?/g, 'Rs\u00A0').replace(/−/g, '-').replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/Σ/g, 'Sum ').replace(/→/g, '->').replace(/≠/g, '!=').replace(/✓/g, 'OK').replace(/•••/g, '***');
    let out = '';
    for (const ch of str) out += this.charset.has(ch.codePointAt(0)) ? ch : '?';
    return out;
  }
  newPage(first = false) {
    this.page = this.pdf.addPage([this.pw, this.ph]);
    if (first) {
      const bh = 96;
      this.page.drawRectangle({ x: 0, y: this.ph - bh, width: this.pw, height: bh, color: NAVY });
      this.page.drawRectangle({ x: 0, y: this.ph - bh - 3, width: this.pw, height: 3, color: GOLD });
      const ch = 70; const cw = (this.crest.width / this.crest.height) * ch;
      this.page.drawImage(this.crest, { x: M, y: this.ph - bh + 13, width: cw, height: ch });
      const tx = M + cw + 16;
      this.page.drawText(this.t(this.eventName.toUpperCase()), { x: tx, y: this.ph - 34, size: 10, font: this.f.sansB, color: GOLD });
      this.page.drawText(this.t(this.round), { x: tx, y: this.ph - 48, size: 9, font: this.f.sans, color: rgb(0.92, 0.88, 0.8) });
      this.page.drawText(this.t(this.title), { x: tx, y: this.ph - 72, size: 19, font: this.f.serifB, color: rgb(1, 1, 1) });
      if (this.subtitle) this.page.drawText(this.fit(this.subtitle, this.f.sans, 9, this.pw - tx - M), { x: tx, y: this.ph - 87, size: 9, font: this.f.sans, color: rgb(0.85, 0.82, 0.75) });
      this.y = this.ph - bh - 26;
      if (this.source) { this.page.drawText(this.t(this.source), { x: M, y: this.y, size: 9, font: this.f.sansB, color: this.draft ? RED : GOLD_TEXT }); this.y -= 16; }
    } else {
      this.page.drawRectangle({ x: 0, y: this.ph - 26, width: this.pw, height: 26, color: NAVY });
      this.page.drawText(this.t(`${this.eventName.toUpperCase()}  ·  ${this.title}`), { x: M, y: this.ph - 17, size: 8.5, font: this.f.sansB, color: GOLD });
      this.y = this.ph - 48;
    }
  }
  space(h) { if (this.y - h < M + 28) this.newPage(); }
  /** Shorten text with an ellipsis so it fits a width. */
  fit(text, font, size, width) {
    let s = this.t(text);
    if (font.widthOfTextAtSize(s, size) <= width) return s;
    while (s.length > 1 && font.widthOfTextAtSize(`${s}...`, size) > width) s = s.slice(0, -1);
    return `${s.trimEnd()}...`;
  }
  gap(h = 8) { this.y -= h; }
  wrap(text, font, size, width) {
    // split on ordinary spaces only, so "Rs 12,00,000" (non-breaking) stays together
    const words = []; for (const w of this.t(text).split(/[ \t\r\n]+/)) {
      if (font.widthOfTextAtSize(w, size) <= width) { words.push(w); continue; }
      let part = ''; for (const ch of w) { if (font.widthOfTextAtSize(part + ch, size) > width && part) { words.push(part); part = ch; } else part += ch; } if (part) words.push(part);
    }
    const lines = []; let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) > width && cur) { lines.push(cur); cur = w; } else cur = next;
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  }
  heading(text, level = 1) {
    const size = level === 1 ? 14 : 11.5;
    this.space(size + 30);
    this.gap(level === 1 ? 10 : 6);
    this.page.drawText(this.t(text), { x: M, y: this.y, size, font: level === 1 ? this.f.serifB : this.f.sansB, color: level === 1 ? NAVY : GOLD_TEXT });
    this.y -= 6;
    if (level === 1) this.page.drawRectangle({ x: M, y: this.y, width: this.pw - 2 * M, height: 1, color: GOLD });
    this.y -= level === 1 ? 14 : 10;
  }
  para(text, { size = 9.5, font = 'sans', color = INK, indent = 0 } = {}) {
    const f = this.f[font];
    for (const line of this.wrap(text, f, size, this.pw - 2 * M - indent)) {
      this.space(size + 4);
      this.page.drawText(line, { x: M + indent, y: this.y, size, font: f, color });
      this.y -= size + 3.5;
    }
    this.y -= 3;
  }
  bullets(items, opts = {}) {
    for (const it of items) {
      const text = typeof it === 'string' ? it : it.text;
      const tone = typeof it === 'string' ? null : it.tone;
      const mark = tone === 'positive' ? '+' : tone === 'negative' ? '-' : '*';
      const col = tone === 'positive' ? GREEN : tone === 'negative' ? RED : MUTED;
      this.space(14);
      this.page.drawText(mark, { x: M + 2, y: this.y, size: 10, font: this.f.sansB, color: col });
      this.para(text, { ...opts, indent: 14 });
    }
  }
  kv(pairs, { cols = 2 } = {}) {
    const colW = (this.pw - 2 * M) / cols;
    for (let i = 0; i < pairs.length; i += cols) {
      this.space(26);
      for (let c = 0; c < cols && i + c < pairs.length; c++) {
        const [k, v] = pairs[i + c];
        const x = M + c * colW;
        this.page.drawText(this.t(k).toUpperCase(), { x, y: this.y, size: 7, font: this.f.sansB, color: GOLD_TEXT });
        this.page.drawText(this.t(v).slice(0, 60), { x, y: this.y - 12, size: 10.5, font: this.f.serifB, color: INK });
      }
      this.y -= 28;
    }
  }
  /** columns: [{ label, w (share of width), align: 'left'|'right' }]; rows: arrays of strings. */
  table({ columns, rows, totals = null, size = 8, zebra = true, title = null }) {
    if (title) this.heading(title, 2);
    const totalW = this.pw - 2 * M;
    const ws = columns.map((c) => (c.w || 1));
    const wsum = ws.reduce((a, b) => a + b, 0);
    const widths = ws.map((w) => (w / wsum) * totalW);
    const pad = 3;
    // header size: small enough that no single header word is wider than its column
    let hs = size - 0.5;
    while (hs > 5.5 && columns.some((c, i) => this.t(c.label).split(/[ \t]+/).some((w) => this.f.sansB.widthOfTextAtSize(w, hs) > widths[i] - 2 * pad))) hs -= 0.25;
    const header = () => {
      const lines = columns.map((c, i) => this.wrap(c.label, this.f.sansB, hs, widths[i] - 2 * pad));
      const hh = Math.max(...lines.map((l) => l.length)) * (hs + 1.5) + 6;
      this.space(hh + size + 8);
      this.page.drawRectangle({ x: M, y: this.y - hh + size + 1, width: totalW, height: hh, color: NAVY });
      let x = M;
      lines.forEach((ls, i) => {
        ls.forEach((l, j) => {
          const tw = this.f.sansB.widthOfTextAtSize(l, hs);
          const tx = columns[i].align === 'right' ? x + widths[i] - pad - tw : x + pad;
          this.page.drawText(l, { x: tx, y: this.y - j * (hs + 1.5), size: hs, font: this.f.sansB, color: rgb(1, 1, 1) });
        });
        x += widths[i];
      });
      this.y -= hh;
    };
    header();
    const drawRow = (cells, { bold = false, fill = null } = {}) => {
      const font = bold ? this.f.sansB : this.f.sans;
      // numbers (right-aligned) never wrap: they shrink to fit their column instead
      const sizes = cells.map((c, i) => { if (columns[i].align !== 'right') return size; let fs = size; const txt = this.t(c ?? ''); while (fs > 5 && font.widthOfTextAtSize(txt, fs) > widths[i] - 2 * pad) fs -= 0.25; return fs; });
      const lines = cells.map((c, i) => (columns[i].align === 'right' ? [this.t(c ?? '')] : this.wrap(c ?? '', font, size, widths[i] - 2 * pad)));
      const rh = Math.max(...lines.map((l) => l.length)) * (size + 1.5) + 4;
      if (this.y - rh < M + 28) { this.newPage(); header(); }
      if (fill) this.page.drawRectangle({ x: M, y: this.y - rh + size + 1.5, width: totalW, height: rh, color: fill });
      let x = M;
      lines.forEach((ls, i) => {
        ls.forEach((l, j) => {
          const fs = sizes[i];
          const tw = font.widthOfTextAtSize(l, fs);
          const neg = /^-/.test(l) && columns[i].align === 'right';
          const tx = columns[i].align === 'right' ? x + widths[i] - pad - tw : x + pad;
          this.page.drawText(l, { x: tx, y: this.y - j * (size + 1.5), size: fs, font, color: neg ? RED : INK });
        });
        x += widths[i];
      });
      this.y -= rh;
    };
    rows.forEach((r, i) => drawRow(r, { fill: zebra && i % 2 ? ZEBRA : null }));
    if (totals) {
      this.page.drawRectangle({ x: M, y: this.y + size + 1.5, width: totalW, height: 0.8, color: GOLD });
      drawRow(totals, { bold: true });
    }
    this.y -= 8;
  }
  /** Horizontal bars. items: [{ label, values: [{ v, label }] }]; one colour per series. */
  bars({ title = null, items, series = [], fmt = (v) => String(v), height = 12 }) {
    if (title) this.heading(title, 2);
    const max = Math.max(1, ...items.flatMap((i) => i.values.map((v) => Math.abs(v.v))));
    const labelW = 110; const valW = 70;
    const barW = this.pw - 2 * M - labelW - valW;
    const zeroX = M + labelW + (items.some((i) => i.values.some((v) => v.v < 0)) ? barW / 2 : 0);
    const scale = (items.some((i) => i.values.some((v) => v.v < 0)) ? barW / 2 : barW) / max;
    if (series.length > 1) {
      this.space(14);
      let x = M + labelW;
      series.forEach((s, k) => { this.page.drawRectangle({ x, y: this.y - 1, width: 8, height: 8, color: PALETTE[k % PALETTE.length] }); this.page.drawText(this.t(s), { x: x + 11, y: this.y, size: 8, font: this.f.sans, color: MUTED }); x += 20 + this.f.sans.widthOfTextAtSize(this.t(s), 8) + 10; });
      this.y -= 14;
    }
    for (const it of items) {
      const h = it.values.length * (height + 2) + 4;
      this.space(h + 4);
      this.page.drawText(this.t(it.label).slice(0, 26), { x: M, y: this.y - height + 3, size: 8.5, font: this.f.sans, color: INK });
      it.values.forEach((v, k) => {
        const w = Math.abs(v.v) * scale;
        const y = this.y - (k + 1) * (height + 2) + 2;
        this.page.drawRectangle({ x: v.v >= 0 ? zeroX : zeroX - w, y, width: Math.max(0.5, w), height, color: PALETTE[k % PALETTE.length] });
        this.page.drawText(this.t(v.label ?? fmt(v.v)), { x: M + labelW + barW + 6, y: y + 3, size: 8, font: this.f.sans, color: v.v < 0 ? RED : INK });
      });
      this.y -= h;
    }
    this.page.drawRectangle({ x: zeroX, y: this.y + 4, width: 0.6, height: 2, color: LINE });
    this.y -= 6;
  }
  async save() {
    const pages = this.pdf.getPages();
    pages.forEach((p, i) => {
      const { width } = p.getSize();
      if (this.draft) p.drawText('DRAFT - NOT OFFICIAL', { x: 120, y: 260, size: 54, font: this.f.sansB, color: rgb(0.85, 0.3, 0.25), opacity: 0.12, rotate: degrees(35) });
      p.drawRectangle({ x: M, y: 30, width: width - 2 * M, height: 0.6, color: LINE });
      p.drawText(this.t(`${this.eventName} · Round 4 Control · ${this.notice || 'Fictional simulation data'}`).slice(0, 120), { x: M, y: 19, size: 7, font: this.f.sans, color: MUTED });
      p.drawText(this.t(`${this.source ? `${this.source} · ` : ''}${this.generated}`).slice(0, 130), { x: M, y: 10, size: 7, font: this.f.sans, color: MUTED });
      const pn = `Page ${i + 1} of ${pages.length}`;
      p.drawText(pn, { x: width - M - this.f.sans.widthOfTextAtSize(pn, 7.5), y: 19, size: 7.5, font: this.f.sansB, color: MUTED });
    });
    return Buffer.from(await this.pdf.save());
  }
}
