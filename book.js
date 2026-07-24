/**
 * Curio — the annual volume.
 *
 * The promise that "no company can be acquired out from under your memories"
 * only means something if you can hold the memories. This lays the year out as
 * a book and hands it to the browser's own print engine, which every phone and
 * computer can turn into a PDF — or into paper.
 *
 * Deliberately no PDF library. jsPDF and its kin are larger than this entire
 * app, would have to be cached for offline use, and would render type worse
 * than the browser does. Print-to-PDF is already on every device.
 */

const MONTHS = (locale) => Array.from({ length: 12 }, (_, i) =>
  new Date(2000, i, 1).toLocaleDateString(locale, { month: 'long' }));

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Group a year's moments by month, then by day. */
export function organise(moments, year, { composeDay, locale = 'en-GB' } = {}) {
  const kept = moments
    .filter((m) => m.kept !== false && String(m.day || '').startsWith(String(year)))
    .sort((a, b) => new Date(a.at) - new Date(b.at));

  const months = Array.from({ length: 12 }, () => []);
  const byDay = new Map();
  for (const m of kept) {
    if (!byDay.has(m.day)) byDay.set(m.day, []);
    byDay.get(m.day).push(m);
  }
  for (const [day, list] of byDay) {
    const d = new Date(day + 'T12:00:00');
    months[d.getMonth()].push({
      day, date: d, moments: list,
      summary: composeDay ? composeDay(day, list, 0, locale) : { title: day, subtitle: '' },
    });
  }
  return { year, months, days: byDay.size, moments: kept.length };
}

/**
 * The whole book as one printable document.
 * @param opts.stats  { moments, days, withPhoto, mood }
 */
