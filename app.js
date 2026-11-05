// SmartFoodie app: browsing, search, cart, checkout with tax, and the AI assistant.
(() => {
  const SF = window.SF;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const icon = (name, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const usd = dollars => `$${Number(dollars).toFixed(2)}`;
  const cents = SF.formatMoney;
  const normalize = SF.assistant.normalize;
  const restaurantOf = dish => SF.restaurantById.get(dish.restaurantId);
  const deliveryFees = Object.fromEntries(SF.restaurants.map(restaurant => [restaurant.id, restaurant.deliveryFee]));

  // ---------- Storage (per-device conveniences; the site works without it) ----------
  const store = {
    get(key, fallback) {
      try { const value = localStorage.getItem(`sf:${key}`); return value == null ? fallback : JSON.parse(value); } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(`sf:${key}`, JSON.stringify(value)); } catch { /* storage unavailable */ }
    }
  };

  const sanitizeCart = lines => (Array.isArray(lines) ? lines : [])
    .filter(line => line && SF.dishById.has(line.dishId) && Number(line.quantity) > 0)
    .map(line => ({ dishId: line.dishId, quantity: Math.min(99, Math.floor(Number(line.quantity))), note: String(line.note || '').slice(0, 140) }));

  const state = {
    category: 'all',
    chips: new Set(),
    sort: 'recommended',
    query: '',
    mode: store.get('mode', 'delivery') === 'pickup' ? 'pickup' : 'delivery',
    cart: sanitizeCart(store.get('cart', [])),
    location: store.get('location', null),
    taxState: SF.TAX_RATES[store.get('taxState', 'CA')] ? store.get('taxState', 'CA') : 'CA',
    budget: Number(store.get('budget', 25)) || 25,
    tip: store.get('tip', { percent: 15, custom: null }),
    orders: Array.isArray(store.get('orders', [])) ? store.get('orders', []) : []
  };

  // ---------- Toast ----------
  let toastTimer;
  const toast = message => {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  };

  // ---------- Images ----------
  const PLACEHOLDER = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="#ebebea"/><text x="2" y="1.85" font-size="1" text-anchor="middle">🍽️</text></svg>')}`;
  const img = (image, alt, { sizes = '(max-width: 760px) 50vw, 300px', widths = [400, 800], width = 600, eager = false } = {}) => {
    const srcset = SF.imageSrcset(image, widths);
    return `<img src="${esc(SF.imageUrl(image, width))}"${srcset ? ` srcset="${esc(srcset)}" sizes="${sizes}"` : ''} alt="${esc(alt)}" loading="${eager ? 'eager' : 'lazy'}" decoding="async">`;
  };
  // Replace any photo that fails to load with a neutral placeholder instead of a broken icon.
  document.addEventListener('error', event => {
    const target = event.target;
    if (target instanceof HTMLImageElement && !target.dataset.failed && !target.closest('.qr-code, .leaflet-container')) {
      target.dataset.failed = '1';
      target.removeAttribute('srcset');
      target.src = PLACEHOLDER;
    }
  }, true);

  // ---------- Cart ----------
  const cartQuantity = dishId => state.cart.filter(line => line.dishId === dishId).reduce((sum, line) => sum + line.quantity, 0);
  const cartCount = () => state.cart.reduce((sum, line) => sum + line.quantity, 0);
  const pricingItems = lines => lines.map(line => {
    const dish = SF.dishById.get(line.dishId);
    return { price: dish.price, quantity: line.quantity, restaurantId: dish.restaurantId };
  });
  const totalsFor = (lines = state.cart, { includeTip = true, mode = state.mode } = {}) => SF.computeTotals({
    items: pricingItems(lines),
    mode,
    state: state.taxState,
    deliveryFees,
    tipPercent: includeTip ? state.tip.percent : 0,
    tipAmount: includeTip ? state.tip.custom : null
  });
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

  function setMode(mode) {
    state.mode = mode === 'pickup' ? 'pickup' : 'delivery';
    store.set('mode', state.mode);
    $$('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === state.mode)));
    renderRestaurants();
    cartChanged();
  }

  function cartChanged() {
    const count = cartCount();
    $('#cartCount').textContent = count;
    $('#cartButtonTotal').textContent = count ? cents(totalsFor(state.cart, { includeTip: false }).subtotal) : '';
    $('#cartButton').setAttribute('aria-label', count ? `Open your order: ${count} item${count === 1 ? '' : 's'}` : 'Open your order');
    $$('[data-add]').forEach(button => {
      const quantity = cartQuantity(button.dataset.add);
      button.classList.toggle('in-cart', quantity > 0);
      button.innerHTML = quantity ? `<span>${quantity}</span>` : icon('plus');
    });
    if ($('#cartDrawer').open) renderCart();
    if ($('#checkoutDialog').open) renderCheckoutSummary();
  }

  // ---------- Browsing: filters, sorting ----------
  const CHIP_TESTS = {
    top: dish => dish.rating >= 4.8,
    under15: dish => dish.price <= 15,
    fast: dish => dish.prep <= 15,
    vegetarian: dish => dish.diet === 'vegetarian' || dish.diet === 'vegan',
    spicy: dish => dish.spicy > 0,
    new: dish => dish.isNew
  };
  const searchText = new Map(SF.dishes.map(dish => {
    const restaurant = restaurantOf(dish);
    return [dish.id, normalize(`${dish.name} ${restaurant.name} ${dish.cuisine} ${dish.tags.join(' ')} ${dish.aliases.join(' ')} ${dish.description} ${dish.diet}`)];
  }));
  const queryMatches = (text, query) => normalize(query).split(' ').filter(Boolean).every(token => text.includes(token));

  function filteredDishes({ ignoreChips = false } = {}) {
    const dishes = SF.dishes.filter(dish => SF.dishMatchesCategory(dish, state.category)
      && (ignoreChips || [...state.chips].every(chip => CHIP_TESTS[chip](dish)))
      && (!state.query || queryMatches(searchText.get(dish.id), state.query)));
    const sorters = {
      recommended: (a, b) => (b.rating * 2 + Math.log10(b.ratingCount) * 0.6 + (b.isNew ? 0.1 : 0)) - (a.rating * 2 + Math.log10(a.ratingCount) * 0.6 + (a.isNew ? 0.1 : 0)),
      rating: (a, b) => b.rating - a.rating || b.ratingCount - a.ratingCount,
      price: (a, b) => a.price - b.price || b.rating - a.rating,
      fastest: (a, b) => a.prep - b.prep || b.rating - a.rating
    };
    return dishes.sort(sorters[state.sort] || sorters.recommended);
  }

  const etaText = restaurant => (state.mode === 'pickup'
    ? `Pickup in ${Math.max(10, restaurant.eta[0] - 10)} min`
    : `${restaurant.eta[0]}–${restaurant.eta[1]} min`);
  const feeText = restaurant => (state.mode === 'pickup' ? 'No delivery fee' : `${usd(restaurant.deliveryFee)} delivery fee`);
  const stars = rating => `<span class="stars" aria-label="${rating} out of 5 stars">${[1, 2, 3, 4, 5].map(n => icon('star', `icon${n <= Math.round(rating) ? '' : ' off'}`)).join('')}</span>`;
  const ratingInline = dish => `<span class="stars-inline">${icon('star')}${dish.rating.toFixed(1)} <small>(${dish.ratingCount})</small></span>`;

  function dishCard(dish, { sizes } = {}) {
    const restaurant = restaurantOf(dish);
    const quantity = cartQuantity(dish.id);
    return `<article class="dish-card">
      <div class="media-wrap">
        <button type="button" class="dish-media" data-open-dish="${dish.id}" aria-label="${esc(dish.name)} details">
          ${img(dish.image, dish.imageAlt, { sizes })}
          ${dish.isNew ? '<span class="badge badge-new">New</span>' : ''}
          ${dish.spicy > 1 ? '<span class="badge badge-spicy">Spicy</span>' : ''}
        </button>
        <button type="button" class="quick-add${quantity ? ' in-cart' : ''}" data-add="${dish.id}" aria-label="Add ${esc(dish.name)} to order">${quantity ? `<span>${quantity}</span>` : icon('plus')}</button>
      </div>
      <div class="dish-body">
        <h3>${esc(dish.name)}</h3>
        <div class="dish-line"><span class="price">${usd(dish.price)}</span><span class="dot">•</span>${ratingInline(dish)}</div>
        <div class="dish-sub">${esc(restaurant.name)} · ${dish.prep} min</div>
      </div>
    </article>`;
  }

  function restaurantCard(restaurant, highlightCount) {
    return `<button type="button" class="rest-card" data-open-restaurant="${restaurant.id}">
      <div class="rest-media">${img(restaurant.image, `${restaurant.name}: ${restaurant.tagline}`, { sizes: '(max-width: 760px) 78vw, 320px' })}${highlightCount ? `<span class="rest-badge">${highlightCount} matching dish${highlightCount === 1 ? '' : 'es'}</span>` : ''}</div>
      <div class="rest-info">
        <div class="rest-title"><h3>${esc(restaurant.name)}</h3><span class="rating-pill" aria-label="Rated ${restaurant.rating} out of 5">${restaurant.rating.toFixed(1)}</span></div>
        <p class="rest-meta"><b>${feeText(restaurant)}</b> · ${etaText(restaurant)}</p>
        <p class="rest-meta">${esc(restaurant.cuisine)} · ${restaurant.priceLevel} · ${restaurant.ratingCount.toLocaleString('en-US')} ratings</p>
      </div>
    </button>`;
  }

  function renderRail() {
    $('#categoryRail').innerHTML = SF.categories.map(category => {
      const count = category.id === 'all' ? SF.dishes.length : SF.dishes.filter(dish => SF.dishMatchesCategory(dish, category.id)).length;
      return `<button type="button" class="rail-item" role="tab" data-category="${category.id}" aria-selected="${category.id === state.category}">
        <span class="rail-icon" aria-hidden="true">${category.icon}</span><span class="rail-label">${category.label}</span><span class="rail-count">${count}</span>
      </button>`;
    }).join('');
  }

  function renderRestaurants() {
    const filtering = state.category !== 'all' || state.query || state.chips.size;
    const matches = filteredDishes();
    const counts = new Map();
    matches.forEach(dish => counts.set(dish.restaurantId, (counts.get(dish.restaurantId) || 0) + 1));
    const list = filtering
      ? SF.restaurants.filter(restaurant => counts.has(restaurant.id)).sort((a, b) => counts.get(b.id) - counts.get(a.id) || b.rating - a.rating)
      : [...SF.restaurants].sort((a, b) => b.rating - a.rating || b.ratingCount - a.ratingCount);
    $('#restaurants').hidden = list.length === 0;
    $('#restaurantsSub').textContent = filtering
      ? `${list.length} restaurant${list.length === 1 ? '' : 's'} with dishes that match.`
      : 'Tap a restaurant to see its full menu and reviews.';
    $('#restaurantRow').innerHTML = list.map(restaurant => restaurantCard(restaurant, filtering ? counts.get(restaurant.id) : 0)).join('');
  }

  function renderNewRow() {
    const fresh = SF.dishes.filter(dish => dish.isNew && SF.dishMatchesCategory(dish, state.category));
    const hide = fresh.length === 0 || state.query || state.chips.has('new');
    $('#new-dishes').hidden = Boolean(hide);
    if (!hide) $('#newRow').innerHTML = fresh.map(dish => dishCard(dish, { sizes: '(max-width: 760px) 46vw, 250px' })).join('');
  }

  function renderGrid() {
    const dishes = filteredDishes();
    const category = SF.categories.find(item => item.id === state.category);
    const title = state.query ? `Results for “${state.query}”` : category.id === 'all' ? 'All dishes' : `${category.label} dishes`;
    $('#dishesTitle').textContent = title;
    $('#dishesSub').textContent = `${dishes.length} dish${dishes.length === 1 ? '' : 'es'}${state.chips.size ? ' · filtered' : ''}`;
    $('#dishGrid').innerHTML = dishes.map(dish => dishCard(dish)).join('');
    $('#dishEmpty').hidden = dishes.length > 0;
    $('#clearFilters').hidden = !(state.chips.size || state.category !== 'all' || state.query || state.sort !== 'recommended');
  }

  function renderBrowse() {
    renderRestaurants();
    renderNewRow();
    renderGrid();
    window.dispatchEvent(new CustomEvent('sf:category', { detail: { category: state.category } }));
  }

  function setCategory(categoryId) {
    state.category = categoryId;
    $$('.rail-item').forEach(item => item.setAttribute('aria-selected', String(item.dataset.category === categoryId)));
    renderBrowse();
  }

  function clearFilters() {
    state.chips.clear();
    state.query = '';
    state.sort = 'recommended';
    $('#sortSelect').value = 'recommended';
    $('#searchInput').value = '';
    $$('#filterBar [data-chip]').forEach(chip => chip.setAttribute('aria-pressed', 'false'));
    setCategory('all');
  }

  $('#categoryRail').addEventListener('click', event => {
    const item = event.target.closest('[data-category]');
    if (item) setCategory(item.dataset.category);
  });
  $('#filterBar').addEventListener('click', event => {
    const chip = event.target.closest('[data-chip]');
    if (!chip) return;
    const key = chip.dataset.chip;
    if (state.chips.has(key)) state.chips.delete(key); else state.chips.add(key);
    chip.setAttribute('aria-pressed', String(state.chips.has(key)));
    renderBrowse();
  });
  $('#sortSelect').addEventListener('change', event => { state.sort = event.target.value; renderGrid(); });
  $('#clearFilters').addEventListener('click', clearFilters);
  $('#emptyClear').addEventListener('click', clearFilters);

  // Scroller arrows
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-scroll]');
    if (!button) return;
    const row = document.getElementById(button.dataset.scroll);
    row.scrollBy({ left: Number(button.dataset.dir) * row.clientWidth * 0.85, behavior: 'smooth' });
  });

  // Promo cards
  $('.promo-row').addEventListener('click', event => {
    const card = event.target.closest('[data-promo]');
    if (!card) return;
    if (card.dataset.promo === 'ai') openAssistant();
    if (card.dataset.promo === 'nearby') $('#nearby').scrollIntoView({ behavior: 'smooth' });
    if (card.dataset.promo === 'new') {
      state.chips.add('new');
      $('#filterBar [data-chip="new"]').setAttribute('aria-pressed', 'true');
      renderBrowse();
      $('#dishes').scrollIntoView({ behavior: 'smooth' });
    }
  });

  // Global click handling for dish cards, restaurant cards, quick add
  document.addEventListener('click', event => {
    const add = event.target.closest('[data-add]');
    if (add) { addToCart(add.dataset.add, 1); return; }
    const openDishButton = event.target.closest('[data-open-dish]');
    if (openDishButton) { openDish(openDishButton.dataset.openDish); return; }
    const openRestaurantButton = event.target.closest('[data-open-restaurant]');
    if (openRestaurantButton) openRestaurant(openRestaurantButton.dataset.openRestaurant);
  });

  // ---------- Instant search ----------
  const searchInput = $('#searchInput');
  const searchResults = $('#searchResults');
  const restaurantSearchText = new Map(SF.restaurants.map(restaurant => [restaurant.id,
    normalize(`${restaurant.name} ${restaurant.cuisine} ${restaurant.tagline} ${restaurant.dishIds.map(id => SF.dishById.get(id).name).join(' ')}`)]));
  let activeOption = -1;

  const highlight = (text, query) => {
    const tokens = normalize(query).split(' ').filter(Boolean);
    if (!tokens.length) return esc(text);
    const plain = normalize(text);
    // Highlight the first matching token at a word start, mapping back to the original string.
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

  const rank = (name, haystack, query) => {
    const q = normalize(query);
    const n = normalize(name);
    if (!queryMatches(haystack, query)) return -1;
    if (n.startsWith(q)) return 100;
    if (n.split(' ').some(word => word.startsWith(q))) return 70;
    if (n.includes(q)) return 50;
    return 20;
  };

  function renderSuggestions() {
    const query = searchInput.value.trim();
    activeOption = -1;
    if (!query) { closeSuggestions(); return; }
    const dishes = SF.dishes.map(dish => ({ dish, score: rank(`${dish.name} ${dish.aliases.join(' ')}`, searchText.get(dish.id), query) + dish.rating }))
      .filter(item => item.score >= 0).sort((a, b) => b.score - a.score).slice(0, 6);
    const restaurants = SF.restaurants.map(restaurant => ({ restaurant, score: rank(restaurant.name, restaurantSearchText.get(restaurant.id), query) + restaurant.rating }))
      .filter(item => item.score >= 0).sort((a, b) => b.score - a.score).slice(0, 4);
    const categories = SF.categories.filter(category => category.id !== 'all' && normalize(category.label).startsWith(normalize(query))).slice(0, 2);
    let html = '';
    if (categories.length) html += `<div class="search-group-label">Cuisines</div>${categories.map(category => `<button type="button" class="search-option" role="option" data-search-category="${category.id}"><span class="search-emoji">${category.icon}</span><span><strong>${highlight(category.label, query)}</strong><small>Show all ${category.label} dishes</small></span></button>`).join('')}`;
    if (dishes.length) html += `<div class="search-group-label">Dishes</div>${dishes.map(({ dish }) => `<button type="button" class="search-option" role="option" data-search-dish="${dish.id}">${img(dish.image, '', { widths: [120], width: 120, sizes: '44px' })}<span><strong>${highlight(dish.name, query)}</strong><small>${usd(dish.price)} · ${esc(restaurantOf(dish).name)} · ★ ${dish.rating.toFixed(1)}</small></span></button>`).join('')}`;
    if (restaurants.length) html += `<div class="search-group-label">Restaurants</div>${restaurants.map(({ restaurant }) => `<button type="button" class="search-option" role="option" data-search-restaurant="${restaurant.id}">${img(restaurant.image, '', { widths: [120], width: 120, sizes: '44px' })}<span><strong>${highlight(restaurant.name, query)}</strong><small>${esc(restaurant.cuisine)} · ★ ${restaurant.rating.toFixed(1)} · ${etaText(restaurant)}</small></span></button>`).join('')}`;
    if (!html) html = `<div class="search-empty">No matches for “${esc(query)}”. Press Enter to ask the AI assistant instead.</div>`;
    else html += `<button type="button" class="search-option" role="option" data-search-all><span class="search-emoji">${icon('search')}</span><span><strong>See all results for “${esc(query)}”</strong><small>Show matching dishes and restaurants</small></span></button>`;
    searchResults.innerHTML = html;
    searchResults.hidden = false;
    searchInput.setAttribute('aria-expanded', 'true');
  }

  function closeSuggestions() {
    searchResults.hidden = true;
    searchInput.setAttribute('aria-expanded', 'false');
    searchInput.removeAttribute('aria-activedescendant');
  }

  function applySearch(query) {
    state.query = query.trim();
    closeSuggestions();
    renderBrowse();
    $('#dishes').scrollIntoView({ behavior: 'smooth' });
  }

  function chooseSuggestion(option) {
    if (!option) return;
    if (option.dataset.searchDish) { closeSuggestions(); openDish(option.dataset.searchDish); }
    else if (option.dataset.searchRestaurant) { closeSuggestions(); openRestaurant(option.dataset.searchRestaurant); }
    else if (option.dataset.searchCategory) { searchInput.value = ''; state.query = ''; closeSuggestions(); setCategory(option.dataset.searchCategory); $('#dishes').scrollIntoView({ behavior: 'smooth' }); }
    else if ('searchAll' in option.dataset) applySearch(searchInput.value);
  }

  searchInput.addEventListener('input', () => {
    renderSuggestions();
    if (!searchInput.value.trim() && state.query) { state.query = ''; renderBrowse(); }
  });
  searchInput.addEventListener('focus', () => { if (searchInput.value.trim()) renderSuggestions(); });
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
      if (activeOption >= 0 && options[activeOption]) chooseSuggestion(options[activeOption]);
      else if (searchInput.value.trim() && !options.length) { const text = searchInput.value.trim(); closeSuggestions(); openAssistant(); sendToAssistant(text); }
      else if (searchInput.value.trim()) applySearch(searchInput.value);
    } else if (event.key === 'Escape') {
      closeSuggestions();
    }
  });
  searchResults.addEventListener('mousedown', event => event.preventDefault());
  searchResults.addEventListener('click', event => chooseSuggestion(event.target.closest('.search-option')));
  document.addEventListener('click', event => { if (!event.target.closest('#globalSearch')) closeSuggestions(); });
  document.addEventListener('keydown', event => {
    if (event.key === '/' && !event.target.closest('input, textarea, select') && !document.querySelector('dialog[open]')) {
      event.preventDefault();
      searchInput.focus();
    }
  });

  // ---------- Dialog helpers ----------
  const openDialog = dialog => { if (!dialog.open) dialog.showModal(); };
  $$('dialog').forEach(dialog => {
    dialog.addEventListener('click', event => {
      if (event.target.closest('[data-close]')) { dialog.close(); return; }
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      const outside = event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
      if (outside) dialog.close();
    });
  });

  // ---------- Dish details ----------
  const daysAgoText = days => (days <= 1 ? 'Yesterday' : days < 7 ? `${days} days ago` : days < 14 ? '1 week ago' : `${Math.floor(days / 7)} weeks ago`);
  const initials = name => name.split(' ').map(part => part[0]).join('').slice(0, 2);
  const reviewList = reviews => reviews.map(review => `<article class="review">
      <div class="review-head"><div class="review-person"><span class="avatar" aria-hidden="true">${esc(initials(review.name))}</span><div><strong>${esc(review.name)}</strong><small>${daysAgoText(review.daysAgo)}</small></div></div>${stars(review.rating)}</div>
      <p>${esc(review.text)}</p>
    </article>`).join('');

  const dietLabel = { vegan: 'Vegan', vegetarian: 'Vegetarian', seafood: 'Seafood', meat: '' };

  function openDish(dishId) {
    const dish = SF.dishById.get(dishId);
    if (!dish) return;
    const restaurant = restaurantOf(dish);
    const breakdown = SF.ratingBreakdown(dish.rating, dish.ratingCount);
    const histogram = [5, 4, 3, 2, 1].map(starCount => {
      const share = dish.ratingCount ? Math.round(breakdown[starCount] / dish.ratingCount * 100) : 0;
      return `<div class="histogram-row"><span>${starCount}★</span><div class="histogram-bar"><span style="width:${share}%"></span></div><span>${share}%</span></div>`;
    }).join('');
    const tags = [
      dietLabel[dish.diet] ? `<span class="tag tag-diet">${dietLabel[dish.diet]}</span>` : '',
      dish.spicy ? `<span class="tag tag-spicy">${'🌶'.repeat(dish.spicy)} ${dish.spicy > 1 ? 'Spicy' : 'Mild heat'}</span>` : '',
      `<span class="tag">${icon('clock')} ${dish.prep} min prep</span>`,
      ...dish.tags.map(tag => `<span class="tag">${esc(tag)}</span>`)
    ].join('');
    $('#dishDialogBody').innerHTML = `
      <div class="dish-hero">${img(dish.image, dish.imageAlt, { widths: [800, 1200], width: 900, sizes: '(max-width: 900px) 100vw, 470px', eager: true })}</div>
      <div class="dish-detail">
        <div>
          <p class="eyebrow">${esc(dish.cuisine)} · <button type="button" data-open-restaurant="${restaurant.id}">${esc(restaurant.name)}</button>${dish.isNew ? ' · <b style="color:var(--brand)">New</b>' : ''}</p>
          <h2 id="dishDialogTitle">${esc(dish.name)}</h2>
          <p class="dish-price">${usd(dish.price)}</p>
        </div>
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
        </form>
        <section aria-label="Customer reviews">
          <p class="detail-label">What people say</p>
          <div class="reviews">${reviewList(dish.reviews)}</div>
          <p class="sample-note">Sample reviews for this demo.</p>
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

  // ---------- Restaurant menu ----------
  function openRestaurant(restaurantId) {
    const restaurant = SF.restaurantById.get(restaurantId);
    if (!restaurant) return;
    const dishes = restaurant.dishIds.map(id => SF.dishById.get(id));
    const average = restaurant.reviews.reduce((sum, review) => sum + review.rating, 0) / restaurant.reviews.length;
    $('#restaurantDialogBody').innerHTML = `
      <div class="rest-cover">${img(restaurant.image, `${restaurant.name}: ${restaurant.tagline}`, { widths: [800, 1400], width: 1000, sizes: '(max-width: 760px) 100vw, 820px', eager: true })}<h2 id="restaurantDialogTitle">${esc(restaurant.name)}</h2></div>
      <div class="rest-facts">
        <span>${icon('star')} <b>${restaurant.rating.toFixed(1)}</b> (${restaurant.ratingCount.toLocaleString('en-US')} ratings)</span>
        <span>${icon('clock')} ${etaText(restaurant)}</span>
        <span>${icon(state.mode === 'pickup' ? 'store' : 'scooter')} ${feeText(restaurant)}</span>
        <span>${esc(restaurant.cuisine)} · ${restaurant.priceLevel}</span>
      </div>
      <div class="rest-section">
        <h3>Menu</h3>
        <div class="menu-list">${dishes.map(dish => `<div class="menu-item">
          <button type="button" class="menu-item-text" data-open-dish="${dish.id}">
            <strong>${esc(dish.name)}${dish.isNew ? ' <span class="tag" style="background:var(--brand-soft);color:var(--brand)">New</span>' : ''}</strong>
            <span class="dish-line"><span class="price">${usd(dish.price)}</span><span class="dot">•</span>${ratingInline(dish)}<span class="dot">•</span>${dish.prep} min</span>
            <p>${esc(dish.description)}</p>
          </button>
          <div class="menu-item-media">${img(dish.image, dish.imageAlt, { widths: [240], width: 240, sizes: '104px' })}<button type="button" class="quick-add${cartQuantity(dish.id) ? ' in-cart' : ''}" data-add="${dish.id}" aria-label="Add ${esc(dish.name)} to order">${cartQuantity(dish.id) ? `<span>${cartQuantity(dish.id)}</span>` : icon('plus')}</button></div>
        </div>`).join('')}</div>
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

  // ---------- Cart drawer ----------
  const stateOptions = selected => Object.entries(SF.TAX_RATES)
    .sort((a, b) => a[1][0].localeCompare(b[1][0]))
    .map(([code, [name, rate]]) => `<option value="${code}"${code === selected ? ' selected' : ''}>${name} (${rate}%)</option>`).join('');

  function totalsRows(totals, { showTip = false, taxSelect = false } = {}) {
    const rows = [
      ['Food subtotal', totals.subtotal],
      state.mode === 'delivery' ? [`Delivery fee${totals.restaurantCount > 1 ? ` (${totals.restaurantCount} restaurants)` : ''}`, totals.delivery] : null,
      ['Service fee <small>(5%, min $1, max $5)</small>', totals.service],
      totals.smallOrder ? ['Small order fee <small>(under $10)</small>', totals.smallOrder] : null,
      [taxSelect
        ? `<span class="tax-select">Sales tax <select data-tax-state aria-label="State for sales tax">${stateOptions(state.taxState)}</select></span>`
        : `Sales tax <small>(${state.taxState} ${totals.taxRate}% of food)</small>`, totals.tax],
      showTip && state.mode === 'delivery' ? ['Driver tip', totals.tip] : null
    ].filter(Boolean);
    return `${rows.map(([label, value]) => `<div class="totals-row"><span>${label}</span><span>${cents(value)}</span></div>`).join('')}
      <div class="totals-row totals-total"><span>${showTip ? 'Total' : 'Estimated total'}</span><span>${cents(showTip ? totals.total : totals.totalBeforeTip)}</span></div>
      ${showTip ? '' : `<div class="totals-row"><span class="info">${state.mode === 'delivery' ? 'Tip is added at checkout.' : 'Pickup: no delivery fee or tip.'}</span></div>`}`;
  }

  function renderCart() {
    const body = $('#cartBody');
    const foot = $('#cartFoot');
    const modeToggle = `<div class="segmented drawer-mode" role="group" aria-label="Order type">
      <button type="button" data-mode="delivery" aria-pressed="${state.mode === 'delivery'}">${icon('scooter')} Delivery</button>
      <button type="button" data-mode="pickup" aria-pressed="${state.mode === 'pickup'}">${icon('store')} Pickup</button></div>`;
    const recent = state.orders.slice(0, 3).map(order => `<div class="recent-order"><div><strong>${esc(order.id)}</strong><small>${new Date(order.placedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${order.items.reduce((sum, item) => sum + item.quantity, 0)} items · ${cents(order.totals.total)}</small></div><button type="button" class="button button-secondary" data-reorder="${esc(order.id)}">Reorder</button></div>`).join('');
    if (!state.cart.length) {
      body.innerHTML = `${modeToggle}<div class="cart-empty">${icon('bag')}<strong>Your order is empty</strong><p>Add dishes from any restaurant, or ask the AI assistant to build an order for you.</p><button type="button" class="button button-secondary" data-ai-open>${icon('spark')} Ask AI</button></div>${recent ? `<div class="recent-orders"><h3>Order again</h3>${recent}</div>` : ''}`;
      foot.innerHTML = '';
      foot.hidden = true;
      return;
    }
    foot.hidden = false;
    const groups = new Map();
    state.cart.forEach((line, index) => {
      const dish = SF.dishById.get(line.dishId);
      if (!groups.has(dish.restaurantId)) groups.set(dish.restaurantId, []);
      groups.get(dish.restaurantId).push({ line, index, dish });
    });
    const totals = totalsFor(state.cart, { includeTip: false });
    const spentShare = Math.min(100, Math.round(totals.totalBeforeTip / (state.budget * 100) * 100));
    const over = totals.totalBeforeTip > state.budget * 100;
    body.innerHTML = `${modeToggle}
      ${[...groups.entries()].map(([restaurantId, lines]) => {
        const restaurant = SF.restaurantById.get(restaurantId);
        return `<section class="cart-group"><div class="cart-group-head"><strong>${esc(restaurant.name)}</strong><small>${etaText(restaurant)}</small></div>
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
      <button type="button" class="chip chip-clear" id="clearCart" style="margin-top:12px">Clear order</button>`;
    foot.innerHTML = `<div class="totals">${totalsRows(totals, { taxSelect: true })}</div>
      <button type="button" class="button button-primary button-block" id="goCheckout" style="margin-top:14px">Go to checkout · ${cents(totals.totalBeforeTip)}</button>`;
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
    const reorder = event.target.closest('[data-reorder]');
    if (reorder) {
      const order = state.orders.find(item => item.id === reorder.dataset.reorder);
      order?.items.forEach(item => { if (SF.dishById.has(item.dishId)) addToCart(item.dishId, item.quantity, item.note, { silent: true }); });
      toast('Added your previous order');
    }
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
  document.addEventListener('change', event => {
    if (event.target.matches('[data-tax-state]')) setTaxState(event.target.value);
  });
  document.addEventListener('click', event => {
    const modeButton = event.target.closest('[data-mode]');
    if (modeButton) setMode(modeButton.dataset.mode);
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
    const label = state.location?.zip ? `${state.location.city ? `${state.location.city}, ` : ''}${state.location.state} ${state.location.zip}` : `Tax: ${state.taxState}`;
    $('#addressLabel').textContent = label;
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

  // Address dialog
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

  // ---------- Checkout ----------
  const checkoutDialog = $('#checkoutDialog');
  const TIP_CHOICES = [0, 10, 15, 18, 20];

  function renderTipOptions() {
    const totals = totalsFor(state.cart, { includeTip: false });
    $('#tipOptions').innerHTML = TIP_CHOICES.map(percent => `<button type="button" class="chip" data-tip="${percent}" aria-pressed="${state.tip.custom == null && state.tip.percent === percent}">${percent ? `${percent}%` : 'No tip'}${percent ? `<span>${cents(Math.round(totals.subtotal * percent / 100))}</span>` : ''}</button>`).join('')
      + `<label class="tip-custom${state.tip.custom != null ? ' is-active' : ''}"><span>Other $</span><input type="number" min="0" step="0.5" inputmode="decimal" id="tipCustom" aria-label="Custom tip in dollars" value="${state.tip.custom ?? ''}" placeholder="0.00"></label>`;
  }

  function renderCheckoutSummary() {
    if (!state.cart.length) { checkoutDialog.close(); return; }
    $$('[data-checkout-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.checkoutMode === state.mode)));
    $('#deliveryFields').hidden = state.mode !== 'delivery';
    $('#tipFields').hidden = state.mode !== 'delivery';
    $('#pickupFields').hidden = state.mode !== 'pickup';
    const restaurants = [...new Set(state.cart.map(line => SF.dishById.get(line.dishId).restaurantId))].map(id => SF.restaurantById.get(id));
    $('#pickupInfo').textContent = `Pick up from ${restaurants.map(restaurant => restaurant.name).join(' and ')}. Ready in about ${Math.max(...state.cart.map(line => SF.dishById.get(line.dishId).prep))} minutes after you order.`;
    $('#checkoutItems').innerHTML = state.cart.map(line => {
      const dish = SF.dishById.get(line.dishId);
      return `<div class="summary-item"><span>${line.quantity} × ${esc(dish.name)}</span><b>${usd(dish.price * line.quantity)}</b></div>`;
    }).join('');
    const totals = totalsFor();
    $('#checkoutTotals').innerHTML = totalsRows(totals, { showTip: true });
    $('#placeOrderButton').textContent = `Place order · ${cents(totals.total)}`;
    if (state.mode === 'delivery') renderTipOptions();
  }

  function openCheckout() {
    if (!state.cart.length) { toast('Add a dish first'); return; }
    const saved = store.get('address', {});
    $('#checkoutStreet').value = saved.street || '';
    $('#checkoutZip').value = saved.zip || state.location?.zip || '';
    $('#checkoutNote').value = saved.note || '';
    $('#checkoutState').innerHTML = stateOptions(state.taxState);
    $('#pickupState').innerHTML = stateOptions(state.taxState);
    $('#zipHint').textContent = '';
    $('#checkoutError').hidden = true;
    $$('#checkoutForm [aria-invalid]').forEach(field => field.removeAttribute('aria-invalid'));
    renderCheckoutSummary();
    openDialog(checkoutDialog);
  }

  checkoutDialog.addEventListener('click', event => {
    const modeButton = event.target.closest('[data-checkout-mode]');
    if (modeButton) { setMode(modeButton.dataset.checkoutMode); return; }
    const tipButton = event.target.closest('[data-tip]');
    if (tipButton) {
      state.tip = { percent: Number(tipButton.dataset.tip), custom: null };
      store.set('tip', state.tip);
      renderCheckoutSummary();
    }
  });
  checkoutDialog.addEventListener('input', event => {
    if (event.target.id === 'tipCustom') {
      const value = event.target.value === '' ? null : Math.max(0, Number(event.target.value));
      state.tip = { percent: state.tip.percent, custom: Number.isFinite(value) ? value : null };
      store.set('tip', state.tip);
      $$('[data-tip]').forEach(button => button.setAttribute('aria-pressed', String(state.tip.custom == null && Number(button.dataset.tip) === state.tip.percent)));
      const totals = totalsFor();
      $('#checkoutTotals').innerHTML = totalsRows(totals, { showTip: true });
      $('#placeOrderButton').textContent = `Place order · ${cents(totals.total)}`;
    }
    if (event.target.id === 'checkoutZip') {
      const zip = event.target.value.replace(/\D/g, '').slice(0, 5);
      event.target.value = zip;
      event.target.removeAttribute('aria-invalid');
      if (zip.length !== 5) { $('#zipHint').textContent = ''; return; }
      $('#zipHint').textContent = 'Looking up ZIP…';
      lookupZip(zip).then(place => {
        if ($('#checkoutZip').value !== zip) return;
        $('#checkoutState').value = place.state;
        setTaxState(place.state, { location: place });
        $('#zipHint').dataset.tone = '';
        $('#zipHint').textContent = `${place.city}, ${place.state} · sales tax ${SF.taxRateFor(place.state)}% on food`;
      }).catch(() => {
        $('#zipHint').dataset.tone = 'error';
        $('#zipHint').textContent = "We couldn't verify this ZIP. Choose the state for tax below.";
      });
    }
    if (event.target.id === 'checkoutStreet') event.target.removeAttribute('aria-invalid');
    if (!$('#checkoutForm [aria-invalid="true"]')) $('#checkoutError').hidden = true;
  });
  checkoutDialog.addEventListener('change', event => {
    if (event.target.id === 'checkoutState' || event.target.id === 'pickupState') setTaxState(event.target.value);
  });

  $('#checkoutForm').addEventListener('submit', event => {
    event.preventDefault();
    const errors = [];
    if (state.mode === 'delivery') {
      const street = $('#checkoutStreet');
      const zip = $('#checkoutZip');
      if (street.value.trim().length < 4) { errors.push('Enter a street address.'); street.setAttribute('aria-invalid', 'true'); }
      if (!/^\d{5}$/.test(zip.value)) { errors.push('Enter a 5-digit ZIP code.'); zip.setAttribute('aria-invalid', 'true'); }
    }
    if (errors.length) {
      $('#checkoutError').textContent = errors.join(' ');
      $('#checkoutError').hidden = false;
      $('#checkoutForm [aria-invalid="true"]').focus();
      return;
    }
    store.set('address', { street: $('#checkoutStreet').value.trim(), zip: $('#checkoutZip').value, note: $('#checkoutNote').value.trim() });
    placeOrder();
  });

  // ---------- Place order & tracking (demo) ----------
  let trackerTimer = null;
  function placeOrder() {
    const totals = totalsFor();
    const prep = Math.max(...state.cart.map(line => SF.dishById.get(line.dishId).prep));
    const travel = state.mode === 'delivery' ? 15 : 0;
    const order = {
      id: `SF-${Date.now().toString(36).slice(-4).toUpperCase()}${Math.random().toString(36).slice(2, 4).toUpperCase()}`,
      placedAt: Date.now(),
      mode: state.mode,
      taxState: state.taxState,
      items: state.cart.map(line => ({ ...line })),
      totals,
      etaMinutes: prep + travel
    };
    state.orders = [order, ...state.orders].slice(0, 10);
    store.set('orders', state.orders);
    clearCart();
    checkoutDialog.close();
    showConfirmation(order);
  }

  function showConfirmation(order) {
    const eta = new Date(order.placedAt + order.etaMinutes * 60000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const steps = order.mode === 'delivery'
      ? [['Order confirmed', 'The restaurant received your order'], ['Preparing your food', 'Fresh and made to order'], ['Driver on the way', 'Your driver picked up the order'], ['Delivered', `Estimated by ${eta}`]]
      : [['Order confirmed', 'The restaurant received your order'], ['Preparing your food', 'Fresh and made to order'], ['Ready for pickup', `Estimated by ${eta}`], ['Picked up', 'Enjoy your meal!']];
    $('#confirmBody').innerHTML = `
      <div class="confirm-hero">
        <span class="confirm-check">${icon('check')}</span>
        <h2 id="confirmTitle">Order placed!</h2>
        <p>${order.mode === 'delivery' ? 'Estimated arrival' : 'Ready for pickup'} around <b>${eta}</b> (${order.etaMinutes} min)</p>
        <span class="order-number">${esc(order.id)}</span>
      </div>
      <div class="tracker" id="tracker">${steps.map(([title, detail], index) => `<div class="tracker-step${index === 0 ? ' current' : ''}"><span class="tracker-dot">${index + 1}</span><div><strong>${title}</strong><small>${detail}</small></div></div>`).join('')}</div>
      <p class="sample-note">Demo tracking runs faster than real time.</p>
      <div class="confirm-box">
        <div class="summary-items">${order.items.map(line => { const dish = SF.dishById.get(line.dishId); return `<div class="summary-item"><span>${line.quantity} × ${esc(dish.name)}</span><b>${usd(dish.price * line.quantity)}</b></div>`; }).join('')}</div>
        <div class="totals" style="margin-top:12px">${[
          ['Food subtotal', order.totals.subtotal], ['Delivery fee', order.totals.delivery], ['Service fee', order.totals.service],
          ['Small order fee', order.totals.smallOrder], [`Sales tax (${order.taxState} ${order.totals.taxRate}%)`, order.totals.tax], ['Driver tip', order.totals.tip]
        ].filter(([label, value]) => value > 0 || label.startsWith('Sales tax')).map(([label, value]) => `<div class="totals-row"><span>${label}</span><span>${cents(value)}</span></div>`).join('')}
        <div class="totals-row totals-total"><span>Total paid at ${order.mode === 'delivery' ? 'the door' : 'the counter'}</span><span>${cents(order.totals.total)}</span></div></div>
      </div>
      <button type="button" class="button button-primary button-block" data-close style="margin-top:18px">Done</button>`;
    openDialog($('#confirmDialog'));
    clearInterval(trackerTimer);
    let current = 0;
    trackerTimer = setInterval(() => {
      const items = $$('#tracker .tracker-step');
      if (!items.length || current >= items.length - 1) { clearInterval(trackerTimer); items[current]?.classList.replace('current', 'done'); return; }
      items[current].classList.remove('current');
      items[current].classList.add('done');
      current += 1;
      items[current].classList.add('current');
    }, 6000);
  }

  // ---------- AI assistant ----------
  const aiPanel = $('#aiPanel');
  const aiFab = $('#aiFab');
  const aiMessages = $('#aiMessages');
  const aiInput = $('#aiInput');
  const aiHistory = [];
  const ai = { remote: false, model: null, busy: false, greeted: false };
  const SUGGESTIONS = ['Dinner for 3 under $50', 'Something spicy under $15', 'Quick vegetarian lunch', 'Thêm 2 phở bò', "What's my total with tax?", 'Checkout'];

  const menuForAi = SF.dishes.map(dish => ({
    id: dish.id, name: dish.name, restaurant: restaurantOf(dish).name, cuisine: dish.cuisine, price: dish.price, prep: dish.prep,
    diet: dish.diet, spicy: dish.spicy, rating: dish.rating, ratingCount: dish.ratingCount, tags: dish.tags
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
      addBotMessage({ reply: "Hi! Tell me what you're craving, your budget, or how many people you're feeding. I can add dishes for you and show the total with tax. Tiếng Việt cũng được nhé!" });
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
    const dishes = ids.map(id => SF.dishById.get(id)).filter(Boolean);
    if (!dishes.length) return '';
    return `<div class="ai-cards">${dishes.map(dish => `<div class="ai-card">
      ${img(dish.image, dish.imageAlt, { widths: [160], width: 160, sizes: '64px' })}
      <button type="button" class="ai-card-text" data-open-dish="${dish.id}"><strong>${esc(dish.name)}</strong><small>${usd(dish.price)} · ★ ${dish.rating.toFixed(1)} · ${dish.prep} min</small><small>${esc(restaurantOf(dish).name)}</small></button>
      <button type="button" class="quick-add${cartQuantity(dish.id) ? ' in-cart' : ''}" data-add="${dish.id}" aria-label="Add ${esc(dish.name)} to order">${cartQuantity(dish.id) ? `<span>${cartQuantity(dish.id)}</span>` : icon('plus')}</button>
    </div>`).join('')}</div>`;
  }

  function aiSummary() {
    if (!state.cart.length) return '';
    const totals = totalsFor(state.cart, { includeTip: false });
    return `<div class="ai-summary"><div class="totals">${totalsRows(totals)}</div>
      <div style="display:flex;gap:8px"><button type="button" class="button button-secondary" data-ai-cart style="flex:1">Review order</button><button type="button" class="button button-primary" data-ai-checkout style="flex:1">Checkout</button></div></div>`;
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

  function applyActions(actions) {
    let checkout = false;
    actions.forEach(action => {
      if (action.type === 'add' && SF.dishById.has(action.dishId)) addToCart(action.dishId, Math.max(1, Math.min(20, Number(action.quantity) || 1)), '', { silent: true });
      else if (action.type === 'remove') removeDish(action.dishId, Number(action.quantity) || 0);
      else if (action.type === 'clear') clearCart();
      else if (action.type === 'mode') setMode(action.mode);
      else if (action.type === 'checkout') checkout = true;
    });
    return checkout;
  }

  async function askClaude() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch('./api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          messages: aiHistory.slice(-16),
          menu: menuForAi,
          cart: aggregatedCart(),
          context: { mode: state.mode, state: state.taxState, taxRate: SF.taxRateFor(state.taxState), budget: state.budget }
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
        const checkout = applyActions(actions);
        result = { reply: data.reply || 'Done.', dishIds: [...new Set(shown)], showSummary: changed || /total|tax|thuế|tổng/i.test(message), checkout };
      } catch (error) {
        note = 'Claude is unavailable right now, so the on-device assistant answered.';
      }
    }
    if (!result) {
      await new Promise(resolve => setTimeout(resolve, 220));
      const local = SF.assistant.respond(message, {
        dishes: SF.dishes, restaurants: SF.restaurants, cart: aggregatedCart(), mode: state.mode, state: state.taxState,
        totalsFor: items => totalsFor(items, { includeTip: false })
      });
      const checkout = applyActions(local.actions);
      result = { ...local, checkout };
    }
    $('#aiTyping')?.remove();
    aiHistory.push({ role: 'assistant', content: result.reply });
    addBotMessage({ ...result, note });
    ai.busy = false;
    $('.ai-send').disabled = false;
    if (result.checkout) setTimeout(openCheckout, 350);
  }

  $('#aiForm').addEventListener('submit', event => {
    event.preventDefault();
    const text = aiInput.value;
    aiInput.value = '';
    sendToAssistant(text);
  });

  // ---------- Share / QR ----------
  const shareDialog = $('#shareDialog');
  const qrContainer = $('#shareQrCode');
  let activeQrUrl = '';
  $('#openShareQr').addEventListener('click', () => {
    activeQrUrl = new URL('./', location.href).href;
    $('#shareUrl').textContent = activeQrUrl;
    qrContainer.replaceChildren();
    if (window.QRCode) {
      new QRCode(qrContainer, { text: activeQrUrl, width: 224, height: 224, colorDark: '#141414', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
    } else {
      qrContainer.innerHTML = '<p class="muted">The QR generator could not load. Copy the link below instead.</p>';
    }
    const hint = $('#qrHint');
    if (location.protocol === 'file:') hint.textContent = 'This local file address cannot be opened by other devices. Publish the site to create a public QR code.';
    else if (['localhost', '127.0.0.1'].includes(location.hostname)) hint.textContent = 'This localhost address only works on this computer. Open the Wi-Fi address printed by serve.py to share with a phone.';
    else if (/^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(location.hostname)) hint.textContent = 'This local network QR works only for devices on the same Wi-Fi while your server is running.';
    else hint.textContent = 'This QR code points to the public website currently open in your browser.';
    openDialog(shareDialog);
  });
  $('#copySiteLink').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(activeQrUrl); toast('Website link copied'); } catch { window.prompt('Copy this website link:', activeQrUrl); }
  });
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
  $$('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === state.mode)));
  updateAddressChip();
  renderRail();
  renderBrowse();
  cartChanged();
  detectRemoteAssistant();
  window.SFApp = { toast, openDish, openRestaurant, openAssistant, sendToAssistant, setTaxState };

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
})();
