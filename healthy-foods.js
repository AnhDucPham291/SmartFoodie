// "World dishes to explore": famous dishes from around the world, each linked to the restaurant
// on SmartFoodie that serves it, with its price, rating, and a customer review.
// Includes search, style filters, saved favorites, and follows the cuisine selected in the category rail.
// Dishes are shown in swipeable rows by course (Mains, Appetizers, ...), like "All dishes".
const worldDishes = [
  { name: 'Pho', country: 'Vietnam', dish: 'pho', description: 'Slow-simmered broth, rice noodles, and fresh herbs.', tags: ['Lean protein'] },
  { name: 'Com Tam', country: 'Vietnam', dish: 'com-tam', description: 'Broken rice with grilled pork, egg, and pickled vegetables.', tags: ['Lean protein', 'Whole grains'] },
  { name: 'Bun Bo Hue', country: 'Vietnam', dish: 'bun-bo-hue', description: 'Spicy lemongrass broth, beef, rice noodles, and herbs.', tags: ['Lean protein'] },
  { name: 'Pad Thai', country: 'Thailand', dish: 'pad-thai', description: 'Stir-fried noodles with peanuts, lime, and bean sprouts.', tags: ['Seafood'] },
  { name: 'Chirashi Sushi Bowl', country: 'Japan', dish: 'chirashi', description: 'Sushi rice topped with fresh, colorful sashimi.', tags: ['Seafood', 'Whole grains'] },
  { name: 'Penne Pomodoro', country: 'Italy', dish: 'penne-pomodoro', description: 'Penne with tomato sauce, basil, and parmesan.', tags: ['Plant-based'] },
  { name: 'Street Tacos', country: 'Mexico', dish: 'street-tacos', description: 'Seasoned filling in corn tortillas with cilantro and lime.', tags: ['Lean protein', 'Whole grains'] },
  { name: 'Butter Chicken', country: 'India', dish: 'butter-chicken', description: 'Tomato cream curry with fragrant rice and cilantro.', tags: ['Lean protein', 'Whole grains'] },
  { name: 'Gado-Gado', country: 'Indonesia', dish: 'gado-gado', description: 'Vegetables, tofu, tempeh, and peanut dressing.', tags: ['Plant-based'] },
  { name: 'Spaghetti Carbonara', country: 'Italy', dish: 'carbonara', description: 'Pasta with eggs, pecorino, black pepper, and guanciale.', tags: ['Lean protein'] },
  { name: 'Lasagna', country: 'Italy', dish: 'lasagna', description: 'Baked pasta layered with tomato, cheese, and savory ragù.', tags: ['Lean protein'] },
  { name: 'Margherita Pizza', country: 'Italy', dish: 'margherita', description: 'Classic pizza with tomato, mozzarella, and fresh basil.', tags: ['Plant-based'] },
  { name: 'Pepperoni Pizza', country: 'United States', dish: 'pepperoni-pizza', description: 'Cheesy pizza topped with pepperoni and tomato sauce.', tags: ['Lean protein'] },
  { name: 'Fried Chicken', country: 'United States', dish: 'two-piece-meal', description: 'Crispy golden chicken with a savory seasoned coating.', tags: ['Lean protein'] },
  { name: 'Fish and Chips', country: 'United Kingdom', dish: 'fish-and-chips', description: 'Battered fish with crisp chips and a lemon wedge.', tags: ['Seafood'] },
  { name: 'Caesar Salad', country: 'United States', dish: 'caesar-salad', description: 'Crisp romaine, parmesan, croutons, and Caesar dressing.', tags: ['Plant-based'] },
  { name: 'Greek Salad', country: 'Greece', dish: 'greek-salad', description: 'Tomatoes, cucumber, olives, feta, and oregano.', tags: ['Plant-based'] },
  { name: 'Classic Cheeseburger', country: 'United States', dish: 'cheeseburger', description: 'Grilled beef, melted cheese, lettuce, and tomato on a bun.', tags: ['Lean protein'] },
  { name: 'Mac and Cheese', country: 'United States', dish: 'mac-and-cheese', description: 'Baked macaroni in a rich, creamy cheese sauce.', tags: ['Whole grains'] },
  { name: 'Grilled Cheese Sandwich', country: 'United States', dish: 'grilled-cheese', description: 'Toasted bread with a warm, melted cheese filling.', tags: ['Plant-based'] },
  { name: 'French Onion Soup', country: 'France', dish: 'french-onion-soup', description: 'Slow-cooked onion soup topped with toasted bread and cheese.', tags: ['Plant-based'] },
  { name: 'Butter Croissant', country: 'France', dish: 'butter-croissant', description: 'Flaky, buttery pastry baked until golden.', tags: ['Plant-based'] },
  { name: 'Beef Steak', country: 'United States', dish: 'ribeye-steak', description: 'Grilled steak served with herbs and seasonal sides.', tags: ['Lean protein'] },
  { name: 'Roast Chicken', country: 'France', dish: 'roast-chicken', description: 'Herb-roasted chicken with a golden, crisp skin.', tags: ['Lean protein'] },
  { name: 'Pancakes with Berries', country: 'United States', dish: 'berry-pancakes', description: 'Soft breakfast pancakes served with fresh berries.', tags: ['Plant-based'] },
  { name: 'Apple Pie', country: 'United States', dish: 'apple-pie', description: 'A flaky pastry crust filled with cinnamon-spiced apples.', tags: ['Plant-based'] },
  { name: 'Sausage Roll', country: 'United Kingdom', dish: 'sausage-rolls', description: 'Seasoned sausage wrapped in crisp, golden pastry.', tags: ['Lean protein'] },
  { name: 'Ratatouille', country: 'France', dish: 'ratatouille', description: 'A colorful Provençal stew of eggplant, zucchini, and tomato.', tags: ['Plant-based'] },
  { name: 'Caprese Salad', country: 'Italy', dish: 'caprese-salad', description: 'Tomato, mozzarella, basil, and a drizzle of olive oil.', tags: ['Plant-based'] },
  { name: 'Grilled Salmon Bowl', country: 'United States', dish: 'salmon-bowl', description: 'Grilled salmon with brown rice, greens, and avocado.', tags: ['Seafood', 'Whole grains'] },
  { name: 'California Cobb Salad', country: 'United States', dish: 'cobb-salad', description: 'A fresh salad with chicken, avocado, egg, and greens.', tags: ['Lean protein'] },
  { name: 'Turkey Avocado Wrap', country: 'United States', dish: 'turkey-avocado-wrap', description: 'Lean turkey, avocado, and crunchy greens in a whole-wheat wrap.', tags: ['Lean protein', 'Whole grains'] },
  { name: 'Quinoa Veggie Bowl', country: 'United States', dish: 'quinoa-bowl', description: 'Quinoa with roasted vegetables, greens, and lemon dressing.', tags: ['Plant-based', 'Whole grains'] },
  { name: 'Sweet Potato and Black Bean Bowl', country: 'United States', dish: 'sweet-potato-bowl', description: 'Roasted sweet potato, black beans, corn, and greens.', tags: ['Plant-based', 'Whole grains'] },
  { name: 'Blueberry Oatmeal', country: 'United States', dish: 'blueberry-oatmeal', description: 'Warm rolled oats topped with blueberries and nuts.', tags: ['Plant-based', 'Whole grains'] },
  { name: 'Grilled Chicken and Greens', country: 'United States', dish: 'chicken-greens', description: 'Grilled chicken breast with leafy greens and vegetables.', tags: ['Lean protein'] },
  { name: 'Avocado Whole-Grain Toast', country: 'United States', dish: 'avocado-toast', description: 'Avocado, tomato, and herbs on toasted whole-grain bread.', tags: ['Plant-based', 'Whole grains'] },
  { name: 'Salmon Poke Bowl', country: 'United States', dish: 'poke-bowl', description: 'Fresh salmon with rice, cucumber, avocado, and sesame.', tags: ['Seafood', 'Whole grains'] },
  { name: 'Lentil and Vegetable Soup', country: 'United States', dish: 'lentil-soup', description: 'Hearty lentils simmered with vegetables and herbs.', tags: ['Plant-based', 'Whole grains'] }
];