export function render(book, { locale = 'en-GB', name = '', stats = null, labels = {} } = {}) {
  const L = {
    title: 'The Curio', volume: 'Volume', of: 'The year of',
    contents: 'Contents', kept: 'moments kept', days: 'days written',
    photos: 'photographs', colophon: 'Made by The Curio on this device. No copy of this was sent anywhere.',
    empty: 'Nothing was kept this year.',
    ...labels,
  };
  const monthNames = MONTHS(locale);

  const cover = `
    <section class="cover">
      <div class="mark">${esc(L.title)}</div>
      <h1>${esc(book.year)}</h1>
      ${name ? `<div class="who">${esc(L.of)} ${esc(name)}</div>` : ''}
      <div class="figures">
        <span><b>${book.moments}</b>${esc(L.kept)}</span>
        <span><b>${book.days}</b>${esc(L.days)}</span>
        ${stats?.withPhoto ? `<span><b>${stats.withPhoto}</b>${esc(L.photos)}</span>` : ''}
      </div>
    </section>`;

  const contents = `
    <section class="contents">
      <h2>${esc(L.contents)}</h2>
      <ul>${book.months.map((days, i) => days.length
        ? `<li><span>${esc(monthNames[i])}</span><b>${days.length}</b></li>` : '').join('')}
      </ul>
    </section>`;

  const body = book.months.map((days, i) => {
    if (!days.length) return '';
    return `
    <section class="month">
      <h2 class="monthname">${esc(monthNames[i])}</h2>
      ${days.map((d) => `
        <article class="day">
          <header>
            <span class="date">${d.date.toLocaleDateString(locale, { weekday: 'long', day: 'numeric' })}</span>
            <h3>${esc(d.summary.title)}</h3>
          </header>
          ${d.moments.map((m) => `
            <div class="entry">
              <span class="time">${new Date(m.at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</span>
              <div class="body">
                <h4>${esc(m.title)}</h4>
                <p>${esc(m.placard)}</p>
                ${m.photo ? `<img src="${m.photo}" alt="">` : ''}
              </div>
            </div>`).join('')}
        </article>`).join('')}
    </section>`;
  }).join('');

  return `<!DOCTYPE html><html lang="${esc(locale)}"><head><meta charset="utf-8">
<title>${esc(L.title)} — ${esc(book.year)}</title>
<style>
  @page { size: A5; margin: 16mm 14mm; }
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Georgia,"Times New Roman",serif;color:#241d14;background:#fff;
       font-size:11pt;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}

  .cover{height:calc(100vh - 40mm);display:flex;flex-direction:column;justify-content:center;
         page-break-after:always;text-align:center}
  .cover .mark{font-family:ui-monospace,Menlo,monospace;font-size:9pt;letter-spacing:.35em;
               text-transform:uppercase;color:#9a7420;margin-bottom:14mm}
  .cover h1{font-size:56pt;font-weight:400;letter-spacing:-.02em;line-height:1}
  .cover .who{font-style:italic;font-size:13pt;color:#6d6350;margin-top:6mm}
  .figures{display:flex;justify-content:center;gap:12mm;margin-top:18mm}
  .figures span{display:flex;flex-direction:column;font-family:ui-monospace,Menlo,monospace;
                font-size:7.5pt;letter-spacing:.14em;text-transform:uppercase;color:#7a7060}
  .figures b{font-family:Georgia,serif;font-size:22pt;font-weight:400;color:#241d14;letter-spacing:0}

  .contents{page-break-after:always;padding-top:6mm}
  .contents h2{font-size:16pt;font-weight:400;margin-bottom:6mm;
               border-bottom:1px solid #ddd6c4;padding-bottom:2mm}
  .contents ul{list-style:none}
  .contents li{display:flex;justify-content:space-between;padding:2.2mm 0;
               border-bottom:1px dotted #e6dfd0;font-size:11pt}
  .contents li b{font-weight:400;color:#9a7420}

  .month{page-break-before:always}
  .monthname{font-size:26pt;font-weight:400;letter-spacing:-.01em;margin:0 0 6mm;
             padding-bottom:3mm;border-bottom:2px solid #241d14}

  .day{page-break-inside:avoid;margin-bottom:7mm}
  .day header{margin-bottom:2.5mm}
  .day .date{font-family:ui-monospace,Menlo,monospace;font-size:7.5pt;letter-spacing:.16em;
             text-transform:uppercase;color:#9a7420}
  .day h3{font-size:14pt;font-weight:400;margin-top:1mm}

  .entry{display:flex;gap:4mm;padding:2mm 0;page-break-inside:avoid}
  .entry .time{font-family:ui-monospace,Menlo,monospace;font-size:8pt;color:#8a8073;
               flex:0 0 13mm;padding-top:1mm}
  .entry h4{font-size:11.5pt;font-weight:400;margin-bottom:.8mm}
  .entry p{color:#4a4234}
  .entry img{width:100%;max-height:75mm;object-fit:cover;border-radius:2mm;margin-top:2.5mm}

  .colophon{page-break-before:always;padding-top:40mm;text-align:center;
            font-size:9pt;color:#7a7060;font-style:italic}
  @media screen{
    body{background:#e8e4d8;padding:20px}
    .cover,.contents,.month,.colophon{background:#fff;max-width:148mm;margin:0 auto 20px;
      padding:16mm 14mm;box-shadow:0 6px 24px -10px rgba(0,0,0,.4);border-radius:2px}
    .cover{height:auto;min-height:180mm}
  }
</style></head><body>
${cover}
${book.moments ? contents + body : `<section class="month"><p>${esc(L.empty)}</p></section>`}
<section class="colophon">${esc(L.colophon)}</section>
<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),350));<\/script>
</body></html>`;
}

/**
 * Build the book and hand it to the browser to print or save as PDF.
 * Opens a new window; if that is blocked, falls back to downloading the file.
 */
export function open(html, filename = 'curio-year.html') {
  const w = typeof window !== 'undefined' ? window.open('', '_blank') : null;
  if (w && w.document) {
    w.document.write(html);
    w.document.close();
    return 'printed';
  }
  const blob = new Blob([html], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  return 'downloaded';
}

/** Which years actually have anything in them. */
export function yearsWithContent(moments = []) {
  const years = new Set();
  for (const m of moments) {
    if (m.kept === false) continue;
    const y = String(m.day || '').slice(0, 4);
    if (y) years.add(Number(y));
  }
  return [...years].sort((a, b) => b - a);
}
