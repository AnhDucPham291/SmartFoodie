// SmartFoodie catalog: cuisines, restaurants, dishes, and sample reviews.
// All names, prices, ratings, and reviews are demo data for the website preview.
(function (root) {
  const SF = root.SF || (root.SF = {});

  const UNSPLASH = 'https://images.unsplash.com/photo-';
  // Returns a sized image URL. Unsplash photos are resized on their CDN; other hosts are used as-is.
  SF.imageUrl = (image, width = 600) => image.startsWith('u:')
    ? `${UNSPLASH}${image.slice(2)}?auto=format&fit=crop&w=${width}&q=75`
    : image;
  SF.imageSrcset = (image, widths = [400, 800]) => image.startsWith('u:')
    ? widths.map(width => `${SF.imageUrl(image, width)} ${width}w`).join(', ')
    : '';

  // Category rail. `match` decides which dishes belong to a category.
  SF.categories = [
    { id: 'all', label: 'All', icon: '🍽️' },
    { id: 'asian', label: 'Asian', icon: '🥢', cuisines: ['Vietnamese', 'Thai', 'Indonesian', 'Japanese', 'Korean', 'Chinese', 'Indian'] },
    { id: 'american', label: 'American', icon: '🍔', cuisines: ['American'] },
    { id: 'mexican', label: 'Mexican', icon: '🌮', cuisines: ['Mexican'] },
    { id: 'italian', label: 'Italian', icon: '🍕', cuisines: ['Italian'] },
    { id: 'japanese', label: 'Japanese', icon: '🍣', cuisines: ['Japanese'] },
    { id: 'chinese', label: 'Chinese', icon: '🥟', cuisines: ['Chinese'] },
    { id: 'korean', label: 'Korean', icon: '🍲', cuisines: ['Korean'] },
    { id: 'thai', label: 'Thai', icon: '🍤', cuisines: ['Thai'] },
    { id: 'vietnamese', label: 'Vietnamese', icon: '🍜', cuisines: ['Vietnamese'] },
    { id: 'indian', label: 'Indian', icon: '🍛', cuisines: ['Indian'] },
    { id: 'mediterranean', label: 'Mediterranean', icon: '🫒', cuisines: ['Spanish', 'Greek', 'Middle Eastern'] },
    { id: 'middle-eastern', label: 'Middle Eastern', icon: '🧆', cuisines: ['Middle Eastern'] },
    { id: 'healthy', label: 'Healthy', icon: '🥗', tags: ['Healthy'] }
  ];

  SF.restaurants = [
    { id: 'little-saigon', name: 'Little Saigon Noodle Bar', cuisine: 'Vietnamese', rating: 4.8, ratingCount: 1260, eta: [20, 30], deliveryFee: 1.49, priceLevel: '$$', image: 'u:1582878826629-29b7ad1cdc43', tagline: 'Slow-simmered broths and Saigon street food' },
    { id: 'spice-route', name: 'Spice Route Kitchen', cuisine: 'Thai · Indonesian', rating: 4.7, ratingCount: 684, eta: [25, 35], deliveryFee: 1.99, priceLevel: '$$', image: 'u:1455619452474-d2be8b1e70cd', tagline: 'Curries, noodles, and bright Southeast Asian flavors' },
    { id: 'tokyo-bento', name: 'Tokyo Bento', cuisine: 'Japanese', rating: 4.7, ratingCount: 942, eta: [20, 30], deliveryFee: 2.49, priceLevel: '$$', image: 'u:1557872943-16a5ac26437e', tagline: 'Ramen, sushi, and bento boxes' },
    { id: 'seoul-bowl', name: 'Seoul Bowl', cuisine: 'Korean', rating: 4.8, ratingCount: 731, eta: [20, 30], deliveryFee: 1.99, priceLevel: '$$', image: 'u:1590301157890-4810ed352733', tagline: 'Bibimbap, bulgogi, and crispy Korean fried chicken' },
    { id: 'wok-and-roll', name: 'Wok & Roll', cuisine: 'Chinese', rating: 4.6, ratingCount: 1105, eta: [15, 25], deliveryFee: 0.99, priceLevel: '$', image: 'u:1563245372-f21724e3856d', tagline: 'Wok-fired classics and handmade dumplings' },
    { id: 'curry-corner', name: 'Curry Corner', cuisine: 'Indian', rating: 4.5, ratingCount: 856, eta: [25, 35], deliveryFee: 1.49, priceLevel: '$$', image: 'u:1589302168068-964664d93dc0', tagline: 'Curries, biryani, and street snacks' },
    { id: 'burger-bench', name: 'Burger Bench', cuisine: 'American · Fast food', rating: 4.6, ratingCount: 2034, eta: [10, 20], deliveryFee: 0.99, priceLevel: '$', image: 'u:1568901346375-23c9450c58cd', tagline: 'Classic burgers and crispy sandwiches' },
    { id: 'golden-bird', name: 'Golden Bird Kitchen', cuisine: 'American · Fried chicken', rating: 4.5, ratingCount: 1477, eta: [15, 25], deliveryFee: 0.99, priceLevel: '$', image: 'u:1626645738196-c2a7c87a8f58', tagline: 'Southern-style fried chicken' },
    { id: 'stackhouse', name: 'Stackhouse Grill', cuisine: 'American · BBQ', rating: 4.3, ratingCount: 1188, eta: [20, 30], deliveryFee: 1.99, priceLevel: '$$', image: 'u:1544025162-d76694265947', tagline: 'Smash burgers, ribs, and wings' },
    { id: 'green-fork', name: 'Green Fork Express', cuisine: 'American · Healthy', rating: 4.7, ratingCount: 903, eta: [15, 25], deliveryFee: 1.49, priceLevel: '$$', image: 'u:1505576399279-565b52d4ac71', tagline: 'Grain bowls and big fresh salads' },
    { id: 'taco-trail', name: 'Taco Trail', cuisine: 'Mexican · Fast food', rating: 4.4, ratingCount: 1320, eta: [10, 20], deliveryFee: 0.99, priceLevel: '$', image: 'u:1512838243191-e81e8f66f1fd', tagline: 'Quick tacos and burritos' },
    { id: 'casa-verde', name: 'Casa Verde Cocina', cuisine: 'Mexican', rating: 4.7, ratingCount: 642, eta: [20, 30], deliveryFee: 1.99, priceLevel: '$$', image: 'u:1599974579688-8dbdd335c77f', tagline: 'Street tacos, carnitas, and quesadillas' },
    { id: 'nonnas', name: "Nonna's Pasta & Pizza", cuisine: 'Italian', rating: 4.8, ratingCount: 1015, eta: [25, 35], deliveryFee: 2.49, priceLevel: '$$', image: 'u:1574071318508-1cdbab80d002', tagline: 'Fresh pasta and wood-fired pizza' },
    { id: 'olive-ember', name: 'Olive & Ember', cuisine: 'Mediterranean · Middle Eastern', rating: 4.7, ratingCount: 588, eta: [20, 30], deliveryFee: 1.99, priceLevel: '$$', image: 'u:1534080564583-6be75777b70a', tagline: 'Shawarma, falafel, paella, and shakshuka' }
  ];

  // [id, name, restaurantId, cuisine, price, rating, ratingCount, prepMinutes, diet, spicy(0-2), tags, image, description, ingredients, aliases, isNew]
  const DISH_ROWS = [
    ['pho', 'Pho Bo (Beef Pho)', 'little-saigon', 'Vietnamese', 14, 4.9, 214, 20, 'meat', 0, ['Soup', 'Noodles', 'Comfort'], 'u:1582878826629-29b7ad1cdc43', 'Slow-simmered beef broth with rice noodles, thin-sliced beef, and fresh herbs.', 'Beef, rice noodles, beef broth, star anise, basil, lime, bean sprouts', ['pho', 'pho bo', 'beef pho', 'beef noodle soup']],
    ['com-tam', 'Com Tam', 'little-saigon', 'Vietnamese', 13, 4.8, 187, 20, 'meat', 0, ['Rice', 'Grill'], 'https://www.vietnamairlines.com/content/dam/legacy-site-assets/SEO-images/2025%20SEO/Traffic%20TA/MB/broken-rice-vietnam/broken-rice-consists-of-rice-as-the-main-ingredient-accompanied-by-dishes-such-as-grilled-meat-and-eggs.jpg', 'Broken rice with caramelized grilled pork, a fried egg, and pickled vegetables.', 'Broken rice, grilled pork chop, egg, pickled carrot and daikon, fish sauce dressing', ['com tam', 'broken rice', 'com suon']],
    ['bun-bo-hue', 'Bun Bo Hue', 'little-saigon', 'Vietnamese', 15, 4.9, 146, 25, 'meat', 2, ['Soup', 'Noodles', 'Spicy'], 'https://cdn2.tuoitre.vn/ttnew/r/2024/04/01/hue-10-1711960135.jpg', 'Spicy lemongrass beef broth with thick rice noodles and herbs.', 'Beef shank, thick rice noodles, lemongrass, chili oil, herbs, lime', ['bun bo hue', 'bun bo', 'spicy beef noodle soup']],
    ['chicken-vermicelli', 'Chicken Vermicelli Bowl', 'little-saigon', 'Vietnamese', 12.5, 4.7, 98, 15, 'meat', 0, ['Noodles', 'Grill', 'Healthy'], 'u:1511910849309-0dffb8785146', 'Lemongrass grilled chicken over rice vermicelli with herbs and nuoc cham.', 'Lemongrass chicken, rice vermicelli, lettuce, herbs, peanuts, nuoc cham', ['chicken vermicelli', 'vermicelli bowl', 'bun ga nuong', 'bun ga']],
    ['banh-mi', 'Banh Mi Thit', 'little-saigon', 'Vietnamese', 9.5, 4.8, 126, 10, 'meat', 1, ['Sandwich', 'Street food'], 'u:1600454309261-3dc9b7597637', 'Crackly baguette with savory pork, pâté, pickled vegetables, cilantro, and chili.', 'Baguette, roast pork, pâté, mayonnaise, pickled carrot and daikon, cucumber, cilantro, chili', ['banh mi', 'banh mi thit', 'vietnamese sandwich'], true],

    ['pad-thai', 'Pad Thai', 'spice-route', 'Thai', 16, 4.8, 201, 20, 'seafood', 0, ['Noodles'], 'u:1637806931098-af30b519be53', 'Stir-fried rice noodles with shrimp, egg, peanuts, lime, and bean sprouts.', 'Rice noodles, shrimp, egg, tamarind sauce, peanuts, bean sprouts, lime', ['pad thai', 'thai noodles']],
    ['red-curry', 'Thai Red Curry', 'spice-route', 'Thai', 15, 4.7, 88, 20, 'meat', 2, ['Curry', 'Rice', 'Spicy'], 'u:1455619452474-d2be8b1e70cd', 'Chicken in a rich coconut red curry with bamboo shoots and Thai basil, served with jasmine rice.', 'Chicken, coconut milk, red curry paste, bamboo shoots, Thai basil, jasmine rice', ['red curry', 'thai red curry', 'thai curry', 'cari thai'], true],
    ['tom-yum', 'Tom Yum Goong', 'spice-route', 'Thai', 14, 4.8, 73, 15, 'seafood', 2, ['Soup', 'Spicy'], 'u:1548943487-a2e4e43b4853', 'Hot-and-sour shrimp soup with lemongrass, galangal, lime leaf, and mushrooms.', 'Shrimp, lemongrass, galangal, kaffir lime leaf, mushrooms, chili, lime', ['tom yum', 'tom yum goong', 'tom yam', 'lau thai'], true],
    ['gado-gado', 'Gado-Gado', 'spice-route', 'Indonesian', 13, 4.8, 124, 20, 'vegetarian', 0, ['Healthy', 'Salad'], 'u:1546069901-5ec6a79120b0', 'Indonesian salad of blanched vegetables, tofu, tempeh, and egg with peanut dressing.', 'Mixed vegetables, tofu, tempeh, boiled egg, peanut dressing, crackers', ['gado gado', 'gado-gado', 'indonesian salad']],

    ['chirashi', 'Chirashi Sushi Bowl', 'tokyo-bento', 'Japanese', 18, 4.9, 173, 20, 'seafood', 0, ['Rice', 'Sushi'], 'u:1565753445646-1fe473522242', 'Sushi rice topped with fresh, colorful sashimi.', 'Sushi rice, salmon, tuna, tamago, cucumber, pickled ginger', ['chirashi', 'chirashi bowl', 'sashimi bowl']],
    ['salmon-sushi-set', 'Salmon Sushi Set', 'tokyo-bento', 'Japanese', 15, 4.7, 112, 18, 'seafood', 0, ['Sushi'], 'u:1617196034796-73dfa7b1fd56', 'Salmon nigiri and maki with wasabi, ginger, and soy.', 'Salmon, sushi rice, nori, wasabi, pickled ginger', ['salmon sushi', 'sushi set', 'sushi']],
    ['teriyaki-bento', 'Chicken Teriyaki Bento', 'tokyo-bento', 'Japanese', 13.5, 4.6, 95, 15, 'meat', 0, ['Rice', 'Grill'], 'u:1609183480237-ccbb2d7c5772', 'Glazed teriyaki chicken with rice, salad, and pickles.', 'Chicken thigh, teriyaki glaze, steamed rice, salad, pickles, scallions', ['teriyaki', 'chicken teriyaki', 'bento']],
    ['tonkotsu-ramen', 'Tonkotsu Ramen', 'tokyo-bento', 'Japanese', 16, 4.9, 158, 15, 'meat', 0, ['Soup', 'Noodles', 'Comfort'], 'u:1557872943-16a5ac26437e', 'Creamy pork-bone broth with ramen noodles, chashu pork, soft egg, and nori.', 'Pork-bone broth, ramen noodles, chashu pork, soft-boiled egg, nori, scallions', ['ramen', 'tonkotsu', 'tonkotsu ramen', 'mi ramen'], true],
    ['chicken-katsu', 'Chicken Katsu Plate', 'tokyo-bento', 'Japanese', 14, 4.7, 84, 15, 'meat', 0, ['Fried', 'Rice'], 'u:1569050467447-ce54b3bbc37d', 'Panko-crusted chicken cutlet with katsu sauce, rice, and shredded cabbage.', 'Chicken breast, panko, katsu sauce, steamed rice, cabbage', ['katsu', 'chicken katsu', 'tonkatsu'], true],

    ['bulgogi-bowl', 'Beef Bulgogi Bowl', 'seoul-bowl', 'Korean', 14, 4.8, 131, 18, 'meat', 0, ['Rice', 'Grill'], 'u:1553163147-622ab57be1c7', 'Sweet-savory marinated beef over rice with vegetables and a soft egg.', 'Beef, soy-pear marinade, rice, vegetables, egg, sesame', ['bulgogi', 'beef bulgogi', 'bulgogi bowl']],
    ['tofu-bibimbap', 'Tofu Bibimbap', 'seoul-bowl', 'Korean', 12.5, 4.7, 102, 15, 'vegetarian', 1, ['Rice', 'Healthy'], 'u:1590301157890-4810ed352733', 'Rice bowl with seasoned vegetables, crispy tofu, egg, and gochujang.', 'Rice, tofu, spinach, carrot, bean sprouts, mushrooms, egg, gochujang', ['bibimbap', 'tofu bibimbap', 'com tron han quoc']],
    ['korean-fried-chicken', 'Korean Fried Chicken', 'seoul-bowl', 'Korean', 15, 4.8, 167, 20, 'meat', 1, ['Fried', 'Spicy'], 'u:1569058242253-92a9c755a0ec', 'Double-fried crispy chicken tossed in a sweet-spicy gochujang glaze.', 'Chicken, potato-starch batter, gochujang glaze, garlic, sesame, pickled radish', ['korean fried chicken', 'kfc', 'ga ran han quoc', 'ga chien han quoc'], true],

    ['chow-mein', 'Chicken Chow Mein', 'wok-and-roll', 'Chinese', 12, 4.6, 118, 15, 'meat', 0, ['Noodles'], 'u:1585032226651-759b368d7246', 'Wok-tossed egg noodles with chicken, cabbage, and bean sprouts.', 'Egg noodles, chicken, cabbage, carrots, bean sprouts, soy sauce', ['chow mein', 'chicken chow mein', 'mi xao']],
    ['veg-fried-rice', 'Vegetable Fried Rice', 'wok-and-roll', 'Chinese', 10.5, 4.5, 90, 12, 'vegetarian', 0, ['Rice'], 'u:1603133872878-684f208fb84b', 'Fluffy wok-fried rice with egg, peas, carrots, and scallions.', 'Rice, egg, peas, carrots, scallions, soy sauce', ['fried rice', 'vegetable fried rice', 'com chien']],
    ['xiao-long-bao', 'Xiao Long Bao (6 pcs)', 'wok-and-roll', 'Chinese', 11, 4.9, 142, 15, 'meat', 0, ['Dumplings'], 'u:1563245372-f21724e3856d', 'Steamed soup dumplings filled with pork and savory broth, with ginger vinegar.', 'Pork, dumpling wrappers, gelatin broth, ginger, black vinegar', ['xiao long bao', 'xlb', 'soup dumplings', 'dumplings', 'ha cao', 'tieu long bao'], true],
    ['orange-chicken', 'Orange Chicken', 'wok-and-roll', 'Chinese', 13, 4.6, 121, 15, 'meat', 1, ['Fried', 'Rice'], 'u:1525755662778-989d0524087e', 'Crispy chicken in a sweet-tangy orange glaze with broccoli and steamed rice.', 'Chicken, orange glaze, broccoli, steamed rice, sesame', ['orange chicken', 'ga sot cam'], true],

    ['butter-chicken', 'Butter Chicken', 'curry-corner', 'Indian', 17, 4.8, 188, 25, 'meat', 0, ['Curry', 'Rice', 'Comfort'], 'u:1710091691771-96b2e6d17dac', 'Tandoori chicken in a silky tomato-butter sauce with fragrant rice.', 'Chicken, tomato, butter, cream, garam masala, basmati rice, cilantro', ['butter chicken', 'murgh makhani', 'ga bo']],
    ['tikka-masala', 'Chicken Tikka Masala', 'curry-corner', 'Indian', 14, 4.7, 134, 18, 'meat', 1, ['Curry'], 'u:1565557623262-b51c2513a641', 'Smoky chicken tikka in a creamy spiced tomato sauce, served with naan.', 'Chicken tikka, tomato cream sauce, spices, naan', ['tikka masala', 'chicken tikka', 'tikka']],
    ['chana-masala', 'Chana Masala', 'curry-corner', 'Indian', 11.5, 4.6, 77, 15, 'vegan', 1, ['Curry', 'Healthy'], 'u:1582576163090-09d3b6f8a969', 'Chickpeas simmered in a tangy, spiced onion-tomato gravy with rice.', 'Chickpeas, onion, tomato, ginger, garlic, spices, rice', ['chana masala', 'chickpea curry', 'chana']],
    ['chicken-biryani', 'Chicken Biryani', 'curry-corner', 'Indian', 15.5, 4.8, 139, 25, 'meat', 1, ['Rice'], 'u:1589302168068-964664d93dc0', 'Layered basmati rice and spiced chicken with saffron, fried onions, and raita.', 'Basmati rice, chicken, yogurt, saffron, whole spices, fried onions, raita', ['biryani', 'chicken biryani', 'com biryani'], true],
    ['veg-samosas', 'Vegetable Samosas (3 pcs)', 'curry-corner', 'Indian', 7, 4.7, 96, 10, 'vegetarian', 1, ['Fried', 'Snack'], 'u:1601050690597-df0568f70950', 'Flaky pastries filled with spiced potato and peas, with mint and tamarind chutneys.', 'Pastry, potato, peas, cumin, coriander, mint chutney, tamarind chutney', ['samosa', 'samosas', 'banh samosa'], true],

    ['cheeseburger', 'Classic Cheeseburger', 'burger-bench', 'American', 8.5, 4.6, 240, 12, 'meat', 0, ['Burger'], 'u:1568901346375-23c9450c58cd', 'Grilled beef patty, melted cheese, lettuce, tomato, and pickles on a toasted bun.', 'Beef patty, American cheese, lettuce, tomato, pickles, onion, bun', ['cheeseburger', 'classic burger', 'burger', 'hamburger']],
    ['crispy-chicken-sandwich', 'Crispy Chicken Sandwich', 'burger-bench', 'American', 9.25, 4.5, 176, 15, 'meat', 0, ['Sandwich', 'Fried'], 'u:1606755962773-d324e0a13086', 'Buttermilk fried chicken, slaw, and pickles on a brioche bun.', 'Fried chicken breast, slaw, pickles, sauce, brioche bun', ['chicken sandwich', 'crispy chicken sandwich', 'chicken burger']],
    ['two-piece-meal', '2-Piece Chicken Meal', 'golden-bird', 'American', 10, 4.5, 205, 15, 'meat', 0, ['Fried'], 'u:1626645738196-c2a7c87a8f58', 'Two pieces of crispy fried chicken with a side and a biscuit.', 'Chicken, seasoned flour, side of slaw or fries, biscuit', ['fried chicken', '2 piece', 'two piece', 'ga ran']],
    ['chicken-tenders', 'Chicken Tenders', 'golden-bird', 'American', 8.75, 4.4, 163, 12, 'meat', 0, ['Fried'], 'u:1562967914-608f82629710', 'Crispy tenders with honey mustard dip.', 'Chicken tenderloin, breading, honey mustard', ['chicken tenders', 'tenders', 'chicken strips']],
    ['smash-burger', 'Double Smash Burger', 'stackhouse', 'American', 11.5, 4.6, 198, 15, 'meat', 0, ['Burger'], 'u:1553979459-d2229ba7433b', 'Two crispy-edged smashed patties, cheese, onions, and house sauce.', 'Beef patties, cheese, grilled onions, pickles, house sauce, bun', ['smash burger', 'double smash', 'double burger']],
    ['loaded-fries', 'Loaded Fries', 'stackhouse', 'American', 6.5, 4.3, 121, 10, 'vegetarian', 0, ['Snack', 'Fried'], 'u:1573080496219-bb080dd4f877', 'Crispy fries with cheese sauce, parmesan, and herbs.', 'Potatoes, cheese sauce, parmesan, herbs', ['loaded fries', 'fries', 'khoai tay chien']],
    ['bbq-ribs', 'Smoky BBQ Ribs (half rack)', 'stackhouse', 'American', 19, 4.8, 117, 25, 'meat', 0, ['Grill', 'BBQ'], 'u:1544025162-d76694265947', 'Slow-smoked pork ribs with a sticky BBQ glaze, fries, and pickles.', 'Pork ribs, dry rub, BBQ sauce, fries, pickles', ['ribs', 'bbq ribs', 'suon nuong'], true],
    ['buffalo-wings', 'Buffalo Wings (8 pcs)', 'stackhouse', 'American', 12, 4.7, 150, 20, 'meat', 2, ['Fried', 'Spicy'], 'u:1567620832903-9fc6debc209f', 'Crispy wings tossed in tangy-hot buffalo sauce with ranch and celery.', 'Chicken wings, buffalo sauce, ranch, celery', ['wings', 'buffalo wings', 'chicken wings', 'canh ga'], true],
    ['grain-bowl', 'Grilled Chicken Grain Bowl', 'green-fork', 'American', 12.5, 4.7, 143, 12, 'meat', 0, ['Healthy', 'Bowl'], 'u:1490645935967-10de6ba17061', 'Grilled chicken, whole grains, greens, and crunchy vegetables with lemon dressing.', 'Grilled chicken, quinoa, brown rice, greens, vegetables, lemon dressing', ['grain bowl', 'chicken bowl', 'healthy bowl']],
    ['harvest-salad', 'Harvest Salad', 'green-fork', 'American', 10.75, 4.6, 88, 10, 'vegetarian', 0, ['Healthy', 'Salad'], 'u:1505253716362-afaea1d3d1af', 'Mixed greens, seasonal fruit, feta, and toasted seeds.', 'Mixed greens, fruit, feta, seeds, vinaigrette', ['salad', 'harvest salad', 'salad rau']],

    ['chicken-taco-pair', 'Chicken Taco Pair', 'taco-trail', 'Mexican', 7.5, 4.4, 132, 10, 'meat', 1, ['Tacos', 'Street food'], 'u:1512838243191-e81e8f66f1fd', 'Two soft tacos with seasoned chicken, pickled onion, and salsa.', 'Corn tortillas, chicken, pickled onion, salsa, cilantro', ['chicken tacos', 'taco pair']],
    ['veggie-burrito', 'Veggie Burrito', 'taco-trail', 'Mexican', 9, 4.5, 97, 12, 'vegetarian', 0, ['Burrito'], 'u:1626700051175-6818013e1d4f', 'Flour tortilla packed with beans, rice, vegetables, and cheese.', 'Flour tortilla, black beans, rice, peppers, cheese, salsa', ['burrito', 'veggie burrito', 'vegetarian burrito']],
    ['street-tacos', 'Street Tacos', 'casa-verde', 'Mexican', 13, 4.8, 196, 15, 'meat', 1, ['Tacos', 'Street food'], 'u:1552332386-f8dd00dc2f85', 'Three carne asada tacos on corn tortillas with cilantro, onion, and lime.', 'Corn tortillas, carne asada, cilantro, onion, lime, salsa verde', ['street tacos', 'carne asada tacos']],
    ['carnitas-tacos', 'Carnitas Tacos', 'casa-verde', 'Mexican', 12.5, 4.8, 109, 15, 'meat', 0, ['Tacos'], 'u:1599974579688-8dbdd335c77f', 'Slow-braised crispy pork in warm tortillas with pickled onions and cilantro.', 'Braised pork, corn tortillas, pickled onions, cilantro, salsa roja', ['carnitas', 'carnitas tacos', 'pork tacos'], true],
    ['chicken-quesadilla', 'Chicken Quesadilla', 'casa-verde', 'Mexican', 11, 4.6, 91, 12, 'meat', 0, ['Cheesy'], 'u:1618040996337-56904b7850b9', 'Griddled flour tortilla with melted cheese and seasoned chicken, with sour cream and pico.', 'Flour tortilla, chicken, Monterey Jack, pico de gallo, sour cream', ['quesadilla', 'chicken quesadilla'], true],

    ['penne-pomodoro', 'Penne Pomodoro', 'nonnas', 'Italian', 14, 4.7, 132, 18, 'vegetarian', 0, ['Pasta'], 'u:1734769774783-78ddeed93751', 'Penne in a bright tomato sauce with basil and parmesan.', 'Penne, tomatoes, garlic, basil, olive oil, parmesan', ['penne', 'pomodoro', 'penne pomodoro', 'tomato pasta']],
    ['bolognese', 'Spaghetti Bolognese', 'nonnas', 'Italian', 16, 4.8, 124, 20, 'meat', 0, ['Pasta', 'Comfort'], 'u:1622973536968-3ead9e780960', 'Spaghetti with a slow-cooked beef and tomato ragù and parmesan.', 'Spaghetti, beef, tomato, onion, carrot, celery, parmesan', ['bolognese', 'spaghetti', 'spaghetti bolognese', 'mi y'], true],
    ['margherita', 'Margherita Pizza', 'nonnas', 'Italian', 15, 4.8, 161, 18, 'vegetarian', 0, ['Pizza'], 'u:1574071318508-1cdbab80d002', 'Wood-fired pizza with San Marzano tomato, fresh mozzarella, and basil.', 'Pizza dough, San Marzano tomatoes, fresh mozzarella, basil, olive oil', ['pizza', 'margherita', 'margherita pizza'], true],

    ['shawarma-wrap', 'Chicken Shawarma Wrap', 'olive-ember', 'Middle Eastern', 12, 4.7, 133, 12, 'meat', 0, ['Wrap', 'Grill'], 'u:1633321702518-7feccafb94d5', 'Spiced chicken shawarma with garlic sauce, pickles, and tomato in warm flatbread.', 'Chicken, shawarma spices, toum garlic sauce, pickles, tomato, flatbread', ['shawarma', 'chicken shawarma', 'shawarma wrap', 'banh mi tho nhi ky'], true],
    ['falafel-plate', 'Falafel Plate', 'olive-ember', 'Middle Eastern', 12.5, 4.7, 87, 12, 'vegan', 0, ['Healthy'], 'u:1561651823-34feb02250e4', 'Crispy chickpea falafel with hummus, tahini, salad, and pita.', 'Chickpeas, herbs, hummus, tahini, salad, pita', ['falafel', 'falafel plate', 'hummus'], true],
    ['seafood-paella', 'Seafood Paella', 'olive-ember', 'Spanish', 22, 4.8, 76, 30, 'seafood', 0, ['Rice'], 'u:1534080564583-6be75777b70a', 'Saffron rice with shrimp, mussels, and calamari, finished with lemon.', 'Bomba rice, saffron, shrimp, mussels, calamari, peppers, lemon', ['paella', 'seafood paella', 'com chao tay ban nha'], true],
    ['shakshuka', 'Shakshuka', 'olive-ember', 'Middle Eastern', 13, 4.7, 69, 18, 'vegetarian', 1, ['Eggs', 'Brunch'], 'u:1590412200988-a436970781fa', 'Eggs poached in a smoky tomato-pepper sauce with herbs and warm bread.', 'Eggs, tomatoes, peppers, onion, paprika, cumin, herbs, bread', ['shakshuka', 'shakshouka', 'trung sot ca'], true]
  ];

  // Sample feedback for each dish: [stars, comment].
  const DISH_REVIEWS = {
    'pho': [[5, 'Broth tastes like it simmered all night: clear, rich, and fragrant with star anise.'], [5, 'Generous herbs and lime on the side. Perfect on a rainy day.'], [4, "Great flavor. I'd love a few more slices of beef for the price."]],
    'com-tam': [[5, 'The grilled pork is smoky and caramelized, and the fish sauce dressing is spot on.'], [5, 'Tastes like the com tam stalls in Saigon. The fried egg was perfectly runny.'], [4, 'Big, satisfying portion. The pickles could be a little more tangy.']],
    'bun-bo-hue': [[5, 'Proper heat and a deep lemongrass broth. The thick noodles have a great chew.'], [5, 'Spicy, savory, and hearty. Exactly what I was craving.'], [4, "Loved it, but it's quite spicy. Ask for the chili oil on the side if you're sensitive."]],
    'chicken-vermicelli': [[5, 'Lemongrass chicken, fresh herbs, and nuoc cham. Light and bright.'], [4, 'Great mix of textures. Pour all the sauce in!']],
    'banh-mi': [[5, 'Crackly baguette, savory pork, pâté, and fresh pickles. Textbook banh mi.'], [5, 'Fast, affordable, and so good. The cilantro and chili make it pop.'], [4, 'Delicious. Ask for extra pickled carrots if you like it tangy.']],
    'pad-thai': [[5, 'The tamarind sauce is balanced: sweet, sour, and not too sticky.'], [4, 'Plump shrimp and plenty of peanuts. Arrived still hot.'], [5, 'My go-to lunch. The squeeze of lime makes it.']],
    'red-curry': [[5, 'Coconut-rich and properly spicy, with tender chicken and bamboo shoots.'], [4, "Great depth of flavor. I'd order it medium-spicy next time."], [5, 'Pairs perfectly with the jasmine rice. Big portion.']],
    'tom-yum': [[5, 'Hot, sour, and fragrant with lemongrass and lime leaf. The shrimp were plump.'], [5, 'Clears your head in the best way. Authentic flavor.'], [4, 'Excellent broth. A bit spicy for me, but I finished it all.']],
    'gado-gado': [[5, 'Crunchy vegetables and a rich peanut dressing. Filling but light.'], [4, 'Love the tofu and tempeh. Dressing on the side keeps it crisp.'], [5, 'One of the best healthy lunches around.']],
    'chirashi': [[5, 'The fish is fresh and beautifully cut. The rice is seasoned just right.'], [5, 'Feels like a treat: salmon, tuna, and tamago over sushi rice.'], [4, 'Excellent quality. A little more ginger would have been nice.']],
    'salmon-sushi-set': [[5, 'Fresh salmon nigiri and rolls, neatly packed.'], [4, 'Good quality for the price.']],
    'teriyaki-bento': [[5, 'Glossy teriyaki chicken, rice, and sides. A balanced lunch box.'], [4, 'Tasty and filling. The sauce is a little sweet.']],
    'tonkotsu-ramen': [[5, 'Creamy pork broth, melt-in-your-mouth chashu, and a perfectly jammy egg.'], [5, 'The noodles stayed firm even with delivery. Very impressive.'], [4, 'Rich and comforting. Add the chili oil for an extra kick.']],
    'chicken-katsu': [[5, 'Super crispy panko crust, juicy chicken, and tangy katsu sauce.'], [4, 'Great crunch. The shredded cabbage keeps it fresh.'], [5, 'Comfort food done right. The kids loved it too.']],
    'bulgogi-bowl': [[5, 'Tender marinated beef with a hint of pear and sesame.'], [5, 'Huge bowl, and great with kimchi.']],
    'tofu-bibimbap': [[5, 'Colorful vegetables, crispy tofu, and gochujang. Mix it all up!'], [4, 'Healthy and satisfying. The egg was perfectly runny.']],
    'korean-fried-chicken': [[5, 'Shatteringly crisp and double-fried, with a sweet-spicy gochujang glaze.'], [5, 'Stayed crunchy after a 20-minute drive. Seriously good.'], [4, 'Addictive sauce. Grab extra napkins.']],
    'chow-mein': [[4, 'Wok-tossed noodles with a nice smoky flavor.'], [5, 'Quick, hot, and full of vegetables.']],
    'veg-fried-rice': [[4, 'Fluffy rice and not greasy. A solid side or main.'], [5, 'Simple and comforting, with real wok flavor.']],
    'xiao-long-bao': [[5, 'Delicate wrappers and hot, savory soup inside. Bite carefully!'], [5, "Best soup dumplings I've had delivered. The ginger vinegar is a must."], [4, 'Very good. One dumpling broke in transit, but the flavor was excellent.']],
    'orange-chicken': [[5, 'Crispy chicken in a bright, citrusy sauce. Better than the chains.'], [4, 'Sweet and tangy with real orange zest. Great with steamed rice.'], [5, 'Generous portion, and the leftovers reheated well.']],
    'butter-chicken': [[5, 'Silky, buttery sauce with tender chicken. The rice soaks it up perfectly.'], [5, 'Mild but full of flavor. A hit with my kids too.'], [4, "Really good. I'd add naan to the order next time."]],
    'tikka-masala': [[5, 'Smoky chicken tikka in a creamy, spiced tomato sauce.'], [4, 'Great flavor. Order it with garlic naan.']],
    'chana-masala': [[5, 'Hearty chickpeas in a tangy, spiced gravy. A great vegan pick.'], [4, 'Comforting and filling, with mild heat.']],
    'chicken-biryani': [[5, 'Fragrant basmati, tender chicken, and whole spices in every bite.'], [5, 'Comes with cooling raita that balances the heat.'], [4, 'Delicious and filling. Mildly spicy, so ask for extra heat if you like.']],
    'veg-samosas': [[5, 'Flaky, golden pastry with a well-spiced potato and pea filling.'], [4, 'Great starter. The tamarind and mint chutneys are excellent.'], [5, 'Crisp even after delivery. I order these every time.']],
    'cheeseburger': [[5, 'Classic and juicy, with melted American cheese.'], [4, 'Quick and reliable. Good value.']],
    'crispy-chicken-sandwich': [[5, 'Crunchy chicken, tangy slaw, and a soft brioche bun.'], [4, 'Big sandwich. A little messy, but tasty.']],
    'two-piece-meal': [[4, 'Crispy, well-seasoned chicken. The sides were warm.'], [5, 'Juicy inside, crunchy outside. My fried chicken fix.']],
    'chicken-tenders': [[4, "The kids' favorite. The honey mustard dip is great."], [5, 'Crispy and not greasy.']],
    'smash-burger': [[5, 'Lacy, crispy edges on the patties. Seriously good.'], [4, 'Messy in the best way. Bring napkins.']],
    'loaded-fries': [[4, 'Cheesy, crispy, and great for sharing.'], [4, 'Good snack. Best eaten right away.']],
    'bbq-ribs': [[5, 'Fall-off-the-bone tender with a smoky, sticky glaze.'], [5, 'Real smoke ring and great bark. Worth every penny.'], [4, 'Excellent ribs. The sauce is on the sweeter side.']],
    'buffalo-wings': [[5, 'Crispy skin, tangy-hot buffalo sauce, and cool ranch on the side.'], [4, 'Proper heat. The celery sticks were fresh and crunchy.'], [5, 'A game-day favorite. Arrived hot and saucy.']],
    'grain-bowl': [[5, 'Grilled chicken, grains, and crunchy vegetables with a lemony dressing.'], [5, 'Healthy without being boring.']],
    'harvest-salad': [[5, 'Fresh greens, fruit, and feta. Light and refreshing.'], [4, 'Nice salad. Dressing on the side keeps it crisp.']],
    'chicken-taco-pair': [[4, 'Quick, tasty, and affordable.'], [5, 'Great salsa and fresh toppings.']],
    'veggie-burrito': [[5, 'Packed with beans, rice, and vegetables. Very filling.'], [4, 'A solid vegetarian option.']],
    'street-tacos': [[5, 'Charred tortillas, juicy carne asada, and lots of cilantro and onion.'], [5, 'The salsa verde is fantastic. I ordered a second round.'], [4, 'Delicious and quick. Portions are on the smaller side.']],
    'carnitas-tacos': [[5, 'Slow-braised pork with crispy edges. The pickled onions are perfect.'], [5, 'Juicy and flavorful, and the tortillas taste fresh.'], [4, "Really good. I'd add more salsa roja next time."]],
    'chicken-quesadilla': [[5, 'Golden and crisp outside, with gooey cheese and seasoned chicken inside.'], [4, 'Comes with sour cream and pico. An easy, tasty lunch.'], [5, 'Kids and adults were both happy. Great value.']],
    'penne-pomodoro': [[5, 'Simple, bright tomato sauce with fresh basil. The pasta was al dente.'], [4, "Comforting and light. Add the parmesan; it's worth it."], [5, 'Tastes homemade. A great vegetarian option.']],
    'bolognese': [[5, 'Slow-cooked meat sauce with real depth. Tastes like Sunday dinner.'], [5, 'Perfect pasta texture and plenty of parmesan.'], [4, 'Hearty and delicious. A touch more sauce would be ideal.']],
    'margherita': [[5, 'Blistered crust, sweet tomatoes, and fresh mozzarella.'], [5, 'Simple and perfect. Still crisp when it arrived.'], [4, "Lovely pizza. I'd add a drizzle of chili oil."]],
    'shawarma-wrap': [[5, 'Juicy spiced chicken, garlic sauce, and pickles, wrapped tight.'], [5, 'The garlic sauce is incredible. A great lunch.'], [4, 'Tasty and filling. A bit messy to eat in the car!']],
    'falafel-plate': [[5, 'Crunchy outside, fluffy and herby inside. The hummus is super smooth.'], [5, 'A satisfying vegan meal with lots of fresh salad.'], [4, 'Great flavor. I would love a second pita.']],
    'seafood-paella': [[5, 'Saffron rice with a crispy bottom, plus mussels, shrimp, and calamari.'], [5, 'Feels like a special-occasion dish. I shared it with a friend.'], [4, 'Delicious, though it takes a little longer to prepare.']],
    'shakshuka': [[5, 'Eggs poached in a spiced tomato-pepper sauce. Perfect with the bread.'], [4, 'Warming and flavorful. A great brunch option.'], [5, 'Runny yolks and smoky paprika. So comforting.']]
  };

  const REVIEWER_NAMES = [
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

  const RESTAURANT_COMMENTS = [
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
    'Quick service, clean presentation, and a delicious meal.',
    'Everything tasted well prepared. I will be back.',
    'The flavors were spot on, and the staff were helpful.',
    'Nice quality for the price, with a short wait.',
    'The meal was flavorful and the pickup process was smooth.'
  ];

  const restaurantById = new Map(SF.restaurants.map(restaurant => [restaurant.id, restaurant]));
  let reviewerIndex = 0;
  const nextReviewer = () => REVIEWER_NAMES[reviewerIndex++ % REVIEWER_NAMES.length];

  SF.dishes = DISH_ROWS.map(([id, name, restaurantId, cuisine, price, rating, ratingCount, prep, diet, spicy, tags, image, description, ingredients, aliases, isNew], dishIndex) => ({
    id, name, restaurantId, cuisine, price, rating, ratingCount, prep, diet, spicy, tags, image, description, ingredients,
    aliases: aliases || [],
    isNew: Boolean(isNew),
    imageAlt: `${name}: ${description.charAt(0).toLowerCase()}${description.slice(1).replace(/\.$/, '')}`,
    reviews: (DISH_REVIEWS[id] || []).map(([stars, text], reviewIndex) => ({
      name: nextReviewer(),
      rating: stars,
      daysAgo: 1 + ((dishIndex * 5 + reviewIndex * 9) % 45),
      text
    }))
  }));
  SF.dishById = new Map(SF.dishes.map(dish => [dish.id, dish]));
  SF.restaurantById = restaurantById;

  // Restaurant-level sample reviews.
  SF.restaurants.forEach((restaurant, index) => {
    const count = 8 + (index * 5) % 9;
    restaurant.reviews = Array.from({ length: count }, (_, reviewIndex) => ({
      name: nextReviewer(),
      rating: reviewIndex % 4 === 3 ? 4 : 5,
      daysAgo: 1 + ((index * 7 + reviewIndex * 4) % 60),
      text: RESTAURANT_COMMENTS[(index * 3 + reviewIndex) % RESTAURANT_COMMENTS.length]
    }));
    restaurant.dishIds = SF.dishes.filter(dish => dish.restaurantId === restaurant.id).map(dish => dish.id);
  });

  // Star distribution that averages to `rating` across `count` ratings (for the histogram).
  SF.ratingBreakdown = (rating, count) => {
    const deficit = Math.max(0, (5 - rating) * count);
    const one = Math.round(deficit * 0.12 / 4);
    const two = Math.round(deficit * 0.08 / 3);
    const three = Math.round(deficit * 0.2 / 2);
    const four = Math.max(0, Math.round(deficit - one * 4 - two * 3 - three * 2));
    const five = Math.max(0, count - one - two - three - four);
    return { 5: five, 4: four, 3: three, 2: two, 1: one };
  };

  SF.dishMatchesCategory = (dish, categoryId) => {
    const category = SF.categories.find(item => item.id === categoryId);
    if (!category || category.id === 'all') return true;
    if (category.cuisines && category.cuisines.includes(dish.cuisine)) return true;
    if (category.tags && category.tags.some(tag => dish.tags.includes(tag))) return true;
    return false;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = SF;
})(typeof window !== 'undefined' ? window : globalThis);
