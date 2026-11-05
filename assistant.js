// On-device ordering assistant. Understands English and Vietnamese requests such as
// "add 2 pho for pickup", "thêm 2 phở", "something spicy under $15", or
// "dinner for 3 under $50", and turns them into cart actions and recommendations.
// The same action format is used by the Claude-powered assistant in serve.py.
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
    'tacos': ['street-tacos', 'carnitas-tacos', 'chicken-taco-pair'],
    'taco': ['street-tacos', 'carnitas-tacos', 'chicken-taco-pair'],
    'curry': ['red-curry', 'butter-chicken', 'tikka-masala', 'chana-masala'],
    'cari': ['red-curry', 'butter-chicken', 'tikka-masala', 'chana-masala'],
    'burger': ['cheeseburger', 'smash-burger'],
    'burgers': ['cheeseburger', 'smash-burger'],
    'fried chicken': ['two-piece-meal', 'korean-fried-chicken'],
    'ga ran': ['two-piece-meal', 'korean-fried-chicken'],
    'sushi': ['salmon-sushi-set', 'chirashi'],
    'chicken': [],
    'noodles': [],
    'pasta': ['penne-pomodoro', 'bolognese']
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
    || /\b(toi|minh|muon|cho|mon|them|bot|nguoi|duoi|re|ngon|an gi|goi y|giao|thanh toan|bao nhieu|khong)\b/.test(normalize(text));

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
    { key: 'snack', pattern: /\b(snack|appetizer|starter|an vat|khai vi)\b/, tags: ['Snack', 'Dumplings'] },
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
    prefs.surprise = /\b(surprise|anything|whatever|random|gi cung duoc|bat ky|tuy ban)\b/.test(free);
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
    return score;
  }

  // Applies hard filters, relaxing cuisine first and time second if nothing matches.
  function candidateDishes(dishes, prefs, { usePrice = true } = {}) {
    const notes = [];
    const base = dishes.filter(dish => dietAllows(dish, prefs.diet) && !(prefs.spicy < 0 && dish.spicy > 1));
    let pool = base;
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

  function recommend(dishes, prefs, count = 3) {
    const { pool, notes } = candidateDishes(dishes, prefs);
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

  // Picks `people` dishes from one restaurant (one delivery fee) that maximize preference
  // score while keeping the total with tax and fees (before tip) within the budget.
  function planMeal(dishes, prefs, ctx) {
    const people = Math.min(6, prefs.people || 2);
    const budgetCents = prefs.maxPrice ? Math.round(prefs.maxPrice * 100) : null;
    const { pool } = candidateDishes(dishes, prefs, { usePrice: false });
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

  /**
   * @param {string} text  what the person typed
   * @param {object} ctx   { dishes, cart: [{dishId, quantity}], mode, state, totalsFor(items) }
   * @returns {{reply:string, actions:object[], dishIds:string[], offer:object|null, showSummary:boolean}}
   */
  function respond(text, ctx) {
    const vi = isVietnamese(text);
    const t = (en, viText) => (vi ? viText : en);
    const { mentions, freeText } = findMentions(text, ctx.dishes);
    const free = ` ${freeText} `;
    const result = { reply: '', actions: [], dishIds: [], offer: null, showSummary: false, language: vi ? 'vi' : 'en' };
    const dishName = id => (ctx.dishes.find(dish => dish.id === id) || {}).name || id;
    const replies = [];

    const wantsClear = /\b(clear|empty|reset|start over)\b.*\b(cart|order|bag|everything|all)\b|\b(xoa|huy) (het|tat ca|toan bo|gio|don)\b|\blam lai don\b/.test(free);
    const wantsCheckout = /\b(checkout|check out|place (the |my )?order|pay now|proceed to (checkout|payment)|thanh toan|chot don)\b/.test(free);
    const wantsRemove = /\b(remove|delete|take off|drop|minus|cancel|bo|xoa|bot|huy|loai)\b/.test(free);
    const wantsAdd = /\b(add|order|get|want|buy|take|have|give|grab|another|plus|them|dat|lay|mua|goi|cho)\b/.test(free);
    const wantsPickup = /\b(pick ?up|takeout|carry ?out|tu lay|den lay|tu den lay|lay tai quan|mang ve)\b/.test(free);
    const wantsDelivery = !wantsPickup && /\b(deliver|delivery|delivered|giao|ship)\b/.test(free);
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

    if (wantsPickup || wantsDelivery) {
      const mode = wantsPickup ? 'pickup' : 'delivery';
      if (mode !== ctx.mode) {
        result.actions.push({ type: 'mode', mode });
        replies.push(mode === 'pickup'
          ? t('Switched to pickup: no delivery fee or tip.', 'Đã chuyển sang tự đến lấy: không mất phí giao hàng và tiền tip.')
          : t('Switched to delivery.', 'Đã chuyển sang giao hàng tận nơi.'));
      }
      result.showSummary = result.showSummary || cart.length > 0;
    }

    if (wantsCheckout) {
      if (cart.length) {
        result.actions.push({ type: 'checkout' });
        replies.push(t('Opening checkout. Review the total with tax, then place your order.', 'Đang mở trang thanh toán. Bạn kiểm tra tổng tiền (đã gồm thuế) rồi bấm đặt hàng nhé.'));
      } else {
        replies.push(t('Your order is empty. Add a dish first, for example "add 1 pho".', 'Đơn hàng đang trống. Hãy thêm món trước, ví dụ "thêm 1 phở".'));
      }
    }

    if (wantsTotal && !wantsCheckout && !result.priceAnswered) {
      if (cart.length) { replies.push(t("Here's your current total:", 'Tổng đơn hiện tại của bạn:')); result.showSummary = true; }
      else replies.push(t('Your order is empty, so the total is $0.00.', 'Đơn hàng đang trống nên tổng là $0.00.'));
    }

    if (replies.length) {
      result.reply = replies.join(' ');
      return result;
    }

    if (wantsHelp) {
      result.reply = t('I can recommend dishes, plan a meal for a group, add or remove items, switch delivery or pickup, and show your total with tax. Try "add 2 pho", "something spicy under $15", or "dinner for 3 under $50".',
        'Mình có thể gợi ý món, lên thực đơn cho nhóm, thêm/bớt món, chuyển giao hàng hoặc tự lấy, và tính tổng tiền kèm thuế. Thử: "thêm 2 phở", "món cay dưới $15", hoặc "bữa tối cho 3 người dưới $50".');
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

    const { dishes: picks, notes } = recommend(ctx.dishes, prefs, 3);
    result.dishIds = picks.map(dish => dish.id);
    let opening = t('Here are a few tasty matches:', 'Đây là vài món hợp với yêu cầu của bạn:');
    if (prefs.moods.includes('comfort')) opening = t('A cozy, comforting meal might hit the spot. A few ideas:', 'Một món ấm áp sẽ hợp lúc này. Vài gợi ý cho bạn:');
    else if (prefs.moods.includes('fresh')) opening = t("Let's keep it fresh and light. These could be a good fit:", 'Nhẹ nhàng và tươi mát nhé. Các món này có thể hợp với bạn:');
    else if (prefs.spicy > 0) opening = t('A little heat coming up:', 'Muốn ăn cay? Đây là vài món đậm vị:');
    else if (prefs.quick || prefs.maxPrep) opening = t('Short on time? These are among the quickest:', 'Đang vội? Đây là các món làm nhanh nhất:');
    else if (prefs.surprise) opening = t("Today's surprise picks:", 'Gợi ý bất ngờ hôm nay:');
    const extra = [];
    if (prefs.maxPrice && !notes.includes('price')) extra.push(t(`All under $${prefs.maxPrice} before tax.`, `Tất cả dưới $${prefs.maxPrice} (chưa thuế).`));
    if (notes.includes('price')) extra.push(t(`Nothing matched under $${prefs.maxPrice}, so these are the closest picks.`, `Không có món nào dưới $${prefs.maxPrice}, đây là các món gần nhất.`));
    if (notes.includes('time')) extra.push(t(`Nothing is ready within ${prefs.maxPrep} minutes, so these are the fastest options.`, `Không có món nào xong trong ${prefs.maxPrep} phút, đây là các món nhanh nhất.`));
    if (notes.includes('cuisine')) extra.push(t("That cuisine isn't on the menu yet, so here are similar favorites.", 'Thực đơn chưa có món theo kiểu này, đây là các món tương tự.'));
    result.reply = [opening, ...extra].join(' ');
    return result;
  }

  SF.assistant = { normalize, findMentions, parsePreferences, recommend, planMeal, respond, isVietnamese };
  if (typeof module !== 'undefined' && module.exports) module.exports = SF;
})(typeof window !== 'undefined' ? window : globalThis);
