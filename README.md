# SmartFoodie

A responsive website for eating out with friends: **dine in**, **book a table** (reservation), or **order ahead for pickup** from 14 restaurants and 188 dishes. See opening hours, meal times, prep times, distance, and how many people ordered each dish today; check in as a group, split the bill, keep your order history, post reviews with photos, find real restaurants near you, and let an AI assistant set it all up. There is no delivery.

## Preview on this computer or phone

Run from this folder:

```bash
python3 serve.py
```

Open the `localhost` address printed in the terminal on this computer. The server also prints a Wi-Fi address for phones on the same network. Open that Wi-Fi address on this computer, select the **share** (QR) button, then scan the code with your phone. If port 8000 is busy, the server tries the next 19 ports. You can choose a starting port with `python3 serve.py --port 8100`.

## What's on the site

- **Three ways to eat** (header switch, the cards at the top, the order drawer, and checkout):
  - **Dine-in**: order from your phone, say when you'll arrive (now, 10, 20, or 30 minutes), and check in at the restaurant. The kitchen starts at check-in; the page shows when food reaches the table.
  - **Reservation**: book a table for 1–12 people up to two weeks ahead. Restaurant cards show the next open times; the booking form only offers times inside opening hours (last seating an hour before closing). Pre-ordering is optional and is timed for when you sit down.
  - **Pickup**: order ahead for as soon as possible or a 15-minute time slot in the next 24 hours, only when every restaurant in the order is open.
- **Opening hours and meal times**: each restaurant has weekly hours (including split lunch/dinner hours and late nights) and an **Open · until 9:30 PM** or **Closed · opens 10:30 AM** badge. Breakfast, brunch, lunch-special, and dinner dishes show when they are served, and checkout warns if a pre-order isn't served at the chosen time.
- **Prep time for dine-in and pickup**: every dish page shows both (pickup adds packing time), plus extra minutes during the lunch and dinner rush. Restaurant cards show the walk-in wait.
- **Ordered today**: each dish shows about how many people ordered it at that restaurant today. The number grows through the day and includes your own orders.
- **Search as you type**: dish suggestions show the photo, price, restaurant, distance, rating, prep time, today's orders, and whether it's available now. Search forgives typos (`ramn`, `buritto`), works with or without Vietnamese accents (`phở`, `đồ uống`, `gà nướng`), and reads filters you type: `pho under $12`, `vegan open now`, `tacos within 1 mi`, `ready in 15 min`, `món chay dưới 10$`. Recent and popular searches show when the box is empty, and **Did you mean…** fixes misspellings.
- **Filters**: price range (presets or sliders), distance (0.5–5 mi), open now, ready in 15 minutes, 4.8+, vegetarian, spicy, new, and best sellers, plus sorting by nearest, price, fastest, or most ordered today.
- **Reviews and photos**: dish cards quote a review; **Fresh photos and reviews** shows the latest ones. Write your own review with stars and a photo (shrunk and saved on your device) from a dish page or **Your orders**.
- **Group check-in**: each dine-in order and reservation has a check-in code. Tap each friend as they arrive, add late joiners, and check in the group to get a table number. **Invite your group** shares a link (or QR code) that shows friends the time, place, and code.
- **Split the bill**: at checkout or later, split evenly or by item (tap who had what; shared items are split between the people selected). Tax, fees, and tip are shared in proportion, every share is rounded to the cent and adds up to the total, and you can mark who has paid. **Split a bill** also works for any receipt total. Friends see their share through the same link or QR code.
- **Your orders**: upcoming and past orders with status (scheduled, preparing, ready for pickup, checked in, seated), check-in codes, receipts, **Add to calendar** for reservations, cancel, reorder, and rate.
- **Cuisine bar**, **dish pages**, **restaurant pages** (menu by course, hours, meal times, and a **Book a table** button), **New on SmartFoodie**, and **World dishes to explore** work as before.

### How the total is calculated

| Line | Rule |
| --- | --- |
| Food subtotal | Menu price × quantity |
| Service fee | 5% of food subtotal, minimum $1, maximum $5 |
| Small order fee | $2 when the food subtotal is under $10 |
| Sales tax | State rate × food subtotal |
| Tip | 0/10/15/18/20% of food subtotal or a custom amount. Starts at 18% for dine-in and reservations and 0% for pickup |

A reservation without a pre-order costs nothing.

Sales tax uses each state's statewide base rate for prepared food (for example CA 7.25%, NY 4%, OR 0%; states with a separate restaurant meals tax use that rate). Local city and county taxes are not included, so a real receipt can be slightly higher. The state comes from the ZIP code (header **Set ZIP** button) or can be chosen by hand in your order or at checkout. Rates live in `pricing.js`; for a real business, use a tax service instead.

Checkout is a demo: no card details are collected, nothing is charged, and orders and reservations are not sent to restaurants. Order history, reviews, and photos are saved only in your browser.

### Demo data

Restaurant hours, distances (miles from you), prep times, walk-in waits, and "ordered today" numbers are sample values for the demo, computed from the visitor's local time. Hours, distances, and meal times live in `data.js`; the logic is in `schedule.js`.

## AI ordering assistant

Select **Ask AI** and type in English or Vietnamese, for example:

- `book a table for 4 at 7pm` / `đặt bàn 6 người lúc 7h tối` / `reserve nonnas tomorrow at 12:30 for 2` (opens the booking form filled in; you confirm)
- `add 2 pho and a banh mi for pickup` / `thêm 2 phở bò` / `ăn tại quán`
- `something spicy under $15`, `open now near me`
- `dinner for 3 under $50` (picks dishes from one restaurant so the total with tax and fees fits the budget)
- `check in`, `split the bill` / `chia tiền`, `my orders`
- `what's my total with tax?`, `remove the pho`, `checkout`

