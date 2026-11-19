// Instant search for dishes and restaurants: works with or without Vietnamese accents, forgives
// typos ("ramn", "buritto"), matches Vietnamese food words ("gà nướng", "đồ uống"), and reads
// filters typed into the box ("pho under $12", "vegan open now", "tacos within 1 mi",
// "món chay dưới 10$", "ready in 15 min"). Pure functions, so they also run in Node.
(function (root) {
  const SF = root.SF || (root.SF = {});

  // Lowercase, no accents, symbols kept (for reading "$12" or "<15").
  const fold = value => String(value || '').toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const normalize = value => fold(value).replace(/[^a-z0-9]+/g, ' ').trim();
  // Vietnamese phrases whose words collide with other dishes once accents are gone: "phô mai"
  // (cheese) would answer a search for "pho", and "cà phê" (coffee) one for "cá" (fish). They are
  // kept as one word in the index and in queries, and a shorter word never matches their start.
  const COMPOUNDS = [[/\bpho mai\b/g, 'phomai'], [/\bca phe\b/g, 'caphe'], [/\bca ri\b/g, 'cari']];
  const NO_PREFIX = new Set(['phomai', 'caphe']);
  const prepare = text => COMPOUNDS.reduce((result, [pattern, joined]) => result.replace(pattern, joined), normalize(text));
  const words = text => prepare(text).split(' ').filter(Boolean);
  const unique = list => [...new Set(list)];

  const STOPWORDS = new Set(['the', 'a', 'and', 'with', 'of', 'for', 'some', 'me', 'i', 'want', 'to', 'on', 'at', 'please', 'mon', 'cho', 'toi', 'minh', 'muon', 'an', 'nhung', 'cac', 'va']);

  // English words in the menu -> words people type in Vietnamese (without accents).
  const VI_WORDS = {
    chicken: 'ga', beef: 'bo', pork: 'heo lon thit', shrimp: 'tom', fish: 'ca', salmon: 'ca hoi', tuna: 'ca ngu',
    egg: 'trung', eggs: 'trung', tofu: 'dau hu dau phu', rice: 'com', noodles: 'mi bun', noodle: 'mi bun', ramen: 'mi',
    soup: 'sup canh', broth: 'nuoc dung', lamb: 'cuu', vegetables: 'rau', salad: 'goi rau', spicy: 'cay', fried: 'chien ran',
    grill: 'nuong', grilled: 'nuong', bbq: 'nuong', dumplings: 'ha cao banh bao sui cao', coffee: 'ca phe cafe', tea: 'tra',
    milk: 'sua', juice: 'nuoc ep', smoothie: 'sinh to', lemonade: 'nuoc chanh', dessert: 'trang mieng', drink: 'do uong nuoc uong thuc uong',
    // No "phô mai" for cheese: without accents it reads "pho" and would match cheese dishes for pho.
    appetizer: 'khai vi an vat', snack: 'an vat', main: 'mon chinh', curry: 'cari ca ri', pasta: 'mi y',
    mango: 'xoai', coconut: 'dua', vegetarian: 'chay', vegan: 'chay thuan chay', seafood: 'hai san', sandwich: 'banh mi kep',
    pancakes: 'banh kep', crepe: 'banh xeo', sweet: 'ngot', breakfast: 'bua sang an sang', brunch: 'bua sang'
  };
  function viTerms(text) {
    return unique(words(text).flatMap(word => (VI_WORDS[word] ? VI_WORDS[word].split(' ') : []))).join(' ');
  }

  // Damerau-Levenshtein (optimal string alignment) distance, stopping early above `max`.
  function editDistance(a, b, max = 2) {
    if (a === b) return 0;
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let before = null;
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i += 1) {
      const row = [i];
      let rowMin = i;
      for (let j = 1; j <= b.length; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        let value = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
        if (before && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, before[j - 2] + 1);
        row[j] = value;
        rowMin = Math.min(rowMin, value);
      }
      if (rowMin > max) return max + 1;
      before = prev;
      prev = row;
    }
    return prev[b.length];
  }

  // ---------- Filters typed into the search box ----------
  const NUM = '(\\d+(?:\\.\\d+)?)';
  const CURRENCY = '(?:\\s*(?:\\$|dollars?|usd|bucks|do\\b))';
  // Not followed by more digits (so "15 min" can't match as "1") or a time or distance unit.
  const NOT_TIME_OR_DISTANCE = '(?![\\d.])(?!\\s*(?:min|mins|minutes?|phut|mi\\b|miles?|km))';
  const money = value => `$${Number(value) % 1 ? Number(value).toFixed(2) : Number(value)}`;

  function parseQuery(raw) {
    let text = ` ${fold(raw)} `;
    const filters = {};
    const take = (pattern, apply) => {
      text = text.replace(new RegExp(pattern, 'g'), (...match) => { apply(match); return ' '; });
    };
    take(`\\$\\s*${NUM}\\s*(?:-|–|to|den)\\s*\\$?\\s*${NUM}|${NUM}\\s*(?:-|–|to|den)\\s*${NUM}${CURRENCY}`, m => {
      const a = Number(m[1] ?? m[3]);
      const b = Number(m[2] ?? m[4]);
      filters.minPrice = Math.min(a, b);
      filters.maxPrice = Math.max(a, b);
    });
    take(`(?:under|below|less than|cheaper than|max|up to|at most|duoi|khong qua|toi da|<=?)\\s*\\$?\\s*${NUM}${CURRENCY}?${NOT_TIME_OR_DISTANCE}`, m => { filters.maxPrice = Number(m[1]); });
    take(`(?:over|above|more than|at least|tren|>=?)\\s*\\$?\\s*${NUM}${CURRENCY}?${NOT_TIME_OR_DISTANCE}`, m => { filters.minPrice = Number(m[1]); });
    take(`\\$\\s*${NUM}|${NUM}(?:\\s*(?:\\$|dollars?|usd|bucks))`, m => { filters.maxPrice = Number(m[1] ?? m[2]); });
    take(`(?:under|in|within|less than|duoi|trong)?\\s*(\\d{1,3})\\s*(?:min|mins|minutes?|phut)\\b`, m => { filters.maxPrep = Number(m[1]); });
    take(`(?:within|under|in|duoi|trong vong|trong)?\\s*${NUM}\\s*(?:mi|miles?|mile)\\b`, m => { filters.maxDistance = Number(m[1]); });
    take('\\b(?:near me|nearby|close by|gan day|gan toi|gan nhat|quanh day)\\b', () => { filters.maxDistance = filters.maxDistance || 1; });
    take('\\b(?:quick|fast|nhanh)\\b', () => { filters.maxPrep = filters.maxPrep || 15; });
    take('\\b(?:open now|open|dang mo cua|dang mo|mo cua|con mo)\\b', () => { filters.openNow = true; });
    take('\\b(?:best ?sellers?|popular|ban chay|pho bien)\\b', () => { filters.best = true; });
    take('\\b(?:vegan|thuan chay)\\b', () => { filters.diet = 'vegan'; });
    take('\\b(?:vegetarian|veggie|meatless|do chay|chay)\\b', () => { filters.diet = filters.diet || 'vegetarian'; });
    take('\\b(?:not spicy|no spice|mild|khong cay|it cay)\\b', () => { filters.spicy = -1; });
    take('\\b(?:spicy|cay)\\b', () => { filters.spicy = filters.spicy || 1; });
    take('\\b(?:cheap|cheapest|gia re|re)\\b', () => { if (filters.maxPrice == null) filters.maxPrice = 10; });

    const labels = [];
    if (filters.minPrice != null && filters.maxPrice != null) labels.push(`${money(filters.minPrice)}–${money(filters.maxPrice)}`);
    else if (filters.maxPrice != null) labels.push(`Under ${money(filters.maxPrice)}`);
    else if (filters.minPrice != null) labels.push(`${money(filters.minPrice)}+`);
    if (filters.maxPrep) labels.push(`Ready in ${filters.maxPrep} min`);
    if (filters.maxDistance) labels.push(`Within ${filters.maxDistance} mi`);
    if (filters.openNow) labels.push('Open now');
    if (filters.best) labels.push('Best sellers');
    if (filters.diet) labels.push(filters.diet === 'vegan' ? 'Vegan' : 'Vegetarian');
    if (filters.spicy) labels.push(filters.spicy > 0 ? 'Spicy' : 'Not spicy');

    const tokens = words(text).filter(token => !STOPWORDS.has(token));
    return { raw: String(raw || ''), text: tokens.join(' '), tokens, filters, labels };
  }

  // Price, diet, spice, and best-seller filters. Open now, distance, and prep time depend on the
  // clock and order type, so the page adds those.
  function basicFilter(dish, filters) {
    if (filters.maxPrice != null && dish.price > filters.maxPrice) return false;
    if (filters.minPrice != null && dish.price < filters.minPrice) return false;
    if (filters.diet === 'vegan' && dish.diet !== 'vegan') return false;
    if (filters.diet === 'vegetarian' && dish.diet !== 'vegetarian' && dish.diet !== 'vegan') return false;
    if (filters.spicy > 0 && !dish.spicy) return false;
    if (filters.spicy < 0 && dish.spicy > 1) return false;
    if (filters.best && !dish.bestSeller) return false;
    return true;
  }

  // ---------- Index and ranking ----------
  const field = (weight, text) => ({ weight, text: ` ${prepare(text)} `, words: unique(words(text)) });

  function createIndex({ dishes, restaurants, restaurantOf, courseLabel = () => '' }) {
    const vocabulary = new Set();
    const dishEntries = dishes.map(dish => {
      const restaurant = restaurantOf(dish);
      const facts = `${dish.cuisine} ${dish.tags.join(' ')} ${courseLabel(dish.course)} ${dish.course} ${dish.diet === 'meat' ? '' : dish.diet} ${dish.spicy ? 'spicy' : ''} ${dish.bestSeller ? 'best seller bestseller popular' : ''} ${dish.isNew ? 'new' : ''}`;
      const entry = {
        item: dish,
        name: prepare(dish.name),
        aliases: dish.aliases.map(prepare),
        fields: [
          field(3, dish.name),
          field(2.6, dish.aliases.join(' ')),
          field(1.5, `${restaurant.name} ${(restaurant.aliases || []).join(' ')}`),
          field(1.4, facts),
          field(1.1, viTerms(`${dish.name} ${facts} ${dish.ingredients}`)),
          field(0.6, `${dish.description} ${dish.ingredients}`)
        ]
      };
      entry.fields.slice(0, 4).forEach(item => item.words.forEach(word => vocabulary.add(word)));
      return entry;
    });
    const restaurantEntries = restaurants.map(restaurant => {
      const menu = dishes.filter(dish => dish.restaurantId === restaurant.id).map(dish => dish.name).join(' ');
      const entry = {
        item: restaurant,
        name: prepare(restaurant.name),
        aliases: (restaurant.aliases || []).map(prepare),
        fields: [
          field(3, restaurant.name),
          field(3, (restaurant.aliases || []).join(' ')),
          field(1.5, restaurant.cuisine),
          field(1.1, viTerms(`${restaurant.cuisine} ${restaurant.tagline}`)),
          field(0.7, menu),
          field(0.6, restaurant.tagline)
        ]
      };
      entry.fields.slice(0, 3).forEach(item => item.words.forEach(word => vocabulary.add(word)));
      return entry;
    });
    return { dishes: dishEntries, restaurants: restaurantEntries, vocabulary };
  }

  // How well one typed word matches an entry. Strong matches are whole words or word starts;
  // weak matches forgive typos ("ramn" -> ramen) or find the word inside a longer one. The last
  // word may still be half-typed, so it can also match the start of a longer word with a typo.
  function tokenScore(token, entry, isLast) {
    let strong = 0;
    let weak = 0;
    const fuzzyMax = token.length >= 7 ? 2 : token.length >= 5 ? 1 : 0;
    for (const { weight, words: list } of entry.fields) {
      for (const word of list) {
        if (word === token) { strong = Math.max(strong, weight); continue; }
        if (word.startsWith(token) && !NO_PREFIX.has(word)) {
          if (token.length >= 2 || weight >= 2.5) strong = Math.max(strong, (token.length <= 2 ? 0.5 : 0.82) * weight);
          continue;
        }
        let score = 0;
        if (token.length >= 4 && word.length >= token.length + 3 && word.includes(token)) score = 0.45;
        else if (fuzzyMax && Math.abs(word.length - token.length) <= fuzzyMax && editDistance(token, word, fuzzyMax) <= fuzzyMax) score = 0.55;
        else if (isLast && token.length >= 4 && word.length > token.length && editDistance(token, word.slice(0, token.length), 1) <= 1) score = 0.4;
        weak = Math.max(weak, score * weight);
      }
    }
    return strong ? { score: strong, weak: false } : { score: weak, weak: weak > 0 };
  }

  // -1 when a word doesn't match at all. `weak` is true when any word only matched loosely.
  function scoreEntry(entry, query) {
    const { tokens, text } = query;
    if (!tokens.length) return { score: 0, weak: false };
    let total = 0;
    let weak = false;
    for (let i = 0; i < tokens.length; i += 1) {
      const match = tokenScore(tokens[i], entry, i === tokens.length - 1);
      if (!match.score) return { score: -1, weak: true };
      total += match.score;
      weak = weak || match.weak;
    }
    if (entry.name.startsWith(text)) total += 3;
    else if (entry.name.includes(text)) total += 1.5;
    if (entry.aliases.includes(text)) total += 3;
    // Words typed together that appear together ("do uong", "fried rice") count extra.
    if (tokens.length > 1) total += Math.max(0, ...entry.fields.map(item => (item.text.includes(` ${text}`) ? item.weight * 1.5 : 0)));
    return { score: total, weak };
  }

  const popularity = item => (item.rating || 0) * 0.25 + Math.log10((item.ratingCount || 0) + 1) * 0.15;

  // Results best first. Loose (typo) matches only show when nothing matches exactly, so a
  // search for "chicken" never fills up with near misses. `typo` tells the page that happened.
  function rank(entries, raw, { test = null, limit = Infinity } = {}) {
    const query = typeof raw === 'string' ? parseQuery(raw) : raw;
    let results = [];
    for (const entry of entries) {
      if (test && !test(entry.item, query.filters)) continue;
      const { score, weak } = scoreEntry(entry, query);
      if (query.tokens.length && score < 0) continue;
      results.push({ item: entry.item, score: Math.max(0, score) + popularity(entry.item), weak });
    }
    const strong = results.filter(result => !result.weak);
    const typo = strong.length === 0 && results.length > 0;
    if (!typo) results = strong;
    results.sort((a, b) => b.score - a.score);
    return { query, results: results.slice(0, limit), total: results.length, typo };
  }
  const searchDishes = (index, raw, options) => rank(index.dishes, raw, options);
  const searchRestaurants = (index, raw, options) => rank(index.restaurants, raw, options);

  // "Did you mean …?" for a query with no results: swaps each unknown word for the closest menu word.
  function suggest(index, raw) {
    const query = typeof raw === 'string' ? parseQuery(raw) : raw;
    let changed = false;
    const fixed = query.tokens.map(token => {
      if (index.vocabulary.has(token) || token.length < 3) return token;
      let best = null;
      let bestDistance = 3;
      for (const word of index.vocabulary) {
        if (Math.abs(word.length - token.length) > 2) continue;
        const d = editDistance(token, word, 2);
        if (d < bestDistance) { best = word; bestDistance = d; }
      }
      if (best && bestDistance <= (token.length >= 5 ? 2 : 1)) { changed = true; return best; }
      return token;
    });
    return changed ? fixed.join(' ') : null;
  }

  SF.search = { fold, normalize, editDistance, parseQuery, basicFilter, createIndex, searchDishes, searchRestaurants, suggest };
  if (typeof module !== 'undefined' && module.exports) module.exports = SF;
})(typeof window !== 'undefined' ? window : globalThis);
