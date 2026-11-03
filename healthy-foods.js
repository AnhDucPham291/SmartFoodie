const healthyMeals = [
  { name: 'Pho', country: 'Vietnam', description: 'Slow-simmered broth, rice noodles, and fresh herbs.', tags: ['Lean protein'], image: 'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?auto=format&fit=crop&w=900&q=85' },
  { name: 'Com Tam', country: 'Vietnam', description: 'Broken rice with grilled pork, egg, and pickled vegetables.', tags: ['Lean protein', 'Whole grains'], image: 'https://www.vietnamairlines.com/content/dam/legacy-site-assets/SEO-images/2025%20SEO/Traffic%20TA/MB/broken-rice-vietnam/broken-rice-consists-of-rice-as-the-main-ingredient-accompanied-by-dishes-such-as-grilled-meat-and-eggs.jpg' },
  { name: 'Bun Bo Hue', country: 'Vietnam', description: 'Spicy lemongrass broth, beef, rice noodles, and herbs.', tags: ['Lean protein'], image: 'https://cdn2.tuoitre.vn/ttnew/r/2024/04/01/hue-10-1711960135.jpg' },
  { name: 'Pad Thai', country: 'Thailand', description: 'Stir-fried noodles with peanuts, lime, and bean sprouts.', tags: ['Seafood'], image: 'https://images.unsplash.com/photo-1637806931098-af30b519be53?auto=format&fit=crop&w=900&q=85' },
  { name: 'Chirashi Sushi Bowl', country: 'Japan', description: 'Sushi rice topped with fresh, colorful sashimi.', tags: ['Seafood', 'Whole grains'], image: 'https://images.unsplash.com/photo-1565753445646-1fe473522242?auto=format&fit=crop&w=900&q=85' },
  { name: 'Penne Pomodoro', country: 'Italy', description: 'Penne with tomato sauce, basil, and parmesan.', tags: ['Plant-based'], image: 'https://images.unsplash.com/photo-1734769774783-78ddeed93751?auto=format&fit=crop&w=900&q=85' },
  { name: 'Street Tacos', country: 'Mexico', description: 'Seasoned filling in corn tortillas with cilantro and lime.', tags: ['Lean protein', 'Whole grains'], image: 'https://images.unsplash.com/photo-1552332386-f8dd00dc2f85?auto=format&fit=crop&w=900&q=85' },
  { name: 'Butter Chicken', country: 'India', description: 'Tomato cream curry with fragrant rice and cilantro.', tags: ['Lean protein', 'Whole grains'], image: 'https://images.unsplash.com/photo-1710091691771-96b2e6d17dac?auto=format&fit=crop&w=900&q=85' },
  { name: 'Gado-Gado', country: 'Indonesia', description: 'Vegetables, tofu, tempeh, and peanut dressing.', tags: ['Plant-based'], image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=85' },
  { name: 'Spaghetti Carbonara', country: 'Italy', description: 'Pasta with eggs, pecorino, black pepper, and pancetta.', tags: ['Lean protein'], image: 'https://images.unsplash.com/photo-1612874742237-6526221588e3?auto=format&fit=crop&w=900&q=85' },
  { name: 'Lasagna', country: 'Italy', description: 'Baked pasta layered with tomato, cheese, and savory ragù.', tags: ['Lean protein'], image: 'https://images.unsplash.com/photo-1574894709920-11b28e7367e3?auto=format&fit=crop&w=900&q=85' },
  { name: 'Margherita Pizza', country: 'Italy', description: 'Classic pizza with tomato, mozzarella, and fresh basil.', tags: ['Plant-based'], image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=900&q=85' },
  { name: 'Pepperoni Pizza', country: 'United States', description: 'Cheesy pizza topped with pepperoni and tomato sauce.', tags: ['Lean protein'], image: 'https://images.unsplash.com/photo-1571407970349-bc81e7e96d47?auto=format&fit=crop&w=900&q=85' },
  { name: 'Fried Chicken', country: 'United States', description: 'Crispy golden chicken with a savory seasoned coating.', tags: ['Lean protein'], image: 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&w=900&q=85' },
  { name: 'Fish and Chips', country: 'United Kingdom', description: 'Battered fish with crisp chips and a lemon wedge.', tags: ['Seafood'], image: 'https://images.unsplash.com/photo-1579208575657-c595a05383b7?auto=format&fit=crop&w=900&q=85' },
  { name: 'Caesar Salad', country: 'United States', description: 'Crisp romaine, parmesan, croutons, and Caesar dressing.', tags: ['Plant-based'], image: 'https://images.unsplash.com/photo-1550304943-4f24f54ddde9?auto=format&fit=crop&w=900&q=85' },
  { name: 'Greek Salad', country: 'Greece', description: 'Tomatoes, cucumber, olives, feta, and oregano.', tags: ['Plant-based'], image: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=900&q=85' },
  { name: 'Classic Cheeseburger', country: 'United States', description: 'Grilled beef, melted cheese, lettuce, and tomato on a bun.', tags: ['Lean protein'], image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=85' },
  { name: 'Mac and Cheese', country: 'United States', description: 'Baked macaroni in a rich, creamy cheese sauce.', tags: ['Whole grains'], image: 'https://images.unsplash.com/photo-1543339494-b4cd4f7ba686?auto=format&fit=crop&w=900&q=85' },
  { name: 'Grilled Cheese Sandwich', country: 'United States', description: 'Toasted bread with a warm, melted cheese filling.', tags: ['Plant-based'], image: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=900&q=85' },
  { name: 'French Onion Soup', country: 'France', description: 'Slow-cooked onion soup topped with toasted bread and cheese.', tags: ['Plant-based'], image: 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=85' },
  { name: 'Butter Croissant', country: 'France', description: 'Flaky, buttery pastry baked until golden.', tags: ['Plant-based'], image: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=900&q=85' },
  { name: 'Beef Steak', country: 'United States', description: 'Grilled steak served with herbs and seasonal sides.', tags: ['Lean protein'], image: 'https://images.unsplash.com/photo-1600891964599-f61ba0e24092?auto=format&fit=crop&w=900&q=85' },
  { name: 'Roast Chicken', country: 'France', description: 'Herb-roasted chicken with a golden, crisp skin.', tags: ['Lean protein'], image: 'https://images.unsplash.com/photo-1532550907401-a500c9a57435?auto=format&fit=crop&w=900&q=85' },
  { name: 'Pancakes with Berries', country: 'United States', description: 'Soft breakfast pancakes served with fresh berries.', tags: ['Plant-based'], image: 'https://images.unsplash.com/photo-1528207776546-365bb710ee93?auto=format&fit=crop&w=900&q=85' },
  { name: 'Apple Pie', country: 'United States', description: 'A flaky pastry crust filled with cinnamon-spiced apples.', tags: ['Plant-based'], image: 'https://images.unsplash.com/photo-1621743478914-cc8f86d7e7b5?auto=format&fit=crop&w=900&q=85' },
  { name: 'Sausage Roll', country: 'United Kingdom', description: 'Seasoned sausage wrapped in crisp, golden pastry.', tags: ['Lean protein'], image: 'https://images.unsplash.com/photo-1608039829572-78524f79c4c7?auto=format&fit=crop&w=900&q=85' },
  { name: 'Ratatouille', country: 'France', description: 'A colorful Provençal stew of eggplant, zucchini, and tomato.', tags: ['Plant-based'], image: 'https://images.unsplash.com/photo-1572453800999-e8d2d1589b7c?auto=format&fit=crop&w=900&q=85' },
  { name: 'Caprese Salad', country: 'Italy', description: 'Tomato, mozzarella, basil, and a drizzle of olive oil.', tags: ['Plant-based'], image: 'https://images.unsplash.com/photo-1608039829572-78524f79c4c7?auto=format&fit=crop&w=900&q=85' },
  { name: 'Grilled Salmon Bowl', country: 'United States', description: 'Grilled salmon with brown rice, greens, and avocado.', tags: ['Seafood', 'Whole grains'], image: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=900&q=85' },
  { name: 'California Cobb Salad', country: 'United States', description: 'A fresh salad with chicken, avocado, egg, and greens.', tags: ['Lean protein'], image: 'https://images.unsplash.com/photo-1512621776951-a57141f2e394?auto=format&fit=crop&w=900&q=85' },
  { name: 'Turkey Avocado Wrap', country: 'United States', description: 'Lean turkey, avocado, and crunchy greens in a whole-wheat wrap.', tags: ['Lean protein', 'Whole grains'], image: 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=900&q=85' },
  { name: 'Quinoa Veggie Bowl', country: 'United States', description: 'Quinoa with roasted vegetables, greens, and lemon dressing.', tags: ['Plant-based', 'Whole grains'], image: 'https://images.unsplash.com/photo-1512621776951-a57141f2e394?auto=format&fit=crop&w=900&q=85' },
  { name: 'Sweet Potato and Black Bean Bowl', country: 'United States', description: 'Roasted sweet potato, black beans, corn, and greens.', tags: ['Plant-based', 'Whole grains'], image: 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=85' },
  { name: 'Blueberry Oatmeal', country: 'United States', description: 'Warm rolled oats topped with blueberries and nuts.', tags: ['Plant-based', 'Whole grains'], image: 'https://images.unsplash.com/photo-1517673132405-a56a62b18caf?auto=format&fit=crop&w=900&q=85' },
  { name: 'Grilled Chicken and Greens', country: 'United States', description: 'Grilled chicken breast with leafy greens and vegetables.', tags: ['Lean protein'], image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=85' },
  { name: 'Avocado Whole-Grain Toast', country: 'United States', description: 'Avocado, tomato, and herbs on toasted whole-grain bread.', tags: ['Plant-based', 'Whole grains'], image: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=900&q=85' },
  { name: 'Shrimp Poke Bowl', country: 'United States', description: 'Shrimp with rice, cucumber, avocado, and sesame.', tags: ['Seafood', 'Whole grains'], image: 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=85' },
  { name: 'Lentil and Vegetable Soup', country: 'United States', description: 'Hearty lentils simmered with vegetables and herbs.', tags: ['Plant-based', 'Whole grains'], image: 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=85' }
];

(() => {
  const grid = document.querySelector('#healthyGrid');
  if (!grid) return;
  const search = document.querySelector('#healthySearch');
  const empty = document.querySelector('#healthyEmpty');
  const savedCount = document.querySelector('#healthySavedCount');
  const totalCount = document.querySelector('#healthyCount');
  const allCount = document.querySelector('.healthy-filters [data-filter="all"] span');
  const filters = [...document.querySelectorAll('.healthy-filters [data-filter]')];
  let activeFilter = 'all';
  let saved = new Set(JSON.parse(localStorage.getItem('smartfoodie-healthy-saved') || '[]'));

  function render() {
    const term = search.value.trim().toLowerCase();
    const results = healthyMeals.filter(meal =>
      (activeFilter === 'all' || meal.tags.includes(activeFilter)) &&
      `${meal.name} ${meal.country} ${meal.description} ${meal.tags.join(' ')}`.toLowerCase().includes(term)
    );
    totalCount.textContent = healthyMeals.length;
    allCount.textContent = healthyMeals.length;
    grid.innerHTML = results.map(meal => {
      const isSaved = saved.has(meal.name);
      return `<article class="healthy-card">
        <div class="healthy-photo"><img src="${meal.image}" alt="${meal.name}" loading="lazy"><span class="healthy-origin">${meal.country}</span><button class="healthy-save${isSaved ? ' saved' : ''}" type="button" aria-label="${isSaved ? 'Remove' : 'Save'} ${meal.name}" aria-pressed="${isSaved}">${isSaved ? '♥' : '♡'}</button></div>
        <div class="healthy-card-content"><div class="healthy-tags">${meal.tags.map(tag => `<span>${tag}</span>`).join('')}</div><h3>${meal.name}</h3><p>${meal.description}</p><button class="healthy-card-action${isSaved ? ' added' : ''}" type="button" data-name="${meal.name}">${isSaved ? 'Saved to your meal ideas' : 'Save this meal idea'} <span>${isSaved ? '✓' : '+'}</span></button></div>
      </article>`;
    }).join('');
    empty.hidden = results.length > 0;
    savedCount.textContent = saved.size;
    grid.querySelectorAll('.healthy-save, .healthy-card-action').forEach(button => button.addEventListener('click', () => {
      const name = button.closest('.healthy-card').querySelector('h3').textContent;
      const wasSaved = saved.has(name);
      if (wasSaved) saved.delete(name); else saved.add(name);
      localStorage.setItem('smartfoodie-healthy-saved', JSON.stringify([...saved]));
      window.dispatchEvent(new CustomEvent('healthy-idea-saved', { detail: { name, saved: !wasSaved } }));
      render();
    }));
    grid.querySelectorAll('.healthy-photo img').forEach(image => image.addEventListener('error', () => {
      const missingName = image.closest('.healthy-card').querySelector('h3').textContent;
      const index = healthyMeals.findIndex(meal => meal.name === missingName);
      if (index !== -1) healthyMeals.splice(index, 1);
      render();
    }, { once: true }));
  }

  search.addEventListener('input', render);
  filters.forEach(button => button.addEventListener('click', () => {
    activeFilter = button.dataset.filter;
    filters.forEach(item => item.classList.toggle('active', item === button));
    render();
  }));
  document.querySelector('#loadMoreHealthy').hidden = true;
  render();
})();
