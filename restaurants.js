const featuredRestaurants = [
  { name: 'Burger Bench', type: 'Fast food · American', rating: '4.6', dishes: [['Classic Cheeseburger', '$8.50', '10–15 min'], ['Crispy Chicken Sandwich', '$9.25', '12–18 min']] },
  { name: 'Golden Bird Kitchen', type: 'Fast food · Fried chicken', rating: '4.5', dishes: [['2-Piece Chicken Meal', '$10.00', '12–18 min'], ['Chicken Tenders', '$8.75', '10–15 min']] },
  { name: 'Taco Trail', type: 'Fast food · Mexican-American', rating: '4.4', dishes: [['Chicken Taco Pair', '$7.50', '8–12 min'], ['Veggie Burrito', '$9.00', '10–15 min']] },
  { name: 'Green Fork Express', type: 'Fast casual · American', rating: '4.7', dishes: [['Grilled Chicken Grain Bowl', '$12.50', '10–15 min'], ['Harvest Salad', '$10.75', '8–12 min']] },
  { name: 'Stackhouse Grill', type: 'Fast casual · American', rating: '4.3', dishes: [['Double Smash Burger', '$11.50', '12–18 min'], ['Loaded Fries', '$6.50', '8–12 min']] },
  { name: 'Wok & Roll', type: 'Asian · Chinese', rating: '4.6', dishes: [['Chicken Chow Mein', '$12.00', '12–18 min'], ['Vegetable Fried Rice', '$10.50', '10–15 min']] },
  { name: 'Seoul Bowl', type: 'Asian · Korean', rating: '4.8', dishes: [['Beef Bulgogi Bowl', '$14.00', '15–20 min'], ['Tofu Bibimbap', '$12.50', '12–18 min']] },
  { name: 'Tokyo Bento', type: 'Asian · Japanese', rating: '4.7', dishes: [['Chicken Teriyaki Bento', '$13.50', '12–18 min'], ['Salmon Sushi Set', '$15.00', '15–20 min']] },
  { name: 'Little Saigon Noodle Bar', type: 'Asian · Vietnamese', rating: '4.8', dishes: [['Beef Pho', '$13.00', '15–20 min'], ['Chicken Vermicelli Bowl', '$12.50', '12–18 min']] },
  { name: 'Curry Corner', type: 'Asian · Indian', rating: '4.5', dishes: [['Chicken Tikka Masala', '$14.00', '15–20 min'], ['Chana Masala', '$11.50', '12–18 min']] }
];

const reviewerNames = [
  'Avery Morgan', 'Jordan Bennett', 'Riley Parker', 'Casey Brooks', 'Taylor Reed', 'Morgan Hayes', 'Jamie Foster', 'Cameron Blake', 'Quinn Ellis', 'Drew Collins',
  'Skyler James', 'Alexis Ward', 'Peyton Ross', 'Reese Murphy', 'Rowan Price', 'Emerson Cole', 'Finley Gray', 'Dakota Lane', 'Harper Wells', 'Logan Bell',
  'Sage Turner', 'Kendall Cruz', 'Charlie Hughes', 'Elliot Bailey', 'Micah Cooper', 'Robin Kelly', 'Sam Rivera', 'Jesse Howard', 'Arden Cook', 'Blair Sanders',
  'Kai Mitchell', 'Noah Bryant', 'Maya Jenkins', 'Ethan Powell', 'Leah Simmons', 'Owen Patterson', 'Zoe Long', 'Miles Perry', 'Nina Butler', 'Eli Henderson',
  'Ivy Coleman', 'Theo Barnes', 'Luca Fisher', 'Amina Washington', 'Ezra West', 'Mila Stone', 'Evan Dixon', 'Lily Grant', 'Amir Knight', 'Ella Spencer',
  'Maxine Porter', 'Caleb Murray', 'Sofia Palmer', 'Isaac Chapman', 'Grace Lawson', 'Julian Webb', 'Nora Franklin', 'Adrian Lawson', 'Ruby George', 'Wyatt Dean',
  'Amara Ford', 'Henry Graham', 'Elena Wallace', 'Felix Woods', 'Naomi Hart', 'Theo Armstrong', 'Layla Kennedy', 'Jude Mason', 'Mina Holmes', 'Oscar West',
  'Tessa Rice', 'Jonah Stone', 'Anika Shah', 'Mateo Ortiz', 'Sarah Lin', 'David Park', 'Emma Nguyen', 'Lucas Kim', 'Olivia Chen', 'Benjamin Lee',
  'Isabel Flores', 'Nathan Scott', 'Chloe Adams', 'Gabriel Young', 'Hannah King', 'Leo Wright', 'Miriam Patel', 'Daniel Brooks', 'Maya Thompson', 'Eli Morgan',
  'Ari Sullivan', 'Sienna Moore', 'Theo Ramirez', 'Lena Fischer', 'Rohan Mehta', 'Clara Evans', 'Mason Rivera', 'Yuna Sato', 'Amelia Ross', 'Andre Davis'
];

