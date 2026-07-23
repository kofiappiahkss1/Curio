/**
 * Curio — who you are.
 *
 * A name, a birthday, and where you live. All of it stays on the device like
 * everything else, and all of it is optional: Curio works perfectly for someone
 * who tells it nothing.
 *
 * Country is detected without asking for location permission and without a
 * network call, by reading the phone's own time zone. That is enough to know
 * which country's holidays to show, and it reveals nothing to anyone.
 */

/* ------------------------------------------------------------------ *
 * where in the world
 * ------------------------------------------------------------------ */

/**
 * IANA time zone → country. Covers the zones people actually live in; anything
 * unlisted falls back to the language tag, and then to asking.
 */
export const ZONE_COUNTRY = {
  'Africa/Accra': 'GH', 'Africa/Lagos': 'NG', 'Africa/Abidjan': 'CI', 'Africa/Nairobi': 'KE',
  'Africa/Dar_es_Salaam': 'TZ', 'Africa/Kampala': 'UG', 'Africa/Kigali': 'RW',
  'Africa/Johannesburg': 'ZA', 'Africa/Cairo': 'EG', 'Africa/Casablanca': 'MA',
  'Africa/Algiers': 'DZ', 'Africa/Tunis': 'TN', 'Africa/Addis_Ababa': 'ET',
  'Africa/Khartoum': 'SD', 'Africa/Dakar': 'SN', 'Africa/Bamako': 'ML',
  'Africa/Ouagadougou': 'BF', 'Africa/Lome': 'TG', 'Africa/Cotonou': 'BJ',
  'Africa/Douala': 'CM', 'Africa/Kinshasa': 'CD', 'Africa/Luanda': 'AO',
  'Africa/Harare': 'ZW', 'Africa/Lusaka': 'ZM', 'Africa/Maputo': 'MZ',
  'Africa/Windhoek': 'NA', 'Africa/Gaborone': 'BW', 'Africa/Freetown': 'SL',
  'Africa/Monrovia': 'LR', 'Africa/Banjul': 'GM', 'Africa/Conakry': 'GN',

  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US',
  'America/Los_Angeles': 'US', 'America/Phoenix': 'US', 'America/Anchorage': 'US',
  'Pacific/Honolulu': 'US', 'America/Detroit': 'US',
  'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA',
  'America/Winnipeg': 'CA', 'America/Halifax': 'CA',
  'America/Mexico_City': 'MX', 'America/Monterrey': 'MX', 'America/Tijuana': 'MX',
  'America/Sao_Paulo': 'BR', 'America/Bahia': 'BR', 'America/Fortaleza': 'BR',
  'America/Manaus': 'BR', 'America/Recife': 'BR',
  'America/Buenos_Aires': 'AR', 'America/Argentina/Buenos_Aires': 'AR',
  'America/Santiago': 'CL', 'America/Bogota': 'CO', 'America/Lima': 'PE',
  'America/Caracas': 'VE', 'America/Havana': 'CU', 'America/Jamaica': 'JM',
  'America/Port_of_Spain': 'TT', 'America/Panama': 'PA', 'America/Guatemala': 'GT',

  'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Europe/Lisbon': 'PT',
  'Europe/Madrid': 'ES', 'Europe/Paris': 'FR', 'Europe/Brussels': 'BE',
  'Europe/Amsterdam': 'NL', 'Europe/Berlin': 'DE', 'Europe/Zurich': 'CH',
  'Europe/Vienna': 'AT', 'Europe/Rome': 'IT', 'Europe/Athens': 'GR',
  'Europe/Stockholm': 'SE', 'Europe/Oslo': 'NO', 'Europe/Copenhagen': 'DK',
  'Europe/Helsinki': 'FI', 'Europe/Warsaw': 'PL', 'Europe/Prague': 'CZ',
  'Europe/Budapest': 'HU', 'Europe/Bucharest': 'RO', 'Europe/Sofia': 'BG',
  'Europe/Kyiv': 'UA', 'Europe/Kiev': 'UA', 'Europe/Moscow': 'RU',
  'Europe/Istanbul': 'TR', 'Europe/Lviv': 'UA',

  'Asia/Dubai': 'AE', 'Asia/Riyadh': 'SA', 'Asia/Qatar': 'QA', 'Asia/Kuwait': 'KW',
  'Asia/Tehran': 'IR', 'Asia/Baghdad': 'IQ', 'Asia/Jerusalem': 'IL', 'Asia/Amman': 'JO',
  'Asia/Beirut': 'LB', 'Asia/Damascus': 'SY', 'Asia/Karachi': 'PK',
  'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Colombo': 'LK',
  'Asia/Dhaka': 'BD', 'Asia/Kathmandu': 'NP', 'Asia/Yangon': 'MM',
  'Asia/Bangkok': 'TH', 'Asia/Ho_Chi_Minh': 'VN', 'Asia/Saigon': 'VN',
  'Asia/Jakarta': 'ID', 'Asia/Makassar': 'ID', 'Asia/Kuala_Lumpur': 'MY',
  'Asia/Singapore': 'SG', 'Asia/Manila': 'PH', 'Asia/Hong_Kong': 'HK',
  'Asia/Shanghai': 'CN', 'Asia/Chongqing': 'CN', 'Asia/Taipei': 'TW',
  'Asia/Seoul': 'KR', 'Asia/Tokyo': 'JP', 'Asia/Almaty': 'KZ', 'Asia/Tashkent': 'UZ',

  'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU',
  'Australia/Perth': 'AU', 'Australia/Adelaide': 'AU', 'Australia/Darwin': 'AU',
  'Pacific/Auckland': 'NZ', 'Pacific/Fiji': 'FJ', 'Pacific/Port_Moresby': 'PG',
};

