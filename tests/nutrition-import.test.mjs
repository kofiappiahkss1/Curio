import test from 'node:test';
import assert from 'node:assert/strict';
import * as n from '../nutrition.js';
import * as I from '../import.js';

/* ================= NUTRITION ================= */
test('the food table is substantial and well formed', () => {
  assert.ok(n.FOODS.length >= 120, `only ${n.FOODS.length} foods`);
  for (const f of n.FOODS) {
    assert.ok(f.name.length > 2, `bad name: ${f.name}`);
    assert.ok(f.kcal >= 0 && f.kcal < 950, `${f.name}: implausible energy ${f.kcal}`);
    for (const k of ['protein', 'carbs', 'fat', 'fibre']) {
      assert.ok(f[k] >= 0 && f[k] <= 100, `${f.name}: ${k} out of range`);
    }
    // Energy must roughly agree with the macros — except for alcohol, which
    // carries 7 kcal per gram and is not a macronutrient, so beer and wine
    // legitimately hold more energy than their carbohydrate figure explains.
    const fromMacros = f.protein * 4 + f.carbs * 4 + f.fat * 9;
    if (f.kcal > 20 && !f.tags.includes('alcohol')) {
      const ratio = fromMacros / f.kcal;
      assert.ok(ratio > 0.55 && ratio < 1.5,
        `${f.name}: ${f.kcal} kcal does not match its macros (${Math.round(fromMacros)})`);
    }
    assert.ok(f.tags.length, `${f.name} has no tags`);
  }
});

test('the table is not just Western food', () => {
  const names = n.FOODS.map((f) => f.name.toLowerCase()).join(' ');
  for (const dish of ['jollof', 'banku', 'kenkey', 'waakye', 'fufu', 'ugali', 'injera', 'pilau']) {
    assert.ok(names.includes(dish), `${dish} is missing`);
  }
});

test('searching finds foods by name, word and tag', () => {
  assert.equal(n.findFoods('jollof')[0].name, 'Jollof rice');
  assert.ok(n.findFoods('rice').length >= 3);
  assert.ok(n.findFoods('banku').length >= 1);
  assert.equal(n.findFoods('a').length, 0, 'a single letter should not match everything');
  assert.equal(n.findFoods('').length, 0);
});

test('portions convert honestly', () => {
  const rice = n.findFoods('white rice')[0];
  const small = n.forServing(rice, 100);
  assert.equal(small.kcal, rice.kcal, '100g is exactly the per-100g figure');
  const double = n.forServing(rice, 200);
  assert.equal(double.kcal, rice.kcal * 2);
  assert.equal(n.forServing(rice, 0).kcal, 0);
  assert.equal(n.forServing(rice, -50).grams, 0, 'negatives are refused');
});

test('portion defaults suit the kind of food', () => {
  const drink = n.findFoods('water')[0];
  const nuts = n.findFoods('cashews')[0];
  const soup = n.findFoods('light soup')[0];
  assert.ok(n.defaultGrams(drink) > 200, 'a drink is a glass, not a spoonful');
  assert.ok(n.defaultGrams(nuts) < 60, 'nuts are a handful');
  assert.ok(n.defaultGrams(soup) > 200, 'soup is a bowl');
  assert.ok(n.defaultGrams(drink, 'large') > n.defaultGrams(drink, 'small'));
});

test('a meal of several foods totals correctly', () => {
  const a = n.forServing(n.findFoods('jollof')[0], 200);
  const b = n.forServing(n.findFoods('fried chicken')[0], 100);
  const t = n.total([a, b]);
  assert.equal(t.kcal, a.kcal + b.kcal);
  assert.equal(t.grams, 300);
  assert.equal(n.total([]).kcal, 0);
});

test('the macro split adds to roughly a hundred', () => {
  const t = n.total([n.forServing(n.findFoods('jollof')[0], 250)]);
  const split = n.macroSplit(t);
  const sum = split.protein + split.carbs + split.fat;
  assert.ok(sum >= 97 && sum <= 103, `split came to ${sum}`);
  assert.deepEqual(n.macroSplit({ protein: 0, carbs: 0, fat: 0 }), { protein: 0, carbs: 0, fat: 0 });
});

test('a day of meals is totalled from the archive', () => {
  const moments = [
    { day: '2026-07-23', kept: true, nutrition: { total: { kcal: 600, protein: 30, carbs: 60, fat: 20, fibre: 5, grams: 300 } } },
    { day: '2026-07-23', kept: true, nutrition: { total: { kcal: 400, protein: 20, carbs: 40, fat: 15, fibre: 3, grams: 200 } } },
    { day: '2026-07-22', kept: true, nutrition: { total: { kcal: 900, protein: 1, carbs: 1, fat: 1, fibre: 1, grams: 1 } } },
    { day: '2026-07-23', kept: false, nutrition: { total: { kcal: 999, protein: 1, carbs: 1, fat: 1, fibre: 1, grams: 1 } } },
  ];
  const t = n.dayTotals(moments, '2026-07-23');
  assert.equal(t.kcal, 1000, 'other days and forgotten meals are excluded');
  assert.equal(t.meals, 2);
});

test('the energy estimate is plausible or absent', () => {
  const e = n.estimateDailyEnergy({ age: 30, sex: 'male', heightCm: 175, weightKg: 70 });
  assert.ok(e > 1800 && e < 3200, `got ${e}`);
  assert.equal(n.estimateDailyEnergy({}), null, 'missing details give nothing rather than a guess');
});