const extraReviewerFirstNames = ['Amaya', 'Ben', 'Cecilia', 'Darius', 'Esme', 'Farah', 'Gideon', 'Holly', 'Imran', 'Jocelyn', 'Kieran', 'Lucia', 'Malik', 'Nadia', 'Orlando', 'Priya', 'Rafael', 'Selena', 'Tariq', 'Valeria'];
const extraReviewerLastNames = ['Anders', 'Bishop', 'Carlisle'];
const reviewCounts = [12, 17, 10, 14, 19, 11, 16, 13, 20, 15];
const fiveStarCounts = [7, 9, 4, 10, 6, 7, 13, 9, 16, 8];

const sampleComments = [
  'The food was fresh, flavorful, and ready sooner than I expected.',
  'Really satisfying meal, and the portion was just right.',
  'Friendly service and a tasty meal. I would order this again.',
  'Everything was warm when I picked it up, and the flavors were great.',
  'A convenient lunch stop with plenty of flavor.',
  'The seasoning was excellent, and the order was easy to customize.',
  'Good value for a quick meal. The staff were welcoming too.',
  'Fresh ingredients and a nice balance of flavors.',
  'My order came out quickly and tasted great.',
  'A comforting meal with generous portions.',
  'The menu has good options, and my food was cooked just right.',
  'Loved the crisp texture and the bright, fresh toppings.',
  'Quick service, clean presentation, and a delicious meal.',
  'Everything tasted well prepared. I will be back.',
  'A tasty option when I need lunch in a hurry.',
  'The flavors were spot on, and the staff were helpful.',
  'Fresh, filling, and easy to take on the go.',
  'Nice quality for the price, with a short wait.',
  'The meal was flavorful and the pickup process was smooth.',
  'A reliable choice for a quick bite with friends.'
];

let reviewerOffset = 0;
featuredRestaurants.forEach((restaurant, restaurantIndex) => {
  const count = reviewCounts[restaurantIndex];
  const fiveStarCount = fiveStarCounts[restaurantIndex];
  restaurant.reviews = Array.from({ length: count }, (_, reviewIndex) => {
    const nameIndex = reviewerOffset + reviewIndex;
    const extraIndex = nameIndex - reviewerNames.length;
    const name = reviewerNames[nameIndex] || `${extraReviewerFirstNames[extraIndex % extraReviewerFirstNames.length]} ${extraReviewerLastNames[Math.floor(extraIndex / extraReviewerFirstNames.length)]}`;
    return {
      name,
      rating: reviewIndex < fiveStarCount ? 5 : 4,
      text: sampleComments[(restaurantIndex * 3 + reviewIndex) % sampleComments.length]
    };
  });
  reviewerOffset += count;
});