/** The device's own time zone, if it will say. */
export function timeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; }
  catch { return null; }
}

/**
 * Work out the country without asking permission and without a network call.
 * Time zone first (most reliable), then the language tag, then nothing.
 */
export function detectCountry(langs) {
  const zone = timeZone();
  if (zone && ZONE_COUNTRY[zone]) return { code: ZONE_COUNTRY[zone], how: 'timezone', zone };

  const list = langs || (typeof navigator !== 'undefined' ? navigator.languages : []) || [];
  for (const tag of list) {
    const m = String(tag).match(/^[a-z]{2,3}[-_]([A-Za-z]{2})$/);
    if (m) return { code: m[1].toUpperCase(), how: 'language', zone };
  }

  // a zone we don't have listed still tells us the region
  if (zone) return { code: null, how: 'unknown', zone };
  return { code: null, how: 'none', zone: null };
}

/* ------------------------------------------------------------------ *
 * dates of birth
 * ------------------------------------------------------------------ */

/** Age in whole years on a given day. */
export function ageOn(dob, on = new Date()) {
  if (!dob) return null;
  const b = new Date(dob);
  if (Number.isNaN(b.getTime())) return null;
  let age = on.getFullYear() - b.getFullYear();
  const before = on.getMonth() < b.getMonth() ||
    (on.getMonth() === b.getMonth() && on.getDate() < b.getDate());
  if (before) age--;
  return age < 0 ? null : age;
}

/** When the next birthday falls, and how far off it is. */
export function nextBirthday(dob, from = new Date()) {
  if (!dob) return null;
  const b = new Date(dob);
  if (Number.isNaN(b.getTime())) return null;
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());

  let next = new Date(today.getFullYear(), b.getMonth(), b.getDate());
  // someone born on 29 February gets 1 March in ordinary years
  if (b.getMonth() === 1 && b.getDate() === 29 && next.getMonth() !== 1) {
    next = new Date(today.getFullYear(), 2, 1);
  }
  if (next < today) {
    next = new Date(today.getFullYear() + 1, b.getMonth(), b.getDate());
    if (b.getMonth() === 1 && b.getDate() === 29 && next.getMonth() !== 1) {
      next = new Date(today.getFullYear() + 1, 2, 1);
    }
  }
  const daysAway = Math.round((next - today) / 86400000);
  return { date: next, daysAway, turning: next.getFullYear() - b.getFullYear(), isToday: daysAway === 0 };
}

/** How many days you have been alive — the kind of number a diary should know. */
export function daysAlive(dob, on = new Date()) {
  if (!dob) return null;
  const b = new Date(dob);
  if (Number.isNaN(b.getTime())) return null;
  return Math.floor((on - b) / 86400000);
}

/* ------------------------------------------------------------------ *
 * other people's birthdays
 * ------------------------------------------------------------------ */

/** @param people [{ id, name, dob }] */
export function birthdaysToday(people = [], on = new Date()) {
  return people.filter((p) => {
    const n = nextBirthday(p.dob, on);
    return n && n.isToday;
  }).map((p) => ({ ...p, turning: nextBirthday(p.dob, on).turning }));
}

export function birthdaysUpcoming(people = [], on = new Date(), days = 30) {
  return people
    .map((p) => ({ ...p, ...nextBirthday(p.dob, on) }))
    .filter((p) => p.daysAway != null && p.daysAway > 0 && p.daysAway <= days)
    .sort((a, b) => a.daysAway - b.daysAway);
}

/** A sensible default profile. */
export const EMPTY_PROFILE = { name: '', dob: '', country: null, people: [] };

/** Is there enough here to greet someone by name? */
export const hasName = (p) => !!(p?.name || '').trim();

/** Good morning / afternoon / evening, by the clock. */
export function greetingKey(at = new Date()) {
  const h = at.getHours();
  if (h < 5) return 'night';
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}
