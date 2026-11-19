// Nearby restaurants: search by ZIP code / city or the browser's current location, then list
// real places from OpenStreetMap on a Leaflet map. No API key required.
//
// Speed:
// - Two sources run in parallel: Photon (komoot) returns the closest ~50 places in about a
//   second and is shown first; Overpass returns the complete list with cuisine, hours, and phone
//   and replaces it when ready. If every Overpass server is busy, the quick results stay.
// - Overpass servers are queried with a staggered race: the next server starts after a short
//   delay (or right away if one fails) and the first good answer wins, so one slow or hanging
//   server no longer blocks the search for 30 seconds.
// - The fastest server is remembered and tried first next time.
// - Results are cached per area for 30 minutes; a repeat search or a smaller radius is instant.
// - ZIP/city lookups are cached, and "Use my location" looks up the place name in parallel.
(() => {
  const section = document.querySelector('#nearby');
  if (!section) return;

  const form = section.querySelector('#nearbyForm');
  const input = section.querySelector('#nearbyQuery');
  const radiusSelect = section.querySelector('#nearbyRadius');
  const locateButton = section.querySelector('#nearbyLocate');
  const statusEl = section.querySelector('#nearbyStatus');
  const listEl = section.querySelector('#nearbyList');
  const countEl = section.querySelector('#nearbyCount');
  const filterGroup = section.querySelector('#nearbyFilters');
  const featureGroup = section.querySelector('#nearbyFeatures');
  const filterText = section.querySelector('#nearbyFilterText');
  const mapEl = section.querySelector('#nearbyMap');

  const METERS_PER_MILE = 1609.344;
  const MAX_RESULTS = 60;
  const OVERPASS_LIMIT = 1000;
  const HEDGE_DELAY_MS = 2500;       // start the next server if the current one hasn't answered
  const REQUEST_TIMEOUT_MS = 15000;  // give up on a single server after this long
  const CACHE_TTL_MS = 30 * 60 * 1000;
  const STORAGE_KEY = 'smartfoodie-nearby';
  const CACHE_KEY = 'smartfoodie-nearby-cache';
  const GEOCODE_KEY = 'smartfoodie-geocode-cache';
  const ENDPOINT_KEY = 'smartfoodie-overpass-fastest';
  const DEFAULT_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];
  const PHOTON_URL = 'https://photon.komoot.io/reverse';
  const QUICK_TIMEOUT_MS = 8000;
  const TYPE_LABELS = { restaurant: 'Restaurant', fast_food: 'Fast food', cafe: 'Café', food_court: 'Food court' };

  let map = null;
  let markerLayer = null;
  let centerLayer = null;
  let places = [];
  let activeFilter = 'all';
  const activeFeatures = new Set(); // 'reservations', 'takeout', 'hours'
  let activeController = null;
  let lastCenter = null;
  const markersById = new Map();

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const titleCase = value => value.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
  const normalize = value => String(value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const setStatus = (message, tone = 'info') => {
    statusEl.textContent = message;
    statusEl.dataset.tone = tone;
  };

  const readJson = key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
  const writeJson = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or unavailable */ } };

  function orderedEndpoints() {
    const fastest = readJson(ENDPOINT_KEY);
    return fastest && DEFAULT_ENDPOINTS.includes(fastest) ? [fastest, ...DEFAULT_ENDPOINTS.filter(url => url !== fastest)] : DEFAULT_ENDPOINTS;
  }

  function distanceMeters(a, b) {
    const toRad = deg => deg * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.sqrt(h));
  }

  const formatDistance = meters => {
    const miles = meters / METERS_PER_MILE;
    return miles < 0.1 ? `${Math.round(meters * 3.281)} ft` : `${miles.toFixed(miles < 10 ? 1 : 0)} mi`;
  };

  function initMap() {
    if (map) return true;
    if (!window.L) {
      mapEl.innerHTML = '<p class="nearby-map-fallback">The map could not load. Results still appear in the list.</p>';
      return false;
    }
    map = L.map(mapEl, { scrollWheelZoom: false, zoomControl: true, preferCanvas: true }).setView([39.5, -98.35], 4);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
    }).addTo(map);
    markerLayer = L.layerGroup().addTo(map);
    centerLayer = L.layerGroup().addTo(map);
    // Enable wheel zoom only after the person interacts with the map, so page scrolling isn't hijacked.
    map.once('click focus', () => map.scrollWheelZoom.enable());
    return true;
  }

  async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    return response.json();
  }

  // ----- Geocoding (cached) -----
  async function geocode(query, signal) {
    const trimmed = query.trim();
    const cacheKey = trimmed.toLowerCase();
    const cache = readJson(GEOCODE_KEY) || {};
    if (cache[cacheKey]) return cache[cacheKey];
    let result = null;
    const usZip = trimmed.match(/^(\d{5})(?:-\d{4})?$/);
    if (usZip) {
      try {
        const data = await fetchJson(`https://api.zippopotam.us/us/${usZip[1]}`, { signal });
        const place = data.places?.[0];
        if (place) result = { lat: Number(place.latitude), lon: Number(place.longitude), label: `${place['place name']}, ${place['state abbreviation']} ${usZip[1]}` };
      } catch (error) {
        if (error.name === 'AbortError') throw error;
      }
    }
    if (!result) {
      const params = new URLSearchParams({ format: 'jsonv2', limit: '1', addressdetails: '0' });
      if (/^\d{4,6}$/.test(trimmed) && !usZip) params.set('postalcode', trimmed);
      else params.set('q', trimmed);
      const results = await fetchJson(`https://nominatim.openstreetmap.org/search?${params}`, { signal, headers: { 'Accept-Language': navigator.language || 'en' } });
      if (!results.length) return null;
      const [first] = results;
      result = { lat: Number(first.lat), lon: Number(first.lon), label: first.display_name.split(',').slice(0, 3).join(',') };
    }
    const keys = Object.keys(cache);
    if (keys.length > 40) delete cache[keys[0]];
    cache[cacheKey] = result;
    writeJson(GEOCODE_KEY, cache);
    return result;
  }

  async function reverseLabel(lat, lon, signal) {
    try {
      const data = await fetchJson(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&lat=${lat}&lon=${lon}`, { signal });
      const address = data.address || {};
      const area = address.neighbourhood || address.suburb || address.city_district || address.city || address.town || address.village;
      return area ? `${area}${address.postcode ? ` ${address.postcode}` : ''}` : 'your location';
    } catch {
      return 'your location';
    }
  }

  // ----- Overpass: staggered race across servers -----
  function raceEndpoints(endpoints, request, outerSignal) {
    return new Promise((resolve, reject) => {
      const controllers = [];
      let launched = 0;
      let failures = 0;
      let settled = false;
      let hedgeTimer = null;
      let lastError = null;

      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(hedgeTimer);
        controllers.forEach(controller => controller.abort());
        outerSignal?.removeEventListener('abort', onAbort);
        callback(value);
      };
      const onAbort = () => finish(reject, new DOMException('Search cancelled', 'AbortError'));
      if (outerSignal?.aborted) { onAbort(); return; }
      outerSignal?.addEventListener('abort', onAbort, { once: true });

      const launch = () => {
        if (settled || launched >= endpoints.length) return;
        const endpoint = endpoints[launched];
        launched += 1;
        const controller = new AbortController();
        controllers.push(controller);
        let timedOut = false;
        const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, REQUEST_TIMEOUT_MS);
        clearTimeout(hedgeTimer);
        hedgeTimer = setTimeout(launch, HEDGE_DELAY_MS);
        request(endpoint, controller.signal)
          .then(value => { writeJson(ENDPOINT_KEY, endpoint); finish(resolve, value); })
          .catch(error => {
            if (settled) return;
            failures += 1;
            // Only a cancelled search should surface as AbortError; a slow server is a normal failure.
            lastError = timedOut ? new Error(`${endpoint} timed out`) : error.name === 'AbortError' ? new Error(`${endpoint} aborted`) : error;
            if (failures >= endpoints.length) finish(reject, lastError);
            else if (launched === failures) launch(); // nothing else in flight: try the next server now
          })
          .finally(() => clearTimeout(timeout));
      };
      launch();
    });
  }

  async function fetchPlaces(center, radiusMeters, signal) {
    const query = `[out:json][timeout:20];nwr["amenity"~"^(restaurant|fast_food|cafe|food_court)$"]["name"](around:${Math.round(radiusMeters)},${center.lat},${center.lon});out tags center qt ${OVERPASS_LIMIT};`;
    const data = await raceEndpoints(orderedEndpoints(), async (endpoint, requestSignal) => {
      const result = await fetchJson(endpoint, { method: 'POST', body: new URLSearchParams({ data: query }), signal: requestSignal });
      // Overpass can answer 200 with a runtime error and no data; treat that as a failure.
      if (!Array.isArray(result.elements) || (!result.elements.length && /error|timed out/i.test(result.remark || ''))) throw new Error(result.remark || 'Overpass error');
      return result;
    }, signal);
    return data.elements.map(element => {
      const lat = element.lat ?? element.center?.lat;
      const lon = element.lon ?? element.center?.lon;
      if (lat == null || lon == null) return null;
      const tags = element.tags || {};
      const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
      return {
        id: `${element.type}/${element.id}`,
        name: tags.name,
        type: tags.amenity,
        cuisine: tags.cuisine ? tags.cuisine.split(';').slice(0, 2).map(titleCase).join(', ') : '',
        address: [street, tags['addr:city']].filter(Boolean).join(', '),
        hours: tags.opening_hours || '',
        phone: tags.phone || tags['contact:phone'] || '',
        website: tags.website || tags['contact:website'] || '',
        takeaway: tags.takeaway === 'yes' || tags.takeaway === 'only',
        reservations: ['yes', 'required', 'recommended'].includes(tags.reservation),
        outdoor: tags.outdoor_seating === 'yes',
        lat,
        lon,
        distance: distanceMeters(center, { lat, lon })
      };
    }).filter(Boolean).sort((a, b) => a.distance - b.distance);
  }

  // Quick results: the closest places from Photon, typically in under a second.
  async function fetchQuickPlaces(center, radiusMeters, signal) {
    const params = new URLSearchParams({ lat: center.lat, lon: center.lon, radius: (radiusMeters / 1000).toFixed(2), limit: '100' });
    ['restaurant', 'fast_food', 'cafe', 'food_court'].forEach(type => params.append('osm_tag', `amenity:${type}`));
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), QUICK_TIMEOUT_MS);
    try {
      const data = await fetchJson(`${PHOTON_URL}?${params}`, { signal: controller.signal });
      const osmType = { N: 'node', W: 'way', R: 'relation' };
      return (data.features || []).map(feature => {
        const props = feature.properties || {};
        const [lon, lat] = feature.geometry?.coordinates || [];
        if (!props.name || lat == null || lon == null || !TYPE_LABELS[props.osm_value]) return null;
        const street = [props.housenumber, props.street].filter(Boolean).join(' ');
        return {
          id: `${osmType[props.osm_type] || 'node'}/${props.osm_id}`,
          name: props.name,
          type: props.osm_value,
          cuisine: '', hours: '', phone: '', website: '', takeaway: false, reservations: false, outdoor: false,
          address: [street, props.city].filter(Boolean).join(', '),
          lat, lon,
          distance: distanceMeters(center, { lat, lon })
        };
      }).filter(place => place && place.distance <= radiusMeters).sort((a, b) => a.distance - b.distance);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  // ----- Result cache: reuse a recent, equal-or-larger search around the same spot -----
  const cacheKeyFor = center => `${center.lat.toFixed(3)},${center.lon.toFixed(3)}`;
  function readCache(center, radiusMeters) {
    const entry = (readJson(CACHE_KEY) || {})[cacheKeyFor(center)];
    if (!entry || Date.now() - entry.time > CACHE_TTL_MS || entry.radius < radiusMeters - 1) return null;
    return {
      places: entry.places.filter(place => place.distance <= radiusMeters),
      truncated: entry.truncated && entry.radius > radiusMeters,
      partial: Boolean(entry.partial)
    };
  }
  function writeCache(center, radiusMeters, list, partial = false) {
    const cache = readJson(CACHE_KEY) || {};
    cache[cacheKeyFor(center)] = { time: Date.now(), radius: radiusMeters, truncated: list.length >= OVERPASS_LIMIT, partial, places: list };
    const keys = Object.keys(cache).sort((a, b) => cache[b].time - cache[a].time);
    keys.slice(3).forEach(key => delete cache[key]); // keep the 3 most recent areas
    writeJson(CACHE_KEY, cache);
  }

  const directionsUrl = place => `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lon}`;
  const safeWebsite = url => (/^https?:\/\//i.test(url) ? url : '');

  function popupHtml(place) {
    const website = safeWebsite(place.website);
    return `<div class="nearby-popup">
      <strong>${escapeHtml(place.name)}</strong>
      <span>${escapeHtml(TYPE_LABELS[place.type] || 'Restaurant')}${place.cuisine ? ` · ${escapeHtml(place.cuisine)}` : ''} · ${formatDistance(place.distance)}</span>
      ${place.reservations ? '<small>Takes reservations</small>' : ''}
      ${place.address ? `<small>${escapeHtml(place.address)}</small>` : ''}
      ${place.hours ? `<small>◷ ${escapeHtml(place.hours)}</small>` : ''}
      ${place.phone ? `<small>☎ <a href="tel:${escapeHtml(place.phone.replace(/[^\d+]/g, ''))}">${escapeHtml(place.phone)}</a></small>` : ''}
      <div class="nearby-popup-links"><a href="${directionsUrl(place)}" target="_blank" rel="noreferrer">Directions ↗</a>${website ? `<a href="${escapeHtml(website)}" target="_blank" rel="noreferrer">Website ↗</a>` : ''}</div>
    </div>`;
  }

  const FEATURE_TESTS = { reservations: place => place.reservations, takeout: place => place.takeaway, hours: place => Boolean(place.hours) };
  function matchingPlaces() {
    const text = normalize(filterText?.value.trim());
    return places.filter(place => (activeFilter === 'all' || place.type === activeFilter)
      && [...activeFeatures].every(feature => FEATURE_TESTS[feature](place))
      && (!text || normalize(`${place.name} ${place.cuisine} ${place.address}`).includes(text)));
  }

  function highlight(id, { pan = false } = {}) {
    listEl.querySelectorAll('.nearby-item.is-active').forEach(item => item.classList.remove('is-active'));
    const item = listEl.querySelector(`[data-place-id="${CSS.escape(id)}"]`);
    item?.classList.add('is-active');
    const marker = markersById.get(id);
    if (!marker || !map) return item;
    if (pan) map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 16), { duration: 0.6 });
    marker.openPopup();
    return item;
  }

  function showSkeleton() {
    listEl.innerHTML = Array.from({ length: 6 }, () => '<li class="nearby-skeleton" aria-hidden="true"><span></span><span></span></li>').join('');
  }

  function render() {
    const matches = matchingPlaces();
    const shown = matches.slice(0, MAX_RESULTS);
    markersById.clear();
    markerLayer?.clearLayers();

    const counts = places.reduce((acc, place) => { acc[place.type] = (acc[place.type] || 0) + 1; return acc; }, {});
    filterGroup.querySelectorAll('button').forEach(button => {
      const value = button.dataset.type;
      button.setAttribute('aria-pressed', String(value === activeFilter));
      button.querySelector('span').textContent = value === 'all' ? places.length : (counts[value] || 0);
    });
    countEl.textContent = `${matches.length} ${matches.length === 1 ? 'place' : 'places'}`;

    if (!shown.length) {
      const featureNote = activeFeatures.size ? ' Reservations, takeout, and hours only show when OpenStreetMap lists them.' : '';
      listEl.innerHTML = `<li class="nearby-empty"><strong>${places.length ? 'No places match this filter' : 'No restaurants found here'}</strong><p>Try a larger radius, another category, or a different ZIP code.${featureNote}</p></li>`;
      return;
    }

    listEl.innerHTML = shown.map((place, index) => `
      <li class="nearby-item" data-place-id="${escapeHtml(place.id)}">
        <button type="button" class="nearby-item-main">
          <span class="nearby-pin-number">${index + 1}</span>
          <span class="nearby-item-text">
            <strong>${escapeHtml(place.name)}</strong>
            <small>${escapeHtml(TYPE_LABELS[place.type] || 'Restaurant')}${place.cuisine ? ` · ${escapeHtml(place.cuisine)}` : ''}</small>
            ${place.address ? `<small>${escapeHtml(place.address)}</small>` : ''}
            ${place.hours ? `<small class="nearby-hours">◷ ${escapeHtml(place.hours)}</small>` : ''}
          </span>
          <span class="nearby-distance">${formatDistance(place.distance)}</span>
        </button>
        <div class="nearby-item-tags">${place.reservations ? '<span class="tag-reserve">Takes reservations</span>' : ''}${place.takeaway ? '<span>Takeout</span>' : ''}${place.outdoor ? '<span>Outdoor seating</span>' : ''}<a href="${directionsUrl(place)}" target="_blank" rel="noreferrer">Directions ↗</a></div>
      </li>`).join('');

    if (!map) return;
    shown.forEach((place, index) => {
      const icon = L.divIcon({ className: `nearby-marker nearby-marker-${place.type}`, html: `<span>${index + 1}</span>`, iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -12] });
      const marker = L.marker([place.lat, place.lon], { icon, title: place.name, riseOnHover: true }).bindPopup(popupHtml(place), { maxWidth: 260 });
      marker.on('click', () => {
        const item = highlight(place.id);
        item?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
      marker.addTo(markerLayer);
      markersById.set(place.id, marker);
    });
  }

  function drawCenter(center, radiusMeters) {
    if (!map) return;
    centerLayer.clearLayers();
    const circle = L.circle([center.lat, center.lon], { radius: radiusMeters, color: '#141414', weight: 1.5, fillColor: '#141414', fillOpacity: 0.04, dashArray: '5 6' }).addTo(centerLayer);
    L.marker([center.lat, center.lon], { icon: L.divIcon({ className: 'nearby-you', html: '<span></span>', iconSize: [18, 18], iconAnchor: [9, 9] }), keyboard: false, interactive: false, zIndexOffset: 1000 }).addTo(centerLayer);
    map.fitBounds(circle.getBounds(), { padding: [16, 16] });
  }

  const radiusLabel = () => radiusSelect.selectedOptions[0].textContent;
  function summarize(label, { cached = false, truncated = false, seconds = null } = {}) {
    const matches = matchingPlaces().length;
    if (!places.length) { setStatus(`No restaurants found within ${radiusLabel()} of ${label}.`, 'info'); return; }
    const timing = cached ? ' · loaded instantly from recent search' : seconds != null ? ` · found in ${seconds.toFixed(1)}s` : '';
    setStatus(`${places.length} places within ${radiusLabel()} of ${label}${matches > MAX_RESULTS ? ` · showing the closest ${MAX_RESULTS}` : ''}${timing}.${truncated ? ' Busy area: choose a smaller radius for the most complete results.' : ''}`, 'success');
  }

  async function searchAround(center, label, { labelPromise = null } = {}) {
    activeController?.abort();
    const controller = new AbortController();
    activeController = controller;
    const radiusMeters = Number(radiusSelect.value) * METERS_PER_MILE;
    lastCenter = { ...center, label };
    initMap();
    drawCenter(center, radiusMeters);
    labelPromise?.then(name => {
      if (controller !== activeController) return;
      lastCenter.label = name;
      save({ center: lastCenter, radius: radiusSelect.value, query: input.value.trim() });
      if (!section.classList.contains('is-loading') && places.length) summarize(name);
    });

    const isCurrent = () => controller === activeController;
    const remember = () => save({ center: lastCenter, radius: radiusSelect.value, query: input.value.trim() });
    const cached = readCache(center, radiusMeters);
    if (cached) {
      places = cached.places;
      render();
      summarize(lastCenter.label, { cached: true, truncated: cached.truncated });
      remember();
      if (!cached.partial) { section.classList.remove('is-loading'); return; }
      // Cached quick results are shown instantly; keep trying for the full list in the background.
      setStatus(`Showing ${places.length} nearby places instantly from your recent search · loading full details…`, 'loading');
    } else {
      setStatus(`Finding restaurants near ${label}…`, 'loading');
      showSkeleton();
    }
    section.classList.add('is-loading');
    const started = performance.now();
    let fullDone = false;
    const quick = cached ? Promise.resolve(null) : fetchQuickPlaces(center, radiusMeters, controller.signal).then(list => {
      if (isCurrent() && !fullDone && list.length) {
        places = list;
        render();
        setStatus(`Showing the ${list.length} closest places in ${((performance.now() - started) / 1000).toFixed(1)}s · loading the full list…`, 'loading');
      }
      return list;
    }).catch(() => null);

    try {
      const found = await fetchPlaces(center, radiusMeters, controller.signal);
      fullDone = true;
      if (!isCurrent()) return;
      places = found;
      writeCache(center, radiusMeters, found);
      render();
      summarize(lastCenter.label, { truncated: found.length >= OVERPASS_LIMIT, seconds: (performance.now() - started) / 1000 });
      remember();
    } catch (error) {
      fullDone = true;
      if (error.name === 'AbortError' || !isCurrent()) return;
      const quickList = await quick;
      if (!isCurrent()) return;
      if (quickList && quickList.length) {
        places = quickList;
        writeCache(center, radiusMeters, quickList, true);
        render();
        setStatus(`${quickList.length} closest places within ${radiusLabel()} of ${lastCenter.label}. Cuisine and hours are unavailable because the detailed map service is busy right now.`, 'success');
        remember();
      } else if (cached) {
        summarize(lastCenter.label, { cached: true });
      } else {
        places = [];
        render();
        setStatus('The restaurant map services are busy right now. Please try again in a moment.', 'error');
      }
    } finally {
      if (isCurrent()) section.classList.remove('is-loading');
    }
  }

  const save = data => writeJson(STORAGE_KEY, data);

  async function searchQuery(query) {
    activeController?.abort();
    const controller = new AbortController();
    activeController = controller;
    section.classList.add('is-loading');
    setStatus(`Looking up “${query}”…`, 'loading');
    try {
      const place = await geocode(query, controller.signal);
      if (controller !== activeController) return;
      if (!place) {
        section.classList.remove('is-loading');
        setStatus(`We couldn't find “${query}”. Check the ZIP code or try a city name.`, 'error');
        return;
      }
      await searchAround({ lat: place.lat, lon: place.lon }, place.label);
    } catch (error) {
      if (error.name === 'AbortError') return;
      section.classList.remove('is-loading');
      setStatus('Location lookup failed. Check your connection and try again.', 'error');
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const query = input.value.trim();
    if (!query) {
      setStatus('Enter a ZIP code, city, or address to search.', 'error');
      input.focus();
      return;
    }
    searchQuery(query);
  });

  // The ZIP dialog in the header can start a nearby search too.
  window.addEventListener('sf:nearby-search', event => {
    input.value = event.detail.query;
    searchQuery(event.detail.query);
  });

  locateButton.addEventListener('click', () => {
    if (!('geolocation' in navigator)) {
      setStatus('Your browser does not support location access. Enter a ZIP code instead.', 'error');
      return;
    }
    if (!window.isSecureContext) {
      setStatus('Location access needs a secure (https or localhost) address. Enter a ZIP code instead.', 'error');
      return;
    }
    section.classList.add('is-loading');
    setStatus('Asking your browser for your location…', 'loading');
    navigator.geolocation.getCurrentPosition(position => {
      const center = { lat: position.coords.latitude, lon: position.coords.longitude };
      input.value = '';
      // Start the restaurant search right away; the neighborhood name fills in when ready.
      searchAround(center, 'your location', { labelPromise: reverseLabel(center.lat, center.lon) });
    }, error => {
      section.classList.remove('is-loading');
      const messages = {
        1: 'Location permission was denied. Allow location access in your browser, or enter a ZIP code.',
        2: 'Your location is unavailable right now. Enter a ZIP code instead.',
        3: 'Finding your location took too long. Try again or enter a ZIP code.'
      };
      setStatus(messages[error.code] || 'We could not get your location. Enter a ZIP code instead.', 'error');
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
  });

  radiusSelect.addEventListener('change', () => {
    if (lastCenter) searchAround(lastCenter, lastCenter.label);
  });

  filterGroup.addEventListener('click', event => {
    const button = event.target.closest('button[data-type]');
    if (!button) return;
    activeFilter = button.dataset.type;
    render();
  });
  featureGroup?.addEventListener('click', event => {
    const button = event.target.closest('button[data-feature]');
    if (!button) return;
    const feature = button.dataset.feature;
    if (activeFeatures.has(feature)) activeFeatures.delete(feature); else activeFeatures.add(feature);
    button.setAttribute('aria-pressed', String(activeFeatures.has(feature)));
    render();
    if (places.length && lastCenter) summarize(lastCenter.label);
  });
  filterText?.addEventListener('input', () => {
    render();
    if (places.length && lastCenter) summarize(lastCenter.label);
  });

  listEl.addEventListener('click', event => {
    const button = event.target.closest('.nearby-item-main');
    if (!button) return;
    highlight(button.closest('.nearby-item').dataset.placeId, { pan: true });
    if (window.matchMedia('(max-width: 900px)').matches) mapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  // Create the map when the section comes into view, and restore the last search.
  const start = () => {
    initMap();
    const saved = readJson(STORAGE_KEY);
    if (saved?.center && Number.isFinite(saved.center.lat)) {
      if (saved.radius && [...radiusSelect.options].some(option => option.value === saved.radius)) radiusSelect.value = saved.radius;
      if (saved.query) input.value = saved.query;
      searchAround(saved.center, saved.center.label || 'your last search');
    }
  };
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      start();
    }, { rootMargin: '400px 0px' });
    observer.observe(section);
  } else {
    start();
  }
})();
