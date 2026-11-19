// SmartFoodie app: browsing, search, your order (cart), and checkout for dine-in, reservations,
// and pickup, plus the AI assistant chat. Order history, group check-in, bill splitting, and
// reviews live in orders.js. There is no delivery.
(() => {
  const SF = window.SF;
  const { $, $$, esc, icon, usd, cents, store, toast, img, openDialog, stars, timeAgo, initials, shortName, plural, makeQr, copyText } = SF.ui;
  const S = SF.schedule;
  const MODES = SF.MODES;
  const normalize = SF.search.normalize;
  const restaurantOf = dish => SF.restaurantById.get(dish.restaurantId);
  const dishOf = line => SF.dishById.get(line.dishId);
  const PRICE_MAX = 30; // the price slider's top stop means "no limit"
  const TIP_CHOICES = [0, 10, 15, 18, 20];
  const ARRIVALS = [0, 10, 20, 30];
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  // Labels for the three ways to eat come from SF.MODES, so renaming one there renames it everywhere.
  $$('[data-mode-label]').forEach(el => { if (MODES[el.dataset.modeLabel]) el.textContent = MODES[el.dataset.modeLabel].label; });

  // ---------- Saved state (per device) ----------
  const sanitizeCart = lines => (Array.isArray(lines) ? lines : [])
    .filter(line => line && SF.dishById.has(line.dishId) && Number(line.quantity) > 0)
    .map(line => ({ dishId: line.dishId, quantity: Math.min(99, Math.floor(Number(line.quantity))), note: String(line.note || '').slice(0, 140) }));
  // Earlier versions had delivery; anyone who used it starts on pickup.
  const validMode = mode => (MODES[mode] ? mode : mode === 'delivery' ? 'pickup' : 'dinein');
  function sanitizeTips(saved) {
    const tips = {};
    SF.MODE_ORDER.forEach(mode => {
      const tip = saved && typeof saved === 'object' ? saved[mode] : null;
      const percent = tip && Number.isFinite(Number(tip.percent)) ? Number(tip.percent) : MODES[mode].tipDefault;
      const custom = tip && tip.custom != null && Number.isFinite(Number(tip.custom)) ? Math.max(0, Number(tip.custom)) : null;
      tips[mode] = { percent, custom };
    });
    return tips;
  }
  const sanitizeOrders = list => (Array.isArray(list) ? list : [])
    .filter(order => order && typeof order.id === 'string' && Array.isArray(order.items) && order.totals && Number.isFinite(order.placedAt))
    .map(order => ({ ...order, items: sanitizeCart(order.items) }))
    .slice(0, 40);

  const savedTax = store.get('taxState', 'CA');
  const savedRecent = store.get('recentSearches', []);
  const state = {
    category: 'all',
    chips: new Set(),
    sort: 'recommended',
    query: '',
    price: { min: 0, max: PRICE_MAX },
    radius: 0,
    mode: validMode(store.get('mode', 'dinein')),
    cart: sanitizeCart(store.get('cart', [])),
    location: store.get('location', null),
    taxState: SF.TAX_RATES[savedTax] ? savedTax : 'CA',
    budget: Number(store.get('budget', 25)) || 25,
    tips: sanitizeTips(store.get('tips', null)),
    orders: sanitizeOrders(store.get('orders', [])),
    recentSearches: (Array.isArray(savedRecent) ? savedRecent : []).filter(text => typeof text === 'string').slice(0, 6)
  };
  store.set('mode', state.mode);

  // ---------- Orders store (shared with orders.js) ----------
  const orders = {
    all: () => state.orders,
    get: id => state.orders.find(order => order.id === id) || null,
    add(order) {
      state.orders = [order, ...state.orders].slice(0, 40);
      orders.save();
    },
    update(id, changes) {
      const order = orders.get(id);
      if (!order) return null;
      Object.assign(order, typeof changes === 'function' ? changes(order) : changes);
      orders.save();
      return order;
    },
    save() {
      if (!store.set('orders', state.orders)) toast("Couldn't save on this device. Storage may be full.");
      myTodayCache = null;
      window.dispatchEvent(new CustomEvent('sf:orders'));
    }
  };
  // How many of each dish you ordered today, added to the sample "ordered today" numbers.
  let myTodayCache = null;
  function myOrderedToday(dishId, date) {
    const key = S.dayKey(date);
    if (!myTodayCache || myTodayCache.key !== key) {
      const counts = new Map();
      state.orders.forEach(order => {
        if (order.cancelledAt || !S.sameDay(new Date(order.placedAt), date)) return;
        order.items.forEach(item => counts.set(item.dishId, (counts.get(item.dishId) || 0) + item.quantity));
      });
      myTodayCache = { key, counts };
    }
    return myTodayCache.counts.get(dishId) || 0;
  }
  const orderedToday = (dish, date = new Date()) => S.orderedToday(dish, restaurantOf(dish), date) + myOrderedToday(dish.id, date);

  // ---------- Cart ----------
  const cartQuantity = dishId => state.cart.filter(line => line.dishId === dishId).reduce((sum, line) => sum + line.quantity, 0);
  const cartCount = () => state.cart.reduce((sum, line) => sum + line.quantity, 0);
  const cartRestaurantIds = () => [...new Set(state.cart.map(line => dishOf(line).restaurantId))];
  const pricingItems = lines => lines.map(line => {
    const dish = dishOf(line);
    return { price: dish.price, quantity: line.quantity, restaurantId: dish.restaurantId };
  });
  const totalsFor = (lines = state.cart, { includeTip = true, mode = state.mode } = {}) => {
    const tip = state.tips[mode] || { percent: 0, custom: null };
    return SF.computeTotals({
      items: pricingItems(lines), mode, state: state.taxState,
      tipPercent: includeTip ? tip.percent : 0, tipAmount: includeTip ? tip.custom : null
    });
  };
  const aggregatedCart = () => {
    const map = new Map();
    state.cart.forEach(line => map.set(line.dishId, (map.get(line.dishId) || 0) + line.quantity));
    return [...map.entries()].map(([dishId, quantity]) => ({ dishId, quantity }));
  };
  const saveCart = () => store.set('cart', state.cart);

  function addToCart(dishId, quantity = 1, note = '', { silent = false } = {}) {
    const dish = SF.dishById.get(dishId);
    if (!dish || quantity <= 0) return;
    const cleanNote = String(note || '').trim().slice(0, 140);
    const existing = state.cart.find(line => line.dishId === dishId && line.note === cleanNote);
    if (existing) existing.quantity = Math.min(99, existing.quantity + quantity);
    else state.cart.push({ dishId, quantity: Math.min(99, quantity), note: cleanNote });
    saveCart();
    cartChanged();
    const button = $('#cartButton');
    button.classList.remove('bump'); void button.offsetWidth; button.classList.add('bump');
    if (!silent) toast(`Added ${quantity} × ${dish.name}`);
  }
  function removeDish(dishId, quantity = 0) {
    let remaining = quantity > 0 ? quantity : Infinity;
    for (let i = state.cart.length - 1; i >= 0 && remaining > 0; i -= 1) {
      const line = state.cart[i];
      if (line.dishId !== dishId) continue;
      const take = Math.min(line.quantity, remaining);
      line.quantity -= take;
      remaining -= take;
      if (line.quantity <= 0) state.cart.splice(i, 1);
    }
    saveCart();
    cartChanged();
  }
  function setLineQuantity(index, quantity) {
    if (!state.cart[index]) return;
    if (quantity <= 0) state.cart.splice(index, 1);
    else state.cart[index].quantity = Math.min(99, quantity);
    saveCart();
    cartChanged();
  }
  function clearCart() {
    state.cart = [];
    saveCart();
    cartChanged();
  }

  function syncModeButtons() {
    $$('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === state.mode)));
  }
  function setMode(mode) {
    const next = MODES[mode] ? mode : state.mode;
    const changed = next !== state.mode;
    state.mode = next;
    store.set('mode', next);
    syncModeButtons();
    if (changed) renderBrowse({ keepScroll: true });
    if (checkoutDialog.open && next !== 'reservation' && !state.cart.length) {
      checkoutDialog.close();
      toast(`Add a dish first for ${MODES[next].label.toLowerCase()}`);
    }
    if (changed) delete $('#checkoutError').dataset.submitted; // new form, fresh error state
    cartChanged();
  }

  function cartChanged() {
    const count = cartCount();
    $('#cartCount').textContent = count;
    $('#cartButtonTotal').textContent = count ? cents(totalsFor(state.cart, { includeTip: false }).subtotal) : '';
    $('#cartButton').setAttribute('aria-label', count ? `Open your order: ${plural(count, 'item')}` : 'Open your order');
    $$('[data-add]').forEach(button => {
      const quantity = cartQuantity(button.dataset.add);
      button.classList.toggle('in-cart', quantity > 0);
      button.innerHTML = quantity ? `<span>${quantity}</span>` : icon('plus');
    });
    if ($('#cartDrawer').open) renderCart();
    if (checkoutDialog.open) {
      if (state.mode !== 'reservation' && !state.cart.length) { checkoutDialog.close(); return; }
      prepareCheckout();
      rerender(renderCheckout);
    }
  }

  // Re-render without losing keyboard focus: put focus back on the same control afterwards.
  function rerender(render) {
    const active = document.activeElement;
    let selector = null;
    if (active && active !== document.body) {
      if (active.id) selector = `#${CSS.escape(active.id)}`;
      else {
        const attr = [...active.attributes].find(item => item.name.startsWith('data-') && item.name !== 'data-failed');
        if (attr) selector = `[${attr.name}="${CSS.escape(attr.value)}"]`;
      }
    }
    render();
    if (selector) {
      const el = document.querySelector(selector);
      if (el && el !== document.activeElement && !el.disabled) el.focus({ preventScroll: true });
    }
  }

  // ---------- Times and labels for the current way of eating ----------
  const prepMode = () => (state.mode === 'pickup' ? 'pickup' : 'dinein');
  const dishPrep = (dish, date = new Date()) => S.prepFor(dish, prepMode(), restaurantOf(dish), date);
  function prepLabel(dish, date) {
    const minutes = dishPrep(dish, date);
    if (state.mode === 'pickup') return `Ready in ${minutes} min`;
    if (state.mode === 'reservation') return `${minutes} min prep`;
    return `Served in ${minutes} min`;
  }
  const milesText = restaurant => `${S.formatMiles(restaurant.distance)} · ${S.walkMinutes(restaurant.distance)} min walk`;
  const restaurantDishes = restaurant => restaurant.dishIds.map(id => SF.dishById.get(id));

  // ---------- Filters and sorting ----------
  const CHIP_TESTS = {
    open: (dish, t) => S.dishAvailableAt(dish, restaurantOf(dish), t),
    fast: (dish, t) => dishPrep(dish, t) <= 15,
    top: dish => dish.rating >= 4.8,
    vegetarian: dish => dish.diet === 'vegetarian' || dish.diet === 'vegan',
    spicy: dish => dish.spicy > 0,
    new: dish => dish.isNew,
    best: dish => dish.bestSeller
  };
  const priceActive = () => state.price.min > 0 || state.price.max < PRICE_MAX;
  const priceOk = dish => dish.price >= state.price.min && (state.price.max >= PRICE_MAX || dish.price <= state.price.max);
  const radiusOk = restaurant => !state.radius || restaurant.distance <= state.radius;
  const filtering = () => Boolean(state.category !== 'all' || state.query || state.chips.size || priceActive() || state.radius);

  const searchIndex = SF.search.createIndex({ dishes: SF.dishes, restaurants: SF.restaurants, restaurantOf, courseLabel: SF.courseLabel });
  // Filters typed into the search box that depend on the clock, distance, or order type.
  const queryTest = t => (dish, filters) => SF.search.basicFilter(dish, filters)
    && (!filters.openNow || S.dishAvailableAt(dish, restaurantOf(dish), t))
    && (!filters.maxDistance || restaurantOf(dish).distance <= filters.maxDistance)
    && (!filters.maxPrep || dishPrep(dish, t) <= filters.maxPrep);

  let lastSearch = null; // the parsed query behind the current results, for the subtitle
  function filteredDishes() {
    const t = new Date();
    const passes = dish => SF.dishMatchesCategory(dish, state.category)
      && [...state.chips].every(chip => CHIP_TESTS[chip](dish, t))
      && priceOk(dish) && radiusOk(restaurantOf(dish));
    let list;
    let relevance = null;
    lastSearch = null;
    if (state.query) {
      const test = queryTest(t);
      const found = SF.search.searchDishes(searchIndex, state.query, { test: (dish, filters) => passes(dish) && test(dish, filters) });
      lastSearch = found;
      list = found.results.map(result => result.item);
      relevance = new Map(found.results.map(result => [result.item.id, result.score]));
    } else {
      list = SF.dishes.filter(passes);
    }
    const open = dish => (S.dishAvailableAt(dish, restaurantOf(dish), t) ? 1 : 0);
    const recommended = dish => dish.rating * 2 + Math.log10(dish.ratingCount) * 0.6 + (dish.isNew ? 0.1 : 0) + open(dish) * 0.6;
    const sorters = {
      recommended: relevance ? (a, b) => relevance.get(b.id) - relevance.get(a.id) : (a, b) => recommended(b) - recommended(a),
      nearest: (a, b) => restaurantOf(a).distance - restaurantOf(b).distance || b.rating - a.rating,
      rating: (a, b) => b.rating - a.rating || b.ratingCount - a.ratingCount,
      price: (a, b) => a.price - b.price || b.rating - a.rating,
      fastest: (a, b) => dishPrep(a, t) - dishPrep(b, t) || b.rating - a.rating,
      popular: (a, b) => orderedToday(b, t) - orderedToday(a, t) || b.rating - a.rating
    };
    return list.sort(sorters[state.sort] || sorters.recommended);
  }

  // ---------- Cards ----------
  const ratingInline = dish => `<span class="stars-inline" aria-label="Rated ${dish.rating.toFixed(1)} out of 5 from ${dish.ratingCount} ratings">${icon('star')}${dish.rating.toFixed(1)} <small>(${dish.ratingCount})</small></span>`;
  const quickAdd = dish => {
    const quantity = cartQuantity(dish.id);
    return `<button type="button" class="quick-add${quantity ? ' in-cart' : ''}" data-add="${dish.id}" aria-label="Add ${esc(dish.name)} to order">${quantity ? `<span>${quantity}</span>` : icon('plus')}</button>`;
  };
  const badgeFor = dish => (dish.isNew ? '<span class="badge badge-new">New</span>'
    : dish.bestSeller ? '<span class="badge badge-best">Best seller</span>' : '');
  // The most helpful sample review to quote with a dish: the first 5-star one, else the first.
  const topReview = dish => dish.reviews.find(review => review.rating === 5) || dish.reviews[0] || null;
  const todayText = count => `${count} ordered today`;

  function dishCard(dish, { sizes = '(max-width: 760px) 46vw, 250px', heading = 'h3', t = new Date() } = {}) {
    const restaurant = restaurantOf(dish);
    const availability = S.dishAvailability(dish, restaurant, t);
    const today = orderedToday(dish, t);
    const quote = topReview(dish);
    return `<article class="dish-card${availability.now ? '' : ' is-unavailable'}">
      <div class="media-wrap">
        <button type="button" class="dish-media" data-open-dish="${dish.id}" aria-label="${esc(dish.name)}: details and reviews">
          ${img(dish.image, dish.imageAlt, { sizes })}
          ${badgeFor(dish)}
          ${dish.spicy > 1 ? '<span class="badge badge-spicy">Spicy</span>' : ''}
          ${availability.short ? `<span class="badge badge-avail${availability.now ? '' : ' off'}">${esc(availability.short)}</span>` : ''}
        </button>
        ${quickAdd(dish)}
      </div>
      <div class="dish-body">
        <${heading} class="dish-title">${esc(dish.name)}</${heading}>
        <div class="dish-line"><span class="price">${usd(dish.price)}</span><span class="dot">•</span>${ratingInline(dish)}</div>
        <button type="button" class="dish-rest" data-open-restaurant="${restaurant.id}">${icon('store')}<span>${esc(restaurant.name)}</span><small>${S.formatMiles(restaurant.distance)}</small></button>
        <div class="dish-stats">${today ? `<span class="stat-hot">${icon('flame')}${todayText(today)}</span>` : ''}<span>${icon('clock')}${prepLabel(dish, t)}</span></div>
        ${quote ? `<p class="dish-quote">“${esc(quote.text)}” <span>${esc(shortName(quote.name))} · ${'★'.repeat(quote.rating)}</span></p>` : ''}
      </div>
    </article>`;
  }

  // One swipeable row per course: Mains, Appetizers, Drinks, then Desserts. Empty rows are skipped.
  const ROW_COURSES = ['main', 'appetizer', 'drink', 'dessert'];
  function courseRows(prefix, items, { courseOf = item => item.course, card, rowClass = 'dish-row' }) {
    return ROW_COURSES.map(courseId => {
      const list = items.filter(item => courseOf(item) === courseId);
      if (!list.length) return '';
      const course = SF.COURSES.find(item => item.id === courseId);
      const id = `${prefix}-${courseId}`;
      const name = course.label.toLowerCase();
      return `<div class="course-row" role="group" aria-labelledby="${id}-title">
        <div class="course-head">
          <h3 id="${id}-title">${course.label} <span class="course-count">${list.length}</span></h3>
          <div class="scroller-nav"><button type="button" class="round-button" data-scroll="${id}" data-dir="-1" aria-label="Scroll ${name} left">${icon('left')}</button><button type="button" class="round-button" data-scroll="${id}" data-dir="1" aria-label="Scroll ${name} right">${icon('right')}</button></div>
        </div>
        <div class="h-scroller ${rowClass}" id="${id}">${list.map(card).join('')}</div>
      </div>`;
    }).join('');
  }

  // Dim a row's arrows when it can't scroll further that way.
  function syncScrollButtons(row) {
    const max = row.scrollWidth - row.clientWidth - 2;
    $$(`[data-scroll="${row.id}"]`).forEach(button => {
      button.disabled = Number(button.dataset.dir) < 0 ? row.scrollLeft <= 2 : row.scrollLeft >= max;
    });
  }
  const syncAllScrollButtons = (scope = document) => $$('.h-scroller[id]', scope).forEach(syncScrollButtons);
  let scrollSyncFrame = 0;
  document.addEventListener('scroll', event => {
    if (!(event.target instanceof Element) || !event.target.matches('.h-scroller[id]')) return;
    cancelAnimationFrame(scrollSyncFrame);
    scrollSyncFrame = requestAnimationFrame(() => syncScrollButtons(event.target));
  }, true);
  window.addEventListener('resize', () => syncAllScrollButtons());

  // Reservation times shown on a restaurant card: the next three today, else tomorrow's first three.
  function quickTableTimes(restaurant, t) {
    for (let offset = 0; offset < 7; offset += 1) {
      const day = S.addDays(S.startOfDay(t), offset);
      const slots = S.tableSlots(restaurant, day, t);
      if (slots.length) return { day, slots: slots.slice(0, 3) };
    }
    return null;
  }

  function restaurantModeLine(restaurant, t) {
    const open = S.openState(restaurant, t);
    if (state.mode === 'reservation') return '';
    const prep = S.typicalPrep(restaurant, restaurantDishes(restaurant), prepMode(), t);
    if (!open.open) return `<p class="rest-mode is-closed">${icon('clock')}${state.mode === 'pickup' ? 'Schedule a pickup for later' : 'Book a table for later'}</p>`;
    if (state.mode === 'pickup') return `<p class="rest-mode">${icon('bag')}Ready in about ${prep} min</p>`;
    const wait = S.walkInWait(restaurant, t);
    return `<p class="rest-mode">${icon('dine')}${wait ? `${wait} min wait` : 'No wait'} · served in ~${prep} min</p>`;
  }

  function restaurantCard(restaurant, matchCount, t) {
    const open = S.openState(restaurant, t);
    const tone = open.open ? (open.closingSoon ? 'soon' : 'open') : 'closed';
    let slots = '';
    if (state.mode === 'reservation') {
      const times = quickTableTimes(restaurant, t);
      slots = times
        ? `<div class="slot-row" role="group" aria-label="Book a table at ${esc(restaurant.name)}">
            <div class="slot-head"><span class="slot-day">Tables ${S.formatDay(times.day, t).toLowerCase()}</span><button type="button" class="link-button slot-more" data-book="${restaurant.id}" aria-label="More times at ${esc(restaurant.name)}">More times</button></div>
            <div class="slot-grid">${times.slots.map(slot => `<button type="button" class="slot" data-book="${restaurant.id}" data-day="${S.dayKey(slot)}" data-minutes="${S.minutesOf(slot)}" aria-label="Book ${esc(restaurant.name)}, ${S.formatDay(slot, t)} at ${S.formatTime(slot)}">${S.formatTime(slot)}</button>`).join('')}</div>
          </div>`
        : '<p class="rest-mode is-closed">No tables this week</p>';
    }
    return `<article class="rest-card">
      <button type="button" class="rest-open" data-open-restaurant="${restaurant.id}" aria-label="${esc(restaurant.name)}: menu, hours, and reviews">
        <div class="rest-media">${img(restaurant.image, `${restaurant.name}: ${restaurant.tagline}`, { sizes: '(max-width: 760px) 78vw, 320px' })}
          <span class="rest-status" data-tone="${tone}">${esc(open.label)}</span>
          ${matchCount ? `<span class="rest-badge">${plural(matchCount, 'matching dish', 'matching dishes')}</span>` : ''}
        </div>
        <div class="rest-info">
          <div class="rest-title"><h3>${esc(restaurant.name)}</h3><span class="rating-pill" aria-label="Rated ${restaurant.rating} out of 5">${icon('star')}${restaurant.rating.toFixed(1)}</span></div>
          <p class="rest-meta">${esc(restaurant.cuisine)} · ${restaurant.priceLevel} · ${icon('walk')}${milesText(restaurant)}</p>
          ${restaurantModeLine(restaurant, t)}
        </div>
      </button>
      ${slots}
    </article>`;
  }

  // ---------- Rendering the page ----------
  const RESTAURANT_HEADINGS = {
    dinein: ['Dine in nearby', 'Walk-in wait and serving times change with the lunch and dinner rush.'],
    reservation: ['Book a table', 'Tap a time to reserve for up to 12 people. Pre-order so food is ready when you sit down.'],
    pickup: ['Order ahead for pickup', 'Ready times include the lunch and dinner rush. Schedule ahead when a place is closed.']
  };

  function renderRestaurants(matches, t) {
    const isFiltering = filtering();
    const counts = new Map();
    matches.forEach(dish => counts.set(dish.restaurantId, (counts.get(dish.restaurantId) || 0) + 1));
    let list = (isFiltering ? SF.restaurants.filter(restaurant => counts.has(restaurant.id)) : [...SF.restaurants]).filter(radiusOk);
    if (state.chips.has('open')) list = list.filter(restaurant => S.isOpenAt(restaurant, t));
    const openFirst = state.mode !== 'reservation';
    list.sort((a, b) => (openFirst ? Number(S.isOpenAt(b, t)) - Number(S.isOpenAt(a, t)) : 0)
      || (state.sort === 'nearest' ? a.distance - b.distance : 0)
      || (isFiltering ? (counts.get(b.id) || 0) - (counts.get(a.id) || 0) : 0)
      || b.rating - a.rating || b.ratingCount - a.ratingCount);
    const [title, sub] = RESTAURANT_HEADINGS[state.mode];
    $('#restaurantsTitle').textContent = title;
    const openCount = list.filter(restaurant => S.isOpenAt(restaurant, t)).length;
    $('#restaurantsSub').textContent = isFiltering
      ? `${plural(list.length, 'restaurant')} with dishes that match · ${openCount} open now.`
      : openCount || state.mode === 'reservation'
        ? `${openCount} of ${list.length} open now. ${sub}`
        : 'Everything is closed right now. Book a table or schedule a pickup for when they open.';
    $('#restaurantRow').innerHTML = list.map(restaurant => restaurantCard(restaurant, isFiltering ? counts.get(restaurant.id) : 0, t)).join('');
    $('#restaurantRow').hidden = list.length === 0;
    $('#restaurantEmpty').hidden = list.length > 0;
  }

  function renderNewRow(t) {
    const fresh = SF.dishes.filter(dish => dish.isNew && SF.dishMatchesCategory(dish, state.category) && priceOk(dish) && radiusOk(restaurantOf(dish)));
    const hide = fresh.length === 0 || state.query || state.chips.size;
    $('#new-dishes').hidden = Boolean(hide);
    if (!hide) $('#newRow').innerHTML = fresh.map(dish => dishCard(dish, { t })).join('');
  }

  function renderGrid(dishes, t) {
    const category = SF.categories.find(item => item.id === state.category);
    const onlyDrinks = Boolean(category.courses);
    const title = state.query ? `Results for “${state.query}”` : category.id === 'all' ? 'All dishes' : onlyDrinks ? category.label : `${category.label} dishes`;
    const noun = onlyDrinks ? (dishes.length === 1 ? 'drink' : 'drinks') : (dishes.length === 1 ? 'dish' : 'dishes');
    const extras = [];
    if (lastSearch?.query.labels.length) extras.push(lastSearch.query.labels.join(' · '));
    if (lastSearch?.typo) extras.push('close matches');
    if (state.chips.size || priceActive() || state.radius) extras.push('filtered');
    $('#dishesTitle').textContent = title;
    $('#dishesSub').textContent = `${dishes.length} ${noun}${extras.length ? ` · ${extras.join(' · ')}` : ''}`;
    const rows = $('#dishRows');
    rows.innerHTML = courseRows('dishes', dishes, { card: dish => dishCard(dish, { heading: 'h4', t }) });
    $('#dishEmpty').hidden = dishes.length > 0;
    if (!dishes.length) {
      const fix = state.query ? SF.search.suggest(searchIndex, state.query) : null;
      $('#dishEmptyText').innerHTML = fix
        ? `Did you mean <button type="button" class="link-button" data-search-for="${esc(fix)}">${esc(fix)}</button>? You can also remove a filter or ask the AI assistant.`
        : 'Try another cuisine, remove a filter, or ask the AI assistant for ideas.';
    }
    $('#clearFilters').hidden = !(filtering() || state.sort !== 'recommended');
  }

  function renderBrowse({ keepScroll = false } = {}) {
    const positions = keepScroll ? new Map($$('.h-scroller[id]').map(row => [row.id, row.scrollLeft])) : null;
    const t = new Date();
    const dishes = filteredDishes();
    renderRestaurants(dishes, t);
    renderNewRow(t);
    renderGrid(dishes, t);
    if (positions) positions.forEach((left, id) => { const row = document.getElementById(id); if (row && left) row.scrollLeft = left; });
    syncAllScrollButtons();
    lastRender = Date.now();
    window.dispatchEvent(new CustomEvent('sf:category', { detail: { category: state.category } }));
  }
  let renderTimer = 0;
  const renderBrowseSoon = () => { clearTimeout(renderTimer); renderTimer = setTimeout(() => renderBrowse(), 120); };

  // Opening hours, "ordered today", and rush times change with the clock: refresh every few
  // minutes (keeping scroll positions) and when the tab comes back into view.
  let lastRender = 0;
  const refreshForClock = () => {
    renderBrowse({ keepScroll: true });
    window.dispatchEvent(new CustomEvent('sf:tick'));
  };
  setInterval(() => { if (!document.hidden && !document.querySelector('dialog[open]')) refreshForClock(); }, 5 * 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastRender > 2 * 60000) refreshForClock(); });

  function setCategory(categoryId) {
    state.category = categoryId;
    renderBrowse();
  }

  // ---------- Price and distance ----------
  function priceText() {
    const { min, max } = state.price;
    if (!priceActive()) return 'Price';
    if (min > 0 && max < PRICE_MAX) return `$${min}–$${max}`;
    if (max < PRICE_MAX) return `Under $${max}`;
    return `$${min} and up`;
  }
  function syncPriceControls() {
    $('#priceMin').value = state.price.min;
    $('#priceMax').value = state.price.max;
    $('#priceMinOut').textContent = `$${state.price.min}`;
    $('#priceMaxOut').textContent = state.price.max >= PRICE_MAX ? 'No limit' : `$${state.price.max}`;
    $('#priceLabel').textContent = priceText();
    $('#priceButton').classList.toggle('is-active', priceActive());
    $$('[data-price]').forEach(button => {
      const [min, max] = button.dataset.price.split('-').map(Number);
      button.setAttribute('aria-pressed', String(min === state.price.min && max === state.price.max));
    });
  }
  $('#priceButton').addEventListener('click', () => {
    const panel = $('#pricePanel');
    panel.hidden = !panel.hidden;
    $('#priceButton').setAttribute('aria-expanded', String(!panel.hidden));
  });
  $('#pricePanel').addEventListener('click', event => {
    const preset = event.target.closest('[data-price]');
    if (!preset) return;
    const [min, max] = preset.dataset.price.split('-').map(Number);
    state.price = { min, max };
    syncPriceControls();
    renderBrowse();
  });
  ['priceMin', 'priceMax'].forEach(id => $(`#${id}`).addEventListener('input', () => {
    let min = Number($('#priceMin').value);
    let max = Number($('#priceMax').value);
    if (min > max) { if (id === 'priceMin') max = min; else min = max; }
    state.price = { min, max };
    syncPriceControls();
    renderBrowseSoon();
  }));
  $('#radiusSelect').addEventListener('change', event => { state.radius = Number(event.target.value) || 0; renderBrowse(); });

  function clearFilters() {
    state.chips.clear();
    state.query = '';
    state.sort = 'recommended';
    state.price = { min: 0, max: PRICE_MAX };
    state.radius = 0;
    $('#sortSelect').value = 'recommended';
    $('#radiusSelect').value = '0';
    $('#searchInput').value = '';
    $('#pricePanel').hidden = true;
    $('#priceButton').setAttribute('aria-expanded', 'false');
    $$('#filterBar [data-chip]').forEach(chip => chip.setAttribute('aria-pressed', 'false'));
    syncPriceControls();
    setCategory('all');
  }

  $('#filterBar').addEventListener('click', event => {
    const chip = event.target.closest('[data-chip]');
    if (!chip) return;
    const key = chip.dataset.chip;
    if (state.chips.has(key)) state.chips.delete(key); else state.chips.add(key);
    chip.setAttribute('aria-pressed', String(state.chips.has(key)));
    renderBrowse();
  });
  $('#sortSelect').addEventListener('change', event => { state.sort = event.target.value; renderBrowse({ keepScroll: false }); });
  $('#clearFilters').addEventListener('click', clearFilters);
  $('#emptyClear').addEventListener('click', clearFilters);

  // Scroller arrows
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-scroll]');
    if (!button) return;
    const row = document.getElementById(button.dataset.scroll);
    row.scrollBy({ left: Number(button.dataset.dir) * row.clientWidth * 0.85, behavior: 'smooth' });
  });

  // ---------- Global clicks ----------
  document.addEventListener('click', event => {
    const add = event.target.closest('[data-add]');
    if (add) { addToCart(add.dataset.add, 1); return; }
    const modeButton = event.target.closest('[data-mode]');
    if (modeButton) {
      setMode(modeButton.dataset.mode);
      if (modeButton.classList.contains('mode-card')) $('#restaurants').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const book = event.target.closest('[data-book]');
    if (book) {
      ['#restaurantDialog', '#dishDialog', '#cartDrawer'].forEach(selector => { if ($(selector).open) $(selector).close(); });
      startReservation({ restaurantId: book.dataset.book || null, day: book.dataset.day || null, minutes: book.dataset.minutes ? Number(book.dataset.minutes) : null });
      return;
    }
    const searchFor = event.target.closest('[data-search-for]');
    if (searchFor) { searchInput.value = searchFor.dataset.searchFor; applySearch(searchFor.dataset.searchFor); return; }
    const openDishButton = event.target.closest('[data-open-dish]');
    if (openDishButton) { openDish(openDishButton.dataset.openDish); return; }
    const openRestaurantButton = event.target.closest('[data-open-restaurant]');
    if (openRestaurantButton) { openRestaurant(openRestaurantButton.dataset.openRestaurant); return; }
    if (event.target.closest('[data-open-orders]')) { SF.orders?.openList(); return; }
    if (event.target.closest('[data-split-bill]')) { SF.orders?.splitCustom(); return; }
    const review = event.target.closest('[data-write-review]');
    if (review) SF.orders?.writeReview(review.dataset.writeReview);
  });

  // ---------- Instant search ----------
  const searchInput = $('#searchInput');
  const searchResults = $('#searchResults');
  const POPULAR_SEARCHES = ['pho', 'boba', 'ramen', 'tacos', 'vegetarian under $12', 'spicy noodles', 'open now near me', 'quick lunch under $10'];
  let activeOption = -1;

  const highlight = (text, query) => {
    const tokens = normalize(query).split(' ').filter(Boolean);
    if (!tokens.length) return esc(text);
    const plain = normalize(text);
    // Underline the first matching word start, mapping back to the original text.
    for (const token of tokens) {
      const index = plain.split(' ').findIndex(word => word.startsWith(token));
      if (index === -1) continue;
      const words = text.split(/(\s+)/);
      let wordCount = -1;
      return words.map(part => {
        if (/^\s+$/.test(part)) return esc(part);
        wordCount += normalize(part) ? 1 : 0;
        return wordCount === index ? `<mark>${esc(part.slice(0, token.length))}</mark>${esc(part.slice(token.length))}` : esc(part);
      }).join('');
    }
    return esc(text);
  };

  function rememberSearch(text) {
    const clean = text.trim().slice(0, 60);
    if (!clean) return;
    state.recentSearches = [clean, ...state.recentSearches.filter(item => normalize(item) !== normalize(clean))].slice(0, 6);
    store.set('recentSearches', state.recentSearches);
  }

  function openSuggestions(html) {
    searchResults.innerHTML = html;
    searchResults.hidden = false;
    searchInput.setAttribute('aria-expanded', 'true');
  }
  function closeSuggestions() {
    searchResults.hidden = true;
    searchInput.setAttribute('aria-expanded', 'false');
    searchInput.removeAttribute('aria-activedescendant');
  }

  // Empty box: recent and popular searches.
  function renderSearchStart() {
    const recent = state.recentSearches.length
      ? `<div class="search-group-label">Recent searches <button type="button" class="link-button" data-clear-recent>Clear</button></div>${state.recentSearches.map(text => `<button type="button" class="search-option search-term" role="option" data-search-term="${esc(text)}">${icon('clock')}<span>${esc(text)}</span></button>`).join('')}`
      : '';
    openSuggestions(`${recent}<div class="search-group-label">Try searching</div><div class="search-popular">${POPULAR_SEARCHES.map(text => `<button type="button" class="search-option search-chip" role="option" data-search-term="${esc(text)}">${esc(text)}</button>`).join('')}</div>
      <p class="search-tip">Tip: type filters too, like “under $12”, “open now”, “within 1 mi”, “15 min”, or “món chay”.</p>`);
  }

  function searchDishOption(dish, query, t) {
    const restaurant = restaurantOf(dish);
    const availability = S.dishAvailability(dish, restaurant, t);
    const today = orderedToday(dish, t);
    return `<button type="button" class="search-option search-dish" role="option" data-search-dish="${dish.id}">
      ${img(dish.image, '', { widths: [120], width: 120, sizes: '64px', eager: true })}
      <span class="search-text">
        <strong>${highlight(dish.name, query)}</strong>
        <small><b>${usd(dish.price)}</b> · ${esc(restaurant.name)} · ${S.formatMiles(restaurant.distance)}</small>
        <small class="search-meta">${icon('star')}${dish.rating.toFixed(1)} (${dish.ratingCount})${today ? ` · ${icon('flame')}${today} today` : ''} · ${prepLabel(dish, t)} · <span class="${availability.now ? 'is-open' : 'is-closed'}">${availability.now ? 'Available now' : esc(availability.short || 'Closed')}</span></small>
      </span>
    </button>`;
  }

  function renderSuggestions() {
    const raw = searchInput.value;
    activeOption = -1;
    if (!raw.trim()) { renderSearchStart(); return; }
    const t = new Date();
    const dishSearch = SF.search.searchDishes(searchIndex, raw, { test: queryTest(t), limit: 7 });
    const query = dishSearch.query;
    const restaurants = query.tokens.length
      ? SF.search.searchRestaurants(searchIndex, query, { limit: 3, test: (restaurant, filters) => !filters.maxDistance || restaurant.distance <= filters.maxDistance }).results.map(result => result.item)
      : [];
    const categories = query.tokens.length ? SF.categories.filter(category => category.id !== 'all' && normalize(category.label).startsWith(query.text)).slice(0, 2) : [];
    let html = '';
    if (query.labels.length) html += `<div class="search-filters">${icon('tag')}<span>Filters</span>${query.labels.map(label => `<span class="tag">${esc(label)}</span>`).join('')}</div>`;
    if (dishSearch.typo) {
      const fix = SF.search.suggest(searchIndex, query);
      html += `<div class="search-note">No exact matches${fix ? `. Showing results for <b>${esc(fix)}</b>` : '. Showing close matches'}.</div>`;
    }
    if (categories.length) html += `<div class="search-group-label">Cuisines</div>${categories.map(category => `<button type="button" class="search-option" role="option" data-search-category="${category.id}"><span class="search-emoji">${category.icon}</span><span class="search-text"><strong>${highlight(category.label, query.text)}</strong><small>Show all ${category.label} dishes</small></span></button>`).join('')}`;
    // When the typed filters rule out every matching dish, say how many they hid and offer them.
    const hidden = !dishSearch.results.length && query.tokens.length && query.labels.length ? SF.search.searchDishes(searchIndex, query.text).total : 0;
    if (dishSearch.results.length) html += `<div class="search-group-label">Dishes</div>${dishSearch.results.map(({ item }) => searchDishOption(item, query.text, t)).join('')}`;
    else if (hidden) html += `<div class="search-group-label">Dishes</div><div class="search-empty">${hidden === 1 ? '1 dish matches' : `${hidden} dishes match`} “${esc(query.text)}”, but none ${esc(query.labels.join(', ').toLowerCase())}.</div><button type="button" class="search-option search-term" role="option" data-search-term="${esc(query.text)}">${icon('search')}<span>Show “${esc(query.text)}” without filters</span></button>`;
    if (restaurants.length) html += `<div class="search-group-label">Restaurants</div>${restaurants.map(restaurant => `<button type="button" class="search-option" role="option" data-search-restaurant="${restaurant.id}">${img(restaurant.image, '', { widths: [120], width: 120, sizes: '64px', eager: true })}<span class="search-text"><strong>${highlight(restaurant.name, query.text)}</strong><small>${esc(restaurant.cuisine)} · ${S.formatMiles(restaurant.distance)} · ${icon('star')}${restaurant.rating.toFixed(1)}</small><small>${esc(S.openState(restaurant, t).label)}</small></span></button>`).join('')}`;
    if (dishSearch.results.length) {
      html += `<button type="button" class="search-option search-all" role="option" data-search-all><span class="search-emoji">${icon('search')}</span><span class="search-text"><strong>See all ${dishSearch.total} dish${dishSearch.total === 1 ? '' : 'es'} for “${esc(raw.trim())}”</strong><small>Show them below with your filters</small></span></button>`;
    } else if (!hidden && !restaurants.length && !categories.length) {
      const fix = SF.search.suggest(searchIndex, query);
      html += `<div class="search-empty">No matches for “${esc(raw.trim())}”.${fix ? '' : ' Press Enter to ask the AI assistant instead.'}</div>${fix ? `<button type="button" class="search-option search-term" role="option" data-search-term="${esc(fix)}">${icon('search')}<span>Did you mean <b>${esc(fix)}</b>?</span></button>` : ''}`;
    }
    openSuggestions(html);
  }

  function applySearch(query) {
    state.query = query.trim();
    rememberSearch(query);
    closeSuggestions();
    renderBrowse();
    $('#dishes').scrollIntoView({ behavior: 'smooth' });
  }

  function chooseSuggestion(option) {
    if (!option) return;
    if (option.dataset.searchDish) { rememberSearch(searchInput.value); closeSuggestions(); openDish(option.dataset.searchDish); }
    else if (option.dataset.searchRestaurant) { rememberSearch(searchInput.value); closeSuggestions(); openRestaurant(option.dataset.searchRestaurant); }
    else if (option.dataset.searchCategory) { searchInput.value = ''; state.query = ''; closeSuggestions(); setCategory(option.dataset.searchCategory); $('#dishes').scrollIntoView({ behavior: 'smooth' }); }
    else if (option.dataset.searchTerm != null) { searchInput.value = option.dataset.searchTerm; searchInput.focus(); renderSuggestions(); }
    else if ('searchAll' in option.dataset) applySearch(searchInput.value);
  }

  searchInput.addEventListener('input', () => {
    renderSuggestions();
    if (!searchInput.value.trim() && state.query) { state.query = ''; renderBrowse(); }
  });
  searchInput.addEventListener('focus', () => renderSuggestions());
  searchInput.addEventListener('keydown', event => {
    const options = $$('.search-option', searchResults);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (searchResults.hidden) renderSuggestions();
      if (!options.length) return;
      event.preventDefault();
      activeOption = (activeOption + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      options.forEach((option, index) => {
        option.setAttribute('aria-selected', String(index === activeOption));
        option.id = `search-option-${index}`;
      });
      searchInput.setAttribute('aria-activedescendant', `search-option-${activeOption}`);
      options[activeOption].scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const text = searchInput.value.trim();
      if (activeOption >= 0 && options[activeOption]) chooseSuggestion(options[activeOption]);
      else if (text && !$('[data-search-all]', searchResults) && !$('[data-search-dish]', searchResults)) {
        const fix = $('[data-search-term]', searchResults);
        if (fix) chooseSuggestion(fix);
        else { closeSuggestions(); openAssistant(); sendToAssistant(text); }
      } else if (text) applySearch(text);
    } else if (event.key === 'Escape') {
      closeSuggestions();
    }
  });
  searchResults.addEventListener('mousedown', event => event.preventDefault());
  searchResults.addEventListener('click', event => {
    if (event.target.closest('[data-clear-recent]')) {
      state.recentSearches = [];
      store.set('recentSearches', []);
      renderSearchStart();
      return;
    }
    chooseSuggestion(event.target.closest('.search-option'));
  });
  document.addEventListener('click', event => { if (!event.target.closest('#globalSearch')) closeSuggestions(); });
  document.addEventListener('keydown', event => {
    if (event.key === '/' && !event.target.closest('input, textarea, select') && !document.querySelector('dialog[open]')) {
      event.preventDefault();
      searchInput.focus();
    }
  });

  // ---------- Reviews (sample plus your own from orders.js) ----------
  function reviewList(reviews, dishName = '') {
    return reviews.map(review => {
      const photo = typeof review.photo === 'string' && review.photo.startsWith('data:image/') ? review.photo : '';
      return `<article class="review${review.mine ? ' review-mine' : ''}">
        <div class="review-head"><div class="review-person"><span class="avatar" aria-hidden="true">${esc(initials(review.name))}</span><div><strong>${esc(review.name)}${review.mine ? ' <span class="tag tag-new">Your review</span>' : ''}</strong><small>${timeAgo(review.ageMinutes)}</small></div></div>${stars(review.rating)}</div>
        ${review.text ? `<p>${esc(review.text)}</p>` : ''}
        ${photo ? `<img class="review-photo" src="${esc(photo)}" alt="Photo of ${esc(dishName || 'the dish')} from this review" loading="lazy">` : ''}
      </article>`;
    }).join('');
  }
  const myReviewsFor = dishId => (SF.reviews ? SF.reviews.forDish(dishId) : []);

  // ---------- Dish details ----------
  const dietLabel = { vegan: 'Vegan', vegetarian: 'Vegetarian', seafood: 'Seafood', meat: '' };

  function openDish(dishId) {
    const dish = SF.dishById.get(dishId);
    if (!dish) return;
    const t = new Date();
    const restaurant = restaurantOf(dish);
    const availability = S.dishAvailability(dish, restaurant, t);
    const open = S.openState(restaurant, t);
    const dineIn = S.prepFor(dish, 'dinein', restaurant, t);
    const pickup = S.prepFor(dish, 'pickup', restaurant, t);
    const rush = S.rushExtra(restaurant, t);
    const today = orderedToday(dish, t);
    const breakdown = SF.ratingBreakdown(dish.rating, dish.ratingCount);
    const histogram = [5, 4, 3, 2, 1].map(starCount => {
      const share = dish.ratingCount ? Math.round(breakdown[starCount] / dish.ratingCount * 100) : 0;
      return `<div class="histogram-row"><span>${starCount}★</span><div class="histogram-bar"><span style="width:${share}%"></span></div><span>${share}%</span></div>`;
    }).join('');
    const tags = [
      dish.bestSeller ? `<span class="tag tag-best">${icon('star')} Best seller</span>` : '',
      dietLabel[dish.diet] ? `<span class="tag tag-diet">${dietLabel[dish.diet]}</span>` : '',
      dish.spicy ? `<span class="tag tag-spicy">${'🌶'.repeat(dish.spicy)} ${dish.spicy > 1 ? 'Spicy' : 'Mild heat'}</span>` : '',
      ...dish.tags.filter(tag => tag !== 'Drink').map(tag => `<span class="tag">${esc(tag)}</span>`)
    ].join('');
    const credit = dish.photoCredit;
    const creditLine = credit ? `<p class="photo-credit">Photo: <a href="${esc(credit.href)}" target="_blank" rel="noreferrer">${esc(credit.author || credit.source)}</a>${credit.license ? ` · ${esc(credit.license)}` : ''}${credit.author ? ` · ${esc(credit.source)}` : ''}</p>` : '';
    const mine = myReviewsFor(dish.id);
    const reviews = [...mine, ...[...dish.reviews].sort((a, b) => a.ageMinutes - b.ageMinutes)];
    $('#dishDialogBody').innerHTML = `
      <div class="dish-hero">${img(dish.image, dish.imageAlt, { widths: [800, 1200], width: 900, sizes: '(max-width: 900px) 100vw, 470px', eager: true })}${creditLine}</div>
      <div class="dish-detail">
        <div>
          <p class="eyebrow">${esc(dish.cuisine)} · ${SF.courseLabel(dish.course)} · <button type="button" data-open-restaurant="${restaurant.id}">${esc(restaurant.name)}</button> · ${S.formatMiles(restaurant.distance)}${dish.isNew ? ' · <b class="eyebrow-new">New</b>' : ''}</p>
          <h2 id="dishDialogTitle">${esc(dish.name)}</h2>
          <p class="dish-price">${usd(dish.price)} <span class="stars-inline">${icon('star')}${dish.rating.toFixed(1)} <small>(${dish.ratingCount} ratings)</small></span></p>
        </div>
        <div class="avail-box" data-tone="${availability.now ? 'ok' : 'off'}">
          ${icon('clock')}
          <div><strong>${availability.now ? 'Available now' : `Not available now · ${esc(availability.short)}`}</strong>
          <small>${esc(availability.label)} · ${esc(restaurant.name)}: ${esc(open.label)} · today ${esc(S.hoursOn(restaurant, t))}</small></div>
        </div>
        <div class="prep-grid" role="group" aria-label="Preparation time">
          <div class="prep-cell${state.mode !== 'pickup' ? ' is-current' : ''}">${icon('dine')}<span>Dine-in</span><strong>about ${dineIn} min</strong><small>from order to your table</small></div>
          <div class="prep-cell${state.mode === 'pickup' ? ' is-current' : ''}">${icon('bag')}<span>Pickup</span><strong>about ${pickup} min</strong><small>until it's packed and ready</small></div>
        </div>
        ${rush ? `<p class="field-hint">Includes about ${rush} extra minutes for the ${S.minutesOf(t) < 900 ? 'lunch' : 'dinner'} rush.</p>` : ''}
        <p class="today-line">${icon('flame')}${today ? `<span><b>${today}</b> ${today === 1 ? 'person has' : 'people have'} ordered this at ${esc(restaurant.name)} today</span>` : `<span>No orders yet today. ${open.open ? 'Be the first!' : esc(open.label)}</span>`}</p>
        <p>${esc(dish.description)}</p>
        <div class="tag-row">${tags}</div>
        <div><p class="detail-label">Ingredients</p><p class="muted">${esc(dish.ingredients)}</p></div>
        <div class="rating-summary">
          <div class="rating-big"><strong>${dish.rating.toFixed(1)}</strong>${stars(dish.rating)}<small>${dish.ratingCount} ratings</small></div>
          <div class="histogram" aria-label="Rating distribution">${histogram}</div>
        </div>
        <form class="add-panel" id="dishAddForm">
          <label class="form-field"><span>Special instructions <small>(optional)</small></span><input id="dishNote" maxlength="140" placeholder="No cilantro, sauce on the side…"></label>
          <div class="qty-row">
            <div class="stepper" role="group" aria-label="Quantity">
              <button type="button" data-step="-1" aria-label="Decrease quantity">${icon('minus')}</button><output id="dishQty">1</output><button type="button" data-step="1" aria-label="Increase quantity">${icon('plus')}</button>
            </div>
            <button type="submit" class="button button-primary" style="flex:1" id="dishAddButton">Add 1 to order · ${usd(dish.price)}</button>
          </div>
          ${availability.now ? '' : `<p class="field-hint">You can still add it to pre-order for ${availability.next ? esc(S.formatDayTime(availability.next, t)) : 'later'} with a reservation or a scheduled pickup.</p>`}
        </form>
        <section aria-labelledby="dishReviewsTitle">
          <div class="reviews-head"><p class="detail-label" id="dishReviewsTitle">What people say</p><button type="button" class="button button-secondary button-small" data-write-review="${dish.id}">${icon('camera')} Write a review</button></div>
          <div class="reviews">${reviewList(reviews, dish.name)}</div>
          <p class="sample-note">Reviews from other diners are sample data for this demo.</p>
        </section>
      </div>`;
    const dialog = $('#dishDialog');
    let quantity = 1;
    const updateQuantity = () => {
      $('#dishQty').textContent = quantity;
      $('[data-step="-1"]', dialog).disabled = quantity <= 1;
      $('#dishAddButton').textContent = `Add ${quantity} to order · ${usd(dish.price * quantity)}`;
    };
    $$('[data-step]', dialog).forEach(button => button.addEventListener('click', () => {
      quantity = Math.max(1, Math.min(20, quantity + Number(button.dataset.step)));
      updateQuantity();
    }));
    updateQuantity();
    $('#dishAddForm').addEventListener('submit', event => {
      event.preventDefault();
      addToCart(dish.id, quantity, $('#dishNote').value);
      dialog.close();
    });
    $('[data-open-restaurant]', dialog).addEventListener('click', () => dialog.close());
    if ($('#restaurantDialog').open) $('#restaurantDialog').close();
    openDialog(dialog);
    dialog.scrollTop = 0;
  }

  // ---------- Restaurant page ----------
  // Best sellers first, then appetizers, mains, desserts, and drinks. Empty sections are skipped.
  const menuSections = dishes => [
    { id: 'best', label: 'Best sellers', dishes: dishes.filter(dish => dish.bestSeller) },
    ...SF.COURSES.map(course => ({ id: course.id, label: course.label, dishes: dishes.filter(dish => !dish.bestSeller && dish.course === course.id) }))
  ].filter(section => section.dishes.length);

  function menuItem(dish, t) {
    const quote = topReview(dish);
    const availability = S.dishAvailability(dish, restaurantOf(dish), t);
    const today = orderedToday(dish, t);
    return `<div class="menu-item${availability.now ? '' : ' is-unavailable'}">
      <button type="button" class="menu-item-text" data-open-dish="${dish.id}">
        <strong>${esc(dish.name)}${dish.isNew ? ' <span class="tag tag-new">New</span>' : ''}</strong>
        <span class="dish-line"><span class="price">${usd(dish.price)}</span><span class="dot">•</span>${ratingInline(dish)}<span class="dot">•</span>${prepLabel(dish, t)}</span>
        <span class="menu-meta">${today ? `<span class="stat-hot">${icon('flame')}${todayText(today)}</span>` : ''}${availability.short ? `<span class="${availability.now ? 'meal-time' : 'meal-time off'}">${icon('clock')}${esc(availability.short)}</span>` : ''}</span>
        <p>${esc(dish.description)}</p>
        ${quote ? `<span class="menu-quote">“${esc(quote.text)}” <span>${esc(shortName(quote.name))}</span></span>` : ''}
      </button>
      <div class="menu-item-media">${img(dish.image, dish.imageAlt, { widths: [240], width: 240, sizes: '104px' })}${quickAdd(dish)}</div>
    </div>`;
  }

  function openRestaurant(restaurantId) {
    const restaurant = SF.restaurantById.get(restaurantId);
    if (!restaurant) return;
    const t = new Date();
    const dishes = restaurantDishes(restaurant);
    const sections = menuSections(dishes);
    const open = S.openState(restaurant, t);
    const average = restaurant.reviews.reduce((sum, review) => sum + review.rating, 0) / restaurant.reviews.length;
    const wait = S.walkInWait(restaurant, t);
    const dinePrep = S.typicalPrep(restaurant, dishes, 'dinein', t);
    const pickupPrep = S.typicalPrep(restaurant, dishes, 'pickup', t);
    const limited = dishes.filter(dish => S.dishWindow(dish));
    const times = quickTableTimes(restaurant, t);
    const tableDay = times ? S.formatDay(times.day, t) : '';
    const nextTable = times ? `Next table ${['Today', 'Tomorrow'].includes(tableDay) ? tableDay.toLowerCase() : tableDay} at ${S.formatTime(times.slots[0])}` : 'No tables this week';
    $('#restaurantDialogBody').innerHTML = `
      <div class="rest-cover">${img(restaurant.image, `${restaurant.name}: ${restaurant.tagline}`, { widths: [800, 1400], width: 1000, sizes: '(max-width: 760px) 100vw, 820px', eager: true })}<h2 id="restaurantDialogTitle">${esc(restaurant.name)}</h2></div>
      <div class="rest-facts">
        <span>${icon('star')} <b>${restaurant.rating.toFixed(1)}</b> (${restaurant.ratingCount.toLocaleString('en-US')} ratings)</span>
        <span>${icon('walk')} ${milesText(restaurant)}</span>
        <span>${esc(restaurant.cuisine)} · ${restaurant.priceLevel}</span>
        <span class="rest-status-inline" data-tone="${open.open ? (open.closingSoon ? 'soon' : 'open') : 'closed'}">${icon('clock')} ${esc(open.label)}</span>
      </div>
      <div class="rest-actions">
        <div class="rest-action">${icon('dine')}<div><strong>Dine-in</strong><small>${open.open ? `${wait ? `About ${wait} min wait` : 'No wait now'} · food in about ${dinePrep} min` : 'Closed now'}</small></div></div>
        <div class="rest-action">${icon('calendar')}<div><strong>${MODES.reservation.label}</strong><small>${esc(nextTable)}</small></div><button type="button" class="button button-primary button-small" data-book="${restaurant.id}">Book a table</button></div>
        <div class="rest-action">${icon('bag')}<div><strong>Pickup</strong><small>${open.open ? `Ready in about ${pickupPrep} min` : 'Schedule for later'}</small></div></div>
      </div>
      <div class="rest-section rest-hours">
        <h3>Opening hours</h3>
        <table class="hours-table"><tbody>${S.weekHours(restaurant, t).map(row => `<tr${row.today ? ' class="is-today"' : ''}><th scope="row">${row.day}${row.today ? ' <small>(today)</small>' : ''}</th><td>${esc(row.text)}</td></tr>`).join('')}</tbody></table>
        ${limited.length ? `<p class="detail-label" style="margin-top:14px">Meal times</p><ul class="meal-times">${limited.map(dish => `<li><button type="button" data-open-dish="${dish.id}">${esc(dish.name)}</button><span>${esc(S.windowLabel(dish))}</span></li>`).join('')}</ul>` : '<p class="muted" style="margin-top:10px">Every dish is served whenever the restaurant is open.</p>'}
      </div>
      <nav class="menu-nav" aria-label="Menu sections">${sections.map(section => `<button type="button" class="chip" data-menu-jump="${section.id}">${section.label} <span>${section.dishes.length}</span></button>`).join('')}</nav>
      <div class="rest-section">
        <h3>Menu <small class="muted">${dishes.length} items · prep times for ${MODES[state.mode].label.toLowerCase()}</small></h3>
        ${sections.map(section => `<section class="menu-section" id="menu-${section.id}" aria-labelledby="menu-${section.id}-title">
          <h4 id="menu-${section.id}-title">${section.id === 'best' ? icon('star') : ''}${section.label}</h4>
          <div class="menu-list">${section.dishes.map(dish => menuItem(dish, t)).join('')}</div>
        </section>`).join('')}
      </div>
      <div class="rest-section">
        <h3>Reviews <small class="muted" style="font-weight:500">★ ${average.toFixed(1)} from ${restaurant.reviews.length} recent reviews</small></h3>
        <div class="reviews">${reviewList(restaurant.reviews.slice(0, 6))}</div>
        <p class="sample-note">Sample reviews for this demo.</p>
      </div>`;
    if ($('#dishDialog').open) $('#dishDialog').close();
    const dialog = $('#restaurantDialog');
    openDialog(dialog);
    dialog.scrollTop = 0;
  }
  $('#restaurantDialog').addEventListener('click', event => {
    const jump = event.target.closest('[data-menu-jump]');
    if (jump) document.getElementById(`menu-${jump.dataset.menuJump}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // ---------- Totals ----------
  const stateOptions = selected => Object.entries(SF.TAX_RATES)
    .sort((a, b) => a[1][0].localeCompare(b[1][0]))
    .map(([code, [name, rate]]) => `<option value="${code}"${code === selected ? ' selected' : ''}>${name} (${rate}%)</option>`).join('');

  function totalsRows(totals, { showTip = false, taxSelect = false, mode = state.mode } = {}) {
    const rows = [
      ['Food subtotal', totals.subtotal],
      ['Service fee <small>(5%, min $1, max $5)</small>', totals.service],
      totals.smallOrder ? ['Small order fee <small>(under $10)</small>', totals.smallOrder] : null,
      [taxSelect
        ? `<span class="tax-select">Sales tax <select data-tax-state aria-label="State for sales tax">${stateOptions(state.taxState)}</select></span>`
        : `Sales tax <small>(${state.taxState} ${totals.taxRate}% of food)</small>`, totals.tax],
      showTip ? [MODES[mode].tipLabel, totals.tip] : null
    ].filter(Boolean);
    return `${rows.map(([label, value]) => `<div class="totals-row"><span>${label}</span><span>${cents(value)}</span></div>`).join('')}
      <div class="totals-row totals-total"><span>${showTip ? 'Total' : 'Estimated total'}</span><span>${cents(showTip ? totals.total : totals.totalBeforeTip)}</span></div>
      ${showTip ? '' : '<div class="totals-row"><span class="info">An optional tip is added at checkout.</span></div>'}`;
  }

  // ---------- Cart drawer ----------
  const modeSegmented = () => `<div class="segmented segmented-3 drawer-mode" role="group" aria-label="How are you eating?">
    ${SF.MODE_ORDER.map(mode => `<button type="button" data-mode="${mode}" aria-pressed="${state.mode === mode}">${icon(MODES[mode].icon)} ${esc(MODES[mode].label)}</button>`).join('')}</div>`;

  function cartGroupStatus(restaurant, lines, t) {
    const open = S.openState(restaurant, t);
    if (state.mode === 'pickup') {
      const prep = S.orderPrep(lines.map(({ dish }) => dish), 'pickup', restaurantOf, t);
      return open.open ? `Ready in about ${prep} min` : open.label;
    }
    return open.label;
  }

  function renderCart() {
    const body = $('#cartBody');
    const foot = $('#cartFoot');
    const t = new Date();
    const pastWithItems = state.orders.filter(order => order.items.length).slice(0, 3);
    const recent = pastWithItems.length ? `<div class="recent-orders"><div class="recent-head"><h3>Order again</h3><button type="button" class="link-button" data-open-orders>All orders</button></div>${pastWithItems.map(order => `<div class="recent-order"><div><strong>${esc(order.items.map(item => SF.dishById.get(item.dishId)?.name).filter(Boolean).slice(0, 2).join(', '))}</strong><small>${esc(MODES[order.mode]?.label || 'Order')} · ${new Date(order.placedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${cents(order.totals.total)}</small></div><button type="button" class="button button-secondary button-small" data-reorder="${esc(order.id)}">Reorder</button></div>`).join('')}</div>` : '';
    if (!state.cart.length) {
      const reservation = state.mode === 'reservation';
      body.innerHTML = `${modeSegmented()}<div class="cart-empty">${icon(reservation ? 'calendar' : 'bag')}<strong>${reservation ? 'Book a table, no order needed' : 'Your order is empty'}</strong><p>${reservation ? 'Reserve now and order at the restaurant, or add dishes first to pre-order.' : 'Add dishes from any restaurant, or ask the AI assistant to build an order for you.'}</p>${reservation ? '<button type="button" class="button button-primary" data-book="">Book a table</button>' : `<button type="button" class="button button-secondary" data-ai-open>${icon('spark')} Ask AI</button>`}</div>${recent}`;
      foot.innerHTML = '';
      foot.hidden = true;
      return;
    }
    foot.hidden = false;
    const groups = new Map();
    state.cart.forEach((line, index) => {
      const dish = dishOf(line);
      if (!groups.has(dish.restaurantId)) groups.set(dish.restaurantId, []);
      groups.get(dish.restaurantId).push({ line, index, dish });
    });
    const totals = totalsFor(state.cart, { includeTip: false });
    const spentShare = Math.min(100, Math.round(totals.totalBeforeTip / (state.budget * 100) * 100));
    const over = totals.totalBeforeTip > state.budget * 100;
    const oneRestaurantNote = state.mode !== 'pickup' && groups.size > 1
      ? `<p class="cart-note">${icon('dine')}<span>${esc(MODES[state.mode].label)} is at one restaurant. At checkout you choose which one; items from the others stay in your order for later.</span></p>` : '';
    body.innerHTML = `${modeSegmented()}${oneRestaurantNote}
      ${[...groups.entries()].map(([restaurantId, lines]) => {
        const restaurant = SF.restaurantById.get(restaurantId);
        return `<section class="cart-group"><div class="cart-group-head"><strong>${esc(restaurant.name)}</strong><small>${esc(cartGroupStatus(restaurant, lines, t))}</small></div>
          ${lines.map(({ line, index, dish }) => `<div class="cart-line">
            ${img(dish.image, '', { widths: [120], width: 120, sizes: '56px' })}
            <div class="cart-line-text"><strong>${esc(dish.name)}</strong><small>${usd(dish.price)} each${line.note ? ` · “${esc(line.note)}”` : ''}</small></div>
            <div class="cart-line-end"><b>${usd(dish.price * line.quantity)}</b>
              <div class="stepper small" role="group" aria-label="Quantity of ${esc(dish.name)}"><button type="button" data-line="${index}" data-delta="-1" aria-label="${line.quantity === 1 ? 'Remove' : 'Decrease'} ${esc(dish.name)}">${icon(line.quantity === 1 ? 'trash' : 'minus')}</button><output>${line.quantity}</output><button type="button" data-line="${index}" data-delta="1" aria-label="Increase ${esc(dish.name)}">${icon('plus')}</button></div>
            </div>
          </div>`).join('')}</section>`;
      }).join('')}
      <div class="budget-box">
        <div class="budget-top"><span>Budget <b>${usd(state.budget)}</b></span><button type="button" id="editBudget">Edit</button></div>
        <div class="budget-meter${over ? ' over' : ''}"><span style="width:${spentShare}%"></span></div>
        <p class="budget-note${over ? ' over' : ''}">${over ? `${cents(totals.totalBeforeTip - state.budget * 100)} over budget (with tax and fees)` : `${cents(state.budget * 100 - totals.totalBeforeTip)} left after tax and fees, before tip`}</p>
        <form class="budget-edit" id="budgetForm" hidden><label class="sr-only" for="budgetInput">Budget in dollars</label><input id="budgetInput" type="number" min="1" step="1" inputmode="decimal" value="${state.budget}"><button type="submit" class="button button-primary">Save</button></form>
      </div>
      <button type="button" class="chip chip-clear" id="clearCart" style="margin-top:12px">Clear order</button>
      ${recent}`;
    const label = state.mode === 'reservation' ? `Book a table · ${cents(totals.totalBeforeTip)} pre-order` : `Checkout · ${cents(totals.totalBeforeTip)}`;
    foot.innerHTML = `<div class="totals">${totalsRows(totals, { taxSelect: true })}</div>
      <button type="button" class="button button-primary button-block" id="goCheckout" style="margin-top:14px">${label}</button>`;
  }

  function openCart() {
    renderCart();
    openDialog($('#cartDrawer'));
  }
  $('#cartButton').addEventListener('click', openCart);
  const drawer = $('#cartDrawer');
  drawer.addEventListener('click', event => {
    const step = event.target.closest('[data-delta]');
    if (step) {
      const index = Number(step.dataset.line);
      setLineQuantity(index, state.cart[index].quantity + Number(step.dataset.delta));
      return;
    }
    if (event.target.closest('#goCheckout')) { drawer.close(); openCheckout(); return; }
    if (event.target.closest('#clearCart')) { clearCart(); toast('Order cleared'); return; }
    if (event.target.closest('#editBudget')) { $('#budgetForm').hidden = false; $('#budgetInput').focus(); return; }
    if (event.target.closest('[data-ai-open]')) { drawer.close(); openAssistant(); return; }
    if (event.target.closest('[data-open-orders]')) { drawer.close(); return; }
    const reorder = event.target.closest('[data-reorder]');
    if (reorder) reorderOrder(reorder.dataset.reorder);
  });
  drawer.addEventListener('submit', event => {
    if (event.target.id !== 'budgetForm') return;
    event.preventDefault();
    const value = Number($('#budgetInput').value);
    if (!Number.isFinite(value) || value < 1) return;
    state.budget = Math.round(value * 100) / 100;
    store.set('budget', state.budget);
    renderCart();
    toast('Budget updated');
  });
  function reorderOrder(orderId) {
    const order = orders.get(orderId);
    if (!order) return;
    order.items.forEach(item => { if (SF.dishById.has(item.dishId)) addToCart(item.dishId, item.quantity, item.note, { silent: true }); });
    toast('Added your previous order');
  }
  document.addEventListener('change', event => {
    if (event.target.matches('[data-tax-state]')) setTaxState(event.target.value);
  });

  function setTaxState(code, { location = null } = {}) {
    if (!SF.TAX_RATES[code]) return;
    state.taxState = code;
    store.set('taxState', code);
    if (location) { state.location = location; store.set('location', location); }
    updateAddressChip();
    cartChanged();
  }
  function updateAddressChip() {
    $('#addressLabel').textContent = state.location?.zip ? `${state.location.city ? `${state.location.city}, ` : ''}${state.location.state} ${state.location.zip}` : `Tax: ${state.taxState}`;
  }

  // ---------- ZIP lookup ----------
  const zipCache = store.get('zipCache', {});
  async function lookupZip(zip) {
    if (zipCache[zip]) return zipCache[zip];
    const response = await fetch(`https://api.zippopotam.us/us/${zip}`);
    if (!response.ok) throw new Error('ZIP not found');
    const data = await response.json();
    const place = data.places?.[0];
    if (!place) throw new Error('ZIP not found');
    const result = { zip, city: place['place name'], state: place['state abbreviation'], lat: Number(place.latitude), lon: Number(place.longitude) };
    zipCache[zip] = result;
    store.set('zipCache', zipCache);
    return result;
  }
  const addressDialog = $('#addressDialog');
  $('#addressChip').addEventListener('click', () => {
    $('#addressZip').value = state.location?.zip || '';
    $('#addressState').innerHTML = stateOptions(state.taxState);
    $('#addressHint').textContent = '';
    openDialog(addressDialog);
  });
  $('#addressZip').addEventListener('input', async event => {
    const zip = event.target.value.replace(/\D/g, '').slice(0, 5);
    event.target.value = zip;
    if (zip.length !== 5) return;
    $('#addressHint').textContent = 'Looking up ZIP…';
    try {
      const place = await lookupZip(zip);
      if ($('#addressZip').value !== zip) return;
      $('#addressState').value = place.state;
      $('#addressHint').textContent = `${place.city}, ${place.state} · sales tax ${SF.taxRateFor(place.state)}%`;
      $('#addressHint').dataset.tone = '';
    } catch {
      $('#addressHint').textContent = "We couldn't find that ZIP. Choose your state instead.";
      $('#addressHint').dataset.tone = 'error';
    }
  });
  $('#addressForm').addEventListener('submit', async event => {
    event.preventDefault();
    const zip = $('#addressZip').value;
    let location = null;
    if (/^\d{5}$/.test(zip)) {
      try { location = await lookupZip(zip); } catch { location = null; }
    }
    setTaxState(location?.state || $('#addressState').value, { location: location || { zip: '', city: '', state: $('#addressState').value } });
    addressDialog.close();
    toast(`Sales tax set to ${state.taxState} ${SF.taxRateFor(state.taxState)}%`);
    if (location && $('#addressNearby').checked) {
      window.dispatchEvent(new CustomEvent('sf:nearby-search', { detail: { query: zip } }));
      $('#nearby').scrollIntoView({ behavior: 'smooth' });
    }
  });

  // ---------- Checkout: dine-in, reservation, or pickup ----------
  const checkoutDialog = $('#checkoutDialog');
  const contact = store.get('contact', {}) || {};
  const checkout = {
    restaurantId: null,
    arrival: 10,          // dine-in: minutes until you get there (0 = already there)
    table: '',
    party: 2,
    day: null,            // reservation: 'YYYY-MM-DD'
    minutes: null,        // reservation: minutes after midnight
    name: String(contact.name || '').slice(0, 60),
    phone: String(contact.phone || '').slice(0, 30),
    guests: '',
    notes: '',
    pickup: 'asap',       // 'asap' or a timestamp
    pickupName: String(contact.name || '').slice(0, 60),
    split: { on: false, method: 'even', count: 2, names: [], assign: {} }
  };
  const bestRestaurantId = () => [...SF.restaurants].sort((a, b) => b.rating - a.rating || a.distance - b.distance)[0].id;
  const checkoutRestaurant = () => SF.restaurantById.get(checkout.restaurantId);

  // The lines this checkout places: everything for pickup; one restaurant's items for dine-in
  // and reservations (the rest stay in the order).
  function checkoutLines() {
    if (state.mode === 'pickup') return state.cart;
    return state.cart.filter(line => dishOf(line).restaurantId === checkout.restaurantId);
  }

  // The next 14 days with this restaurant's open table times.
  function reservationDays(restaurant, t) {
    return Array.from({ length: 14 }, (_, offset) => {
      const date = S.addDays(S.startOfDay(t), offset);
      return { key: S.dayKey(date), date, label: offset < 2 ? `${S.formatDay(date, t)}, ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : S.formatDay(date, t), slots: S.tableSlots(restaurant, date, t) };
    });
  }
  function ensureReservationTime(t = new Date()) {
    const days = reservationDays(checkoutRestaurant(), t);
    const day = days.find(item => item.key === checkout.day && item.slots.length) || days.find(item => item.slots.length);
    if (!day) { checkout.day = null; checkout.minutes = null; return; }
    checkout.day = day.key;
    const minutes = day.slots.map(slot => S.minutesOf(slot));
    if (!minutes.includes(checkout.minutes)) {
      const wanted = checkout.minutes;
      checkout.minutes = wanted == null ? minutes[0] : minutes.reduce((best, value) => (Math.abs(value - wanted) < Math.abs(best - wanted) ? value : best), minutes[0]);
    }
  }
  const reservedFor = () => (checkout.day && checkout.minutes != null ? S.at(S.fromDayKey(checkout.day), checkout.minutes) : null);

  function pickupInfo(t = new Date()) {
    const dishes = state.cart.map(dishOf);
    const restaurants = [...new Set(dishes.map(dish => dish.restaurantId))].map(id => SF.restaurantById.get(id));
    const prep = S.orderPrep(dishes, 'pickup', restaurantOf, t) || 15;
    const asapAt = new Date(t.getTime() + prep * 60000);
    const asapOk = restaurants.length > 0 && restaurants.every(restaurant => S.isOpenAt(restaurant, t) && S.isOpenAt(restaurant, asapAt));
    return { restaurants, prep, asapAt, asapOk, slots: S.pickupSlots(restaurants, prep, t) };
  }
  function ensurePickupTime(info) {
    if (checkout.pickup === 'asap' && info.asapOk) return;
    if (checkout.pickup !== 'asap' && info.slots.some(slot => String(slot.getTime()) === checkout.pickup)) return;
    checkout.pickup = info.asapOk || !info.slots.length ? 'asap' : String(info.slots[0].getTime());
  }
  const pickupTime = info => (checkout.pickup === 'asap' ? info.asapAt : new Date(Number(checkout.pickup)));

  function prepareCheckout(options = {}) {
    const inCart = cartRestaurantIds();
    if (options.restaurantId) checkout.restaurantId = options.restaurantId;
    if (options.party) checkout.party = clamp(Math.round(options.party), 1, 12);
    if (state.mode === 'dinein') {
      if (!inCart.includes(checkout.restaurantId)) checkout.restaurantId = inCart[0] || null;
    } else if (state.mode === 'reservation') {
      if (!SF.restaurantById.has(checkout.restaurantId)) checkout.restaurantId = inCart[0] || bestRestaurantId();
      if (options.day) checkout.day = options.day;
      if (options.minutes != null) checkout.minutes = options.minutes;
      ensureReservationTime();
    } else {
      ensurePickupTime(pickupInfo());
    }
    if (!checkout.split.on) checkout.split.count = clamp(state.mode === 'pickup' ? 2 : checkout.party, 2, 12);
  }

  const partyOptions = selected => Array.from({ length: 12 }, (_, i) => i + 1)
    .map(n => `<option value="${n}"${n === selected ? ' selected' : ''}>${plural(n, 'person', 'people')}</option>`).join('');
  const placeCard = (restaurant, t) => {
    const open = S.openState(restaurant, t);
    return `<div class="place-card">${img(restaurant.image, '', { widths: [120], width: 120, sizes: '56px' })}<div><strong>${esc(restaurant.name)}</strong><small><span class="rest-status-inline" data-tone="${open.open ? (open.closingSoon ? 'soon' : 'open') : 'closed'}">${esc(open.label)}</span> · ${milesText(restaurant)}</small></div></div>`;
  };
  const namesOf = ids => ids.map(id => SF.restaurantById.get(id).name).join(' and ');

  function dineInFields(t) {
    const restaurant = checkoutRestaurant();
    const inCart = cartRestaurantIds();
    const others = inCart.filter(id => id !== restaurant.id);
    const prep = S.orderPrep(checkoutLines().map(dishOf), 'dinein', restaurantOf, new Date(t.getTime() + checkout.arrival * 60000));
    const arrive = new Date(t.getTime() + checkout.arrival * 60000);
    const timing = checkout.arrival === 0
      ? `You're checked in as soon as you order. Food is served in about ${prep} min (around ${S.formatTime(new Date(t.getTime() + prep * 60000))}).`
      : `Check in when you arrive (around ${S.formatTime(arrive)}). The kitchen starts then, and food is served about ${prep} min later. It's ${/^(8|11|18|8\d)$/.test(String(S.walkMinutes(restaurant.distance))) ? 'an' : 'a'} ${S.walkMinutes(restaurant.distance)}-minute walk.`;
    return `<fieldset class="checkout-block">
        <legend>Restaurant</legend>
        ${inCart.length > 1 ? `<label class="form-field"><span>Eat at</span><select id="ckRestaurant">${inCart.map(id => `<option value="${id}"${id === restaurant.id ? ' selected' : ''}>${esc(SF.restaurantById.get(id).name)}</option>`).join('')}</select></label>` : ''}
        ${placeCard(restaurant, t)}
        ${others.length ? `<p class="field-hint">Items from ${esc(namesOf(others))} stay in your order for later.</p>` : ''}
      </fieldset>
      <fieldset class="checkout-block">
        <legend>When will you get there?</legend>
        <div class="chip-group" role="group" aria-label="Arrival time">${ARRIVALS.map(minutes => `<button type="button" class="chip" data-arrival="${minutes}" aria-pressed="${checkout.arrival === minutes}">${minutes ? `In ${minutes} min` : "I'm here now"}</button>`).join('')}</div>
        <div class="form-grid" style="margin-top:14px">
          <label class="form-field"><span>Party size</span><select id="ckParty">${partyOptions(checkout.party)}</select></label>
          <label class="form-field"><span>Table number <small>(if you're seated)</small></span><input id="ckTable" inputmode="numeric" maxlength="4" value="${esc(checkout.table)}" placeholder="e.g. 12"></label>
        </div>
        <p class="field-hint">${esc(timing)}</p>
      </fieldset>`;
  }

  function reservationFields(t) {
    const restaurant = checkoutRestaurant();
    const days = reservationDays(restaurant, t);
    const day = days.find(item => item.key === checkout.day);
    const lines = checkoutLines();
    const others = cartRestaurantIds().filter(id => id !== restaurant.id);
    const count = lines.reduce((sum, line) => sum + line.quantity, 0);
    const when = reservedFor();
    return `<fieldset class="checkout-block">
        <legend>Restaurant</legend>
        <label class="form-field"><span>Book at</span><select id="ckRestaurant">${[...SF.restaurants].sort((a, b) => a.name.localeCompare(b.name)).map(item => `<option value="${item.id}"${item.id === restaurant.id ? ' selected' : ''}>${esc(item.name)} · ${S.formatMiles(item.distance)}</option>`).join('')}</select></label>
        ${placeCard(restaurant, t)}
      </fieldset>
      <fieldset class="checkout-block">
        <legend>Date, time, and party size</legend>
        <div class="form-grid form-grid-3">
          <label class="form-field"><span>Date</span><select id="ckDay">${days.map(item => `<option value="${item.key}"${item.key === checkout.day ? ' selected' : ''}${item.slots.length ? '' : ' disabled'}>${esc(item.label)}${item.slots.length ? '' : ' · no tables'}</option>`).join('')}</select></label>
          <label class="form-field"><span>Time</span><select id="ckTime"${day ? '' : ' disabled'}>${day ? day.slots.map(slot => `<option value="${S.minutesOf(slot)}"${S.minutesOf(slot) === checkout.minutes ? ' selected' : ''}>${S.formatTime(slot)}</option>`).join('') : '<option>No tables</option>'}</select></label>
          <label class="form-field"><span>Party size</span><select id="ckParty">${partyOptions(checkout.party)}</select></label>
        </div>
        <p class="field-hint">${when ? `${esc(restaurant.name)} hours that day: ${esc(S.hoursOn(restaurant, when))}. ` : ''}Your table is held for 15 minutes.${checkout.party >= 8 ? ' For groups of 8 or more, the restaurant may call to confirm.' : ''}</p>
      </fieldset>
      <fieldset class="checkout-block">
        <legend>Your details</legend>
        <div class="form-grid">
          <label class="form-field"><span>Name for the reservation</span><input id="ckName" autocomplete="name" maxlength="60" value="${esc(checkout.name)}" placeholder="Your name"></label>
          <label class="form-field"><span>Phone <small>(optional)</small></span><input id="ckPhone" type="tel" autocomplete="tel" maxlength="30" value="${esc(checkout.phone)}" placeholder="(555) 123-4567"></label>
          <label class="form-field span-2"><span>Who's coming? <small>(optional, for group check-in)</small></span><input id="ckGuests" maxlength="300" value="${esc(checkout.guests)}" placeholder="Bao, Chi, Jordan"></label>
          <label class="form-field span-2"><span>Notes for the restaurant <small>(optional)</small></span><input id="ckNotes" maxlength="140" value="${esc(checkout.notes)}" placeholder="Birthday, quiet table, high chair…"></label>
        </div>
      </fieldset>
      <fieldset class="checkout-block">
        <legend>Pre-order <small class="muted">(optional)</small></legend>
        ${lines.length
          ? `<p>Your ${plural(count, 'item')} from ${esc(restaurant.name)} ${count === 1 ? 'is' : 'are'} prepared to be served when you're seated.</p>`
          : `<p class="muted">Want food waiting when you sit down? Add dishes from ${esc(restaurant.name)} to pre-order, or order at the table.</p><button type="button" class="button button-secondary button-small" data-open-restaurant="${restaurant.id}" style="margin-top:10px">See the menu</button>`}
        ${others.length ? `<p class="field-hint">Items from ${esc(namesOf(others))} aren't part of this reservation and stay in your order.</p>` : ''}
      </fieldset>`;
  }

  function pickupFields(t) {
    const info = pickupInfo(t);
    return `<fieldset class="checkout-block">
        <legend>Pick up from</legend>
        <div class="place-list">${info.restaurants.map(restaurant => placeCard(restaurant, t)).join('')}</div>
      </fieldset>
      <fieldset class="checkout-block">
        <legend>Pickup time</legend>
        <div class="form-grid">
          <label class="form-field"><span>When</span><select id="ckPickup">
            ${info.asapOk ? `<option value="asap"${checkout.pickup === 'asap' ? ' selected' : ''}>As soon as possible (about ${S.formatTime(info.asapAt)})</option>` : ''}
            ${info.slots.map(slot => `<option value="${slot.getTime()}"${String(slot.getTime()) === checkout.pickup ? ' selected' : ''}>${S.formatDayTime(slot, t)}</option>`).join('')}
          </select></label>
          <label class="form-field"><span>Name for pickup</span><input id="ckPickupName" autocomplete="name" maxlength="60" value="${esc(checkout.pickupName)}" placeholder="Your name"></label>
        </div>
        <p class="field-hint">${info.asapOk ? `Ready about ${info.prep} min after you order, including the current rush.` : 'Closed right now, so choose a time after it opens.'} Show your order code at the counter.</p>
      </fieldset>`;
  }

  function renderTip() {
    const fieldset = $('#tipFields');
    const totals = totalsFor(checkoutLines(), { includeTip: false });
    fieldset.hidden = totals.subtotal === 0;
    if (fieldset.hidden) return;
    const mode = MODES[state.mode];
    const tip = state.tips[state.mode];
    $('#tipLegend').textContent = mode.tipLabel;
    $('#tipNote').textContent = mode.tipNote;
    $('#tipOptions').innerHTML = TIP_CHOICES.map(percent => `<button type="button" class="chip" data-tip="${percent}" aria-pressed="${tip.custom == null && tip.percent === percent}">${percent ? `${percent}%` : 'No tip'}${percent ? `<span>${cents(Math.round(totals.subtotal * percent / 100))}</span>` : ''}</button>`).join('')
      + `<label class="tip-custom${tip.custom != null ? ' is-active' : ''}"><span>Other $</span><input type="number" min="0" step="0.5" inputmode="decimal" id="tipCustom" aria-label="Custom tip in dollars" value="${tip.custom ?? ''}" placeholder="0.00"></label>`;
  }

  const splitLinesFor = lines => lines.map(line => ({ label: `${line.quantity} × ${dishOf(line).name}`, cents: Math.round(dishOf(line).price * 100) * line.quantity }));
  function renderSplit() {
    const fieldset = $('#splitFields');
    const lines = checkoutLines();
    const totals = totalsFor(lines);
    fieldset.hidden = totals.subtotal === 0 || !SF.splitUI;
    if (fieldset.hidden) return;
    const split = checkout.split;
    fieldset.innerHTML = `<legend>Split the bill</legend>
      <label class="switch-row"><input type="checkbox" id="splitOn"${split.on ? ' checked' : ''}><span>Split with friends so everyone pays their share</span></label>
      ${split.on ? SF.splitUI.editor(split, splitLinesFor(lines), totals) : '<p class="field-hint">Split evenly or by who had what. Tax, fees, and tip are shared fairly.</p>'}`;
  }
  function renderSplitShares() {
    const box = $('#splitFields [data-split-shares]');
    if (!box || !checkout.split.on) return;
    const lines = checkoutLines();
    box.innerHTML = SF.splitUI.sharesList(checkout.split, splitLinesFor(lines), totalsFor(lines));
  }

  // Problems that stop the order; `field` points at the input to fix.
  function checkoutIssues(t = new Date()) {
    const issues = [];
    const lines = checkoutLines();
    const unavailable = (when, restaurantFor) => lines.map(dishOf).filter((dish, index, list) => list.indexOf(dish) === index && !S.dishAvailableAt(dish, restaurantFor(dish), when))
      .map(dish => ({ text: `${dish.name} isn't served at ${S.formatTime(when)} (${S.windowLabel(dish)}). Remove it or choose another time.` }));
    if (state.mode === 'dinein') {
      const restaurant = checkoutRestaurant();
      const arrive = new Date(t.getTime() + checkout.arrival * 60000);
      if (!lines.length) issues.push({ text: 'Add a dish to order for dine-in.' });
      else if (!S.isOpenAt(restaurant, arrive)) issues.push({ text: `${restaurant.name} is closed ${checkout.arrival ? 'when you arrive' : 'right now'} (${S.openState(restaurant, t).label}). Book a table or schedule a pickup instead.` });
      else issues.push(...unavailable(arrive, restaurantOf));
    } else if (state.mode === 'reservation') {
      const restaurant = checkoutRestaurant();
      const when = reservedFor();
      if (!when) issues.push({ text: `${restaurant.name} has no open tables in the next two weeks. Choose another restaurant.` });
      else issues.push(...unavailable(when, restaurantOf));
      if (checkout.name.trim().length < 2) issues.push({ field: 'ckName', text: 'Enter a name for the reservation.' });
    } else {
      const info = pickupInfo(t);
      if (!lines.length) issues.push({ text: 'Add a dish to order for pickup.' });
      else if (!info.asapOk && !info.slots.length) issues.push({ text: 'The restaurants in your order are closed for the next 24 hours.' });
      else issues.push(...unavailable(pickupTime(info), restaurantOf));
      if (checkout.pickupName.trim().length < 2) issues.push({ field: 'ckPickupName', text: 'Enter a name for the pickup.' });
    }
    return issues;
  }

  function summaryHead(t) {
    if (state.mode !== 'pickup' && !checkoutRestaurant()) return '';
    if (state.mode === 'reservation') {
      const when = reservedFor();
      return `<p class="summary-head">${icon('calendar')}<span><b>${esc(checkoutRestaurant().name)}</b><br>${when ? `${esc(S.formatDay(when, t))} at ${S.formatTime(when)}` : 'No table chosen'} · ${plural(checkout.party, 'person', 'people')}</span></p>`;
    }
    if (state.mode === 'dinein') {
      const arrive = new Date(t.getTime() + checkout.arrival * 60000);
      return `<p class="summary-head">${icon('dine')}<span><b>${esc(checkoutRestaurant().name)}</b><br>${checkout.arrival ? `Arriving about ${S.formatTime(arrive)}` : 'At the restaurant now'} · ${plural(checkout.party, 'person', 'people')}</span></p>`;
    }
    const info = pickupInfo(t);
    return `<p class="summary-head">${icon('bag')}<span><b>Pickup</b><br>Ready ${checkout.pickup === 'asap' ? `about ${S.formatTime(info.asapAt)}` : esc(S.formatDayTime(pickupTime(info), t))}</span></p>`;
  }

  function renderCheckoutSummary() {
    const t = new Date();
    const lines = checkoutLines();
    const totals = totalsFor(lines);
    $('#summaryTitle').textContent = state.mode === 'reservation' ? 'Reservation summary' : 'Order summary';
    $('#checkoutItems').innerHTML = summaryHead(t) + (lines.length
      ? lines.map(line => `<div class="summary-item"><span>${line.quantity} × ${esc(dishOf(line).name)}</span><b>${usd(dishOf(line).price * line.quantity)}</b></div>`).join('')
      : `<p class="muted">${state.mode === 'reservation' ? 'No pre-order. You order at the table.' : 'No items yet.'}</p>`);
    $('#checkoutTotals').innerHTML = totals.subtotal ? totalsRows(totals, { showTip: true, taxSelect: true }) : '';
    $('#taxNote').hidden = totals.subtotal === 0;
    $('#checkoutShares').innerHTML = checkout.split.on && totals.subtotal && SF.splitUI ? SF.splitUI.summary(checkout.split, splitLinesFor(lines), totals) : '';
    renderCheckoutErrors(t);
    const total = cents(totals.total);
    const label = state.mode === 'reservation'
      ? (lines.length ? `Book table + pre-order · ${total}` : 'Book table')
      : `Place ${state.mode === 'pickup' ? 'pickup' : 'dine-in'} order · ${total}`;
    $('#placeOrderButton').textContent = label;
    $('#checkoutBarButton').textContent = label;
  }

  // Availability problems show right away; missing names show after the first Place order.
  function renderCheckoutErrors(t = new Date()) {
    const error = $('#checkoutError');
    const issues = checkoutIssues(t);
    const shown = error.dataset.submitted ? issues : issues.filter(issue => !issue.field);
    error.innerHTML = shown.map(issue => `<p>${esc(issue.text)}</p>`).join('');
    error.hidden = shown.length === 0;
  }

  function renderCheckout() {
    const t = new Date();
    syncModeButtons();
    $('#checkoutTitle').textContent = state.mode === 'reservation' ? 'Book a table' : state.mode === 'pickup' ? 'Pickup checkout' : 'Dine-in checkout';
    $('#checkoutModeFields').innerHTML = state.mode === 'dinein' && checkoutRestaurant() ? dineInFields(t)
      : state.mode === 'reservation' ? reservationFields(t)
      : state.mode === 'pickup' && state.cart.length ? pickupFields(t)
      : '<p class="muted">Add a dish to your order first.</p>';
    renderTip();
    renderSplit();
    renderCheckoutSummary();
  }

  function openCheckout(options = {}) {
    if (state.mode !== 'reservation' && !state.cart.length) { toast('Add a dish first'); return; }
    // Fill in the name from the last booking or pickup on this device.
    const saved = store.get('contact', {}) || {};
    if (!checkout.name.trim() && saved.name) checkout.name = String(saved.name).slice(0, 60);
    if (!checkout.phone.trim() && saved.phone) checkout.phone = String(saved.phone).slice(0, 30);
    if (!checkout.pickupName.trim() && saved.name) checkout.pickupName = String(saved.name).slice(0, 60);
    prepareCheckout(options);
    const error = $('#checkoutError');
    delete error.dataset.submitted;
    error.hidden = true;
    renderCheckout();
    openDialog(checkoutDialog);
    checkoutDialog.scrollTop = 0;
  }
  function startReservation(options = {}) {
    if (state.mode !== 'reservation') setMode('reservation');
    openCheckout(options);
  }

  checkoutDialog.addEventListener('click', event => {
    const arrival = event.target.closest('[data-arrival]');
    if (arrival) { checkout.arrival = Number(arrival.dataset.arrival); rerender(renderCheckout); return; }
    const tipButton = event.target.closest('[data-tip]');
    if (tipButton) {
      state.tips[state.mode] = { percent: Number(tipButton.dataset.tip), custom: null };
      store.set('tips', state.tips);
      rerender(() => { renderTip(); renderSplitShares(); renderCheckoutSummary(); });
      return;
    }
    if (event.target.closest('#splitFields') && SF.splitUI?.handleClick(event, checkout.split)) {
      rerender(() => { renderSplit(); renderCheckoutSummary(); });
    }
  });
  checkoutDialog.addEventListener('change', event => {
    const { id, value } = event.target;
    if (id === 'ckRestaurant') { checkout.restaurantId = value; prepareCheckout(); rerender(renderCheckout); }
    else if (id === 'ckDay') { checkout.day = value; ensureReservationTime(); rerender(renderCheckout); }
    else if (id === 'ckTime') { checkout.minutes = Number(value); renderCheckoutSummary(); }
    else if (id === 'ckParty') {
      checkout.party = clamp(Number(value) || 1, 1, 12);
      if (!checkout.split.on) checkout.split.count = clamp(checkout.party, 2, 12);
      rerender(renderCheckout);
    } else if (id === 'ckPickup') { checkout.pickup = value; rerender(renderCheckout); }
    else if (id === 'splitOn') {
      checkout.split.on = event.target.checked;
      rerender(() => { renderSplit(); renderCheckoutSummary(); });
    }
  });
  const TEXT_FIELDS = { ckTable: 'table', ckName: 'name', ckPhone: 'phone', ckGuests: 'guests', ckNotes: 'notes', ckPickupName: 'pickupName' };
  checkoutDialog.addEventListener('input', event => {
    const { id } = event.target;
    if (TEXT_FIELDS[id]) {
      checkout[TEXT_FIELDS[id]] = event.target.value;
      event.target.removeAttribute('aria-invalid');
      if ($('#checkoutError').dataset.submitted) renderCheckoutErrors();
      return;
    }
    if (id === 'tipCustom') {
      const value = event.target.value === '' ? null : Math.max(0, Number(event.target.value));
      state.tips[state.mode] = { percent: state.tips[state.mode].percent, custom: Number.isFinite(value) ? value : null };
      store.set('tips', state.tips);
      $$('[data-tip]', checkoutDialog).forEach(button => button.setAttribute('aria-pressed', String(state.tips[state.mode].custom == null && Number(button.dataset.tip) === state.tips[state.mode].percent)));
      event.target.closest('.tip-custom')?.classList.toggle('is-active', state.tips[state.mode].custom != null);
      renderSplitShares();
      renderCheckoutSummary();
      return;
    }
    if (SF.splitUI?.handleInput(event, checkout.split)) { renderSplitShares(); renderCheckoutSummary(); }
  });

  $('#checkoutForm').addEventListener('submit', event => {
    event.preventDefault();
    const issues = checkoutIssues();
    $$('#checkoutForm [aria-invalid]').forEach(field => field.removeAttribute('aria-invalid'));
    if (issues.length) {
      const error = $('#checkoutError');
      error.dataset.submitted = '1';
      renderCheckoutErrors();
      issues.forEach(issue => { if (issue.field) $(`#${issue.field}`)?.setAttribute('aria-invalid', 'true'); });
      const field = $('#checkoutForm [aria-invalid="true"]');
      if (field) field.focus();
      else error.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    placeOrder();
  });

  // ---------- Placing an order or booking ----------
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const randomCode = length => Array.from({ length }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  function guestList(party, host, extra = '') {
    const names = [host || 'You', ...String(extra).split(/[,;\n]/).map(name => name.trim()).filter(Boolean)];
    while (names.length < party) names.push(`Guest ${names.length + 1}`);
    return names.slice(0, 12).map(name => ({ name: name.slice(0, 40), here: false }));
  }

  function placeOrder() {
    const t = new Date();
    const mode = state.mode;
    const lines = checkoutLines().map(line => ({ ...line }));
    const dishes = lines.map(dishOf);
    const totals = totalsFor(lines);
    const order = {
      id: `SF-${Date.now().toString(36).slice(-4).toUpperCase()}${randomCode(2)}`,
      code: randomCode(4),
      placedAt: t.getTime(),
      mode,
      taxState: state.taxState,
      restaurantIds: mode === 'pickup' ? [...new Set(dishes.map(dish => dish.restaurantId))] : [checkout.restaurantId],
      items: lines,
      totals
    };
    if (mode === 'dinein') {
      const arriveAt = t.getTime() + checkout.arrival * 60000;
      const guests = guestList(checkout.party, 'You');
      Object.assign(order, {
        party: guests.length, arriveAt, guests, table: checkout.table.trim(),
        prepMinutes: S.orderPrep(dishes, 'dinein', restaurantOf, new Date(arriveAt)), checkedInAt: null
      });
      if (checkout.arrival === 0) { order.checkedInAt = t.getTime(); order.guests[0].here = true; }
    } else if (mode === 'reservation') {
      const when = reservedFor();
      const guests = guestList(checkout.party, checkout.name.trim(), checkout.guests);
      Object.assign(order, {
        party: Math.max(checkout.party, guests.length), reservedFor: when.getTime(), name: checkout.name.trim(), phone: checkout.phone.trim(),
        notes: checkout.notes.trim(), guests, prepMinutes: lines.length ? S.orderPrep(dishes, 'dinein', restaurantOf, when) : 0, checkedInAt: null
      });
      store.set('contact', { name: checkout.name.trim(), phone: checkout.phone.trim() });
    } else {
      const info = pickupInfo(t);
      Object.assign(order, {
        readyAt: pickupTime(info).getTime(), scheduled: checkout.pickup !== 'asap', pickupName: checkout.pickupName.trim(),
        prepMinutes: info.prep, pickedUpAt: null
      });
      store.set('contact', { ...(store.get('contact', {}) || {}), name: checkout.pickupName.trim() });
    }
    if (checkout.split.on && totals.total > 0 && SF.splitUI) order.split = SF.splitUI.toOrder(checkout.split);
    orders.add(order);
    const placedRestaurants = new Set(order.restaurantIds);
    state.cart = mode === 'pickup' ? [] : state.cart.filter(line => !placedRestaurants.has(dishOf(line).restaurantId));
    saveCart();
    checkout.split = { on: false, method: 'even', count: 2, names: [], assign: {} };
    checkout.guests = '';
    checkout.notes = '';
    checkout.table = '';
    checkoutDialog.close();
    cartChanged();
    renderBrowse({ keepScroll: true });
    SF.orders?.show(order.id, { justPlaced: true });
  }

  // ---------- AI assistant ----------
  const aiPanel = $('#aiPanel');
  const aiFab = $('#aiFab');
  const aiMessages = $('#aiMessages');
  const aiInput = $('#aiInput');
  const aiHistory = [];
  const ai = { remote: false, model: null, busy: false, greeted: false };
  const SUGGESTIONS = ['Book a table for 4 at 7pm', 'Dinner for 4 under $60', 'Pickup lunch under $12', 'Open now near me', 'Something spicy under $15', 'Thêm 2 phở bò', 'Đặt bàn 6 người lúc 7h tối', 'Check in', 'Split the bill', "What's my total with tax?"];

  // Course and best-seller status travel as tags so the server prompt needs no extra fields.
  const menuForAi = SF.dishes.map(dish => ({
    id: dish.id, name: dish.name, restaurant: restaurantOf(dish).name, cuisine: dish.cuisine, price: dish.price, prep: dish.prep,
    diet: dish.diet, spicy: dish.spicy, rating: dish.rating, ratingCount: dish.ratingCount,
    tags: [SF.courseLabel(dish.course), ...(dish.bestSeller ? ['Best seller'] : []), ...(dish.window ? [S.windowLabel(dish)] : []), ...dish.tags.filter(tag => tag !== 'Drink')]
  }));
  const restaurantsForAi = SF.restaurants.map(restaurant => ({
    id: restaurant.id, name: restaurant.name, cuisine: restaurant.cuisine, distance: restaurant.distance,
    hours: S.weekHours(restaurant).map(row => `${row.day.slice(0, 3)} ${row.text}`).join('; ')
  }));

  async function detectRemoteAssistant() {
    // Static hosting (file://, GitHub Pages) has no assistant server: use the on-device assistant.
    if (!/^https?:$/.test(location.protocol) || location.hostname.endsWith('.github.io')) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    try {
      const response = await fetch('./api/health', { cache: 'no-store', signal: controller.signal });
      if (!response.ok) return;
      const data = await response.json();
      ai.remote = Boolean(data.ai);
      ai.model = data.model || null;
    } catch { /* static hosting: use the on-device assistant */ } finally { clearTimeout(timer); }
    updateAiStatus();
  }
  function updateAiStatus() {
    const status = $('#aiStatus');
    status.dataset.mode = ai.remote ? 'claude' : 'local';
    status.textContent = ai.remote ? `Powered by Claude${ai.model ? ` (${ai.model})` : ''}` : 'On-device assistant';
  }

  function openAssistant() {
    aiPanel.hidden = false;
    aiFab.setAttribute('aria-expanded', 'true');
    if (!ai.greeted) {
      ai.greeted = true;
      addBotMessage({ reply: "Hi! Tell me what you're craving, your budget, or how many people are coming. I can book a table, set up dine-in or pickup, and show the total with tax. Tiếng Việt cũng được nhé!" });
    }
    renderAiSuggestions();
    setTimeout(() => aiInput.focus(), 50);
  }
  function closeAssistant() {
    aiPanel.hidden = true;
    aiFab.setAttribute('aria-expanded', 'false');
    aiFab.focus();
  }
  aiFab.addEventListener('click', openAssistant);
  $('#aiClose').addEventListener('click', closeAssistant);
  aiPanel.addEventListener('keydown', event => { if (event.key === 'Escape') closeAssistant(); });
  document.addEventListener('click', event => { if (event.target.closest('[data-ai-open]') && !event.target.closest('#cartDrawer')) openAssistant(); });

  function renderAiSuggestions() {
    $('#aiSuggestions').innerHTML = SUGGESTIONS.map(text => `<button type="button" class="chip" data-suggest="${esc(text)}">${esc(text)}</button>`).join('');
  }
  $('#aiSuggestions').addEventListener('click', event => {
    const chip = event.target.closest('[data-suggest]');
    if (chip) sendToAssistant(chip.dataset.suggest);
  });

  const scrollChat = () => { aiMessages.scrollTop = aiMessages.scrollHeight; };
  const addUserMessage = text => {
    aiMessages.insertAdjacentHTML('beforeend', `<div class="msg msg-user">${esc(text)}</div>`);
    scrollChat();
  };
  function aiDishCards(ids) {
    const t = new Date();
    const dishes = ids.map(id => SF.dishById.get(id)).filter(Boolean);
    if (!dishes.length) return '';
    return `<div class="ai-cards">${dishes.map(dish => `<div class="ai-card">
      ${img(dish.image, dish.imageAlt, { widths: [160], width: 160, sizes: '64px' })}
      <button type="button" class="ai-card-text" data-open-dish="${dish.id}"><strong>${esc(dish.name)}</strong><small>${usd(dish.price)} · ★ ${dish.rating.toFixed(1)} · ${prepLabel(dish, t)}</small><small>${esc(restaurantOf(dish).name)} · ${S.formatMiles(restaurantOf(dish).distance)}</small></button>
      ${quickAdd(dish)}
    </div>`).join('')}</div>`;
  }
  function aiSummary() {
    if (!state.cart.length) return '';
    const totals = totalsFor(state.cart, { includeTip: false });
    return `<div class="ai-summary"><div class="totals">${totalsRows(totals)}</div>
      <div style="display:flex;gap:8px"><button type="button" class="button button-secondary" data-ai-cart style="flex:1">Review order</button><button type="button" class="button button-primary" data-ai-checkout style="flex:1">${state.mode === 'reservation' ? 'Book a table' : 'Checkout'}</button></div></div>`;
  }
  function addBotMessage({ reply, dishIds = [], offer = null, showSummary = false, note = '' }) {
    let html = `<div class="msg msg-bot">${esc(reply)}</div>`;
    if (note) html += `<div class="msg-note">${esc(note)}</div>`;
    if (dishIds.length) html += aiDishCards(dishIds);
    if (offer?.items?.length) {
      const totals = totalsFor(offer.items, { includeTip: false });
      html += `<button type="button" class="button button-primary ai-offer" data-offer='${esc(JSON.stringify(offer.items))}'>${icon('plus')} Add all to order · ${cents(totals.totalBeforeTip)} with tax and fees</button>`;
    }
    if (showSummary) html += aiSummary();
    aiMessages.insertAdjacentHTML('beforeend', html);
    scrollChat();
  }
  aiMessages.addEventListener('click', event => {
    const offerButton = event.target.closest('[data-offer]');
    if (offerButton) {
      JSON.parse(offerButton.dataset.offer).forEach(item => addToCart(item.dishId, item.quantity, '', { silent: true }));
      offerButton.disabled = true;
      offerButton.textContent = 'Added to your order';
      addBotMessage({ reply: 'Added. Here is your order total:', showSummary: true });
      return;
    }
    if (event.target.closest('[data-ai-cart]')) { openCart(); return; }
    if (event.target.closest('[data-ai-checkout]')) openCheckout();
  });

  // Applies the assistant's cart and settings changes now; screens (checkout, booking,
  // check-in) open right after the reply shows.
  function applyActions(actions) {
    let after = null;
    actions.forEach(action => {
      if (action.type === 'add' && SF.dishById.has(action.dishId)) addToCart(action.dishId, Math.max(1, Math.min(20, Number(action.quantity) || 1)), '', { silent: true });
      else if (action.type === 'remove') removeDish(action.dishId, Number(action.quantity) || 0);
      else if (action.type === 'clear') clearCart();
      else if (action.type === 'mode' && MODES[action.mode]) setMode(action.mode);
      else if (action.type === 'reserve') {
        const day = /^\d{4}-\d{2}-\d{2}$/.test(action.date || '') ? action.date : S.dayKey(S.addDays(new Date(), Math.max(0, Math.min(13, Number(action.dayOffset) || 0))));
        const minutes = Number.isFinite(Number(action.minutes)) ? Number(action.minutes) : null;
        after = () => startReservation({ restaurantId: SF.restaurantById.has(action.restaurantId) ? action.restaurantId : null, day, minutes, party: Number(action.party) || null });
      } else if (action.type === 'checkout') after = () => openCheckout();
      else if (action.type === 'orders') after = () => SF.orders?.openList();
      else if (action.type === 'checkin') after = () => SF.orders?.checkInNext();
      else if (action.type === 'split') after = () => SF.orders?.splitLatest();
    });
    return after;
  }

  async function askClaude() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    const t = new Date();
    try {
      const response = await fetch('./api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          messages: aiHistory.slice(-16),
          menu: menuForAi,
          restaurants: restaurantsForAi,
          cart: aggregatedCart(),
          context: {
            mode: state.mode, state: state.taxState, taxRate: SF.taxRateFor(state.taxState), budget: state.budget,
            localTime: t.toLocaleString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }),
            today: S.dayKey(t),
            openNow: SF.restaurants.filter(restaurant => S.isOpenAt(restaurant, t)).map(restaurant => restaurant.id)
          }
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Assistant error ${response.status}`);
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  async function sendToAssistant(text) {
    const message = String(text || '').trim();
    if (!message || ai.busy) return;
    if (aiPanel.hidden) openAssistant();
    ai.busy = true;
    $('.ai-send').disabled = true;
    addUserMessage(message);
    aiHistory.push({ role: 'user', content: message });
    aiMessages.insertAdjacentHTML('beforeend', '<div class="msg msg-bot typing" id="aiTyping" aria-label="Assistant is typing"><span></span><span></span><span></span></div>');
    scrollChat();
    let result = null;
    let note = '';
    if (ai.remote) {
      try {
        const data = await askClaude();
        const actions = Array.isArray(data.actions) ? data.actions : [];
        const shown = actions.filter(action => action.type === 'show').flatMap(action => action.dishIds || []);
        const changed = actions.some(action => ['add', 'remove', 'clear', 'mode'].includes(action.type));
        const after = applyActions(actions);
        result = { reply: data.reply || 'Done.', dishIds: [...new Set(shown)], showSummary: changed || /total|tax|thuế|tổng/i.test(message), after };
      } catch {
        note = 'Claude is unavailable right now, so the on-device assistant answered.';
      }
    }
    if (!result) {
      await new Promise(resolve => setTimeout(resolve, 220));
      const local = SF.assistant.respond(message, {
        dishes: SF.dishes, restaurants: SF.restaurants, cart: aggregatedCart(), mode: state.mode, state: state.taxState,
        totalsFor: items => totalsFor(items, { includeTip: false }), now: new Date(),
        hasOrders: state.orders.length > 0
      });
      result = { ...local, after: applyActions(local.actions) };
    }
    $('#aiTyping')?.remove();
    aiHistory.push({ role: 'assistant', content: result.reply });
    addBotMessage({ ...result, note });
    ai.busy = false;
    $('.ai-send').disabled = false;
    if (result.after) setTimeout(result.after, 350);
  }
  $('#aiForm').addEventListener('submit', event => {
    event.preventDefault();
    const text = aiInput.value;
    aiInput.value = '';
    sendToAssistant(text);
  });

  // ---------- Share the site / QR ----------
  const shareDialog = $('#shareDialog');
  const qrContainer = $('#shareQrCode');
  let activeQrUrl = '';
  $('#openShareQr').addEventListener('click', () => {
    activeQrUrl = new URL('./', location.href).href;
    $('#shareUrl').textContent = activeQrUrl;
    makeQr(qrContainer, activeQrUrl, 224);
    const hint = $('#qrHint');
    if (location.protocol === 'file:') hint.textContent = 'This local file address cannot be opened by other devices. Publish the site to create a public QR code.';
    else if (['localhost', '127.0.0.1'].includes(location.hostname)) hint.textContent = 'This localhost address only works on this computer. Open the Wi-Fi address printed by serve.py to share with a phone.';
    else if (/^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(location.hostname)) hint.textContent = 'This local network QR works only for devices on the same Wi-Fi while your server is running.';
    else hint.textContent = 'This QR code points to the public website currently open in your browser.';
    openDialog(shareDialog);
  });
  $('#copySiteLink').addEventListener('click', () => copyText(activeQrUrl, 'Website link copied'));
  $('#downloadQr').addEventListener('click', () => {
    const canvas = qrContainer.querySelector('canvas');
    const image = qrContainer.querySelector('img');
    const dataUrl = canvas?.toDataURL('image/png') || image?.src;
    if (!dataUrl) { toast('The QR code is not ready yet.'); return; }
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = 'smartfoodie-qr.png';
    link.click();
  });

  // ---------- Start ----------
  syncModeButtons();
  updateAddressChip();
  syncPriceControls();
  renderBrowse();
  cartChanged();
  detectRemoteAssistant();
  SF.app = {
    state, orders, toast, openDish, openRestaurant, openAssistant, sendToAssistant, setTaxState, setMode,
    addToCart, openCart, openCheckout, startReservation, reorderOrder, totalsFor, orderedToday, dishCard,
    quickAdd, topReview, shortName, courseRows, syncAllScrollButtons, reviewList, restaurantOf, renderBrowse
  };
  window.SFApp = SF.app;

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
})();