Asking for delivery gets a polite reminder that SmartFoodie has dine-in, reservations, and pickup.

It works in two modes:

1. **On-device assistant** (default, also on GitHub Pages): runs in the browser with no account or key.
2. **Claude** (when you run `serve.py` with an API key): understands free-form requests and uses the same tools. The assistant can add or remove items, switch between dine-in, reservation, and pickup, open the booking form for a restaurant, party size, date, and time, open check-in, the bill splitter, or your orders, and open checkout, but only you can place an order or book a table.

To turn on Claude:

```bash
pip install -r requirements.txt
export ANTHROPIC_API_KEY=your-key-here
python3 serve.py
```

The terminal shows `AI assistant: Claude (claude-opus-5-5) is on.` and the assistant header shows **Powered by Claude**. If Claude is unreachable, the on-device assistant answers instead. Each device on your network is limited to 20 assistant requests per minute so others on the same Wi-Fi can't run up your API bill. Set `SMARTFOODIE_AI=off` to keep the server from calling Claude.

## Restaurants near you (map)

Enter a US ZIP code, a city, or an address, or select **Use my location**. Choose a radius (0.5–5 mi), filter by type, name, **Takes reservations**, **Takeout**, or **Hours listed**, and select a place to see it on the map with directions. Opening hours show in the list when OpenStreetMap has them.

Search speed:

- **Quick results first**: the closest places (from [Photon](https://photon.komoot.io/)) usually appear in under a second.
- **Full details next**: the complete list with cuisine and opening hours comes from the [Overpass API](https://overpass-api.de/). Several Overpass servers are tried in a staggered race and the first answer wins, so one slow server can't stall the search. The fastest server is remembered for next time.
- **Instant repeats**: results are cached on the device for 30 minutes. Searching the same area again or choosing a smaller radius doesn't wait for the network. ZIP and city lookups are cached too.

Other free services used: [Leaflet](https://leafletjs.com/) with OpenStreetMap tiles, [Zippopotam.us](https://zippopotam.us/) for ZIP codes, and [Nominatim](https://nominatim.org/) for cities and addresses. Listings come from OpenStreetMap contributors and may be incomplete. **Use my location** needs `localhost` or `https://` (it does not work on the `http://192.168…` Wi-Fi address); search by ZIP there instead.

## Publish a public link with GitHub Pages

### Option A: upload in the browser (no command line)

1. Go to [github.com/new](https://github.com/new), name the repository `SmartFoodie`, choose **Public**, and select **Create repository**.
2. On the new repository page, select **uploading an existing file**. In Finder, open the SmartFoodie folder, press **⌘A** to select every file, and drag them onto the upload area. Select **Commit changes**.
3. Open **Settings → Pages**. Under **Build and deployment**, set **Source** to **Deploy from a branch**, choose **main** and **/ (root)**, and select **Save**.
4. After about a minute, refresh the Pages settings. The link appears at the top: `https://YOUR-USERNAME.github.io/SmartFoodie/`.

To update the site later, upload the changed files the same way; the link updates within a minute.

### Option B: git push with GitHub Actions

The included `.github/workflows/deploy.yml` publishes the website when files are pushed to `main` or `master`.

1. Create a GitHub repository for SmartFoodie and push this folder, including the hidden `.github` folder.
2. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Wait for the **Deploy SmartFoodie to GitHub Pages** workflow to finish.

GitHub Pages hosts static files only, so the public site uses the on-device AI assistant. Never put an API key in the website files.

## Project files

| File | Purpose |
| --- | --- |
| `index.html`, `style.css` | Page layout and design |
| `menu-data.js` | The 10 added items per restaurant (drinks, appetizers, mains, best sellers) and their photo sources |
| `data.js` | The three ways to eat (`SF.MODES`, where labels such as "Reservation" can be renamed), cuisines, restaurants with hours and distance, meal times, dishes, photos, ratings, and reviews |
| `images/dishes/` | Dish photos from Wikimedia Commons, resized to 400px and 800px WebP |
| `pricing.js` | Fees, state sales tax, tip, and totals (integer cents) |
| `schedule.js` | Opening hours, meal times, prep times, table and pickup times, and "ordered today" numbers |
| `search.js` | Typo-tolerant search with Vietnamese support and filters typed into the box |
| `split.js` | Bill splitting math and the group link format |
| `assistant.js` | On-device AI assistant (English and Vietnamese) |
| `ui.js` | Shared page helpers (photos, dialogs, toast, QR codes, sharing) |
| `app.js` | Browsing, filters, search box, your order, checkout for dine-in, reservations, and pickup, and the assistant chat |
| `orders.js` | Order history, order status, group check-in, bill splitting, reviews with photos, and group links |
| `healthy-foods.js` | "World dishes to explore" section |
| `nearby.js` | Map search for real nearby restaurants |
| `serve.py` | Local server and the optional Claude assistant endpoint |
| `sw.js`, `manifest.webmanifest` | Install-to-home-screen support and offline fallback |

Restaurant names, menus, prices, ratings, and reviews are sample data for the demo.

Dish photos come from [Unsplash](https://unsplash.com/), [TheMealDB](https://www.themealdb.com/), [TheCocktailDB](https://www.thecocktaildb.com/), and [Wikimedia Commons](https://commons.wikimedia.org/). Commons photos are used under their Creative Commons or public-domain licenses; each dish page shows the photographer and license and links to the original file. The author, license, and file path for every Commons photo are listed in `SF.MENU_PHOTOS` in `menu-data.js`.
