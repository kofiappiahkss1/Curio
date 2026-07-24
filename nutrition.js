/**
 * Curio — nutrition.
 *
 * WHY THIS DOES NOT READ YOUR PHOTOGRAPH
 *
 * Apps like Cal.AI send the picture to a server running a large vision model.
 * Curio has no server, and its privacy policy says plainly that it contains no
 * code capable of uploading anything. Adding photo recognition would make that
 * sentence false, so it is not here.
 *
 * What is here instead: a bundled food table, a fast search, and honest portion
 * arithmetic. You photograph the meal as before, say what it is — two taps once
 * a food is remembered — and Curio does the rest on the device, with the radio
 * off, for ever, free.
 *
 * ON ACCURACY. Every figure below is per 100 g and is a reasonable average, not
 * a laboratory measurement: recipes vary by cook, region and hand. Curio says
 * "about" everywhere and rounds honestly. Photo-estimating apps are no more
 * exact — they are simply less open about it.
 *
 * Columns: [name, kcal, protein g, carbs g, fat g, fibre g, tags]
 */

export const PER = 100;   // all figures are per 100 g

/* eslint-disable no-multi-spaces */
const F = [
  // ---- West African ----
  ['Jollof rice',            160,  3.4, 27.0,  4.2, 1.1, 'gh ng rice main'],
  ['Waakye',                 145,  5.0, 26.0,  2.0, 3.4, 'gh rice beans main'],
  ['Banku',                  145,  2.6, 31.0,  0.5, 1.2, 'gh maize main'],
  ['Kenkey',                 140,  2.4, 30.0,  0.6, 1.4, 'gh maize main'],
  ['Fufu',                   130,  1.2, 31.0,  0.2, 1.6, 'gh ng cassava main'],
  ['Gari',                   360,  1.6, 84.0,  0.5, 3.5, 'gh ng cassava staple'],
  ['Kelewele',               215,  1.3, 33.0,  9.0, 2.2, 'gh plantain snack'],
  ['Fried plantain',         190,  1.3, 31.0,  7.5, 2.2, 'plantain side'],
  ['Boiled plantain',        122,  1.3, 32.0,  0.4, 2.3, 'plantain side'],
  ['Red red (bean stew)',    155,  6.8, 20.0,  5.4, 6.0, 'gh beans main'],
  ['Groundnut soup',         135,  7.5,  7.0,  8.6, 1.8, 'gh ng soup'],
  ['Light soup',              62,  7.0,  3.4,  2.2, 0.8, 'gh soup'],
  ['Palm nut soup',          180,  6.0,  6.0, 15.0, 2.0, 'gh soup'],
  ['Okro stew',               95,  4.5,  6.5,  5.8, 2.6, 'gh ng stew'],
  ['Egusi soup',             215,  9.0,  7.0, 17.0, 3.0, 'ng soup'],
  ['Suya',                   210, 26.0,  3.0, 10.5, 0.6, 'ng beef grill'],
  ['Grilled tilapia',        128, 26.0,  0.0,  2.7, 0.0, 'fish grill'],
  ['Fried fish',             200, 22.0,  5.0, 10.0, 0.2, 'fish fried'],
  ['Shito (pepper sauce)',   330,  8.0, 12.0, 28.0, 3.0, 'gh sauce'],
  ['Meat pie',               290,  8.0, 28.0, 16.0, 1.4, 'gh ng pastry'],
  ['Chin chin',              450,  7.0, 60.0, 20.0, 1.8, 'ng snack'],
  ['Puff puff',              280,  5.0, 40.0, 11.0, 1.4, 'ng snack'],
  ['Yam (boiled)',           118,  1.5, 28.0,  0.2, 4.1, 'yam staple'],
  ['Fried yam',              215,  1.8, 33.0,  8.5, 3.8, 'yam side'],

  // ---- East & Southern African ----
  ['Ugali',                  110,  2.5, 23.0,  0.5, 1.0, 'ke tz maize staple'],
  ['Sukuma wiki',             65,  3.2,  6.0,  3.4, 2.8, 'ke greens side'],
  ['Chapati',                300,  8.0, 46.0,  9.5, 2.4, 'ke bread'],
  ['Pilau',                  185,  5.5, 27.0,  6.0, 1.2, 'ke tz rice main'],
  ['Nyama choma',            250, 27.0,  0.0, 15.0, 0.0, 'ke grill beef'],
  ['Githeri',                140,  7.0, 23.0,  1.8, 6.5, 'ke beans maize'],
  ['Injera',                 165,  5.5, 33.0,  1.0, 4.5, 'et bread'],
  ['Doro wat',               190, 16.0,  6.0, 11.0, 1.5, 'et stew chicken'],
  ['Pap (maize meal)',        95,  2.2, 21.0,  0.3, 0.9, 'za maize staple'],
  ['Bunny chow',             240,  8.0, 33.0,  8.5, 3.0, 'za main'],
  ['Bobotie',                200, 13.0, 11.0, 12.0, 1.2, 'za main'],

  // ---- Staples and grains ----
  ['White rice (cooked)',    130,  2.7, 28.0,  0.3, 0.4, 'rice staple'],
  ['Brown rice (cooked)',    112,  2.6, 24.0,  0.9, 1.8, 'rice staple'],
  ['Bread (white)',          265,  9.0, 49.0,  3.2, 2.7, 'bread staple'],
  ['Bread (wholemeal)',      247, 13.0, 41.0,  3.4, 7.0, 'bread staple'],
  ['Pasta (cooked)',         158,  5.8, 31.0,  0.9, 1.8, 'pasta staple'],
  ['Couscous (cooked)',      112,  3.8, 23.0,  0.2, 1.4, 'staple'],
  ['Potato (boiled)',         87,  2.0, 20.0,  0.1, 1.8, 'potato staple'],
  ['Sweet potato (boiled)',   76,  1.4, 17.5,  0.1, 2.5, 'potato staple'],
  ['Chips / fries',          312,  3.4, 41.0, 15.0, 3.8, 'potato fried'],
  ['Oats (cooked)',           71,  2.5, 12.0,  1.5, 1.7, 'breakfast'],
  ['Quinoa (cooked)',        120,  4.4, 21.0,  1.9, 2.8, 'staple'],
  ['Maize / corn',            96,  3.4, 21.0,  1.5, 2.4, 'vegetable'],

  // ---- Meat, fish, eggs ----
  ['Chicken breast',         165, 31.0,  0.0,  3.6, 0.0, 'meat'],
  ['Fried chicken',          260, 22.0, 10.0, 15.0, 0.4, 'meat fried'],
  ['Beef (lean)',            217, 26.0,  0.0, 12.0, 0.0, 'meat'],
  ['Goat meat',              143, 27.0,  0.0,  3.0, 0.0, 'meat'],
  ['Pork',                   242, 27.0,  0.0, 14.0, 0.0, 'meat'],
  ['Lamb',                   258, 25.0,  0.0, 17.0, 0.0, 'meat'],
  ['Salmon',                 208, 20.0,  0.0, 13.0, 0.0, 'fish'],
  ['Tuna (tinned)',          116, 26.0,  0.0,  1.0, 0.0, 'fish'],
  ['Sardines',               208, 25.0,  0.0, 11.5, 0.0, 'fish'],
  ['Prawns',                  99, 24.0,  0.2,  0.3, 0.0, 'seafood'],
  ['Egg (boiled)',           155, 13.0,  1.1, 11.0, 0.0, 'egg'],
  ['Fried egg',              196, 13.6,  0.8, 15.0, 0.0, 'egg'],
  ['Omelette',               154, 11.0,  1.0, 11.5, 0.0, 'egg'],

  // ---- Pulses, nuts, dairy ----
  ['Beans (cooked)',         127,  8.7, 22.8,  0.5, 6.4, 'beans'],
  ['Lentils (cooked)',       116,  9.0, 20.0,  0.4, 7.9, 'beans'],
  ['Chickpeas (cooked)',     164,  8.9, 27.0,  2.6, 7.6, 'beans'],
  ['Groundnuts / peanuts',   567, 26.0, 16.0, 49.0, 8.5, 'nuts'],
  ['Cashews',                553, 18.0, 30.0, 44.0, 3.3, 'nuts'],
  ['Almonds',                579, 21.0, 22.0, 50.0, 12.5, 'nuts'],
  ['Milk (whole)',            61,  3.2,  4.8,  3.3, 0.0, 'dairy'],
  ['Milk (skimmed)',          35,  3.4,  5.0,  0.1, 0.0, 'dairy'],
  ['Yoghurt (plain)',         59, 10.0,  3.6,  0.4, 0.0, 'dairy'],
  ['Cheese (cheddar)',       402, 25.0,  1.3, 33.0, 0.0, 'dairy'],
  ['Butter',                 717,  0.9,  0.1, 81.0, 0.0, 'fat'],

  // ---- Vegetables and fruit ----
  ['Tomato',                  18,  0.9,  3.9,  0.2, 1.2, 'vegetable'],
  ['Onion',                   40,  1.1,  9.3,  0.1, 1.7, 'vegetable'],
  ['Spinach',                 23,  2.9,  3.6,  0.4, 2.2, 'vegetable greens'],
  ['Kale',                    49,  4.3,  9.0,  0.9, 3.6, 'vegetable greens'],
  ['Cabbage',                 25,  1.3,  5.8,  0.1, 2.5, 'vegetable'],
  ['Carrot',                  41,  0.9,  9.6,  0.2, 2.8, 'vegetable'],
  ['Okra',                    33,  1.9,  7.5,  0.2, 3.2, 'vegetable'],
  ['Garden egg / aubergine',  25,  1.0,  6.0,  0.2, 3.0, 'vegetable'],
  ['Pepper (sweet)',          31,  1.0,  6.0,  0.3, 2.1, 'vegetable'],
  ['Avocado',                160,  2.0,  8.5, 15.0, 6.7, 'fruit fat'],
  ['Banana',                  89,  1.1, 23.0,  0.3, 2.6, 'fruit'],
  ['Mango',                   60,  0.8, 15.0,  0.4, 1.6, 'fruit'],
  ['Pineapple',               50,  0.5, 13.0,  0.1, 1.4, 'fruit'],
  ['Pawpaw / papaya',         43,  0.5, 11.0,  0.3, 1.7, 'fruit'],
  ['Orange',                  47,  0.9, 12.0,  0.1, 2.4, 'fruit'],
  ['Apple',                   52,  0.3, 14.0,  0.2, 2.4, 'fruit'],
  ['Watermelon',              30,  0.6,  7.6,  0.2, 0.4, 'fruit'],
  ['Coconut (fresh)',        354,  3.3, 15.0, 33.0, 9.0, 'fruit fat'],

  // ---- Asian ----
  ['Ramen',                  110,  4.5, 15.0,  3.5, 1.0, 'jp noodle main'],
  ['Sushi',                  145,  6.0, 28.0,  1.0, 0.8, 'jp main'],
  ['Fried rice',             186,  5.5, 26.0,  6.5, 1.0, 'cn rice main'],
  ['Noodles (stir-fried)',   180,  6.0, 25.0,  6.0, 1.5, 'cn noodle main'],
  ['Dumplings',              220,  9.0, 26.0,  8.5, 1.4, 'cn main'],
  ['Chicken curry',          160, 14.0,  6.0,  9.0, 1.5, 'in main'],
  ['Dal',                    118,  7.0, 17.0,  2.5, 5.0, 'in main beans'],
  ['Roti / chapati (Indian)',297,  8.5, 46.0,  8.0, 4.9, 'in bread'],
  ['Biryani',                180,  8.0, 24.0,  6.0, 1.5, 'in rice main'],
  ['Samosa',                 262,  5.0, 32.0, 13.0, 2.5, 'in snack'],
  ['Pad thai',               180,  8.0, 25.0,  5.5, 1.6, 'th main'],
  ['Pho',                     75,  6.0, 10.0,  1.2, 0.5, 'vn soup'],
  ['Nasi goreng',            170,  6.0, 24.0,  5.5, 1.2, 'id rice main'],

  // ---- European, American, Middle Eastern ----
  ['Pizza',                  266, 11.0, 33.0, 10.0, 2.3, 'main'],
  ['Burger',                 250, 15.0, 20.0, 12.0, 1.2, 'main'],
  ['Sandwich',               230, 11.0, 28.0,  8.0, 2.0, 'main'],
  ['Toast with jam',         280,  6.0, 52.0,  5.0, 2.2, 'breakfast'],
  ['Full breakfast',         230, 13.0, 12.0, 15.0, 1.6, 'breakfast'],
  ['Salad (mixed, dressed)',  90,  2.0,  6.0,  6.5, 2.4, 'salad'],
  ['Soup (vegetable)',        45,  1.6,  7.0,  1.2, 1.5, 'soup'],
  ['Hummus',                 166,  8.0, 14.0,  9.6, 6.0, 'dip'],
  ['Falafel',                333, 13.0, 32.0, 18.0, 5.0, 'main'],
  ['Shawarma',               215, 17.0, 14.0, 10.0, 1.5, 'main'],
  ['Couscous salad',         140,  4.0, 22.0,  4.0, 2.4, 'salad'],
  ['Tacos',                  220, 11.0, 22.0, 10.0, 3.0, 'mx main'],
  ['Rice and beans',         140,  5.5, 25.0,  2.2, 4.5, 'main'],
  ['Empanada',               290,  9.0, 30.0, 15.0, 1.8, 'snack'],

  // ---- Drinks ----
  ['Water',                    0,  0.0,  0.0,  0.0, 0.0, 'drink'],
  ['Tea (no milk)',            1,  0.0,  0.2,  0.0, 0.0, 'drink'],
  ['Coffee (black)',           2,  0.1,  0.0,  0.0, 0.0, 'drink'],
  ['Tea with milk and sugar',  45,  1.2,  7.5,  1.0, 0.0, 'drink'],
  ['Soft drink',              42,  0.0, 10.6,  0.0, 0.0, 'drink'],
  ['Fruit juice',             45,  0.5, 10.5,  0.1, 0.2, 'drink'],
  // Alcohol carries about 7 kcal per gram and is not a macronutrient, so the
  // energy in these two is deliberately higher than their carbs would suggest.
  ['Beer',                     43,  0.5,  3.6,  0.0, 0.0, 'drink alcohol'],
  ['Wine',                     83,  0.1,  2.6,  0.0, 0.0, 'drink alcohol'],
  ['Sobolo / hibiscus',        30,  0.1,  7.4,  0.0, 0.2, 'gh drink'],
  ['Smoothie',                 70,  1.5, 15.0,  0.6, 1.4, 'drink'],

  // ---- Sweets and snacks ----
  ['Chocolate',              546,  4.9, 61.0, 31.0, 3.4, 'sweet'],
  ['Biscuits',               480,  6.0, 65.0, 21.0, 2.2, 'sweet'],
  ['Cake',                    350,  5.0, 50.0, 15.0, 1.0, 'sweet'],
  ['Ice cream',              207,  3.5, 24.0, 11.0, 0.7, 'sweet'],
  ['Crisps',                 536,  7.0, 53.0, 34.0, 4.8, 'snack'],
  ['Popcorn',                387, 13.0, 78.0,  4.5, 15.0, 'snack'],
  ['Doughnut',               452,  5.0, 51.0, 25.0, 1.5, 'sweet'],
];
/* eslint-enable no-multi-spaces */