(() => {
  const rows = document.querySelector('#worldRows');
  if (!rows || !window.SF) return;
  const SF = window.SF;
  const app = window.SFApp || {};
  const search = document.querySelector('#worldSearch');
  const empty = document.querySelector('#worldEmpty');
  const filters = [...document.querySelectorAll('[data-world-filter]')];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const usd = dollars => `$${Number(dollars).toFixed(2)}`;
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;

  // Join each world dish with the restaurant dish that serves it. Unknown ids are skipped.
  const meals = worldDishes.map(meal => {
    const dish = SF.dishById.get(meal.dish);
    const restaurant = dish && SF.restaurantById.get(dish.restaurantId);
    return dish && restaurant ? { ...meal, item: dish, restaurant } : null;
  }).filter(Boolean);
  const searchText = new Map(meals.map(meal => [meal, SF.assistant.normalize(
    `${meal.name} ${meal.country} ${meal.description} ${meal.tags.join(' ')} ${meal.item.name} ${meal.item.aliases.join(' ')} ${meal.restaurant.name} ${meal.restaurant.cuisine}`
  )]));

  let activeFilter = 'all';
  let category = 'all';
  let saved;
  try { saved = new Set(JSON.parse(localStorage.getItem('smartfoodie-healthy-saved') || '[]')); } catch { saved = new Set(); }

  const quickAdd = dish => (app.quickAdd ? app.quickAdd(dish)
    : `<button type="button" class="quick-add" data-add="${dish.id}" aria-label="Add ${esc(dish.name)} to order">${icon('plus')}</button>`);
  const topReview = dish => (app.topReview ? app.topReview(dish) : dish.reviews[0]);
  const shortName = name => (app.shortName ? app.shortName(name) : name);
  const saveLabel = (name, isSaved) => `${isSaved ? 'Remove' : 'Save'} ${name}`;

  function card(meal) {
    const { item: dish, restaurant } = meal;
    const isSaved = saved.has(meal.name);
    const srcset = SF.imageSrcset(dish.image, [400, 800]);
    const review = topReview(dish);
    return `<article class="world-card">
      <div class="world-media">
        <button type="button" class="world-open" data-open-dish="${dish.id}" aria-label="${esc(meal.name)} from ${esc(restaurant.name)}: details and reviews">
          <img src="${esc(SF.imageUrl(dish.image, 600))}"${srcset ? ` srcset="${esc(srcset)}" sizes="(max-width: 760px) 50vw, 260px"` : ''} alt="${esc(meal.name)}: ${esc(meal.description)}" loading="lazy" decoding="async">
        </button>
        <span class="world-origin">${esc(meal.country)}</span>
        <button type="button" class="world-save" data-save="${esc(meal.name)}" aria-pressed="${isSaved}" aria-label="${esc(saveLabel(meal.name, isSaved))}">${icon('heart')}</button>
        ${quickAdd(dish)}
      </div>
      <div class="world-tags">${dish.bestSeller ? '<span class="world-best">Best seller</span>' : ''}${meal.tags.map(tag => `<span>${esc(tag)}</span>`).join('')}</div>
      <h4><button type="button" data-open-dish="${dish.id}">${esc(meal.name)}</button></h4>
      <div class="dish-line"><span class="price">${usd(dish.price)}</span><span class="dot">•</span><span class="stars-inline" aria-label="Rated ${dish.rating.toFixed(1)} out of 5 from ${dish.ratingCount} ratings">${icon('star')}${dish.rating.toFixed(1)} <small>(${dish.ratingCount})</small></span></div>
      <button type="button" class="world-rest" data-open-restaurant="${restaurant.id}">${icon('store')}<span>${esc(restaurant.name)}</span></button>
      <p>${esc(meal.description)}</p>
      ${review ? `<blockquote class="world-quote"><p>“${esc(review.text)}”</p><footer>${'★'.repeat(review.rating)} ${esc(shortName(review.name))}</footer></blockquote>` : ''}
    </article>`;
  }

  function render() {
    const term = SF.assistant.normalize(search.value);
    const results = meals.filter(meal => SF.dishMatchesCategory(meal.item, category)
      && (activeFilter === 'all' || meal.tags.includes(activeFilter))
      && searchText.get(meal).includes(term));
    document.querySelector('#worldCount').textContent = meals.length;
    document.querySelector('#worldSavedCount').textContent = saved.size;
    // Same course rows as "All dishes": Mains, Appetizers, Drinks, Desserts.
    rows.innerHTML = app.courseRows
      ? app.courseRows('world', results, { courseOf: meal => meal.item.course, card, rowClass: 'world-row' })
      : `<div class="h-scroller world-row">${results.map(card).join('')}</div>`;
    app.syncAllScrollButtons?.(rows);
    empty.hidden = results.length > 0;
  }

  rows.addEventListener('click', event => {
    const button = event.target.closest('[data-save]');
    if (!button) return;
    const name = button.dataset.save;
    const wasSaved = saved.has(name);
    if (wasSaved) saved.delete(name); else saved.add(name);
    try { localStorage.setItem('smartfoodie-healthy-saved', JSON.stringify([...saved])); } catch { /* storage unavailable */ }
    app.toast?.(wasSaved ? `${name} removed from saved ideas` : `${name} saved to your ideas`);
    // Update in place so the row keeps its scroll position.
    button.setAttribute('aria-pressed', String(!wasSaved));
    button.setAttribute('aria-label', saveLabel(name, !wasSaved));
    document.querySelector('#worldSavedCount').textContent = saved.size;
  });
  search.addEventListener('input', render);
  filters.forEach(button => button.addEventListener('click', () => {
    activeFilter = button.dataset.worldFilter;
    filters.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    render();
  }));
  window.addEventListener('sf:category', event => { category = event.detail.category; render(); });
  render();
})();