const restaurantDirectory = document.querySelector('#restaurantDirectoryGrid');
const feedbackDialog = document.querySelector('#feedbackDialog');
const feedbackList = document.querySelector('#feedbackList');
if (restaurantDirectory) {
  restaurantDirectory.innerHTML = featuredRestaurants.map((restaurant, index) => `
    <article class="directory-card">
      <div class="directory-card-top"><span class="directory-number">${String(index + 1).padStart(2, '0')}</span><div><h3>${restaurant.name}</h3><p>${restaurant.type}</p></div><span class="directory-rating" aria-label="${restaurant.rating} out of 5 stars">★ ${restaurant.rating}</span></div>
      <blockquote>“${restaurant.reviews[0].text}”<cite>— ${restaurant.reviews[0].name}</cite></blockquote>
      <div class="directory-menu">${restaurant.dishes.map(([name, price, wait]) => `<div class="directory-dish"><div><strong>${name}</strong><small>Estimated prep time · ${wait}</small></div><b>${price}</b></div>`).join('')}</div>
      <button class="view-feedback" type="button" data-restaurant-index="${index}">View ${restaurant.reviews.length} customer reviews <span>↗</span></button>
    </article>`).join('');

  restaurantDirectory.addEventListener('click', event => {
    const button = event.target.closest('[data-restaurant-index]');
    if (!button || !feedbackDialog || !feedbackList) return;
    const restaurant = featuredRestaurants[Number(button.dataset.restaurantIndex)];
    document.querySelector('#feedbackRestaurantName').textContent = restaurant.name;
    const average = (restaurant.reviews.reduce((sum, review) => sum + review.rating, 0) / restaurant.reviews.length).toFixed(1);
    document.querySelector('#feedbackSummary').innerHTML = `<span>★ ${average}</span> average from ${restaurant.reviews.length} sample reviews`;
    feedbackList.innerHTML = restaurant.reviews.map(review => `<article class="feedback-item"><div class="feedback-reviewer"><strong>${review.name}</strong><span class="feedback-stars" aria-label="${review.rating} out of 5 stars">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</span></div><p>${review.text}</p></article>`).join('');
    feedbackDialog.showModal();
  });

  const scrollRestaurants = direction => {
    const firstCard = restaurantDirectory.querySelector('.directory-card');
    if (!firstCard) return;
    const gap = parseFloat(getComputedStyle(restaurantDirectory).columnGap) || 16;
    restaurantDirectory.scrollBy({ left: direction * (firstCard.getBoundingClientRect().width + gap), behavior: 'smooth' });
  };
  document.querySelector('#restaurantsPrevious')?.addEventListener('click', () => scrollRestaurants(-1));
  document.querySelector('#restaurantsNext')?.addEventListener('click', () => scrollRestaurants(1));

  if ('IntersectionObserver' in window) {
    restaurantDirectory.classList.add('carousel-reveal-ready');
    const revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      });
    }, { root: restaurantDirectory, threshold: 0.24 });
    restaurantDirectory.querySelectorAll('.directory-card').forEach(card => revealObserver.observe(card));
  }
}

document.querySelector('#closeFeedbackDialog')?.addEventListener('click', () => feedbackDialog.close());

const foodTransition = document.querySelector('#foodTransition');
let restaurantTransitionRunning = false;
document.querySelectorAll('a[href="#restaurant-directory"]').forEach(link => {
  link.addEventListener('click', event => {
    event.preventDefault();
    if (restaurantTransitionRunning) return;
    const target = document.querySelector('#restaurant-directory');
    if (!target) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || !foodTransition) {
      target.scrollIntoView({ behavior: 'auto', block: 'start' });
      return;
    }
    restaurantTransitionRunning = true;
    foodTransition.classList.remove('is-active');
    void foodTransition.offsetWidth;
    foodTransition.classList.add('is-active');
    window.setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    window.setTimeout(() => {
      foodTransition.classList.remove('is-active');
      restaurantTransitionRunning = false;
    }, 1380);
  });
});