export const FOODS = F.map(([name, kcal, protein, carbs, fat, fibre, tags], i) => ({
  id: i + 1, name, kcal, protein, carbs, fat, fibre, tags: tags.split(' '),
}));

/* ------------------------------------------------------------------ *
 * portions
 * ------------------------------------------------------------------ *
 * People do not weigh their food, so Curio asks in the shapes people
 * actually think in and converts. Grams remain available for anyone who does.
 */
export const PORTIONS = [
  { key: 'small',  grams: 120, factor: 0.8 },
  { key: 'medium', grams: 220, factor: 1.0 },
  { key: 'large',  grams: 350, factor: 1.4 },
];
export const DEFAULT_PORTION = 'medium';

/** Sensible default grams for a kind of food, so "medium" means something. */
export function defaultGrams(food, portion = DEFAULT_PORTION) {
  const p = PORTIONS.find((x) => x.key === portion) || PORTIONS[1];
  const tags = food?.tags || [];
  let base = p.grams;
  if (tags.includes('drink')) base = 250;
  else if (tags.includes('snack') || tags.includes('sweet')) base = 45;
  else if (tags.includes('nuts')) base = 30;
  else if (tags.includes('fat')) base = 15;
  else if (tags.includes('fruit')) base = 130;
  else if (tags.includes('bread')) base = 60;
  else if (tags.includes('soup')) base = 300;
  return Math.round(base * (p.factor / 1.0));
}

