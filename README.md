# SmartFoodie

A responsive food ordering website: browse 14 restaurants and 48 dishes, filter by cuisine, order with tax calculated, find real restaurants near you, and let an AI assistant build your order.

## Preview on this computer or phone

Run from this folder:

```bash
python3 serve.py
```

Open the `localhost` address printed in the terminal on this computer. The server also prints a Wi-Fi address for phones on the same network. Open that Wi-Fi address on this computer, select the **share** (QR) button, then scan the code with your phone. If port 8000 is busy, the server tries the next 19 ports. You can choose a starting port with `python3 serve.py --port 8100`.

## What's on the site

- **Cuisine bar**: All, Asian, American, Mexican, Italian, Japanese, Chinese, Korean, Thai, Vietnamese, Indian, Mediterranean, Middle Eastern, and Healthy. Combine it with filters (4.8+ rating, under $15, 15 minutes or less, vegetarian, spicy, new) and sorting.
- **Instant search**: suggestions for dishes, restaurants, and cuisines as you type, with or without Vietnamese accents (`pho` and `phở` both work). Press `/` to jump to the search box.
- **Dish pages**: large photo, ingredients, rating breakdown, customer reviews, special instructions, and quantity.
- **Restaurant pages**: full menu with photos, delivery fee, time estimate, and reviews.
- **20 new dishes** marked **New**, each with a photo, rating, and three reviews.
- **Ordering**: cart grouped by restaurant, delivery or pickup, budget meter, checkout with tip, and an order confirmation with live (demo) tracking. Orders are saved on the device for **Reorder**.

### How the total is calculated

| Line | Rule |
| --- | --- |
| Food subtotal | Menu price × quantity |
| Delivery fee | Each restaurant's fee, delivery only |
| Service fee | 5% of food subtotal, minimum $1, maximum $5 |
| Small order fee | $2 when the food subtotal is under $10 |
| Sales tax | State rate × food subtotal |
| Driver tip | 0/10/15/18/20% of food subtotal or a custom amount, delivery only |

Sales tax uses each state's statewide base rate for prepared food (for example CA 7.25%, NY 4%, OR 0%; states with a separate restaurant meals tax use that rate). Local city and county taxes are not included, so a real receipt can be slightly higher. The state comes from the ZIP code (header **Set ZIP** button or checkout) or can be chosen by hand. Rates live in `pricing.js`; for a real business, use a tax service instead.

Checkout is a demo: no card details are collected, nothing is charged, and orders are not sent to restaurants.

## AI ordering assistant

Select **Ask AI** and type in English or Vietnamese, for example:

- `add 2 pho and a banh mi for pickup` / `thêm 2 phở bò`
- `something spicy under $15`
- `dinner for 3 under $50` (picks dishes from one restaurant so the total with tax and fees fits the budget)
- `what's my total with tax?`, `remove the pho`, `checkout`

It works in two modes:

1. **On-device assistant** (default, also on GitHub Pages): runs in the browser with no account or key.
2. **Claude** (when you run `serve.py` with an API key): understands free-form requests and uses the same cart tools. The assistant can add or remove items, switch delivery or pickup, and open checkout, but only you can place the order.

To turn on Claude:

```bash
pip install -r requirements.txt
export ANTHROPIC_API_KEY=your-key-here
python3 serve.py
```

The terminal shows `AI assistant: Claude (claude-opus-5-5) is on.` and the assistant header shows **Powered by Claude**. If Claude is unreachable, the on-device assistant answers instead. Each device on your network is limited to 20 assistant requests per minute so others on the same Wi-Fi can't run up your API bill. Set `SMARTFOODIE_AI=off` to keep the server from calling Claude.

## Restaurants near you (map)

Enter a US ZIP code, a city, or an address, or select **Use my location**. Choose a radius (0.5–5 mi), filter by type or name, and select a place to see it on the map with directions.

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
| `data.js` | Cuisines, restaurants, dishes, photos, ratings, and reviews |
| `pricing.js` | Fees, state sales tax, tip, and totals (integer cents) |
| `assistant.js` | On-device AI assistant (English and Vietnamese) |
| `app.js` | Browsing, search, cart, checkout, and the assistant chat |
| `healthy-foods.js` | "World dishes to explore" section |
| `nearby.js` | Map search for real nearby restaurants |
| `serve.py` | Local server and the optional Claude assistant endpoint |
| `sw.js`, `manifest.webmanifest` | Install-to-home-screen support and offline fallback |

Restaurant names, menus, prices, ratings, and reviews are sample data for the demo. Dish photos are from Unsplash.
