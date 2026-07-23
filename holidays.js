/**
 * Curio — holidays.
 *
 * Works with the radio off, like everything else. Rather than shipping a list
 * of dates that goes stale every January, this computes them: fixed dates,
 * "fourth Thursday of November", everything hung off Easter, and the Islamic
 * calendar via the browser's own Intl support.
 *
 * Rule shapes:
 *   { t:'fixed',   m, d }            25 December
 *   { t:'nth',     m, wd, n }        4th Thursday of November   (wd: 0=Sun)
 *   { t:'last',    m, wd }           last Monday of May
 *   { t:'easter',  o }               offset in days from Easter Sunday
 *   { t:'islamic', hm, hd }          Hijri month/day, converted for this year
 *   { t:'nearest', m, d, wd }        moved to the nearest given weekday
 */

/* ------------------------------------------------------------------ *
 * the computations
 * ------------------------------------------------------------------ */

/** Easter Sunday (Gregorian), by the Meeus/Jones/Butcher algorithm. */
export function easter(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/** The nth given weekday of a month. n = 1..5 */
export function nthWeekday(year, month, weekday, n) {
  const first = new Date(year, month - 1, 1);
  const shift = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month - 1, 1 + shift + (n - 1) * 7);
}

/** The last given weekday of a month. */
export function lastWeekday(year, month, weekday) {
  const last = new Date(year, month, 0);
  const shift = (last.getDay() - weekday + 7) % 7;
  return new Date(year, month - 1, last.getDate() - shift);
}

/** A fixed date nudged to the nearest given weekday (some observances do this). */
function nearestWeekday(year, month, day, weekday) {
  const d = new Date(year, month - 1, day);
  const diff = (weekday - d.getDay() + 7) % 7;
  const back = (d.getDay() - weekday + 7) % 7;
  d.setDate(d.getDate() + (diff <= back ? diff : -back));
  return d;
}

/**
 * Convert a Hijri month/day into this Gregorian year, using the browser's own
 * Islamic calendar. Approximate by nature — observed dates vary by country and
 * by sighting — so anything derived from it is marked `approx`.
 */
export function islamicDate(gregorianYear, hMonth, hDay) {
  try {
    const fmt = new Intl.DateTimeFormat('en-u-ca-islamic', {
      year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC',
    });
    // walk the year looking for the matching Hijri date
    for (let doy = 0; doy < 366; doy++) {
      const g = new Date(Date.UTC(gregorianYear, 0, 1 + doy));
      const parts = fmt.formatToParts(g);
      const m = Number(parts.find((p) => p.type === 'month')?.value);
      const d = Number(parts.find((p) => p.type === 'day')?.value);
      if (m === hMonth && d === hDay) return new Date(gregorianYear, g.getUTCMonth(), g.getUTCDate());
    }
  } catch { /* no Islamic calendar support in this browser */ }
  return null;
}

/** Turn one rule into a date in a given year, or null if it can't be placed. */
export function resolve(rule, year) {
  switch (rule.t) {
    case 'fixed':   return new Date(year, rule.m - 1, rule.d);
    case 'nth':     return nthWeekday(year, rule.m, rule.wd, rule.n);
    case 'last':    return lastWeekday(year, rule.m, rule.wd);
    case 'nearest': return nearestWeekday(year, rule.m, rule.d, rule.wd);
    case 'easter': {
      const e = easter(year);
      return new Date(e.getFullYear(), e.getMonth(), e.getDate() + (rule.o || 0));
    }
    case 'islamic': return islamicDate(year, rule.hm, rule.hd);
    default:        return null;
  }
}

/* ------------------------------------------------------------------ *
 * country data
 * ------------------------------------------------------------------ *
 * Public holidays only — the days a country actually stops. Not exhaustive
 * for every region, and where a date is observed rather than fixed it is
 * marked approximate. Curio would rather be honest than look precise.
 */
