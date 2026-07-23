import test from 'node:test';
import assert from 'node:assert/strict';
import * as h from '../holidays.js';
import * as profile from '../profile.js';
import * as device from '../device.js';

const ds = (d) => d.toDateString();

/* ================= HOLIDAY MATHS ================= */
test('Easter is computed correctly across many years', () => {
  const known = {
    2024: 'Sun Mar 31 2024', 2025: 'Sun Apr 20 2025', 2026: 'Sun Apr 05 2026',
    2027: 'Sun Mar 28 2027', 2028: 'Sun Apr 16 2028', 2030: 'Sun Apr 21 2030',
  };
  for (const [y, want] of Object.entries(known)) {
    assert.equal(ds(h.easter(Number(y))), want, `Easter ${y}`);
  }
});

test('nth and last weekday rules land on the right day', () => {
  assert.equal(ds(h.nthWeekday(2026, 11, 4, 4)), 'Thu Nov 26 2026', 'US Thanksgiving 2026');
  assert.equal(ds(h.nthWeekday(2026, 1, 1, 3)), 'Mon Jan 19 2026', 'MLK Day 2026');
  assert.equal(ds(h.lastWeekday(2026, 5, 1)), 'Mon May 25 2026', 'UK Spring bank holiday 2026');
  assert.equal(ds(h.lastWeekday(2026, 8, 1)), 'Mon Aug 31 2026', 'UK Summer bank holiday 2026');
  // every nth-weekday result must actually be that weekday
  for (let m = 1; m <= 12; m++) {
    for (let wd = 0; wd <= 6; wd++) {
      assert.equal(h.nthWeekday(2026, m, wd, 1).getDay(), wd);
      assert.equal(h.lastWeekday(2026, m, wd).getDay(), wd);
    }
  }
});

test('Easter-relative holidays sit the right distance apart', () => {
  const y = 2026;
  const e = h.easter(y);
  const good = h.resolve({ t: 'easter', o: -2 }, y);
  const mon = h.resolve({ t: 'easter', o: 1 }, y);
  const asc = h.resolve({ t: 'easter', o: 39 }, y);
  assert.equal(good.getDay(), 5, 'Good Friday is a Friday');
  assert.equal(mon.getDay(), 1, 'Easter Monday is a Monday');
  assert.equal(asc.getDay(), 4, 'Ascension is a Thursday');
  assert.equal(Math.round((e - good) / 86400000), 2);
  assert.equal(Math.round((asc - e) / 86400000), 39);
});

/* ================= COUNTRY DATA ================= */
test('every country produces a sane set of holidays', () => {
  for (const code of h.COUNTRY_CODES) {
    const list = h.forYear(code, 2026);
    assert.ok(list.length >= 4, `${code} has too few holidays (${list.length})`);
    assert.ok(list.length <= 25, `${code} has implausibly many (${list.length})`);
    for (const x of list) {
      assert.ok(x.name && x.name.length > 2, `${code}: bad name`);
      assert.equal(x.date.getFullYear(), 2026, `${code}: ${x.name} landed in the wrong year`);
      assert.match(x.day, /^\d{4}-\d{2}-\d{2}$/);
    }
    // sorted by date
    for (let i = 1; i < list.length; i++) {
      assert.ok(list[i].date >= list[i - 1].date, `${code} is out of order`);
    }
  }
});

test('the countries a user is most likely to pick are present and correct', () => {
  assert.equal(h.countryName('GH'), 'Ghana');
  const gh = h.forYear('GH', 2026);
  assert.ok(gh.some((x) => x.name.includes('Independence')), 'Ghana Independence Day');
  assert.ok(gh.some((x) => x.name.includes('Farmers')), 'Farmers’ Day');
  const farmers = gh.find((x) => x.name.includes('Farmers'));
  assert.equal(farmers.date.getDay(), 5, 'Farmers’ Day is a Friday');
  assert.equal(farmers.date.getMonth(), 11, 'in December');

  assert.ok(h.forYear('US', 2026).some((x) => x.name === 'Thanksgiving'));
  assert.ok(h.forYear('NG', 2026).some((x) => x.name === 'Democracy Day'));
  assert.ok(h.forYear('ZA', 2026).some((x) => x.name === 'Freedom Day'));
});

test('a holiday on a given day is found, and absent days stay empty', () => {
  const xmas = h.forDate('GB', new Date(2026, 11, 25));
  assert.equal(xmas.length, 1);
  assert.equal(xmas[0].name, 'Christmas Day');
  assert.equal(h.forDate('GB', new Date(2026, 6, 23)).length, 0, 'an ordinary day is ordinary');
});

