// "World dishes to explore": inspiration list with search, style filters, and saved favorites.
// It also follows the cuisine selected in the category rail.
const healthyMeals = [
  { name: 'Pho', country: 'Vietnam', description: 'Slow-simmered broth, rice noodles, and fresh herbs.', tags: ['Lean protein'], image: 'u:1582878826629-29b7ad1cdc43' },
  { name: 'Com Tam', country: 'Vietnam', description: 'Broken rice with grilled pork, egg, and pickled vegetables.', tags: ['Lean protein', 'Whole grains'], image: 'https://www.vietnamairlines.com/content/dam/legacy-site-assets/SEO-images/2025%20SEO/Traffic%20TA/MB/broken-rice-vietnam/broken-rice-consists-of-rice-as-the-main-ingredient-accompanied-by-dishes-such-as-grilled-meat-and-eggs.jpg' },
  { name: 'Bun Bo Hue', country: 'Vietnam', description: 'Spicy lemongrass broth, beef, rice noodles, and herbs.', tags: ['Lean protein'], image: 'https://cdn2.tuoitre.vn/ttnew/r/2024/04/01/hue-10-1711960135.jpg' },
  { name: 'Pad Thai', country: 'Thailand', description: 'Stir-fried noodles with peanuts, lime, and bean sprouts.', tags: ['Seafood'], image: 'u:1637806931098-af30b519be53' },
  { name: 'Chirashi Sushi Bowl', country: 'Japan', description: 'Sushi rice topped with fresh, colorful sashimi.', tags: ['Seafood', 'Whole grains'], image: 'u:1565753445646-1fe473522242' },
  { name: 'Penne Pomodoro', country: 'Italy', description: 'Penne with tomato sauce, basil, and parmesan.', tags: ['Plant-based'], image: 'u:1734769774783-78ddeed93751' },
  { name: 'Street Tacos', country: 'Mexico', description: 'Seasoned filling in corn tortillas with cilantro and lime.', tags: ['Lean protein', 'Whole grains'], image: 'u:1552332386-f8dd00dc2f85' },
  { name: 'Butter Chicken', country: 'India', description: 'Tomato cream curry with fragrant rice and cilantro.', tags: ['Lean protein', 'Whole grains'], image: 'u:1710091691771-96b2e6d17dac' },
  { name: 'Gado-Gado', country: 'Indonesia', description: 'Vegetables, tofu, tempeh, and peanut dressing.', tags: ['Plant-based'], image: 'u:1546069901-5ec6a79120b0' },
  { name: 'Spaghetti Carbonara', country: 'Italy', description: 'Pasta with eggs, pecorino, black pepper, and pancetta.', tags: ['Lean protein'], image: 'u:1612874742237-6526221588e3' },
  { name: 'Lasagna', country: 'Italy', description: 'Baked pasta layered with tomato, cheese, and savory ragù.', tags: ['Lean protein'], image: 'u:1574894709920-11b28e7367e3' },
  { name: 'Margherita Pizza', country: 'Italy', description: 'Classic pizza with tomato, mozzarella, and fresh basil.', tags: ['Plant-based'], image: 'u:1513104890138-7c749659a591' },
  { name: 'Pepperoni Pizza', country: 'United States', description: 'Cheesy pizza topped with pepperoni and tomato sauce.', tags: ['Lean protein'], image: 'u:1571407970349-bc81e7e96d47' },
  { name: 'Fried Chicken', country: 'United States', description: 'Crispy golden chicken with a savory seasoned coating.', tags: ['Lean protein'], image: 'u:1626082927389-6cd097cdc6ec' },
  { name: 'Fish and Chips', country: 'United Kingdom', description: 'Battered fish with crisp chips and a lemon wedge.', tags: ['Seafood'], image: 'u:1579208575657-c595a05383b7' },
  { name: 'Caesar Salad', country: 'United States', description: 'Crisp romaine, parmesan, croutons, and Caesar dressing.', tags: ['Plant-based'], image: 'u:1550304943-4f24f54ddde9' },
  { name: 'Greek Salad', country: 'Greece', description: 'Tomatoes, cucumber, olives, feta, and oregano.', tags: ['Plant-based'], image: 'u:1540420773420-3366772f4999' },
  { name: 'Classic Cheeseburger', country: 'United States', description: 'Grilled beef, melted cheese, lettuce, and tomato on a bun.', tags: ['Lean protein'], image: 'u:1568901346375-23c9450c58cd' },
  { name: 'Mac and Cheese', country: 'United States', description: 'Baked macaroni in a rich, creamy cheese sauce.', tags: ['Whole grains'], image: 'u:1543339494-b4cd4f7ba686' },
  { name: 'Grilled Cheese Sandwich', country: 'United States', description: 'Toasted bread with a warm, melted cheese filling.', tags: ['Plant-based'], image: 'u:1528735602780-2552fd46c7af' },
  { name: 'French Onion Soup', country: 'France', description: 'Slow-cooked onion soup topped with toasted bread and cheese.', tags: ['Plant-based'], image: 'u:1547592180-85f173990554' },
  { name: 'Butter Croissant', country: 'France', description: 'Flaky, buttery pastry baked until golden.', tags: ['Plant-based'], image: 'u:1555507036-ab1f4038808a' },
  { name: 'Beef Steak', country: 'United States', description: 'Grilled steak served with herbs and seasonal sides.', tags: ['Lean protein'], image: 'u:1600891964599-f61ba0e24092' },
  { name: 'Roast Chicken', country: 'France', description: 'Herb-roasted chicken with a golden, crisp skin.', tags: ['Lean protein'], image: 'u:1532550907401-a500c9a57435' },
  { name: 'Pancakes with Berries', country: 'United States', description: 'Soft breakfast pancakes served with fresh berries.', tags: ['Plant-based'], image: 'u:1528207776546-365bb710ee93' },
  { name: 'Apple Pie', country: 'United States', description: 'A flaky pastry crust filled with cinnamon-spiced apples.', tags: ['Plant-based'], image: 'u:1568571780765-9276ac8b75a2' },
  { name: 'Sausage Roll', country: 'United Kingdom', description: 'Seasoned sausage wrapped in crisp, golden pastry.', tags: ['Lean protein'], image: 'u:1608039829572-78524f79c4c7' },
  { name: 'Ratatouille', country: 'France', description: 'A colorful Provençal stew of eggplant, zucchini, and tomato.', tags: ['Plant-based'], image: 'u:1572453800999-e8d2d1589b7c' },
  { name: 'Caprese Salad', country: 'Italy', description: 'Tomato, mozzarella, basil, and a drizzle of olive oil.', tags: ['Plant-based'], image: 'u:1592417817098-8fd3d9eb14a5' },
  { name: 'Grilled Salmon Bowl', country: 'United States', description: 'Grilled salmon with brown rice, greens, and avocado.', tags: ['Seafood', 'Whole grains'], image: 'u:1467003909585-2f8a72700288' },
  { name: 'California Cobb Salad', country: 'United States', description: 'A fresh salad with chicken, avocado, egg, and greens.', tags: ['Lean protein'], image: 'u:1543339308-43e59d6b73a6' },
  { name: 'Turkey Avocado Wrap', country: 'United States', description: 'Lean turkey, avocado, and crunchy greens in a whole-wheat wrap.', tags: ['Lean protein', 'Whole grains'], image: 'u:1626700051175-6818013e1d4f' },
  { name: 'Quinoa Veggie Bowl', country: 'United States', description: 'Quinoa with roasted vegetables, greens, and lemon dressing.', tags: ['Plant-based', 'Whole grains'], image: 'u:1490645935967-10de6ba17061' },
  { name: 'Sweet Potato and Black Bean Bowl', country: 'United States', description: 'Roasted sweet potato, black beans, corn, and greens.', tags: ['Plant-based', 'Whole grains'], image: 'u:1511690656952-34342bb7c2f2' },
  { name: 'Blueberry Oatmeal', country: 'United States', description: 'Warm rolled oats topped with blueberries and nuts.', tags: ['Plant-based', 'Whole grains'], image: 'u:1517673132405-a56a62b18caf' },
  { name: 'Grilled Chicken and Greens', country: 'United States', description: 'Grilled chicken breast with leafy greens and vegetables.', tags: ['Lean protein'], image: 'u:1543352634-a1c51d9f1fa7' },
  { name: 'Avocado Whole-Grain Toast', country: 'United States', description: 'Avocado, tomato, and herbs on toasted whole-grain bread.', tags: ['Plant-based', 'Whole grains'], image: 'u:1525351484163-7529414344d8' },
  { name: 'Shrimp Poke Bowl', country: 'United States', description: 'Shrimp with rice, cucumber, avocado, and sesame.', tags: ['Seafood', 'Whole grains'], image: 'u:1546069901-ba9599a7e63c' },
  { name: 'Lentil and Vegetable Soup', country: 'United States', description: 'Hearty lentils simmered with vegetables and herbs.', tags: ['Plant-based', 'Whole grains'], image: 'u:1547592166-23ac45744acd' }
];