const NY   = { t: 'fixed', m: 1, d: 1, name: 'New Year’s Day' };
const XMAS = { t: 'fixed', m: 12, d: 25, name: 'Christmas Day' };
const BOX  = { t: 'fixed', m: 12, d: 26, name: 'Boxing Day' };
const GOOD = { t: 'easter', o: -2, name: 'Good Friday' };
const EMON = { t: 'easter', o: 1, name: 'Easter Monday' };
const MAY  = { t: 'fixed', m: 5, d: 1, name: 'Workers’ Day' };
const EIDF = { t: 'islamic', hm: 10, hd: 1, name: 'Eid al-Fitr', approx: true };
const EIDA = { t: 'islamic', hm: 12, hd: 10, name: 'Eid al-Adha', approx: true };

export const COUNTRIES = {
  GH: { name: 'Ghana', holidays: [NY,
    { t: 'fixed', m: 1, d: 7, name: 'Constitution Day' },
    { t: 'fixed', m: 3, d: 6, name: 'Independence Day' },
    GOOD, EMON, MAY,
    { t: 'fixed', m: 8, d: 4, name: 'Founders’ Day' },
    { t: 'fixed', m: 9, d: 21, name: 'Kwame Nkrumah Memorial Day' },
    { t: 'first-friday-december', t2: 'nth', m: 12, wd: 5, n: 1, name: 'Farmers’ Day' },
    XMAS, BOX, EIDF, EIDA] },

  NG: { name: 'Nigeria', holidays: [NY, GOOD, EMON, MAY,
    { t: 'fixed', m: 6, d: 12, name: 'Democracy Day' },
    { t: 'fixed', m: 10, d: 1, name: 'Independence Day' },
    XMAS, BOX, EIDF, EIDA] },

  KE: { name: 'Kenya', holidays: [NY, GOOD, EMON, MAY,
    { t: 'fixed', m: 6, d: 1, name: 'Madaraka Day' },
    { t: 'fixed', m: 10, d: 10, name: 'Huduma Day' },
    { t: 'fixed', m: 10, d: 20, name: 'Mashujaa Day' },
    { t: 'fixed', m: 12, d: 12, name: 'Jamhuri Day' },
    XMAS, BOX, EIDF] },

  ZA: { name: 'South Africa', holidays: [NY,
    { t: 'fixed', m: 3, d: 21, name: 'Human Rights Day' },
    GOOD, { t: 'easter', o: 1, name: 'Family Day' },
    { t: 'fixed', m: 4, d: 27, name: 'Freedom Day' },
    MAY, { t: 'fixed', m: 6, d: 16, name: 'Youth Day' },
    { t: 'fixed', m: 8, d: 9, name: 'National Women’s Day' },
    { t: 'fixed', m: 9, d: 24, name: 'Heritage Day' },
    { t: 'fixed', m: 12, d: 16, name: 'Day of Reconciliation' },
    XMAS, { t: 'fixed', m: 12, d: 26, name: 'Day of Goodwill' }] },

  TZ: { name: 'Tanzania', holidays: [NY,
    { t: 'fixed', m: 4, d: 26, name: 'Union Day' }, MAY,
    { t: 'fixed', m: 12, d: 9, name: 'Independence Day' },
    GOOD, EMON, XMAS, BOX, EIDF, EIDA] },

  UG: { name: 'Uganda', holidays: [NY,
    { t: 'fixed', m: 1, d: 26, name: 'Liberation Day' },
    { t: 'fixed', m: 3, d: 8, name: 'Women’s Day' },
    GOOD, EMON, MAY,
    { t: 'fixed', m: 6, d: 3, name: 'Martyrs’ Day' },
    { t: 'fixed', m: 10, d: 9, name: 'Independence Day' },
    XMAS, BOX, EIDF, EIDA] },

  EG: { name: 'Egypt', holidays: [
    { t: 'fixed', m: 1, d: 7, name: 'Coptic Christmas' },
    { t: 'fixed', m: 1, d: 25, name: 'Revolution Day' },
    { t: 'fixed', m: 4, d: 25, name: 'Sinai Liberation Day' },
    MAY, { t: 'fixed', m: 7, d: 23, name: 'Revolution Day' },
    { t: 'fixed', m: 10, d: 6, name: 'Armed Forces Day' },
    EIDF, EIDA] },

  US: { name: 'United States', holidays: [NY,
    { t: 'nth', m: 1, wd: 1, n: 3, name: 'Martin Luther King Jr. Day' },
    { t: 'nth', m: 2, wd: 1, n: 3, name: 'Presidents’ Day' },
    { t: 'last', m: 5, wd: 1, name: 'Memorial Day' },
    { t: 'fixed', m: 6, d: 19, name: 'Juneteenth' },
    { t: 'fixed', m: 7, d: 4, name: 'Independence Day' },
    { t: 'nth', m: 9, wd: 1, n: 1, name: 'Labor Day' },
    { t: 'nth', m: 11, wd: 4, n: 4, name: 'Thanksgiving' },
    { t: 'fixed', m: 11, d: 11, name: 'Veterans Day' },
    XMAS] },

  CA: { name: 'Canada', holidays: [NY, GOOD,
    { t: 'nth', m: 5, wd: 1, n: 3, name: 'Victoria Day' },
    { t: 'fixed', m: 7, d: 1, name: 'Canada Day' },
    { t: 'nth', m: 9, wd: 1, n: 1, name: 'Labour Day' },
    { t: 'nth', m: 10, wd: 1, n: 2, name: 'Thanksgiving' },
    { t: 'fixed', m: 11, d: 11, name: 'Remembrance Day' },
    XMAS, BOX] },

  GB: { name: 'United Kingdom', holidays: [NY, GOOD, EMON,
    { t: 'nth', m: 5, wd: 1, n: 1, name: 'Early May Bank Holiday' },
    { t: 'last', m: 5, wd: 1, name: 'Spring Bank Holiday' },
    { t: 'last', m: 8, wd: 1, name: 'Summer Bank Holiday' },
    XMAS, BOX] },

  IE: { name: 'Ireland', holidays: [NY,
    { t: 'fixed', m: 3, d: 17, name: 'Saint Patrick’s Day' }, EMON,
    { t: 'nth', m: 5, wd: 1, n: 1, name: 'May Bank Holiday' },
    { t: 'nth', m: 6, wd: 1, n: 1, name: 'June Bank Holiday' },
    { t: 'nth', m: 8, wd: 1, n: 1, name: 'August Bank Holiday' },
    { t: 'last', m: 10, wd: 1, name: 'October Bank Holiday' },
    XMAS, { t: 'fixed', m: 12, d: 26, name: 'Saint Stephen’s Day' }] },

  DE: { name: 'Germany', holidays: [NY, GOOD, EMON, MAY,
    { t: 'easter', o: 39, name: 'Ascension Day' },
    { t: 'easter', o: 50, name: 'Whit Monday' },
    { t: 'fixed', m: 10, d: 3, name: 'German Unity Day' },
    XMAS, { t: 'fixed', m: 12, d: 26, name: 'Second Day of Christmas' }] },

  FR: { name: 'France', holidays: [NY, EMON, MAY,
    { t: 'fixed', m: 5, d: 8, name: 'Victory in Europe Day' },
    { t: 'easter', o: 39, name: 'Ascension Day' },
    { t: 'fixed', m: 7, d: 14, name: 'Bastille Day' },
    { t: 'fixed', m: 8, d: 15, name: 'Assumption' },
    { t: 'fixed', m: 11, d: 1, name: 'All Saints’ Day' },
    { t: 'fixed', m: 11, d: 11, name: 'Armistice Day' },
    XMAS] },

  ES: { name: 'Spain', holidays: [NY,
    { t: 'fixed', m: 1, d: 6, name: 'Epiphany' }, GOOD, MAY,
    { t: 'fixed', m: 8, d: 15, name: 'Assumption' },
    { t: 'fixed', m: 10, d: 12, name: 'National Day' },
    { t: 'fixed', m: 11, d: 1, name: 'All Saints’ Day' },
    { t: 'fixed', m: 12, d: 6, name: 'Constitution Day' },
    XMAS] },

  IT: { name: 'Italy', holidays: [NY,
    { t: 'fixed', m: 1, d: 6, name: 'Epiphany' }, EMON,
    { t: 'fixed', m: 4, d: 25, name: 'Liberation Day' }, MAY,
    { t: 'fixed', m: 6, d: 2, name: 'Republic Day' },
    { t: 'fixed', m: 8, d: 15, name: 'Ferragosto' },
    { t: 'fixed', m: 11, d: 1, name: 'All Saints’ Day' },
    XMAS, { t: 'fixed', m: 12, d: 26, name: 'Saint Stephen’s Day' }] },

  NL: { name: 'Netherlands', holidays: [NY, GOOD, EMON,
    { t: 'fixed', m: 4, d: 27, name: 'King’s Day' },
    { t: 'fixed', m: 5, d: 5, name: 'Liberation Day' },
    { t: 'easter', o: 39, name: 'Ascension Day' },
    { t: 'easter', o: 50, name: 'Whit Monday' },
    XMAS, BOX] },

  PT: { name: 'Portugal', holidays: [NY, GOOD,
    { t: 'fixed', m: 4, d: 25, name: 'Freedom Day' }, MAY,
    { t: 'fixed', m: 6, d: 10, name: 'Portugal Day' },
    { t: 'fixed', m: 8, d: 15, name: 'Assumption' },
    { t: 'fixed', m: 10, d: 5, name: 'Republic Day' },
    { t: 'fixed', m: 12, d: 1, name: 'Restoration of Independence' },
    XMAS] },

  BR: { name: 'Brazil', holidays: [NY,
    { t: 'easter', o: -47, name: 'Carnival' },
    GOOD, { t: 'fixed', m: 4, d: 21, name: 'Tiradentes' }, MAY,
    { t: 'fixed', m: 9, d: 7, name: 'Independence Day' },
    { t: 'fixed', m: 10, d: 12, name: 'Our Lady of Aparecida' },
    { t: 'fixed', m: 11, d: 2, name: 'All Souls’ Day' },
    { t: 'fixed', m: 11, d: 15, name: 'Republic Day' },
    XMAS] },

  MX: { name: 'Mexico', holidays: [NY,
    { t: 'nth', m: 2, wd: 1, n: 1, name: 'Constitution Day' },
    { t: 'nth', m: 3, wd: 1, n: 3, name: 'Benito Juárez Day' }, MAY,
    { t: 'fixed', m: 9, d: 16, name: 'Independence Day' },
    { t: 'fixed', m: 11, d: 2, name: 'Day of the Dead' },
    { t: 'nth', m: 11, wd: 1, n: 3, name: 'Revolution Day' },
    XMAS] },

  IN: { name: 'India', holidays: [
    { t: 'fixed', m: 1, d: 26, name: 'Republic Day' },
    { t: 'fixed', m: 8, d: 15, name: 'Independence Day' },
    { t: 'fixed', m: 10, d: 2, name: 'Gandhi Jayanti' },
    XMAS, EIDF, EIDA] },

  PK: { name: 'Pakistan', holidays: [
    { t: 'fixed', m: 2, d: 5, name: 'Kashmir Day' },
    { t: 'fixed', m: 3, d: 23, name: 'Pakistan Day' }, MAY,
    { t: 'fixed', m: 8, d: 14, name: 'Independence Day' },
    { t: 'fixed', m: 12, d: 25, name: 'Quaid-e-Azam Day' },
    EIDF, EIDA] },

  AE: { name: 'United Arab Emirates', holidays: [NY,
    { t: 'fixed', m: 12, d: 1, name: 'Commemoration Day' },
    { t: 'fixed', m: 12, d: 2, name: 'National Day' },
    EIDF, EIDA, { t: 'islamic', hm: 1, hd: 1, name: 'Islamic New Year', approx: true }] },

  SA: { name: 'Saudi Arabia', holidays: [
    { t: 'fixed', m: 2, d: 22, name: 'Founding Day' },
    { t: 'fixed', m: 9, d: 23, name: 'National Day' },
    EIDF, EIDA] },

  TR: { name: 'Türkiye', holidays: [NY,
    { t: 'fixed', m: 4, d: 23, name: 'National Sovereignty Day' },
    { t: 'fixed', m: 5, d: 19, name: 'Commemoration of Atatürk' },
    { t: 'fixed', m: 7, d: 15, name: 'Democracy Day' },
    { t: 'fixed', m: 8, d: 30, name: 'Victory Day' },
    { t: 'fixed', m: 10, d: 29, name: 'Republic Day' },
    EIDF, EIDA] },

  CN: { name: 'China', holidays: [NY,
    { t: 'fixed', m: 4, d: 4, name: 'Qingming Festival', approx: true },
    MAY, { t: 'fixed', m: 10, d: 1, name: 'National Day' }] },

  JP: { name: 'Japan', holidays: [NY,
    { t: 'nth', m: 1, wd: 1, n: 2, name: 'Coming of Age Day' },
    { t: 'fixed', m: 2, d: 11, name: 'National Foundation Day' },
    { t: 'fixed', m: 4, d: 29, name: 'Shōwa Day' },
    { t: 'fixed', m: 5, d: 3, name: 'Constitution Day' },
    { t: 'fixed', m: 5, d: 5, name: 'Children’s Day' },
    { t: 'nth', m: 7, wd: 1, n: 3, name: 'Marine Day' },
    { t: 'nth', m: 9, wd: 1, n: 3, name: 'Respect for the Aged Day' },
    { t: 'nth', m: 10, wd: 1, n: 2, name: 'Sports Day' },
    { t: 'fixed', m: 11, d: 3, name: 'Culture Day' },
    { t: 'fixed', m: 11, d: 23, name: 'Labour Thanksgiving Day' }] },

  KR: { name: 'South Korea', holidays: [NY,
    { t: 'fixed', m: 3, d: 1, name: 'Independence Movement Day' },
    { t: 'fixed', m: 5, d: 5, name: 'Children’s Day' },
    { t: 'fixed', m: 6, d: 6, name: 'Memorial Day' },
    { t: 'fixed', m: 8, d: 15, name: 'Liberation Day' },
    { t: 'fixed', m: 10, d: 3, name: 'National Foundation Day' },
    { t: 'fixed', m: 10, d: 9, name: 'Hangul Day' },
    XMAS] },

  ID: { name: 'Indonesia', holidays: [NY,
    { t: 'fixed', m: 8, d: 17, name: 'Independence Day' },
    XMAS, EIDF, EIDA] },

  PH: { name: 'Philippines', holidays: [NY,
    { t: 'easter', o: -3, name: 'Maundy Thursday' }, GOOD,
    { t: 'fixed', m: 4, d: 9, name: 'Day of Valour' }, MAY,
    { t: 'fixed', m: 6, d: 12, name: 'Independence Day' },
    { t: 'last', m: 8, wd: 1, name: 'National Heroes Day' },
    { t: 'fixed', m: 11, d: 30, name: 'Bonifacio Day' },
    XMAS, { t: 'fixed', m: 12, d: 30, name: 'Rizal Day' }] },

  AU: { name: 'Australia', holidays: [NY,
    { t: 'fixed', m: 1, d: 26, name: 'Australia Day' }, GOOD, EMON,
    { t: 'fixed', m: 4, d: 25, name: 'Anzac Day' },
    XMAS, BOX] },

  NZ: { name: 'New Zealand', holidays: [NY,
    { t: 'fixed', m: 1, d: 2, name: 'Day after New Year’s Day' },
    { t: 'fixed', m: 2, d: 6, name: 'Waitangi Day' }, GOOD, EMON,
    { t: 'fixed', m: 4, d: 25, name: 'Anzac Day' },
    { t: 'nth', m: 6, wd: 1, n: 1, name: 'King’s Birthday' },
    { t: 'last', m: 10, wd: 1, name: 'Labour Day' },
    XMAS, BOX] },

  SE: { name: 'Sweden', holidays: [NY,
    { t: 'fixed', m: 1, d: 6, name: 'Epiphany' }, GOOD, EMON, MAY,
    { t: 'easter', o: 39, name: 'Ascension Day' },
    { t: 'fixed', m: 6, d: 6, name: 'National Day' },
    XMAS, { t: 'fixed', m: 12, d: 26, name: 'Second Day of Christmas' }] },

  PL: { name: 'Poland', holidays: [NY,
    { t: 'fixed', m: 1, d: 6, name: 'Epiphany' }, EMON, MAY,
    { t: 'fixed', m: 5, d: 3, name: 'Constitution Day' },
    { t: 'fixed', m: 8, d: 15, name: 'Assumption' },
    { t: 'fixed', m: 11, d: 1, name: 'All Saints’ Day' },
    { t: 'fixed', m: 11, d: 11, name: 'Independence Day' },
    XMAS, { t: 'fixed', m: 12, d: 26, name: 'Second Day of Christmas' }] },

  RU: { name: 'Russia', holidays: [NY,
    { t: 'fixed', m: 1, d: 7, name: 'Orthodox Christmas' },
    { t: 'fixed', m: 2, d: 23, name: 'Defender of the Fatherland Day' },
    { t: 'fixed', m: 3, d: 8, name: 'International Women’s Day' },
    { t: 'fixed', m: 5, d: 9, name: 'Victory Day' },
    { t: 'fixed', m: 6, d: 12, name: 'Russia Day' },
    { t: 'fixed', m: 11, d: 4, name: 'Unity Day' }] },
};

