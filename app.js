const cart = [];
let budget = 25;
let toastTimer;
const money = value => `$${value.toFixed(2)}`;
const toast = message => {
  const el = document.querySelector('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
};

document.querySelector('#skipIntro').addEventListener('click', () => {
  document.querySelector('#introScreen').classList.add('dismissed');
});
const menuDiet = new Map([
  ['Pho', 'meat'], ['Com Tam', 'meat'], ['Bun Bo Hue', 'meat'], ['Pad Thai', 'seafood'],
  ['Chirashi Sushi Bowl', 'seafood'], ['Penne Pomodoro', 'vegetarian'], ['Street Tacos', 'meat'],
  ['Butter Chicken', 'meat'], ['Gado-Gado', 'vegan']
]);
const menuFilterInputs = ['mealSearch', 'cuisineFilter', 'dietFilter', 'priceFilter', 'timeFilter'].map(id => document.querySelector(`#${id}`));
const menuCards = [...document.querySelectorAll('.meal-grid .meal-card')];
function applyMenuFilters() {
  const [searchInput, cuisineInput, dietInput, priceInput, timeInput] = menuFilterInputs;
  const query = searchInput.value.trim().toLowerCase();
  let visible = 0;
  menuCards.forEach(card => {
    const name = card.querySelector('h3').textContent;
    const description = card.querySelector('.meal-info > p').textContent;
    const cuisine = card.querySelector('.meal-meta span:last-child').textContent;
    const diet = menuDiet.get(name) || 'meat';
    const minutes = Number(card.querySelector('.meal-meta span').textContent.match(/\d+/)?.[0] || 0);
    const matches = (!query || `${name} ${description} ${cuisine}`.toLowerCase().includes(query))
      && (cuisineInput.value === 'all' || cuisine.toLowerCase() === cuisineInput.value.toLowerCase())
      && (dietInput.value === 'all' || (dietInput.value === 'plant' ? ['vegan', 'vegetarian'].includes(diet) : diet === dietInput.value))
      && (priceInput.value === 'all' || Number(card.dataset.price) <= Number(priceInput.value))
      && (timeInput.value === 'all' || minutes <= Number(timeInput.value));
    card.hidden = !matches;
    if (matches) visible += 1;
  });
  document.querySelector('#mealFilterStatus').textContent = `Showing ${visible} ${visible === 1 ? 'meal' : 'meals'} that match your preferences`;
  document.querySelector('#mealEmpty').hidden = visible !== 0;
}
menuFilterInputs.forEach(input => input.addEventListener(input.tagName === 'INPUT' ? 'input' : 'change', applyMenuFilters));
document.querySelector('#clearMealFilters').addEventListener('click', () => {
  menuFilterInputs.forEach(input => { input.value = input.id === 'mealSearch' ? '' : 'all'; });
  applyMenuFilters();
});
applyMenuFilters();
window.addEventListener('healthy-idea-saved', event => {
  toast(event.detail.saved ? `${event.detail.name} saved to your meal ideas` : `${event.detail.name} removed from your meal ideas`);
});

function renderCart() {
  const total = cart.reduce((sum, item) => sum + item.price, 0);
  document.querySelector('#cartCount').textContent = cart.length;
  document.querySelector('#headerCount').textContent = cart.length;
  document.querySelector('#spentLabel').textContent = money(total);
  document.querySelector('#estimatedTotal').textContent = money(total);
  document.querySelector('#leftLabel').textContent = money(Math.max(0, budget - total));
  const list = document.querySelector('#cartItems');
  if (!cart.length) {
    list.innerHTML = '<div class="empty-cart"><span>✳</span><strong>Your next favorite starts here.</strong><p>Add a meal and we\'ll keep your order together.</p></div>';
    return;
  }
  list.innerHTML = cart.map((item, index) => `<div class="cart-line"><div><strong>${item.name}</strong><small>${money(item.price)}</small></div><button class="remove-item" data-index="${index}" aria-label="Remove ${item.name}">Remove</button></div>`).join('');
  list.querySelectorAll('.remove-item').forEach(button => button.addEventListener('click', () => {
    cart.splice(Number(button.dataset.index), 1);
    renderCart();
  }));
}

document.querySelectorAll('.meal-card').forEach(card => {
  const name = card.querySelector('h3').textContent;
  const price = Number(card.dataset.price);
  card.querySelector('.add-button').addEventListener('click', () => {
    const total = cart.reduce((sum, item) => sum + item.price, 0);
    if (total + price > budget) return toast('This meal is over your current budget. Edit your budget to add it.');
    cart.push({ name, price });
    renderCart();
    toast(`${name} added to your order`);
  });
  card.querySelector('.details-button').addEventListener('click', () => {
    const response = document.querySelector('#chatResponse');
    let message = response.querySelector('.assistant-message');
    if (!message) {
      message = document.createElement('p');
      message.className = 'assistant-message';
      response.prepend(message);
    }
    message.textContent = `${name} is ${money(price)}, rated ${card.querySelector('.rating').textContent.trim()}, and ready in about ${card.querySelector('.meal-meta span').textContent.replace('◷ ', '')}.`;
  });
  card.querySelector('.favorite').addEventListener('click', event => {
    const button = event.currentTarget;
    button.classList.toggle('saved');
    button.textContent = button.classList.contains('saved') ? '♥' : '♡';
    toast(button.classList.contains('saved') ? `${name} saved to your favorites` : `${name} removed from your favorites`);
  });
});

const budgetPill = document.querySelector('#budgetPill');
const budgetInput = document.querySelector('#budgetInput');
const budgetEditor = document.querySelector('#budgetEditor');
const closeBudgetEditor = () => {
  budgetPill.classList.remove('is-editing');
  budgetPill.querySelector(':scope > span').hidden = false;
  document.querySelector('#budgetLabel').parentElement.hidden = false;
  document.querySelector('#budgetButton').hidden = false;
  budgetEditor.hidden = true;
};
document.querySelector('#budgetButton').addEventListener('click', () => {
  budgetInput.value = budget;
  budgetPill.classList.add('is-editing');
  budgetPill.querySelector(':scope > span').hidden = true;
  document.querySelector('#budgetLabel').parentElement.hidden = true;
  document.querySelector('#budgetButton').hidden = true;
  budgetEditor.hidden = false;
  budgetInput.focus();
});
document.querySelector('#cancelBudgetEdit').addEventListener('click', closeBudgetEditor);
budgetEditor.addEventListener('submit', event => {
  event.preventDefault();
  if (!budgetEditor.reportValidity()) return;
  const value = Number(budgetInput.value);
  if (!Number.isFinite(value) || value < 1) return;
  budget = value;
  document.querySelector('#budgetLabel').textContent = budget.toLocaleString('en-US', { maximumFractionDigits: 2 });
  closeBudgetEditor();
  renderCart();
  toast('Your meal budget has been updated.');
});

const mealIngredients = {
  'Pho': 'Beef, rice noodles, slow-simmered broth, herbs',
  'Com Tam': 'Broken rice, grilled pork, egg, pickled vegetables',
  'Bun Bo Hue': 'Beef, rice noodles, lemongrass broth, herbs',
  'Pad Thai': 'Rice noodles, egg, peanuts, lime, bean sprouts',
  'Chirashi Sushi Bowl': 'Sushi rice, salmon, tuna, seasonal vegetables',
  'Penne Pomodoro': 'Penne, tomatoes, basil, parmesan',
  'Street Tacos': 'Corn tortillas, seasoned filling, cilantro, lime',
  'Butter Chicken': 'Chicken, tomato cream sauce, rice, cilantro',
  'Gado-Gado': 'Mixed vegetables, tofu, tempeh, peanut dressing'
};
const mealMoodGroups = [
  { terms: ['comfort', 'cozy', 'warm', 'soup', 'broth', 'tired', 'stressed', 'sad', 'anxious', 'overwhelmed', 'rough day', 'rainy', 'phở', 'pho', 'bún bò', 'mệt', 'buồn', 'căng thẳng', 'ấm'], meals: ['Pho', 'Bun Bo Hue', 'Butter Chicken'] },
  { terms: ['fresh', 'light', 'healthy', 'green', 'crisp', 'salad', 'fresh', 'rau', 'nhẹ', 'thanh mát'], meals: ['Gado-Gado', 'Chirashi Sushi Bowl', 'Street Tacos'] },
  { terms: ['spicy', 'hot', 'heat', 'fiery', 'cay', 'nóng'], meals: ['Bun Bo Hue', 'Street Tacos', 'Butter Chicken'] },
  { terms: ['noodle', 'noodles', 'pasta', 'pho', 'phở', 'mì', 'bún'], meals: ['Pho', 'Bun Bo Hue', 'Pad Thai', 'Penne Pomodoro'] },
  { terms: ['rice', 'bowl', 'cơm', 'curry'], meals: ['Com Tam', 'Chirashi Sushi Bowl', 'Butter Chicken', 'Gado-Gado'] },
  { terms: ['seafood', 'fish', 'sushi', 'salmon', 'shrimp', 'hải sản', 'cá'], meals: ['Chirashi Sushi Bowl', 'Pad Thai'] },
  { terms: ['vegetarian', 'vegan', 'plant-based', 'tofu', 'vegetable', 'veggie', 'chay', 'rau'], meals: ['Gado-Gado', 'Penne Pomodoro'] },
  { terms: ['chicken', 'gà', 'protein'], meals: ['Com Tam', 'Pad Thai', 'Butter Chicken'] },
  { terms: ['beef', 'thịt bò'], meals: ['Pho', 'Bun Bo Hue', 'Street Tacos'] },
  { terms: ['quick', 'fast', 'hurry', 'busy', 'quick lunch', 'nhanh', 'vội'], meals: ['Street Tacos', 'Penne Pomodoro', 'Com Tam'] },
  { terms: ['surprise', 'anything', 'whatever', 'bất kỳ'], meals: ['Gado-Gado', 'Pho', 'Pad Thai'] }
];

function getMealCatalog() {
  return [...document.querySelectorAll('.meal-card')].map(card => {
    const name = card.querySelector('h3').textContent.trim();
    const meta = card.querySelectorAll('.meal-meta span');
    return {
      name,
      price: Number(card.dataset.price),
      image: card.querySelector('.meal-photo img').src,
      imageAlt: card.querySelector('.meal-photo img').alt,
      rating: card.querySelector('.rating').textContent.trim(),
      description: card.querySelector('.meal-info>p').textContent.trim(),
      wait: Number.parseInt(meta[0].textContent.replace(/\D/g, ''), 10),
      cuisine: meta[1].textContent.trim(),
      ingredients: mealIngredients[name],
      searchable: `${name} ${card.querySelector('.meal-info>p').textContent} ${meta[1].textContent} ${mealIngredients[name]}`.toLowerCase()
    };
  });
}

function recommendMeals(request) {
  const text = request.toLowerCase();
  const moneyMatch = text.match(/\$\s*(\d+)|\b(?:under|below|up to|max|less than|dưới|tối đa|budget(?: of)?)\s*\$?\s*(\d+)\s*(?:dollars?|usd|bucks|đô|đồng)?\b(?!\s*(?:minutes?|mins?|min|phút)\b)/i);
  const timeMatch = text.match(/(?:under|within|less than|in|dưới|trong)\s*(\d+)\s*(?:minutes?|mins?|min|phút)\b|\b(\d+)\s*(?:minutes?|mins?|min|phút)\b/i);
  const statedBudget = moneyMatch ? Number(moneyMatch[1] || moneyMatch[2]) : budget;
  const priceLimit = Math.min(budget, statedBudget);
  const timeLimit = timeMatch ? Number(timeMatch[1] || timeMatch[2]) : Infinity;
  const catalog = getMealCatalog();
  const filteredCatalog = catalog.filter(meal => !document.querySelector(`.meal-card h3`) || [...document.querySelectorAll('.meal-card')].find(card => card.querySelector('h3').textContent.trim() === meal.name)?.hidden === false);
  const meals = filteredCatalog.length ? filteredCatalog : catalog;
  const withinBudget = meals.filter(meal => meal.price <= priceLimit);
  let candidates = withinBudget;
  let note = '';
  if (Number.isFinite(timeLimit)) {
    const withinTime = withinBudget.filter(meal => meal.wait <= timeLimit);
    if (withinTime.length) candidates = withinTime;
    else if (withinBudget.length) note = `Nothing on the current menu is ready within ${timeLimit} minutes, so these are the closest matches within your budget.`;
    else note = `I couldn't find a dish within $${priceLimit}; these are the closest menu matches.`;
  } else if (!withinBudget.length) {
    note = `I couldn't find a dish within $${priceLimit}; these are the closest menu matches.`;
  }
  if (!candidates.length) candidates = meals;

  const scored = candidates.map(meal => {
    let score = Number.parseFloat(meal.rating.match(/[\d.]+/)?.[0] || '0') + (25 - meal.price) * .03;
    if (meal.searchable.includes(text) && text.length > 2) score += 2;
    mealMoodGroups.forEach(group => {
      if (group.terms.some(term => text.includes(term)) && group.meals.includes(meal.name)) score += 2.5;
    });
    if (/quick|fast|hurry|busy|nhanh|vội/.test(text)) score += (30 - meal.wait) * .08;
    return { meal, score };
  }).sort((a, b) => b.score - a.score || a.meal.wait - b.meal.wait);

  let opening = 'Here are a few tasty matches for what you described.';
  if (/tired|stressed|sad|anxious|overwhelmed|rough day|comfort|cozy|warm|mệt|buồn|căng thẳng|ấm/.test(text)) opening = 'A cozy, comforting meal may hit the spot. Here are a few ideas.';
  else if (/fresh|light|healthy|green|salad|rau|nhẹ|thanh mát/.test(text)) opening = 'Let’s keep it fresh and bright. These dishes could be a good fit.';
  else if (/spicy|hot|cay|nóng/.test(text)) opening = 'A little heat coming up. Here are some flavorful options.';
  else if (/quick|fast|hurry|busy|nhanh|vội/.test(text)) opening = 'Short on time? These are among the quicker picks.';
  return { meals: scored.slice(0, 3).map(item => item.meal), message: `${opening}${note ? ` ${note}` : ''}` };
}

function showMealSuggestions(request) {
  const response = document.querySelector('#chatResponse');
  const { meals, message } = recommendMeals(request);
  document.querySelector('#recommendationTitle').textContent = 'Ideas picked for your day';
  document.querySelector('#recommendationSub').textContent = 'Matched to your craving, mood, budget, and available time.';
  response.innerHTML = `<p class="assistant-message">${message}</p><div class="assistant-result-grid">${meals.map(meal => `<article class="assistant-result-card"><img src="${meal.image}" alt="${meal.imageAlt}" loading="lazy"><div class="assistant-result-content"><div class="assistant-result-heading"><h4>${meal.name}</h4><span>★ ${meal.rating.replace(/^★\s*/, '')}</span></div><p>${meal.description}</p><small><b>Ingredients</b> · ${meal.ingredients}</small><div class="assistant-result-meta"><strong>$${meal.price}</strong><span>◷ ${meal.wait} min</span><span>${meal.cuisine}</span></div><button type="button" class="assistant-add-button" data-meal-name="${meal.name}">Add to order <span>+</span></button></div></article>`).join('')}</div><small class="assistant-disclaimer">Ingredients are typical menu descriptions. Check with the restaurant about allergens or recipe changes.</small>`;
}

document.querySelector('#chatResponse').addEventListener('click', event => {
  const button = event.target.closest('[data-meal-name]');
  if (!button) return;
  const matchingCard = [...document.querySelectorAll('.meal-card')].find(card => card.querySelector('h3').textContent.trim() === button.dataset.mealName);
  matchingCard?.querySelector('.add-button').click();
});

document.querySelector('#chatForm').addEventListener('submit', event => {
  event.preventDefault();
  const input = document.querySelector('#promptInput');
  const value = input.value.trim();
  if (!value) return;
  showMealSuggestions(value);
  input.value = '';
});

document.querySelectorAll('.quick-picks button').forEach(button => button.addEventListener('click', () => {
  const input = document.querySelector('#promptInput');
  const label = button.textContent;
  if (label === 'Under $15') budget = 15;
  input.value = label === 'Surprise me' ? 'Surprise me with something delicious' : label === 'Quick lunch' ? 'I am busy and want something quick' : label === 'Something fresh' ? 'I want something fresh and light' : label;
  if (label === 'Under $15') {
    document.querySelector('#budgetLabel').textContent = '15';
    budgetInput.value = '15';
    renderCart();
  }
  document.querySelector('#chatForm').requestSubmit();
}));

document.querySelector('#headerOrder').addEventListener('click', () => document.querySelector('.order-sidebar').scrollIntoView({ behavior: 'smooth', block: 'center' }));

const shareDialog = document.querySelector('#shareDialog');
const qrContainer = document.querySelector('#shareQrCode');
const qrHint = document.querySelector('#qrHint');
let activeQrUrl = '';
document.querySelector('#openShareQr').addEventListener('click', () => {
  activeQrUrl = new URL('./', location.href).href;
  document.querySelector('#shareUrl').textContent = activeQrUrl;
  qrContainer.replaceChildren();
  if (window.QRCode) {
    new QRCode(qrContainer, { text: activeQrUrl, width: 224, height: 224, colorDark: '#292825', colorLight: '#fffefa', correctLevel: QRCode.CorrectLevel.M });
  } else {
    qrContainer.innerHTML = '<p class="qr-error">QR generator could not load. Copy the link below instead.</p>';
  }
  if (location.protocol === 'file:') qrHint.textContent = 'This local file address cannot be opened by other devices. Publish the site to create a public QR code.';
  else if (['localhost', '127.0.0.1'].includes(location.hostname)) qrHint.textContent = 'This localhost address only works on this computer. Use your LAN address for same-Wi-Fi testing, or publish the site for a public QR code.';
  else if (/^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(location.hostname)) qrHint.textContent = 'This local network QR works only for devices on the same Wi-Fi while your server is running.';
  else qrHint.textContent = 'This QR code points to the public website currently open in your browser.';
  shareDialog.showModal();
});
document.querySelector('#closeShareQr').addEventListener('click', () => shareDialog.close());
shareDialog.addEventListener('click', event => { if (event.target === shareDialog) shareDialog.close(); });
document.querySelector('#copySiteLink').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(activeQrUrl);
    toast('Website link copied.');
  } catch {
    window.prompt('Copy this website link:', activeQrUrl);
  }
});
document.querySelector('#downloadQr').addEventListener('click', () => {
  const canvas = qrContainer.querySelector('canvas');
  const image = qrContainer.querySelector('img');
  const dataUrl = canvas?.toDataURL('image/png') || image?.src;
  if (!dataUrl) return toast('The QR code is not ready yet.');
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = 'smartfoodie-qr.png';
  link.click();
});

if ('serviceWorker' in navigator && ['https:', 'http:'].includes(location.protocol)) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
