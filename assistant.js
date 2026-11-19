// On-device ordering assistant. Understands English and Vietnamese requests such as
// "add 2 pho for pickup", "thêm 2 phở", "something spicy under $15", "dinner for 3 under $50",
// "book a table for 4 at 7pm", "đặt bàn 6 người lúc 7h tối", "check in", or "chia tiền",
// and turns them into cart actions, bookings, and recommendations. SmartFoodie has dine-in,
// reservations, and pickup only (no delivery). The same action format is used by the
// Claude-powered assistant in serve.py.
(function (root) {
  const SF = root.SF || (root.SF = {});

  const normalize = value => String(value || '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  const NUMBER_WORDS = {
    a: 1, an: 1, one: 1, single: 1, two: 2, couple: 2, double: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    mot: 1, hai: 2, ba: 3, bon: 4, tu: 4, nam: 5, sau: 6, bay: 7, tam: 8, chin: 9, muoi: 10
  };
  const FILLER_TOKENS = new Set(['x', 'phan', 'to', 'bat', 'dia', 'cai', 'chiec', 'suat', 'hop', 'con', 'order', 'orders', 'of', 'portion', 'portions', 'plate', 'plates', 'bowl', 'bowls', 'serving', 'servings', 'more', 'extra', 'nua', 'them']);

  // Generic words that could mean several dishes; the assistant asks which one.
  const GENERIC_ALIASES = {
    'tacos': ['street-tacos', 'carnitas-tacos', 'chicken-taco-pair', 'birria-tacos', 'fish-tacos'],
    'taco': ['street-tacos', 'carnitas-tacos', 'chicken-taco-pair', 'birria-tacos', 'fish-tacos'],
    'curry': ['red-curry', 'green-curry', 'massaman-curry', 'butter-chicken', 'tikka-masala', 'rogan-josh'],
    'cari': ['red-curry', 'green-curry', 'massaman-curry', 'butter-chicken', 'tikka-masala', 'rogan-josh'],
    'burger': ['cheeseburger', 'smash-burger', 'bacon-bbq-burger', 'mushroom-swiss-burger'],
    'burgers': ['cheeseburger', 'smash-burger', 'bacon-bbq-burger', 'mushroom-swiss-burger'],
    'fried chicken': ['two-piece-meal', 'korean-fried-chicken', 'karaage', 'nashville-hot-chicken'],
    'ga ran': ['two-piece-meal', 'korean-fried-chicken', 'karaage'],
    'sushi': ['salmon-sushi-set', 'chirashi', 'dragon-roll'],
    'pizza': ['margherita', 'pepperoni-pizza'],
    'dumplings': ['xiao-long-bao', 'gyoza', 'mandu', 'chili-wontons'],
    'coffee': ['ca-phe-sua-da', 'thai-iced-coffee', 'cold-brew', 'cappuccino'],
    'iced coffee': ['ca-phe-sua-da', 'thai-iced-coffee', 'cold-brew'],
    'milk tea': ['boba-milk-tea', 'hk-milk-tea', 'thai-iced-tea'],
    'tra sua': ['boba-milk-tea', 'hk-milk-tea', 'thai-iced-tea'],
    'milkshake': ['vanilla-shake', 'chocolate-shake', 'banana-shake'],
    'lemonade': ['strawberry-lemonade', 'peach-lemonade', 'mint-lemonade'],
    'nuoc chanh': ['strawberry-lemonade', 'peach-lemonade', 'mint-lemonade', 'nimbu-soda'],
    'smoothie': ['berry-smoothie', 'sinh-to-bo', 'mango-lassi'],
    'sinh to': ['sinh-to-bo', 'berry-smoothie', 'mango-lassi'],
    'chicken': [],
    'noodles': [],
    'pasta': ['penne-pomodoro', 'bolognese', 'carbonara', 'lasagna', 'fettuccine-alfredo']
  };

  function buildAliasIndex(dishes) {
    const index = new Map();
    const addAlias = (alias, ids) => {
      const key = normalize(alias);
      if (!key) return;
      if (!index.has(key)) index.set(key, new Set());
      ids.forEach(id => index.get(key).add(id));
    };
    dishes.forEach(dish => {
      addAlias(dish.name, [dish.id]);
      addAlias(dish.name.replace(/\(.*?\)/g, ''), [dish.id]);
      dish.aliases.forEach(alias => addAlias(alias, [dish.id]));
    });
    Object.entries(GENERIC_ALIASES).forEach(([alias, ids]) => { if (ids.length) addAlias(alias, ids); });
    return [...index.entries()].map(([key, ids]) => ({ tokens: key.split(' '), ids: [...ids] }))
      .sort((a, b) => b.tokens.length - a.tokens.length);
  }

  let cachedIndex = null;
  let cachedFor = null;
  const aliasIndexFor = dishes => {
    if (cachedFor !== dishes) { cachedIndex = buildAliasIndex(dishes); cachedFor = dishes; }
    return cachedIndex;
  };

  const readNumber = token => {
    if (!token) return null;
    if (/^\d{1,2}$/.test(token)) return Number(token);
    const multiplier = token.match(/^(?:x(\d{1,2})|(\d{1,2})x)$/);
    if (multiplier) return Number(multiplier[1] || multiplier[2]);
    return NUMBER_WORDS[token] || null;
  };

  // Finds dish mentions and the quantity written before ("2 pho", "hai phở") or after ("pho x2").
  function findMentions(text, dishes) {
    const tokens = normalize(text).split(' ').filter(Boolean);
    const covered = new Array(tokens.length).fill(false);
    const mentions = [];
    aliasIndexFor(dishes).forEach(({ tokens: aliasTokens, ids }) => {
      for (let start = 0; start + aliasTokens.length <= tokens.length; start += 1) {
        if (covered.slice(start, start + aliasTokens.length).some(Boolean)) continue;
        if (!aliasTokens.every((token, offset) => tokens[start + offset] === token)) continue;
        const end = start + aliasTokens.length;
        for (let i = start; i < end; i += 1) covered[i] = true;
        mentions.push({ start, end, ids });
      }
    });
    mentions.sort((a, b) => a.start - b.start);
    mentions.forEach(mention => {
      let quantity = null;
      for (let i = mention.start - 1, skipped = 0; i >= 0 && skipped <= 3 && !covered[i]; i -= 1) {
        const number = readNumber(tokens[i]);
        // "a"/"an" (and Vietnamese "ăn" = eat, which normalizes to "an") set quantity 1 but
        // are not an explicit order on their own.
        if (number) { quantity = number; mention.weak = ['a', 'an'].includes(tokens[i]); covered[i] = true; break; }
        if (!FILLER_TOKENS.has(tokens[i])) break;
        skipped += 1;
      }
      if (!quantity) {
        const after = tokens[mention.end];
        const multiplier = after && after.match(/^x(\d{1,2})$/);
        if (multiplier) { quantity = Number(multiplier[1]); covered[mention.end] = true; }
        else if (after === 'x' && /^\d{1,2}$/.test(tokens[mention.end + 1] || '')) { quantity = Number(tokens[mention.end + 1]); covered[mention.end] = covered[mention.end + 1] = true; }
      }
      mention.quantity = quantity;
    });
    const freeText = tokens.filter((_, i) => !covered[i]).join(' ');
    return { mentions, freeText, normalized: tokens.join(' ') };
  }

  const isVietnamese = text => /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹáàãéèíìóòõúùýđ]/i.test(text)
    || /\b(toi|minh|muon|cho|mon|them|bot|nguoi|duoi|re|ngon|an gi|goi y|giao|thanh toan|bao nhieu|khong|dat ban|chia tien|toi nay|ngay mai)\b/.test(normalize(text));

  const CUISINE_PATTERNS = [
    ['Vietnamese', /\b(vietnamese|viet|mon viet|viet nam)\b/],
    ['Thai', /\b(thai|thai lan|mon thai)\b/],
    ['Japanese', /\b(japanese|japan|nhat|mon nhat|nhat ban)\b/],
    ['Korean', /\b(korean|korea|han quoc|mon han)\b/],
    ['Chinese', /\b(chinese|china|trung quoc|mon trung|mon hoa)\b/],
    ['Indian', /\b(indian|india|an do)\b/],
    ['Indonesian', /\b(indonesian|indonesia)\b/],
    ['American', /\b(american|mon my|kieu my|do my)\b/],
    ['Mexican', /\b(mexican|mexico|mehico)\b/],
    ['Italian', /\b(italian|italy|mon y|kieu y|do y)\b/],
    ['Middle Eastern', /\b(middle eastern|mediterranean|trung dong|dia trung hai)\b/],
    ['Spanish', /\b(spanish|spain|mediterranean|tay ban nha|dia trung hai)\b/]
  ];
  const ASIAN = ['Vietnamese', 'Thai', 'Japanese', 'Korean', 'Chinese', 'Indian', 'Indonesian'];

  const MOODS = [
    { key: 'comfort', pattern: /\b(comfort|comforting|cozy|warm|soup|broth|tired|stressed|sad|rainy|cold|sick|hangover|met|buon|lanh|mua|sup|canh|nuoc dung|am)\b/, tags: ['Soup', 'Comfort', 'Curry'] },
    { key: 'fresh', pattern: /\b(fresh|light|healthy|clean|salad|green|diet|nhe|tuoi|thanh mat|eat clean|it calo|giam can|lanh manh)\b/, tags: ['Healthy', 'Salad'] },
    { key: 'noodles', pattern: /\b(noodle|noodles|pasta|ramen|mi|bun|pho|hu tieu)\b/, tags: ['Noodles', 'Pasta'] },
    { key: 'rice', pattern: /\b(rice|com|bowl)\b/, tags: ['Rice', 'Bowl'] },
    { key: 'fried', pattern: /\b(fried|crispy|crunchy|chien|ran|gion)\b/, tags: ['Fried'] },
    { key: 'grill', pattern: /\b(grill|grilled|bbq|barbecue|nuong)\b/, tags: ['Grill', 'BBQ'] },
    { key: 'snack', pattern: /\b(snacks?|appetizers?|starters?|sides?|an vat|khai vi|mon an kem)\b/, tags: ['Snack', 'Dumplings'] },
    { key: 'drink', pattern: /\b(drinks?|beverages?|thirsty|coffee|tea|boba|smoothies?|shakes?|milkshakes?|juice|lemonade|soda|latte|do uong|nuoc uong|thuc uong|giai khat|ca phe|cafe|tra sua|tra da|tra chanh|sinh to|nuoc ep)\b/, tags: [] },
    { key: 'dessert', pattern: /\b(desserts?|something sweet|sweet tooth|trang mieng|do ngot|banh ngot)\b/, tags: ['Dessert'] },
    { key: 'brunch', pattern: /\b(breakfast|brunch|bua sang|an sang)\b/, tags: ['Eggs', 'Brunch', 'Sandwich'] },
    { key: 'sandwich', pattern: /\b(sandwich|wrap|banh mi kep)\b/, tags: ['Sandwich', 'Wrap'] }
  ];

  function parsePreferences(rawText, freeText) {
    const raw = String(rawText || '').toLowerCase();
    const free = ` ${freeText} `;
    const prefs = { cuisines: [], tagBoosts: [], moods: [], spicy: 0, diet: null, maxPrice: null, maxPrep: null, people: null, quick: false, cheap: false, surprise: false };

    const minuteGuard = '(?!\\s*(?:minutes?|mins?|min|phút|phut)\\b)';
    const money = raw.match(new RegExp(`\\$\\s*(\\d+(?:\\.\\d+)?)|(\\d+(?:\\.\\d+)?)\\s*(?:\\$|dollars?|usd|bucks|đô|do\\b)|(?:under|below|less than|max|up to|budget(?: of)?|within|dưới|duoi|tối đa|toi da|không quá|khong qua|ngân sách|ngan sach)\\s*\\$?\\s*(\\d+(?:\\.\\d+)?)\\b${minuteGuard}`));
    if (money) prefs.maxPrice = Number(money[1] || money[2] || money[3]);
    const time = raw.match(/(?:under|within|less than|in|dưới|duoi|trong)\s*(\d+)\s*(?:minutes?|mins?|min|phút|phut)\b|\b(\d+)\s*(?:minutes?|mins?|min|phút|phut)\b/);
    if (time) prefs.maxPrep = Number(time[1] || time[2]);
    const people = free.match(/\b(?:for|cho)\s+(\d+|two|three|four|five|six|hai|ba|bon|nam|sau)\s*(?:people|persons|person|ppl|of us|nguoi)?\b/)
      || free.match(/\b(\d+|two|three|four|five|six|hai|ba|bon|nam|sau)\s+(?:people|persons|ppl|nguoi)\b/);
    if (people) {
      const count = readNumber(people[1]);
      if (count && count >= 2 && count <= 6 && !(prefs.maxPrep && Number(people[1]) === prefs.maxPrep)) prefs.people = count;
    }

    if (/\b(vegan|plant based|thuan chay)\b/.test(free)) prefs.diet = 'vegan';
    else if (/\b(vegetarian|veggie|meatless|no meat|chay|an chay|khong thit)\b/.test(free)) prefs.diet = 'vegetarian';
    else if (/\b(seafood|fish|shrimp|prawn|hai san|ca hoi)\b/.test(free)) prefs.diet = 'seafood';

    if (/\b(not spicy|no spice|mild|khong cay|it cay)\b/.test(free)) prefs.spicy = -1;
    else if (/\b(spicy|hot|heat|fiery|cay)\b/.test(free)) prefs.spicy = 1;

    if (/\b(asian|chau a|mon a)\b/.test(free)) prefs.cuisines.push(...ASIAN);
    CUISINE_PATTERNS.forEach(([cuisine, pattern]) => { if (pattern.test(free) && !prefs.cuisines.includes(cuisine)) prefs.cuisines.push(cuisine); });

    MOODS.forEach(mood => {
      if (mood.pattern.test(free)) { prefs.moods.push(mood.key); prefs.tagBoosts.push(...mood.tags); }
    });
    prefs.quick = /\b(quick|fast|hurry|busy|asap|nhanh|voi|gap)\b/.test(free);
    prefs.cheap = /\b(cheap|cheapest|affordable|value|re|tiet kiem)\b/.test(free);
    prefs.best = /\b(best ?sellers?|bestsellers?|popular|most ordered|signature|ban chay|pho bien|noi tieng|mon tu)\b/.test(free);
    prefs.surprise = /\b(surprise|anything|whatever|random|gi cung duoc|bat ky|tuy ban)\b/.test(free);
    prefs.openNow = /\b(open now|open|dang mo|mo cua|con mo)\b/.test(free);
    const miles = raw.match(/(?:within|under|in)?\s*(\d+(?:\.\d+)?)\s*(?:mi|miles?)\b/);
    prefs.maxDistance = miles ? Number(miles[1]) : /\b(near me|nearby|close by|gan day|gan toi|gan nhat)\b/.test(free) ? 1 : null;
    return prefs;
  }

  const seeded = id => {
    const day = Math.floor(Date.now() / 86400000);
    let hash = day;
    for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) % 9973;
    return hash / 9973;
  };

  function dietAllows(dish, diet) {
    if (!diet) return true;
    if (diet === 'vegan') return dish.diet === 'vegan';
    if (diet === 'vegetarian') return dish.diet === 'vegetarian' || dish.diet === 'vegan';
    if (diet === 'seafood') return dish.diet === 'seafood';
    return true;
  }

  function scoreDish(dish, prefs) {
    let score = dish.rating * 2 + Math.log10(dish.ratingCount) * 0.4 + (dish.isNew ? 0.15 : 0);
    if (prefs.cuisines.includes(dish.cuisine)) score += 4;
    prefs.tagBoosts.forEach(tag => { if (dish.tags.includes(tag)) score += 2.5; });
    if (prefs.moods.includes('fresh') && dish.tags.includes('Fried')) score -= 2;
    if (prefs.spicy > 0) score += dish.spicy * 1.5;
    if (prefs.spicy < 0) score -= dish.spicy * 2;
    if (prefs.quick) score += (25 - dish.prep) * 0.12;
    if (prefs.cheap) score += (20 - dish.price) * 0.15;
    if (prefs.surprise) score += seeded(dish.id) * 3;
    if (dish.bestSeller) score += prefs.best ? 4 : 0.2;
    // Starters and desserts only lead the list when someone asks for them.
    if (dish.course === 'appetizer' && !prefs.moods.includes('snack')) score -= 1.5;
    return score;
  }

  // Drinks and desserts are suggested only when asked for; otherwise recommendations are food.
  const courseAllows = (dish, prefs) => {
    if (prefs.moods.includes('drink')) return dish.course === 'drink';
    if (prefs.moods.includes('dessert')) return dish.course === 'dessert';
    return dish.course !== 'drink' && dish.course !== 'dessert';
  };

  // Applies hard filters, relaxing cuisine first and time second if nothing matches.
  function candidateDishes(dishes, prefs, { usePrice = true, ctx = null } = {}) {
    const notes = [];
    const base = dishes.filter(dish => courseAllows(dish, prefs) && dietAllows(dish, prefs.diet) && !(prefs.spicy < 0 && dish.spicy > 1));
    let pool = base;
    const restaurantOf = dish => (ctx && ctx.restaurants ? ctx.restaurants.find(restaurant => restaurant.id === dish.restaurantId) : null);
    if (prefs.openNow && SF.schedule && ctx) {
      const open = pool.filter(dish => restaurantOf(dish) && SF.schedule.dishAvailableAt(dish, restaurantOf(dish), ctx.now || new Date()));
      if (open.length) pool = open; else notes.push('open');
    }
    if (prefs.maxDistance && ctx) {
      const near = pool.filter(dish => restaurantOf(dish) && restaurantOf(dish).distance <= prefs.maxDistance);
      if (near.length) pool = near; else notes.push('distance');
    }
    if (prefs.cuisines.length) {
      const inCuisine = pool.filter(dish => prefs.cuisines.includes(dish.cuisine));
      if (inCuisine.length) pool = inCuisine; else notes.push('cuisine');
    }
    if (prefs.maxPrep) {
      const quick = pool.filter(dish => dish.prep <= prefs.maxPrep);
      if (quick.length) pool = quick; else notes.push('time');
    }
    if (usePrice && prefs.maxPrice) {
      const affordable = pool.filter(dish => dish.price <= prefs.maxPrice);
      if (affordable.length) pool = affordable; else notes.push('price');
    }
    return { pool: pool.length ? pool : base.length ? base : dishes, notes };
  }

  function recommend(dishes, prefs, count = 3, ctx = null) {
    const { pool, notes } = candidateDishes(dishes, prefs, { ctx });
    const ranked = pool.map(dish => ({ dish, score: scoreDish(dish, prefs) }))
      .sort((a, b) => b.score - a.score || a.dish.prep - b.dish.prep);
    // Keep picks varied: at most one dish per restaurant when possible.
    const picks = [];
    const usedRestaurants = new Set();
    ranked.forEach(({ dish }) => {
      if (picks.length < count && !usedRestaurants.has(dish.restaurantId)) { picks.push(dish); usedRestaurants.add(dish.restaurantId); }
    });
    ranked.forEach(({ dish }) => { if (picks.length < count && !picks.includes(dish)) picks.push(dish); });
    return { dishes: picks, notes };
  }

  // Picks `people` dishes from one restaurant (everyone eats together) that maximize preference
  // score while keeping the total with tax and fees (before tip) within the budget.
  function planMeal(dishes, prefs, ctx) {
    const people = Math.min(6, prefs.people || 2);
    const budgetCents = prefs.maxPrice ? Math.round(prefs.maxPrice * 100) : null;
    // A meal plan gives each person a main; drinks and starters can be added on top.
    const mains = dishes.filter(dish => dish.course === 'main');
    const { pool } = candidateDishes(mains.length ? mains : dishes, { ...prefs, moods: prefs.moods.filter(mood => mood !== 'drink') }, { usePrice: false, ctx });
    const byRestaurant = new Map();
    pool.forEach(dish => {
      if (!byRestaurant.has(dish.restaurantId)) byRestaurant.set(dish.restaurantId, []);
      byRestaurant.get(dish.restaurantId).push(dish);
    });
    let best = null;
    let cheapest = null;
    byRestaurant.forEach(menu => {
      const scored = menu.map(dish => ({ dish, score: scoreDish(dish, prefs) }));
      const choose = (start, picked) => {
        if (picked.length === people) {
          const counts = new Map();
          picked.forEach(({ dish }) => counts.set(dish.id, (counts.get(dish.id) || 0) + 1));
          const items = [...counts.entries()].map(([dishId, quantity]) => ({ dishId, quantity }));
          const totals = ctx.totalsFor(items);
          const score = picked.reduce((sum, item) => sum + item.score, 0) + counts.size * 0.8;
          const option = { items, totals, score };
          if (!cheapest || totals.totalBeforeTip < cheapest.totals.totalBeforeTip) cheapest = option;
          if ((budgetCents == null || totals.totalBeforeTip <= budgetCents) && (!best || score > best.score)) best = option;
          return;
        }
        for (let i = start; i < scored.length; i += 1) choose(i, [...picked, scored[i]]);
      };
      choose(0, []);
    });
    return { people, best, cheapest, budgetCents };
  }

  const joinList = (parts, vi) => {
    if (parts.length <= 1) return parts[0] || '';
    return `${parts.slice(0, -1).join(', ')} ${vi ? 'và' : 'and'} ${parts[parts.length - 1]}`;
  };

  // ---------- Booking a table: restaurant, party size, day, and time ----------
  // The longest restaurant name or alias in the text, e.g. "nonnas" or "little saigon".
  function findRestaurant(text, restaurants = []) {
    const words = ` ${normalize(text)} `;
    let best = null;
    restaurants.forEach(restaurant => {
      [restaurant.name, ...(restaurant.aliases || [])].map(normalize).filter(Boolean).forEach(phrase => {
        if (words.includes(` ${phrase} `) && (!best || phrase.length > best.phrase.length)) best = { restaurant, phrase };
      });
    });
    return best;
  }

  const PARTY_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, mot: 1, hai: 2, ba: 3, bon: 4, nam: 5, sau: 6, bay: 7, tam: 8, chin: 9, muoi: 10 };
  // "table for 4", "party of six", "6 people", "đặt bàn 6 người" -> 1 to 12, or null.
  function parseParty(text) {
    const words = normalize(text);
    const patterns = [
      /\b(?:for|cho|party of|group of|nhom)\s+(\d{1,2}|[a-z]+)(?:\s+(?:people|persons|person|ppl|guests|nguoi|of us))?\b/,
      /\b(\d{1,2}|[a-z]+)\s+(?:people|persons|ppl|guests|nguoi)\b/
    ];
    for (const pattern of patterns) {
      const match = words.match(pattern);
      if (!match) continue;
      const value = /^\d+$/.test(match[1]) ? Number(match[1]) : PARTY_WORDS[match[1]];
      if (value >= 1 && value <= 12) return value;
    }
    return null;
  }

  const WEEKDAYS = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
  const VI_WEEKDAYS = { 'chu nhat': 0, 'thu hai': 1, 'thu ba': 2, 'thu tu': 3, 'thu nam': 4, 'thu sau': 5, 'thu bay': 6 };
  const VI_DAY_NAMES = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  // Day and time from "tomorrow at 7:30pm", "friday 12:30", "7h tối", "lúc 6 giờ chiều mai".
  // Vietnamese "tối" (evening) and "tôi" (I) look the same without accents, so evening
  // words are read from the accented text.
  function parseWhen(rawText, now = new Date()) {
    const raw = String(rawText || '').toLowerCase();
    const folded = raw.replace(/đ/g, 'd').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9:]+/g, ' ');
    let dayOffset = 0;
    if (/\b(tomorrow|tmrw|ngay mai|toi mai|sang mai|trua mai|chieu mai)\b/.test(folded)) dayOffset = 1;
    else {
      const vi = Object.keys(VI_WEEKDAYS).find(key => new RegExp(`\\b${key}\\b`).test(folded));
      const en = Object.keys(WEEKDAYS).find(key => new RegExp(`\\b${key}\\b`).test(folded));
      const target = vi ? VI_WEEKDAYS[vi] : en ? WEEKDAYS[en] : null;
      if (target != null) dayOffset = (target - now.getDay() + 7) % 7;
    }
    const evening = /tối|chiều/.test(raw) || /\b(tonight|evening|dinner|toi nay)\b/.test(folded) || /\d\s*(?:h|gio)\s*(?:\d{2})?\s*(?:toi|chieu)\b/.test(folded);
    const morning = /sáng/.test(raw) || /\b(morning|breakfast)\b/.test(folded) || /\d\s*(?:h|gio)\s*(?:\d{2})?\s*sang\b/.test(folded);
    const toEvening = hours => (hours < 12 && !morning && (evening || hours <= 10) ? hours + 12 : hours);
    let hours = null;
    let minutes = 0;
    let match;
    if ((match = folded.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/))) { hours = (Number(match[1]) % 12) + (match[3] === 'pm' ? 12 : 0); minutes = Number(match[2] || 0); }
    else if ((match = folded.match(/\b(\d{1,2}):(\d{2})\b/))) { hours = Number(match[1]); minutes = Number(match[2]); if (hours < 12 && evening) hours += 12; }
    else if ((match = folded.match(/\b(\d{1,2})\s*(?:h|gio)(?:\s*(\d{2}))?\b/))) { hours = toEvening(Number(match[1])); minutes = Number(match[2] || 0); }
    else if ((match = folded.match(/\b(?:at|luc|vao luc|around|khoang)\s+(\d{1,2})\b/))) hours = toEvening(Number(match[1]));
    else if (/\b(noon|lunch|trua)\b/.test(folded)) hours = 12;
    else if (/\b(dinner|tonight|toi nay)\b/.test(folded) || /tối/.test(raw)) hours = 19;
    else if (/\bbrunch\b/.test(folded)) hours = 11;
    else if (morning) hours = 9;
    const valid = hours != null && hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60;
    return { dayOffset, minutes: valid ? hours * 60 + minutes : null };
  }

  function bookingRequest(text, ctx, restaurantMatch, now) {
    const S = SF.schedule;
    const party = parseParty(text);
    const { dayOffset, minutes } = parseWhen(text, now);
    let restaurant = restaurantMatch ? restaurantMatch.restaurant : null;
    if (!restaurant) {
      const prefs = parsePreferences(text, normalize(text));
      if (prefs.cuisines.length) restaurant = [...(ctx.restaurants || [])].filter(item => prefs.cuisines.some(cuisine => item.cuisine.includes(cuisine))).sort((a, b) => b.rating - a.rating)[0] || null;
    }
    let note = '';
    let timeText = '';
    const day = S ? S.addDays(S.startOfDay(now), dayOffset) : null;
    if (S && minutes != null) timeText = S.formatTime(S.at(day, minutes));
    if (S && restaurant) {
      const slots = S.tableSlots(restaurant, day, now).map(slot => S.minutesOf(slot));
      if (!slots.length) note = 'closed';
      else if (minutes != null && !slots.includes(minutes)) note = 'nearest';
    }
    const dayEn = dayOffset === 0 ? 'today' : dayOffset === 1 ? 'tomorrow' : `on ${day ? day.toLocaleDateString('en-US', { weekday: 'long' }) : 'that day'}`;
    const dayVi = dayOffset === 0 ? 'hôm nay' : dayOffset === 1 ? 'ngày mai' : (day ? VI_DAY_NAMES[day.getDay()] : '');
    const reply = t => {
      const en = [`Opening a table${party ? ` for ${party}` : ''}${restaurant ? ` at ${restaurant.name}` : ''}${timeText ? ` ${dayEn} at ${timeText}` : dayOffset ? ` ${dayEn}` : ''}.`];
      const vi = [`Mình mở form đặt bàn${party ? ` ${party} người` : ''}${restaurant ? ` tại ${restaurant.name}` : ''}${timeText ? ` lúc ${timeText} ${dayVi}` : dayOffset ? ` ${dayVi}` : ''}.`];
      if (note === 'nearest') { en.push("That exact time isn't open, so the closest time is selected."); vi.push('Giờ đó không còn bàn nên mình chọn giờ gần nhất.'); }
      if (note === 'closed') { en.push(`${restaurant.name} has no tables that day, so the next open day is selected.`); vi.push(`${restaurant.name} không nhận bàn ngày đó nên mình chọn ngày gần nhất còn bàn.`); }
      if (!restaurant) { en.push('Pick a restaurant,'); vi.push('Bạn chọn nhà hàng,'); }
      en.push(restaurant ? 'Check the details and tap Book table.' : 'then check the details and tap Book table.');
      vi.push(restaurant ? 'Bạn kiểm tra rồi bấm Book table nhé.' : 'rồi kiểm tra và bấm Book table nhé.');
      return t(en.join(' '), vi.join(' '));
    };
    return { restaurant, party, dayOffset, minutes, reply };
  }

  /**
   * @param {string} text  what the person typed
   * @param {object} ctx   { dishes, restaurants, cart: [{dishId, quantity}], mode, state, totalsFor(items), now }
   * @returns {{reply:string, actions:object[], dishIds:string[], offer:object|null, showSummary:boolean}}
   */
  function respond(text, ctx) {
    const vi = isVietnamese(text);
    const t = (en, viText) => (vi ? viText : en);
    const restaurantMatch = findRestaurant(text, ctx.restaurants);
    const dishText = restaurantMatch ? ` ${normalize(text)} `.replace(` ${restaurantMatch.phrase} `, ' ') : text;
    const { mentions, freeText } = findMentions(dishText, ctx.dishes);
    const free = ` ${freeText} `;
    const now = ctx.now || new Date();
    const result = { reply: '', actions: [], dishIds: [], offer: null, showSummary: false, language: vi ? 'vi' : 'en' };
    const dishName = id => (ctx.dishes.find(dish => dish.id === id) || {}).name || id;
    const replies = [];

    const wantsClear = /\b(clear|empty|reset|start over)\b.*\b(cart|order|bag|everything|all)\b|\b(xoa|huy) (het|tat ca|toan bo|gio|don)\b|\blam lai don\b/.test(free);
    const wantsCheckout = /\b(checkout|check out|place (the |my )?order|pay now|proceed to (checkout|payment)|thanh toan|chot don)\b/.test(free);
    const wantsRemove = /\b(remove|delete|take off|drop|minus|cancel|bo|xoa|bot|huy|loai)\b/.test(free);
    const wantsAdd = /\b(add|order|get|want|buy|take|have|give|grab|another|plus|them|dat|lay|mua|goi|cho)\b/.test(free);
    const wantsPickup = /\b(pick ?up|takeout|take out|carry ?out|to go|tu lay|den lay|tu den lay|lay tai quan|mang ve|mang di)\b/.test(free);
    const wantsDelivery = /\b(deliver|delivery|delivered|giao hang|giao tan noi|giao do an|giao den|ship|shipper)\b/.test(free);
    const wantsDineIn = /\b(dine ?in|eat (?:in|there|at the restaurant)|an tai quan|an tai cho|an o quan|an tai nha hang|ngoi an)\b/.test(free);
    const wantsBooking = /\b(book|booking|reserve|reservation|table for|a table|dat ban|dat cho|giu ban|giu cho|dat truoc)\b/.test(free);
    const wantsCheckin = /\b(check ?in|we re here|we are here|i m here|i am here|da den|den roi|den noi)\b/.test(free);
    const wantsOrders = /\b(my orders|order history|past orders|previous orders|my reservations?|lich su|don cua toi|don hang cua toi|don da dat)\b/.test(free);
    const wantsSplit = /\b(split|share the bill|chia tien|chia bill|chia hoa don|chia deu|tra rieng)\b/.test(free);
    const wantsTotal = /\b(total|tax|taxes|how much|cost|bill|tong|thue|bao nhieu|tinh tien)\b/.test(free);
    const wantsHelp = /\b(help|what can you do|giup|huong dan|lam duoc gi)\b/.test(free);

    let cart = ctx.cart.map(item => ({ ...item }));
    const cartQuantity = id => (cart.find(item => item.dishId === id) || {}).quantity || 0;

    if (wantsClear) {
      result.actions.push({ type: 'clear' });
      cart = [];
      replies.push(t('Your order is now empty.', 'Đã xóa toàn bộ đơn hàng.'));
    }

    const specific = mentions.filter(mention => mention.ids.length === 1);
    const ambiguous = mentions.filter(mention => mention.ids.length > 1);

    if (specific.length && wantsRemove && !wantsClear) {
      const removed = [];
      specific.forEach(({ ids: [id], quantity }) => {
        const inCart = cartQuantity(id);
        if (!inCart) { replies.push(t(`${dishName(id)} isn't in your order.`, `${dishName(id)} không có trong đơn.`)); return; }
        const amount = quantity ? Math.min(quantity, inCart) : inCart;
        result.actions.push({ type: 'remove', dishId: id, quantity: quantity ? amount : 0 });
        cart = cart.map(item => item.dishId === id ? { ...item, quantity: item.quantity - amount } : item).filter(item => item.quantity > 0);
        removed.push(`${amount} × ${dishName(id)}`);
      });
      if (removed.length) { replies.push(t(`Removed ${joinList(removed)}.`, `Đã bỏ ${joinList(removed, true)}.`)); result.showSummary = true; }
    } else if (specific.length && (wantsAdd || specific.some(mention => mention.quantity && !mention.weak)) && !(wantsTotal && !wantsAdd)) {
      const added = specific.map(({ ids: [id], quantity }) => {
        const amount = Math.min(20, quantity || 1);
        result.actions.push({ type: 'add', dishId: id, quantity: amount });
        const existing = cart.find(item => item.dishId === id);
        if (existing) existing.quantity += amount; else cart.push({ dishId: id, quantity: amount });
        return `${amount} × ${dishName(id)}`;
      });
      replies.push(t(`Added ${joinList(added)} to your order.`, `Đã thêm ${joinList(added, true)} vào đơn hàng.`));
      result.showSummary = true;
    } else if (specific.length) {
      result.dishIds = specific.map(mention => mention.ids[0]);
      if (wantsTotal) {
        const prices = specific.map(({ ids: [id] }) => {
          const dish = ctx.dishes.find(item => item.id === id);
          return `${dish.name} ${t('is', 'giá')} $${dish.price.toFixed(2)}`;
        });
        replies.push(t(`${joinList(prices)} before tax.`, `${joinList(prices, true)} (chưa thuế).`));
        result.priceAnswered = true;
      } else {
        replies.push(t('Here it is. Tap Add to put it in your order.', 'Món bạn hỏi đây. Bấm Thêm để cho vào đơn nhé.'));
      }
    }

    if (ambiguous.length && !specific.length) {
      result.dishIds = [...new Set(ambiguous.flatMap(mention => mention.ids))].slice(0, 4);
      replies.push(t('Which one did you mean? Here are the options:', 'Bạn muốn món nào? Đây là các lựa chọn:'));
    }

    if (wantsDelivery) {
      replies.push(t("SmartFoodie doesn't deliver. You can dine in, book a table, or order ahead and pick it up.", 'SmartFoodie không giao hàng. Bạn có thể ăn tại quán, đặt bàn trước, hoặc đặt món rồi tự đến lấy.'));
    }

    if (wantsBooking) {
      const booking = bookingRequest(text, ctx, restaurantMatch, now);
      if (ctx.mode !== 'reservation') result.actions.push({ type: 'mode', mode: 'reservation' });
      result.actions.push({ type: 'reserve', restaurantId: booking.restaurant ? booking.restaurant.id : null, party: booking.party, dayOffset: booking.dayOffset, minutes: booking.minutes });
      replies.push(booking.reply(t));
    } else if ((wantsPickup || wantsDineIn) && !wantsDelivery) {
      const mode = wantsPickup ? 'pickup' : 'dinein';
      if (mode !== ctx.mode) {
        result.actions.push({ type: 'mode', mode });
        replies.push(mode === 'pickup'
          ? t('Switched to pickup: order ahead and pick it up when it is ready.', 'Đã chuyển sang tự đến lấy: đặt trước rồi đến lấy khi món xong.')
          : t('Switched to dine-in: check in when you arrive and your food is served at the table.', 'Đã chuyển sang ăn tại quán: check-in khi đến nơi, món sẽ được mang ra bàn.'));
      }
      result.showSummary = result.showSummary || cart.length > 0;
    }

    if (wantsCheckin && !wantsBooking) {
      result.actions.push({ type: 'checkin' });
      replies.push(t('Opening check-in for your next table. Tap each friend as they arrive, then check in your group.', 'Đang mở check-in cho bàn sắp tới. Chạm vào tên từng bạn khi họ đến, rồi check-in cả nhóm.'));
    }
    if (wantsSplit) {
      result.actions.push({ type: 'split' });
      replies.push(t('Opening the bill splitter. Split evenly or by who had what, then share each person\'s amount.', 'Đang mở phần chia tiền. Chia đều hoặc theo món từng người gọi, rồi gửi số tiền cho mỗi người.'));
    }
    if (wantsOrders && !wantsSplit && !wantsCheckin) {
      result.actions.push({ type: 'orders' });
      replies.push(t('Here are your orders and reservations.', 'Đây là các đơn và lịch đặt bàn của bạn.'));
    }

    if (wantsCheckout) {
      if (cart.length) {
        result.actions.push({ type: 'checkout' });
        replies.push(t('Opening checkout. Review the total with tax, then place your order.', 'Đang mở trang thanh toán. Bạn kiểm tra tổng tiền (đã gồm thuế) rồi bấm đặt hàng nhé.'));
      } else {
        replies.push(t('Your order is empty. Add a dish first, for example "add 1 pho".', 'Đơn hàng đang trống. Hãy thêm món trước, ví dụ "thêm 1 phở".'));
      }
    }

    if (wantsTotal && !wantsCheckout && !wantsSplit && !result.priceAnswered) {
      if (cart.length) { replies.push(t("Here's your current total:", 'Tổng đơn hiện tại của bạn:')); result.showSummary = true; }
      else replies.push(t('Your order is empty, so the total is $0.00.', 'Đơn hàng đang trống nên tổng là $0.00.'));
    }

    if (replies.length) {
      result.reply = replies.join(' ');
      return result;
    }

    if (wantsHelp) {
      result.reply = t('I can recommend dishes, plan a meal for a group, book a table, switch between dine-in and pickup, check in your group, split the bill, and show your total with tax. Try "book a table for 4 at 7pm", "add 2 pho", or "dinner for 3 under $50".',
        'Mình có thể gợi ý món, lên thực đơn cho nhóm, đặt bàn, chuyển giữa ăn tại quán và tự đến lấy, check-in cho nhóm, chia tiền, và tính tổng tiền kèm thuế. Thử: "đặt bàn 4 người lúc 7h tối", "thêm 2 phở", hoặc "bữa tối cho 3 người dưới $50".');
      return result;
    }

    // Recommendations and meal planning.
    const prefs = parsePreferences(text, freeText);
    if (prefs.people) {
      const plan = planMeal(ctx.dishes, prefs, ctx);
      const option = plan.best || plan.cheapest;
      if (option) {
        const money = SF.formatMoney ? SF.formatMoney(option.totals.totalBeforeTip) : `$${(option.totals.totalBeforeTip / 100).toFixed(2)}`;
        const restaurantName = ((ctx.restaurants || []).find(r => r.id === ctx.dishes.find(d => d.id === option.items[0].dishId).restaurantId) || {}).name || '';
        result.offer = { items: option.items };
        result.dishIds = option.items.map(item => item.dishId);
        if (plan.best) {
          result.reply = plan.budgetCents
            ? t(`Here's a meal for ${plan.people} from ${restaurantName} that fits $${prefs.maxPrice} including estimated tax and fees: ${money} before tip.`, `Đây là bữa ăn cho ${plan.people} người từ ${restaurantName}, vừa ngân sách $${prefs.maxPrice} (đã gồm thuế và phí ước tính): ${money} chưa gồm tip.`)
            : t(`Here's a well-rated meal for ${plan.people} from ${restaurantName}: ${money} including estimated tax and fees, before tip.`, `Đây là bữa ăn được đánh giá cao cho ${plan.people} người từ ${restaurantName}: ${money} đã gồm thuế và phí ước tính, chưa gồm tip.`);
        } else {
          result.reply = t(`I couldn't fit ${plan.people} dishes into $${prefs.maxPrice} once tax and fees are included. The most affordable option is ${money} before tip:`, `Không thể chọn ${plan.people} món trong $${prefs.maxPrice} khi đã tính thuế và phí. Lựa chọn rẻ nhất là ${money} chưa gồm tip:`);
        }
        return result;
      }
    }

    const { dishes: picks, notes } = recommend(ctx.dishes, prefs, 3, ctx);
    result.dishIds = picks.map(dish => dish.id);
    let opening = t('Here are a few tasty matches:', 'Đây là vài món hợp với yêu cầu của bạn:');
    if (prefs.moods.includes('drink')) opening = t('Something to sip? These drinks are customer favorites:', 'Muốn uống gì đó? Đây là vài đồ uống được yêu thích:');
    else if (prefs.best) opening = t('Our best sellers right now:', 'Các món bán chạy nhất hiện nay:');
    else if (prefs.moods.includes('comfort')) opening = t('A cozy, comforting meal might hit the spot. A few ideas:', 'Một món ấm áp sẽ hợp lúc này. Vài gợi ý cho bạn:');
    else if (prefs.moods.includes('fresh')) opening = t("Let's keep it fresh and light. These could be a good fit:", 'Nhẹ nhàng và tươi mát nhé. Các món này có thể hợp với bạn:');
    else if (prefs.spicy > 0) opening = t('A little heat coming up:', 'Muốn ăn cay? Đây là vài món đậm vị:');
    else if (prefs.quick || prefs.maxPrep) opening = t('Short on time? These are among the quickest:', 'Đang vội? Đây là các món làm nhanh nhất:');
    else if (prefs.surprise) opening = t("Today's surprise picks:", 'Gợi ý bất ngờ hôm nay:');
    const extra = [];
    if (prefs.maxPrice && !notes.includes('price')) extra.push(t(`All under $${prefs.maxPrice} before tax.`, `Tất cả dưới $${prefs.maxPrice} (chưa thuế).`));
    if (notes.includes('price')) extra.push(t(`Nothing matched under $${prefs.maxPrice}, so these are the closest picks.`, `Không có món nào dưới $${prefs.maxPrice}, đây là các món gần nhất.`));
    if (notes.includes('time')) extra.push(t(`Nothing is ready within ${prefs.maxPrep} minutes, so these are the fastest options.`, `Không có món nào xong trong ${prefs.maxPrep} phút, đây là các món nhanh nhất.`));
    if (notes.includes('cuisine')) extra.push(t("That cuisine isn't on the menu yet, so here are similar favorites.", 'Thực đơn chưa có món theo kiểu này, đây là các món tương tự.'));
    if (notes.includes('open')) extra.push(t('Nothing that matches is open right now, so these are for later (book a table or schedule a pickup).', 'Hiện chưa có quán nào phù hợp đang mở cửa, đây là gợi ý cho lúc khác (đặt bàn hoặc hẹn giờ lấy).'));
    else if (prefs.openNow) extra.push(t('All open now.', 'Tất cả đang mở cửa.'));
    if (notes.includes('distance')) extra.push(t(`Nothing matched within ${prefs.maxDistance} mi, so these are a bit farther.`, `Không có món phù hợp trong vòng ${prefs.maxDistance} dặm, đây là các món xa hơn một chút.`));
    else if (prefs.maxDistance) extra.push(t(`All within ${prefs.maxDistance} mi.`, `Tất cả trong vòng ${prefs.maxDistance} dặm.`));
    result.reply = [opening, ...extra].join(' ');
    return result;
  }

  SF.assistant = { normalize, findMentions, parsePreferences, recommend, planMeal, respond, isVietnamese, findRestaurant, parseParty, parseWhen };
  if (typeof module !== 'undefined' && module.exports) module.exports = SF;
})(typeof window !== 'undefined' ? window : globalThis);
