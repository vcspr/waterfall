#!/usr/bin/env node
/**
 * waterfall — a specimen machine.
 *
 *   node waterfall.mjs MyFont.ttf
 *   node waterfall.mjs MyFont.ttf --out specimens --no-pdf
 *   node waterfall.mjs SerifA.otf SansB.ttf --compare   # two fonts, one spread
 *
 * Reads the font's own metadata (fontkit) and sets a specimen in the font
 * itself: cover, size waterfall, character set, variable-axis ramps, and a
 * text setting. The layout adapts to what the font actually is — variable
 * fonts get axis pages, monospaced fonts get a code setting.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, resolve, join } from "node:path";
import * as fontkitNS from "fontkit";

const fontkit = fontkitNS.default ?? fontkitNS;

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const flag = (n) => argv.includes(n);
const fontPaths = argv.filter((a) => /\.(ttf|otf|ttc|woff2?)$/i.test(a));
const fontPath = fontPaths[0];
if (!fontPath) { console.error("Usage: node waterfall.mjs <font file> [font2 --compare] [--out out] [--no-pdf]"); process.exit(1); }

const OUT = resolve(opt("--out", "out"));
const abs = resolve(fontPath);


// ---------------------------------------------------------------- compare mode
if (flag("--compare") && fontPaths.length >= 2) {
  const introspect = (p) => {
    let f = fontkit.openSync(resolve(p));
    if (f.fonts) f = f.fonts[0];
    const pan = f["OS/2"]?.panose;
    const isMono = !!f.post?.isFixedPitch;
    return {
      abs: resolve(p), family: f.familyName || basename(p), style: f.subfamilyName || "",
      glyphs: f.numGlyphs, axes: Object.entries(f.variationAxes || {}),
      feats: [...new Set(f.availableFeatures || [])].length,
      kind: isMono ? "monospace" : (pan && pan[0] === 2 ? (pan[1] >= 2 && pan[1] <= 10 ? "serif" : "sans serif") : "typeface"),
    };
  };
  const [A, B] = [introspect(fontPaths[0]), introspect(fontPaths[1])];
  const escC = (x) => String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const GRAM = "Sphinx of black quartz, judge my vow.";
  const col = (F, cls) => `
    <div class="side">
      <div class="side-name ${cls}">${escC(F.family)}</div>
      <div class="side-meta">${escC(F.style)} · ${escC(F.kind)} · ${F.glyphs.toLocaleString()} glyphs · ${F.axes.length} axes · ${F.feats} features</div>
      ${[64, 36, 21, 13].map((z) => `<div class="cmp-row ${cls}" style="font-size:${z}pt">${escC(GRAM)}</div>`).join("")}
      <div class="cmp-chars ${cls}">AaBbGgQqRr 0123469 fi ffl → &amp;?!</div>
      <p class="cmp-body ${cls}">The difference between two typefaces is rarely visible in a name. Set the same words at the same sizes and the argument settles itself.</p>
    </div>`;
  const htmlC = `<!doctype html><html><head><meta charset="utf-8"><title>${escC(A.family)} vs ${escC(B.family)}</title>
<style>
@font-face { font-family: "FA"; src: url("file://${encodeURI(A.abs)}"); }
@font-face { font-family: "FB"; src: url("file://${encodeURI(B.abs)}"); }
@page { size: Letter landscape; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { background: #26262a; font-family: "Helvetica Neue", Arial, sans-serif; color: #101013; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { background: #fcfcfa; width: 11in; height: 8.5in; padding: 0.5in 0.6in; margin: 0 auto; display: flex; flex-direction: column; overflow: hidden; }
@media screen { .page { margin: 12px auto; box-shadow: 0 1px 4px rgba(0,0,0,.4); } }
.bar { display: flex; justify-content: space-between; font-size: 8pt; letter-spacing: .14em; text-transform: uppercase; padding: 6px 0; border-top: 1.5px solid #101013; }
.bar.top { border-bottom: 1px solid #b9b9b2; margin-bottom: 18px; }
.bar.bot { margin-top: auto; }
.duel { flex: 1; display: grid; grid-template-columns: 1fr 1px 1fr; gap: 0 28px; }
.divider { background: #101013; }
.fa { font-family: "FA", serif; }
.fb { font-family: "FB", serif; }
.side-name { font-size: 30pt; line-height: 1.05; }
.side-meta { font-size: 8pt; color: #8a8a84; letter-spacing: .06em; margin: 6px 0 14px; }
.cmp-row { white-space: nowrap; overflow: hidden; border-bottom: 1px solid #e4e4dd; padding: 8px 0; }
.cmp-chars { font-size: 22pt; padding: 12px 0; border-bottom: 1px solid #e4e4dd; }
.cmp-body { font-size: 11pt; line-height: 1.55; margin-top: 14px; }
</style></head><body>
<section class="page">
  <div class="bar top"><span>WATERFALL — COMPARISON SPREAD</span><span>${escC(A.family).toUpperCase()} / ${escC(B.family).toUpperCase()}</span></div>
  <div class="duel">${col(A, "fa")}<div class="divider"></div>${col(B, "fb")}</div>
  <div class="bar bot"><span>SAME WORDS · SAME SIZES</span><span>SET BY WATERFALL</span></div>
</section>
</body></html>`;
  mkdirSync(OUT, { recursive: true });
  const slugC = `${A.family}-vs-${B.family}`.toLowerCase().replace(/[^\w-]+/g, "-");
  const outC = join(OUT, `${slugC}.html`);
  writeFileSync(outC, htmlC);
  console.log(`✓ ${outC}`);
  if (!flag("--no-pdf")) {
    const { chromium } = await import("playwright");
    const b = await chromium.launch();
    try {
      const p = await b.newPage();
      await p.goto(`file://${outC}`, { waitUntil: "networkidle" });
      await p.pdf({ path: join(OUT, `${slugC}.pdf`), landscape: true, format: "Letter", printBackground: true, preferCSSPageSize: true });
      console.log(`✓ ${join(OUT, `${slugC}.pdf`)}`);
    } finally { await b.close(); }
  }
  process.exit(0);
}

let font = fontkit.openSync(abs);
if (font.fonts) font = font.fonts[0]; // .ttc collections: take the first face

// ---------------------------------------------------------------- introspect
const family = font.familyName || basename(abs);
const style = font.subfamilyName || "";
const glyphs = font.numGlyphs;
const axes = font.variationAxes || {};
const axisList = Object.entries(axes);
const features = [...new Set(font.availableFeatures || [])];
const mono = !!font.post?.isFixedPitch;

let kind = "a typeface";
const panose = font["OS/2"]?.panose;
if (mono) kind = "a monospace";
else if (panose && panose[0] === 2) kind = panose[1] >= 2 && panose[1] <= 10 ? "a serif" : "a sans serif";

const meta = {
  family, style, glyphs, mono, kind,
  axes: axisList.map(([tag, a]) => `${tag} ${a.min}–${a.max}`),
  features: features.slice(0, 24),
};

// ---------------------------------------------------------------- charset
const cs = new Set(font.characterSet || []);
const ranges = [[0x41, 0x5a], [0x61, 0x7a], [0x30, 0x39],
  [0x21, 0x2f], [0x3a, 0x40], [0x5b, 0x60], [0x7b, 0x7e],
  [0xc0, 0xff], [0x152, 0x153], [0x2018, 0x201e], [0x2039, 0x203a]];
const chars = [];
for (const [a, b] of ranges) for (let c = a; c <= b; c++) if (cs.has(c)) chars.push(String.fromCodePoint(c));
const grid = chars.slice(0, 140);

// ---------------------------------------------------------------- html
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const PANGRAM = "Sphinx of black quartz, judge my vow.";
const SIZES = [96, 72, 56, 42, 32, 24, 18, 14, 11, 9];

const wf = SIZES.map((s) =>
  `<div class="wf-row"><span class="tag">${s}</span><span class="spec" style="font-size:${s}pt">${esc(PANGRAM)}</span></div>`).join("");

const gridHtml = grid.map((c) => `<div class="cell spec">${esc(c)}</div>`).join("");

const ramps = axisList.map(([tag, a]) => {
  const steps = 6;
  const row = Array.from({ length: steps }, (_, i) => {
    const v = a.min + (a.max - a.min) * (i / (steps - 1));
    return `<div class="ramp-cell"><div class="spec" style="font-size:44pt; font-variation-settings:'${tag}' ${v.toFixed(0)}">Aa</div><div class="tag">${v.toFixed(0)}</div></div>`;
  }).join("");
  return `<div class="ramp"><h3>${esc(a.name || tag)} · <span class="mut">${tag} ${a.min}–${a.max}</span></h3><div class="ramp-row">${row}</div>
  <div class="spec ramp-line" style="font-variation-settings:'${tag}' ${a.max}">${esc(PANGRAM)}</div></div>`;
}).join("");

const featHtml = features.map((f) => `<span class="chip">${esc(f)}</span>`).join(" ");

const setting = mono
  ? `<pre class="spec code">const specimen = fonts
  .filter((f) =&gt; f.variable)
  .map((f) =&gt; waterfall(f))
  .sort((a, b) =&gt; a.family
    .localeCompare(b.family));

// 0O 1lI| {}[]() =&gt; !== ~/.config</pre>`
  : `<p class="spec set-lg">The world is full of type that was chosen because it was already there. A specimen exists so a choice can be made on purpose: at size, in text, under real punctuation, before the deadline arrives.</p>
     <p class="spec set-sm">Hamburgefonstiv 0123456789 — “quoted,” ‘nested’ &amp; (parenthetical); the quick brown fox jumps over the lazy dog while 2½ waffles cost $4.20 at 9:41 a.m.</p>`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(family)} specimen</title>
<style>
@font-face { font-family: "SPEC"; src: url("file://${encodeURI(abs)}"); }
@page { size: Letter portrait; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { background: #26262a; font-family: "Helvetica Neue", Arial, sans-serif; color: #101013; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.spec { font-family: "SPEC", serif; }
.page { background: #fcfcfa; width: 8.5in; height: 11in; padding: 0.55in 0.6in; page-break-after: always; position: relative; display: flex; flex-direction: column; overflow: hidden; margin: 0 auto; }
@media screen { .page { margin: 12px auto; box-shadow: 0 1px 4px rgba(0,0,0,.4); } }
.rule { border-top: 1.5px solid #101013; }
.bar { display: flex; justify-content: space-between; font-size: 8pt; letter-spacing: .14em; text-transform: uppercase; padding: 6px 0; color: #101013; }
.bar.top { border-top: 1.5px solid #101013; border-bottom: 1px solid #b9b9b2; }
.bar.bot { border-top: 1.5px solid #101013; margin-top: auto; }
.tag { font-size: 7.5pt; letter-spacing: .1em; color: #8a8a84; font-family: "Helvetica Neue", Arial, sans-serif; }
.mut { color: #8a8a84; font-weight: 400; }
h3 { font-size: 9pt; letter-spacing: .12em; text-transform: uppercase; margin: 18px 0 10px; }
.cover-name { font-size: 108pt; line-height: .95; margin: auto 0 8px; word-break: break-word; }
.cover-sub { font-size: 13pt; color: #45454a; margin-bottom: 26px; }
.cover-meta { display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1.5px solid #101013; }
.cover-meta div { padding: 10px 12px 2px 0; font-size: 9.5pt; }
.cover-meta .k { display: block; font-size: 7.5pt; letter-spacing: .12em; text-transform: uppercase; color: #8a8a84; margin-bottom: 3px; }
.wf-row { display: grid; grid-template-columns: 34px 1fr; align-items: baseline; border-bottom: 1px solid #e4e4dd; padding: 6px 0; overflow: hidden; }
.wf-row .spec { white-space: nowrap; }
.grid { display: grid; grid-template-columns: repeat(10, 1fr); border-left: 1px solid #e4e4dd; border-top: 1px solid #e4e4dd; margin-top: 14px; }
.cell { border-right: 1px solid #e4e4dd; border-bottom: 1px solid #e4e4dd; font-size: 21pt; text-align: center; padding: 12px 0 10px; }
.ramp { margin-bottom: 10px; }
.ramp-row { display: flex; gap: 26px; align-items: baseline; }
.ramp-cell { text-align: center; }
.ramp-line { font-size: 15pt; margin-top: 10px; white-space: nowrap; overflow: hidden; }
.chip { display: inline-block; border: 1px solid #101013; padding: 3px 9px; margin: 0 6px 8px 0; font-size: 8.5pt; letter-spacing: .06em; font-family: "Helvetica Neue", Arial, sans-serif; }
.set-lg { font-size: 21pt; line-height: 1.45; margin: 16px 0 22px; }
.set-sm { font-size: 11.5pt; line-height: 1.6; max-width: 5.6in; }
.code { font-size: 13pt; line-height: 1.7; margin-top: 16px; }
</style></head><body>

<section class="page">
  <div class="bar top"><span>SPECIMEN No.1</span><span>${esc(family).toUpperCase()}</span></div>
  <div class="cover-name spec">${esc(family)}</div>
  <div class="cover-sub">${esc(style)} · ${esc(kind)} · set by waterfall</div>
  <div class="cover-meta">
    <div><span class="k">Glyphs</span>${glyphs.toLocaleString()}</div>
    <div><span class="k">Variable axes</span>${meta.axes.length ? esc(meta.axes.join(" · ")) : "none"}</div>
    <div><span class="k">OpenType features</span>${features.length}</div>
  </div>
  <div class="bar bot"><span>${esc(basename(abs)).toUpperCase()}</span><span>PAGE 01</span></div>
</section>

<section class="page">
  <div class="bar top"><span>THE WATERFALL</span><span>${esc(family).toUpperCase()}</span></div>
  <div style="margin-top:8px">${wf}</div>
  <div class="bar bot"><span>96pt → 9pt</span><span>PAGE 02</span></div>
</section>

<section class="page">
  <div class="bar top"><span>CHARACTER SET</span><span>${esc(family).toUpperCase()}</span></div>
  <div class="grid">${gridHtml}</div>
  <h3 style="margin-top:20px">OpenType features</h3>
  <div>${featHtml || '<span class="mut">none declared</span>'}</div>
  <div class="bar bot"><span>${grid.length} OF ${glyphs.toLocaleString()} GLYPHS SHOWN</span><span>PAGE 03</span></div>
</section>

${axisList.length ? `<section class="page">
  <div class="bar top"><span>VARIABLE AXES</span><span>${esc(family).toUpperCase()}</span></div>
  <div style="margin-top:6px">${ramps}</div>
  <div class="bar bot"><span>${axisList.length} AXIS${axisList.length > 1 ? "ES" : ""}</span><span>PAGE 04</span></div>
</section>` : ""}

<section class="page">
  <div class="bar top"><span>${mono ? "CODE SETTING" : "TEXT SETTING"}</span><span>${esc(family).toUpperCase()}</span></div>
  ${setting}
  <div class="bar bot"><span>SET BY WATERFALL</span><span>END</span></div>
</section>

</body></html>`;

// ---------------------------------------------------------------- emit
mkdirSync(OUT, { recursive: true });
const slug = family.toLowerCase().replace(/[^\w]+/g, "-");
const htmlOut = join(OUT, `${slug}.html`);
writeFileSync(htmlOut, html);
console.log(`✓ ${htmlOut}`);
console.log(`  ${family} — ${kind}, ${glyphs.toLocaleString()} glyphs, ${axisList.length} axes, ${features.length} features`);

if (!flag("--no-pdf")) {
  const { chromium } = await import("playwright");
  const b = await chromium.launch();
  try {
    const p = await b.newPage();
    await p.goto(`file://${htmlOut}`, { waitUntil: "networkidle" });
    await p.pdf({ path: join(OUT, `${slug}.pdf`), format: "Letter", printBackground: true, preferCSSPageSize: true });
    console.log(`✓ ${join(OUT, `${slug}.pdf`)}`);
  } finally { await b.close(); }
}
