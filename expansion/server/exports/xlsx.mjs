// A small Excel (.xlsx) writer: several sheets, formulas with their cached values,
// currency/percent formats, bold totals, column widths and frozen header rows.
// Excel recalculates every formula on opening (fullCalcOnLoad).
import { zip } from './zip.mjs';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
export const col = (i) => { let s = ''; i += 1; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
export const ref = (c, r) => `${col(c)}${r}`;

// style name → cellXfs index (order must match STYLES below)
const STYLE_NAMES = ['text', 'head', 'title', 'money', 'moneyBold', 'pct', 'num', 'int', 'bold', 'note', 'subtitle', 'pctBold', 'numBold', 'wrap', 'flag'];
const S = Object.fromEntries(STYLE_NAMES.map((n, i) => [n, i]));

function stylesXml(currency) {
  const sym = esc(currency.symbol || currency.code || '');
  const money = `&quot;${sym}&quot;#,##0;[Red]\\-&quot;${sym}&quot;#,##0`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="${money}"/><numFmt numFmtId="165" formatCode="0.0%"/><numFmt numFmtId="166" formatCode="#,##0.00"/></numFmts>
<fonts count="6">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="15"/><color rgb="FF0B1A2E"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><name val="Calibri"/></font>
<font><i/><sz val="10"/><color rgb="FF5E5344"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FF7A5C1E"/><name val="Calibri"/></font>
</fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF0B1A2E"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF4EAD5"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top style="thin"><color rgb="FF7A5C1E"/></top><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${STYLE_NAMES.length}">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment wrapText="1" vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="3" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="165" fontId="3" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="166" fontId="3" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

class Sheet {
  constructor(name, { cols = [], freeze = null } = {}) {
    this.name = name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);
    this.cols = cols; this.freeze = freeze; this.rows = []; this.merges = [];
  }
  /** Append a row; returns its 1-based row number. Cells: value | { v, f, s }. */
  row(cells = [], { height = null } = {}) { this.rows.push({ cells, height }); return this.rows.length; }
  blank() { return this.row([]); }
  get next() { return this.rows.length + 1; }
  merge(range) { this.merges.push(range); }
  /** Sum of the numeric values already written in a column (letters) between two rows. */
  sum(letters, first, last) {
    let c = 0; for (const ch of letters) c = c * 26 + (ch.charCodeAt(0) - 64); c -= 1;
    let t = 0;
    for (let r = first; r <= last; r++) { const cell = this.rows[r - 1]?.cells[c]; const v = cell && typeof cell === 'object' ? cell.v : cell; if (typeof v === 'number' && Number.isFinite(v)) t += v; }
    return Math.round(t * 100) / 100;
  }
  xml() {
    const out = [];
    const colsXml = this.cols.length ? `<cols>${this.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
    const pane = this.freeze ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${this.freeze - 1}" topLeftCell="A${this.freeze}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
    this.rows.forEach((r, ri) => {
      const rn = ri + 1;
      const cs = r.cells.map((c, ci) => {
        if (c === null || c === undefined || c === '') return '';
        const cell = typeof c === 'object' && !Array.isArray(c) ? c : { v: c };
        const s = S[cell.s || (typeof cell.v === 'number' ? 'num' : 'text')] ?? 0;
        const at = ref(ci, rn);
        if (cell.f) {
          const v = cell.v === undefined || cell.v === null ? '' : typeof cell.v === 'boolean' ? `<v>${cell.v ? 1 : 0}</v>` : typeof cell.v === 'number' ? `<v>${cell.v}</v>` : `<v>${esc(cell.v)}</v>`;
          const t = typeof cell.v === 'boolean' ? ' t="b"' : typeof cell.v === 'string' ? ' t="str"' : '';
          return `<c r="${at}" s="${s}"${t}><f>${esc(cell.f)}</f>${v}</c>`;
        }
        if (typeof cell.v === 'number' && Number.isFinite(cell.v)) return `<c r="${at}" s="${s}"><v>${cell.v}</v></c>`;
        if (typeof cell.v === 'boolean') return `<c r="${at}" s="${s}" t="b"><v>${cell.v ? 1 : 0}</v></c>`;
        return `<c r="${at}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(cell.v)}</t></is></c>`;
      }).join('');
      out.push(`<row r="${rn}"${r.height ? ` ht="${r.height}" customHeight="1"` : ''}>${cs}</row>`);
    });
    const merges = this.merges.length ? `<mergeCells count="${this.merges.length}">${this.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${pane}<sheetFormatPr defaultRowHeight="15"/>${colsXml}<sheetData>${out.join('')}</sheetData>${merges}<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
  }
}

export class Workbook {
  constructor({ currency, title = 'JACO CORP 2026', author = 'JACO CORP Event Control' } = {}) { this.currency = currency || { symbol: '₹', code: 'INR' }; this.sheets = []; this.title = title; this.author = author; }
  sheet(name, opts) { let n = name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31); let k = 2; while (this.sheets.some((s) => s.name === n)) n = `${name.slice(0, 28)} ${k++}`; const s = new Sheet(n, opts); this.sheets.push(s); return s; }
  toBuffer() {
    const sheets = this.sheets.length ? this.sheets : [new Sheet('Empty')];
    const files = [
      { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>' },
      { name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${esc(this.title)}</dc:title><dc:creator>${esc(this.author)}</dc:creator></cp:coreProperties>` },
      { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: 'xl/styles.xml', data: stylesXml(this.currency) },
      ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: s.xml() })),
    ];
    return zip(files);
  }
}