test('the next holiday is always ahead, never behind', () => {
  for (const code of ['GH', 'GB', 'US', 'JP']) {
    for (const from of ['2026-01-15', '2026-07-23', '2026-12-28']) {
      const n = h.next(code, new Date(from));
      assert.ok(n, `${code} from ${from}: nothing found`);
      assert.ok(n.daysAway >= 0, `${code} from ${from}: looked backwards`);
      assert.ok(n.daysAway <= 400);
    }
  }
});

test('unknown countries degrade quietly', () => {
  assert.deepEqual(h.forYear('ZZ', 2026), []);
  assert.equal(h.next('ZZ'), null);
  assert.equal(h.countryName('ZZ'), 'ZZ');
});

/* ================= PROFILE ================= */
test('country is detected from the time zone without asking permission', () => {
  assert.equal(profile.ZONE_COUNTRY['Africa/Accra'], 'GH');
  assert.equal(profile.ZONE_COUNTRY['Europe/London'], 'GB');
  assert.equal(profile.ZONE_COUNTRY['Asia/Tokyo'], 'JP');
  // language tag is the fallback
  const byLang = profile.detectCountry(['en-GH', 'en']);
  assert.equal(byLang.code, 'GH');
  const none = profile.detectCountry(['xx']);
  assert.ok(none.code === null || typeof none.code === 'string');
});

test('age and birthdays are computed correctly, including the awkward cases', () => {
  const on = new Date(2026, 6, 23);
  assert.equal(profile.ageOn('1990-03-15', on), 36);
  assert.equal(profile.ageOn('1990-12-15', on), 35, 'birthday not yet reached this year');
  assert.equal(profile.ageOn('2026-07-23', on), 0, 'born today');
  assert.equal(profile.ageOn('', on), null);
  assert.equal(profile.ageOn('not a date', on), null);

  const nb = profile.nextBirthday('1990-03-15', on);
  assert.equal(nb.date.getFullYear(), 2027);
  assert.equal(nb.turning, 37);
  assert.equal(nb.isToday, false);

  const today = profile.nextBirthday('1990-07-23', on);
  assert.equal(today.isToday, true);
  assert.equal(today.daysAway, 0);
  assert.equal(today.turning, 36);
});

test('someone born on 29 February still gets a birthday every year', () => {
  const leap = profile.nextBirthday('2000-02-29', new Date(2026, 6, 23));
  assert.ok(leap, 'a date was found');
  assert.equal(leap.date.getFullYear(), 2027);
  assert.equal(leap.date.getMonth(), 2, 'moved to March in a non-leap year');
  assert.equal(leap.date.getDate(), 1);

  const inLeapYear = profile.nextBirthday('2000-02-29', new Date(2027, 6, 23));
  assert.equal(inLeapYear.date.getMonth(), 1, 'February in a leap year');
  assert.equal(inLeapYear.date.getDate(), 29);
});

test('days alive counts what you would expect', () => {
  assert.equal(profile.daysAlive('2026-07-22', new Date(2026, 6, 23)), 1);
  assert.equal(profile.daysAlive('2025-07-23', new Date(2026, 6, 23)), 365);
  assert.equal(profile.daysAlive(null), null);
});

test('other people’s birthdays are surfaced today and soon', () => {
  const on = new Date(2026, 6, 23);
  const people = [
    { id: '1', name: 'Ama', dob: '1995-07-23' },
    { id: '2', name: 'Kofi', dob: '1992-07-30' },
    { id: '3', name: 'Yaa', dob: '1988-01-05' },
  ];
  const today = profile.birthdaysToday(people, on);
  assert.equal(today.length, 1);
  assert.equal(today[0].name, 'Ama');
  assert.equal(today[0].turning, 31);

  const soon = profile.birthdaysUpcoming(people, on, 14);
  assert.equal(soon.length, 1);
  assert.equal(soon[0].name, 'Kofi');
  assert.equal(soon[0].daysAway, 7);
});

test('the greeting follows the clock', () => {
  const at = (h) => new Date(2026, 6, 23, h);
  assert.equal(profile.greetingKey(at(2)), 'night');
  assert.equal(profile.greetingKey(at(8)), 'morning');
  assert.equal(profile.greetingKey(at(14)), 'afternoon');
  assert.equal(profile.greetingKey(at(20)), 'evening');
});

/* ================= DEVICE ================= */
test('device detection degrades safely with no browser at all', () => {
  const d = device.detect();
  assert.ok([device.PHONE, device.TABLET, device.DESKTOP].includes(d.kind));
  assert.ok(['mouse', 'touch'].includes(d.pointer));
  assert.equal(typeof d.twoColumn, 'boolean');
  assert.equal(device.apply(null), null, 'no document means no crash');
  assert.equal(typeof device.watch(() => {}), 'function');
});