/** What one serving of something actually comes to. */
export function forServing(food, grams) {
  const g = Math.max(0, Number(grams) || 0);
  const k = g / PER;
  return {
    grams: g,
    kcal: Math.round(food.kcal * k),
    protein: Math.round(food.protein * k * 10) / 10,
    carbs: Math.round(food.carbs * k * 10) / 10,
    fat: Math.round(food.fat * k * 10) / 10,
    fibre: Math.round(food.fibre * k * 10) / 10,
  };
}

/** Add several items into one meal. */
export function total(items = []) {
  return items.reduce((a, x) => ({
    kcal: a.kcal + (x.kcal || 0),
    protein: Math.round((a.protein + (x.protein || 0)) * 10) / 10,
    carbs: Math.round((a.carbs + (x.carbs || 0)) * 10) / 10,
    fat: Math.round((a.fat + (x.fat || 0)) * 10) / 10,
    fibre: Math.round((a.fibre + (x.fibre || 0)) * 10) / 10,
    grams: a.grams + (x.grams || 0),
  }), { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0, grams: 0 });
}

/* ------------------------------------------------------------------ *
 * finding a food
 * ------------------------------------------------------------------ */
const norm = (s) => String(s || '').toLowerCase()
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

/** Ranked search over the table: exact, then start-of-word, then anywhere. */
export function findFoods(query, limit = 8) {
  const q = norm(query).trim();
  if (q.length < 2) return [];
  const scored = [];
  for (const f of FOODS) {
    const n = norm(f.name);
    let score = 0;
    if (n === q) score = 100;
    else if (n.startsWith(q)) score = 70;
    else if (n.split(/[\s/()]+/).some((w) => w.startsWith(q))) score = 55;
    else if (n.includes(q)) score = 35;
    else if (f.tags.some((t) => t.startsWith(q))) score = 20;
    if (score) scored.push({ food: f, score: score - n.length * 0.05 });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.food);
}