/* ================= IMPORT ================= */
const DAYONE = {
  metadata: { version: '1.0' },
  entries: [
    { uuid: 'A1', creationDate: '2021-03-15T09:12:00Z', starred: true, tags: ['travel'],
      text: '# Lisbon\n\nCoffee at a place with green tiles.',
      location: { placeName: 'Café da Ribeira', localityName: 'Lisbon' } },
    { uuid: 'A2', creationDate: '2022-11-02T19:40:00Z', text: 'The contract finally signed.' },
    { uuid: 'A3', creationDate: 'not a date', text: 'Should be skipped.' },
  ],
};

test('a Day One export is recognised and read', () => {
  assert.equal(I.detectFormat(DAYONE), 'dayone');
  const m = I.parseDayOne(DAYONE);
  assert.equal(m.length, 2, 'an unreadable date is skipped rather than crashing');
  assert.equal(m[0].day, '2021-03-15');
  assert.equal(m[0].label, 'Café da Ribeira');
  assert.equal(m[0].kind, 'place');
  assert.deepEqual(m[0].tags, ['travel']);
  assert.equal(m[0].imported, 'Day One');
});

test('Day One photo placeholders are stripped from the text', () => {
  const m = I.parseDayOne({ entries: [{ uuid: 'P', creationDate: '2024-06-01T08:00:00Z',
    text: '![](dayone-moment://ABC123)\n\nThe harbour at dawn.' }] });
  assert.ok(!m[0].placard.includes('dayone-moment'));
  assert.match(m[0].placard, /harbour at dawn/);
});

test('other formats are recognised, and rubbish is not', () => {
  assert.equal(I.detectFormat({ product: 'Curio', moments: [] }), 'curio');
  assert.equal(I.detectFormat([{ date_journal: 1600000000000, text: 'a longer entry here' }]), 'journey');
  assert.equal(I.detectFormat({ nope: 1 }), null);
  assert.equal(I.detectFormat(null), null);
  assert.equal(I.detectFormat('a string'), null);
});

test('CSV with quotes and commas inside fields survives', () => {
  const csv = 'date,title,text\n2023-04-01,"A good day","We walked, then ate."\n2023-04-02,,"Rain, all day"';
  const rows = I.parseCsv(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].title, 'A good day');
  assert.match(rows[0].placard, /We walked, then ate/);
  assert.match(rows[1].placard, /Rain, all day/);
});

test('the CSV splitter handles escaped quotes and newlines', () => {
  const rows = I.splitCsv('a,b\n"he said ""hi""","line1\nline2"');
  assert.equal(rows.length, 2);
  assert.equal(rows[1][0], 'he said "hi"');
  assert.match(rows[1][1], /line1\nline2/);
});

test('a generic export is read as kindly as possible', () => {
  const m = I.parseGenericJson([
    { created: '2023-01-01T10:00:00Z', body: 'An entry from somewhere else.' },
    { timestamp: '2023-01-02T10:00:00Z', title: 'Titled', content: 'With content.' },
    { nothing: 'useful' },
  ]);
  assert.equal(m.length, 2, 'entries with no date are skipped');
  assert.equal(m[1].title, 'Titled');
});

test('an imported entry becomes a moment that says where it came from', () => {
  const m = I.toMoment(I.parseDayOne(DAYONE)[0], 0);
  assert.equal(m.imported, 'Day One');
  assert.match(m.provenance, /Day One/);
  assert.match(m.accession, /^2021\./);
  assert.equal(m.kept, true);
  assert.ok(m.title && m.placard && m.day && m.at);
});

test('reading a rubbish file fails with a clear reason', async () => {
  await assert.rejects(
    () => I.readExport({ name: 'x.json', text: async () => 'not json at all' }),
    (e) => e.message === 'UNREADABLE');
  await assert.rejects(
    () => I.readExport({ name: 'x.json', text: async () => '{"unrelated":true}' }),
    (e) => e.message === 'UNKNOWN_FORMAT');
});

test('a real compressed zip is read, photo and all', async () => {
  // build a Day One-shaped zip in memory using the same tools a browser has
  const { execSync } = await import('node:child_process');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dz-'));
  fs.mkdirSync(path.join(dir, 'photos'));
  fs.writeFileSync(path.join(dir, 'journal.json'), JSON.stringify({
    entries: [{ uuid: 'Z1', creationDate: '2020-05-04T10:00:00Z',
      text: 'From a real zip.', location: { placeName: 'Kiel harbour' } }],
  }));
  fs.writeFileSync(path.join(dir, 'photos', 'deadbeef.jpeg'), Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0, 1, 2, 3]));
  const zipPath = path.join(dir, 'export.zip');
  execSync(`cd ${dir} && zip -qr ${zipPath} journal.json photos`);

  const buf = fs.readFileSync(zipPath);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const files = await I.readZip(ab);
  assert.ok(files.has('journal.json'), 'the journal must be found inside the zip');
  assert.ok([...files.keys()].some((k) => k.includes('deadbeef')), 'photos must be found too');

  globalThis.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
  const res = await I.readExport({ name: 'export.zip', arrayBuffer: async () => ab, text: async () => '' });
  assert.equal(res.format, 'dayone');
  assert.equal(res.moments.length, 1);
  assert.equal(res.moments[0].label, 'Kiel harbour');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a file that is not a zip at all is refused clearly', async () => {
  const notZip = new Uint8Array([1, 2, 3, 4, 5]).buffer;
  await assert.rejects(() => I.readZip(notZip), (e) => e.message === 'NOT_A_ZIP');
});