/* the odd one out: Ghana's Farmers' Day rule needed a normal shape */
COUNTRIES.GH.holidays = COUNTRIES.GH.holidays.map((h) =>
  h.t === 'first-friday-december' ? { t: 'nth', m: 12, wd: 5, n: 1, name: 'Farmers’ Day' } : h);

export const COUNTRY_CODES = Object.keys(COUNTRIES).sort();
export const countryName = (code) => COUNTRIES[code]?.name || code;

/* ------------------------------------------------------------------ *
 * lookups
 * ------------------------------------------------------------------ */

const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Every holiday for a country in a given year, in order. */
export function forYear(code, year) {
  const country = COUNTRIES[code];
  if (!country) return [];
  return country.holidays
    .map((rule) => {
      const date = resolve(rule, year);
      return date ? { name: rule.name, date, day: key(date), approx: !!rule.approx } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.date - b.date);
}

/** Anything landing on a particular day. */
export function forDate(code, date = new Date()) {
  return forYear(code, date.getFullYear()).filter((h) => h.day === key(date));
}

/** The next holiday coming up, with how many days until it. */
export function next(code, from = new Date(), withinDays = 400) {
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const pool = [...forYear(code, today.getFullYear()), ...forYear(code, today.getFullYear() + 1)];
  for (const h of pool) {
    const days = Math.round((h.date - today) / 86400000);
    if (days >= 0 && days <= withinDays) return { ...h, daysAway: days };
  }
  return null;
}

/** Everything in the next N days — for a small "coming up" list. */
export function upcoming(code, from = new Date(), days = 60) {
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const pool = [...forYear(code, today.getFullYear()), ...forYear(code, today.getFullYear() + 1)];
  return pool
    .map((h) => ({ ...h, daysAway: Math.round((h.date - today) / 86400000) }))
    .filter((h) => h.daysAway >= 0 && h.daysAway <= days);
}