export const foodById = (id) => FOODS.find((f) => f.id === Number(id)) || null;

/* ------------------------------------------------------------------ *
 * a day of eating
 * ------------------------------------------------------------------ */

/** Everything eaten on a day, totalled. */
export function dayTotals(moments = [], day) {
  const meals = moments.filter((m) => m.kept !== false && m.day === day && m.nutrition);
  const t = total(meals.map((m) => m.nutrition.total || m.nutrition));
  return { ...t, meals: meals.length };
}

/**
 * A rough daily energy need, by the Mifflin–St Jeor equation.
 * Only used to give the day's total some context, never as advice.
 */
export function estimateDailyEnergy({ age, sex = 'unspecified', heightCm, weightKg, activity = 1.4 } = {}) {
  if (!age || !heightCm || !weightKg) return null;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  const bmr = sex === 'male' ? base + 5 : sex === 'female' ? base - 161 : base - 78;
  return Math.round(bmr * activity);
}

/** How the day's energy splits across protein, carbs and fat. */
export function macroSplit(t) {
  const kcal = (t.protein * 4) + (t.carbs * 4) + (t.fat * 9);
  if (!kcal) return { protein: 0, carbs: 0, fat: 0 };
  return {
    protein: Math.round((t.protein * 4 / kcal) * 100),
    carbs: Math.round((t.carbs * 4 / kcal) * 100),
    fat: Math.round((t.fat * 9 / kcal) * 100),
  };
}

/** Which foods turn up most — pattern material, not judgement. */
export function commonFoods(moments = [], limit = 5) {
  const counts = new Map();
  for (const m of moments) {
    if (m.kept === false || !m.nutrition?.items) continue;
    for (const item of m.nutrition.items) {
      counts.set(item.name, (counts.get(item.name) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, n]) => ({ name, n }));
}

/**
 * Everything here is an estimate. This is the string the interface shows so
 * nobody mistakes it for a measurement.
 */
export const ACCURACY_NOTE = 'about';