(() => {
  const grid = document.querySelector('#worldGrid');
  if (!grid || !window.SF) return;
  const SF = window.SF;
  const search = document.querySelector('#worldSearch');
  const empty = document.querySelector('#worldEmpty');
  const filters = [...document.querySelectorAll('[data-world-filter]')];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const COUNTRY_CUISINE = { Vietnam: 'Vietnamese', Thailand: 'Thai', Japan: 'Japanese', Italy: 'Italian', Mexico: 'Mexican', India: 'Indian', Indonesia: 'Indonesian', 'United States': 'American', Greece: 'Greek', France: 'French', 'United Kingdom': 'British' };
  let activeFilter = 'all';
  let category = 'all';
  let saved;
  try { saved = new Set(JSON.parse(localStorage.getItem('smartfoodie-healthy-saved') || '[]')); } catch { saved = new Set(); }

  const inCategory = meal => {
    if (category === 'all') return true;
    if (category === 'healthy') return meal.tags.includes('Plant-based') || meal.tags.includes('Whole grains');
    const pseudoDish = { cuisine: COUNTRY_CUISINE[meal.country] || meal.country, tags: [] };
    return SF.dishMatchesCategory(pseudoDish, category);
  };

  function render() {
    const term = SF.assistant.normalize(search.value);
    const results = healthyMeals.filter(meal => inCategory(meal)
      && (activeFilter === 'all' || meal.tags.includes(activeFilter))
      && SF.assistant.normalize(`${meal.name} ${meal.country} ${meal.description} ${meal.tags.join(' ')}`).includes(term));
    document.querySelector('#worldCount').textContent = healthyMeals.length;
    document.querySelector('#worldSavedCount').textContent = saved.size;
    grid.innerHTML = results.map(meal => {
      const isSaved = saved.has(meal.name);
      const srcset = SF.imageSrcset(meal.image, [400, 800]);
      return `<article class="world-card">
        <div class="world-media">
          <img src="${esc(SF.imageUrl(meal.image, 600))}"${srcset ? ` srcset="${esc(srcset)}" sizes="(max-width: 760px) 50vw, 260px"` : ''} alt="${esc(meal.name)}: ${esc(meal.description)}" loading="lazy" decoding="async">
          <span class="world-origin">${esc(meal.country)}</span>
          <button type="button" class="world-save" data-save="${esc(meal.name)}" aria-pressed="${isSaved}" aria-label="${isSaved ? 'Remove' : 'Save'} ${esc(meal.name)}"><svg class="icon" aria-hidden="true"><use href="#i-heart"/></svg></button>
        </div>
        <div class="world-tags">${meal.tags.map(tag => `<span>${esc(tag)}</span>`).join('')}</div>
        <h3>${esc(meal.name)}</h3>
        <p>${esc(meal.description)}</p>
      </article>`;
    }).join('');
    empty.hidden = results.length > 0;
  }

  grid.addEventListener('click', event => {
    const button = event.target.closest('[data-save]');
    if (!button) return;
    const name = button.dataset.save;
    const wasSaved = saved.has(name);
    if (wasSaved) saved.delete(name); else saved.add(name);
    try { localStorage.setItem('smartfoodie-healthy-saved', JSON.stringify([...saved])); } catch { /* storage unavailable */ }
    window.SFApp?.toast(wasSaved ? `${name} removed from saved ideas` : `${name} saved to your ideas`);
    render();
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
