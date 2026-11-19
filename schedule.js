// Opening hours, meal times, prep times for dine-in and pickup, reservation and pickup times,
// distances, and "ordered today" counts. Pure functions with no page access, so they also run in Node.
// All times are the visitor's local time.
(function (root) {
  const SF = root.SF || (root.SF = {});

  const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const DAY = 1440; // minutes
  const MINUTE = 60000; // ms
  const PACKING_MINUTES = 2; // boxing up a pickup order

  const toMinutes = text => {
    const [hours, minutes = '0'] = String(text).split(':');
    return Number(hours) * 60 + Number(minutes);
  };

  // '11:30-14:30,17:00-22:00' -> [[690, 870], [1020, 1320]]. A closing time at or before the
  // opening time runs past midnight ('10:00-01:00' -> [600, 1500]).
  function parseIntervals(spec) {
    if (!spec || spec === 'closed') return [];
    return String(spec).split(',').map(part => {
      const [open, close] = part.split('-').map(toMinutes);
      return [open, close <= open ? close + DAY : close];
    }).sort((a, b) => a[0] - b[0]);
  }

  const weeks = new WeakMap();
  function week(restaurant) {
    if (!weeks.has(restaurant)) {
      const hours = restaurant.hours || {};
      weeks.set(restaurant, DAY_KEYS.map(key => parseIntervals(hours[key] ?? hours.all)));
    }
    return weeks.get(restaurant);
  }

  const startOfDay = date => { const day = new Date(date); day.setHours(0, 0, 0, 0); return day; };
  const addDays = (date, days) => { const day = new Date(date); day.setDate(day.getDate() + days); return day; };
  const minutesOf = date => date.getHours() * 60 + date.getMinutes();
  const at = (day, minutes) => { const date = startOfDay(day); date.setMinutes(minutes); return date; };
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const dayKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const fromDayKey = key => { const [y, m, d] = String(key).split('-').map(Number); return new Date(y, m - 1, d); };

  // ---------- Formatting ----------
  const formatTime = date => date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/\s/g, ' ');
  // 7:00 -> "7", 11:30 -> "11:30"; used for compact ranges such as "7–11:30 AM".
  const clock = minutes => {
    const m = ((minutes % DAY) + DAY) % DAY;
    const hour = Math.floor(m / 60) % 12 || 12;
    return m % 60 ? `${hour}:${String(m % 60).padStart(2, '0')}` : String(hour);
  };
  const meridiem = minutes => ((((minutes % DAY) + DAY) % DAY) < 720 ? 'AM' : 'PM');
  const compactRange = (from, to) => (meridiem(from) === meridiem(to)
    ? `${clock(from)}–${clock(to)} ${meridiem(to)}`
    : `${clock(from)} ${meridiem(from)}–${clock(to)} ${meridiem(to)}`);
  function formatDay(date, now = new Date()) {
    if (sameDay(date, now)) return 'Today';
    if (sameDay(date, addDays(now, 1))) return 'Tomorrow';
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
  const formatDayTime = (date, now = new Date()) => `${formatDay(date, now)} ${formatTime(date)}`;
  // "10:30 AM", "tomorrow 10:30 AM", or "Tue 11:00 AM" for the next opening.
  function relativeDayTime(date, now = new Date()) {
    if (sameDay(date, now)) return formatTime(date);
    if (sameDay(date, addDays(now, 1))) return `tomorrow ${formatTime(date)}`;
    return `${date.toLocaleDateString('en-US', { weekday: 'short' })} ${formatTime(date)}`;
  }
  const walkMinutes = miles => Math.max(1, Math.round(miles * 20)); // about 3 mph
  const formatMiles = miles => `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;

  // ---------- Opening hours ----------
  // The open interval that contains `date` (including one that started yesterday and runs past midnight).
  function currentInterval(restaurant, date) {
    const hours = week(restaurant);
    const today = startOfDay(date);
    const minute = minutesOf(date);
    for (const [open, close] of hours[today.getDay()]) {
      if (minute >= open && minute < close) return { start: at(today, open), end: at(today, close) };
    }
    const yesterday = addDays(today, -1);
    for (const [open, close] of hours[yesterday.getDay()]) {
      if (close > DAY && minute + DAY >= open && minute + DAY < close) return { start: at(yesterday, open), end: at(yesterday, close) };
    }
    return null;
  }
  const isOpenAt = (restaurant, date) => Boolean(currentInterval(restaurant, date));

  function nextOpening(restaurant, date) {
    const hours = week(restaurant);
    for (let offset = 0; offset <= 7; offset += 1) {
      const day = addDays(startOfDay(date), offset);
      for (const [open] of hours[day.getDay()]) {
        const start = at(day, open);
        if (start > date) return start;
      }
    }
    return null;
  }

  // { open, closingSoon, closesAt, opensAt, label } for badges such as "Open · until 9:30 PM".
  function openState(restaurant, now = new Date()) {
    const interval = currentInterval(restaurant, now);
    if (interval) {
      const minutesLeft = Math.round((interval.end - now) / MINUTE);
      const closingSoon = minutesLeft <= 45;
      return { open: true, closingSoon, minutesLeft, closesAt: interval.end, label: `${closingSoon ? 'Closing soon' : 'Open'} · until ${formatTime(interval.end)}` };
    }
    const opensAt = nextOpening(restaurant, now);
    return { open: false, closingSoon: false, opensAt, label: opensAt ? `Closed · opens ${relativeDayTime(opensAt, now)}` : 'Closed' };
  }

  function hoursText(intervals) {
    if (!intervals.length) return 'Closed';
    return intervals.map(([open, close]) => `${formatTime(at(new Date(2020, 0, 1), open))} – ${formatTime(at(new Date(2020, 0, 1), close))}`).join(', ');
  }
  const hoursOn = (restaurant, date) => hoursText(week(restaurant)[date.getDay()]);
  // Monday-first weekly hours for the restaurant page; `today` marks the current day.
  function weekHours(restaurant, now = new Date()) {
    return [1, 2, 3, 4, 5, 6, 0].map(index => ({ day: DAY_NAMES[index], text: hoursText(week(restaurant)[index]), today: index === now.getDay() }));
  }

  // ---------- Meal times ----------
  const dishWindow = dish => (dish.window && SF.MEAL_WINDOWS ? SF.MEAL_WINDOWS[dish.window] : null);
  function windowLabel(dish) {
    const meal = dishWindow(dish);
    if (!meal) return 'Served all day';
    const from = toMinutes(meal.from);
    const to = toMinutes(meal.to);
    return to >= DAY ? `${meal.label} · from ${clock(from)} ${meridiem(from)}` : `${meal.label} · ${compactRange(from, to)}`;
  }
  function inWindow(dish, date) {
    const meal = dishWindow(dish);
    if (!meal) return true;
    const minute = minutesOf(date);
    return minute >= toMinutes(meal.from) && minute < toMinutes(meal.to);
  }
  const dishAvailableAt = (dish, restaurant, date) => isOpenAt(restaurant, date) && inWindow(dish, date);

  // The next time the dish can be ordered: inside opening hours and its meal time.
  function nextDishTime(dish, restaurant, date) {
    const meal = dishWindow(dish);
    const from = meal ? toMinutes(meal.from) : 0;
    const to = meal ? toMinutes(meal.to) : 2 * DAY;
    const hours = week(restaurant);
    for (let offset = 0; offset <= 7; offset += 1) {
      const day = addDays(startOfDay(date), offset);
      for (const [open, close] of hours[day.getDay()]) {
        const start = Math.max(open, from);
        if (start >= Math.min(close, to)) continue;
        const startDate = at(day, start);
        if (startDate > date) return startDate;
      }
    }
    return null;
  }

  // { now, label, next, note } e.g. note "Breakfast · 7–11:30 AM · back tomorrow 7:00 AM".
  function dishAvailability(dish, restaurant, now = new Date()) {
    const available = dishAvailableAt(dish, restaurant, now);
    const label = windowLabel(dish);
    if (available) return { now: true, label, next: null, short: dishWindow(dish) ? label : '' };
    const next = nextDishTime(dish, restaurant, now);
    const when = next ? relativeDayTime(next, now) : '';
    const short = isOpenAt(restaurant, now) ? (dishWindow(dish) ? `${dishWindow(dish).label} · ${when ? `from ${when}` : 'not today'}` : '') : (when ? `Opens ${when}` : 'Closed');
    return { now: false, label, next, short };
  }

  // ---------- Prep times ----------
  // Extra kitchen minutes during the lunch (11:30–1:30) and dinner (5:30–7:30) rush.
  function rushExtra(restaurant, date) {
    const minute = minutesOf(date);
    const lunch = minute >= 690 && minute < 810;
    const dinner = minute >= 1050 && minute < 1170;
    if (!lunch && !dinner) return 0;
    return (dinner ? 6 : 5) + (restaurant.ratingCount >= 1200 ? 2 : 0);
  }
  // Minutes from ordering until the dish is served at the table (dine-in) or packed (pickup).
  function prepFor(dish, mode, restaurant, date = new Date()) {
    return dish.prep + rushExtra(restaurant, date) + (mode === 'pickup' ? PACKING_MINUTES : 0);
  }
  // Dishes cook in parallel, so an order takes as long as its slowest dish.
  function orderPrep(dishes, mode, restaurantOf, date = new Date()) {
    return dishes.reduce((max, dish) => Math.max(max, prepFor(dish, mode, restaurantOf(dish), date)), 0);
  }
  // A typical main course at this restaurant, for "food in about N min" on restaurant cards.
  function typicalPrep(restaurant, dishes, mode, date = new Date()) {
    const mains = dishes.filter(dish => dish.course === 'main').map(dish => dish.prep).sort((a, b) => a - b);
    const median = mains.length ? mains[Math.floor(mains.length / 2)] : 15;
    return median + rushExtra(restaurant, date) + (mode === 'pickup' ? PACKING_MINUTES : 0);
  }
  // Walk-in wait for a table (demo estimate): none outside the lunch and dinner rush.
  const walkInWait = (restaurant, date = new Date()) => Math.round(rushExtra(restaurant, date) * 1.5);

  // ---------- Reservation and pickup times ----------
  // Table times on `day` every `step` minutes: at least `lead` minutes from now, and the last
  // seating `lastSeating` minutes before closing. Times stay on that calendar day.
  function tableSlots(restaurant, day, now = new Date(), { step = 15, lead = 30, lastSeating = 60 } = {}) {
    const dayStart = startOfDay(day);
    const slots = [];
    week(restaurant)[dayStart.getDay()].forEach(([open, close]) => {
      const last = Math.min(close - lastSeating, DAY - step);
      for (let minute = Math.ceil(open / step) * step; minute <= last; minute += step) {
        const slot = at(dayStart, minute);
        if (slot - now >= lead * MINUTE) slots.push(slot);
      }
    });
    return slots;
  }
  // Pickup times over the next 24 hours, every 15 minutes, when every restaurant in the order is
  // open both when the kitchen starts and at pickup.
  function pickupSlots(restaurants, prepMinutes, now = new Date(), { step = 15, hours = 24, limit = 64 } = {}) {
    const slots = [];
    const first = new Date(now.getTime() + (prepMinutes + 5) * MINUTE);
    first.setSeconds(0, 0);
    first.setMinutes(Math.ceil(first.getMinutes() / step) * step);
    for (let time = first.getTime(); time <= now.getTime() + hours * 3600000 && slots.length < limit; time += step * MINUTE) {
      const slot = new Date(time);
      const start = new Date(time - prepMinutes * MINUTE);
      if (restaurants.every(restaurant => isOpenAt(restaurant, slot) && isOpenAt(restaurant, start))) slots.push(slot);
    }
    return slots;
  }

  // ---------- Ordered today (demo numbers) ----------
  function seeded(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return ((hash >>> 0) % 10000) / 10000;
  }
  const progressCache = new Map();
  // Share of today's orders already placed: time served so far, with lunch and dinner counting double.
  function dayProgress(dish, restaurant, now) {
    const bucket = Math.floor(minutesOf(now) / 15);
    const key = `${dish.id}|${dayKey(now)}|${bucket}`;
    if (progressCache.has(key)) return progressCache.get(key);
    const day = startOfDay(now);
    let done = 0;
    let total = 0;
    for (let minute = 0; minute < DAY; minute += 15) {
      const time = at(day, minute);
      if (!dishAvailableAt(dish, restaurant, time)) continue;
      const weight = (minute >= 690 && minute < 840) || (minute >= 1050 && minute < 1200) ? 2 : 1;
      total += weight;
      if (minute < bucket * 15) done += weight;
    }
    const progress = total ? done / total : 0;
    if (progressCache.size > 4000) progressCache.clear();
    progressCache.set(key, progress);
    return progress;
  }
  // About how many people have ordered this dish at its restaurant so far today (sample data).
  function orderedToday(dish, restaurant, now = new Date()) {
    const boost = (dish.bestSeller ? 1.4 : 1) * (dish.isNew ? 1.15 : 1) * (dish.course === 'drink' ? 1.15 : 1);
    const daily = (dish.ratingCount / 7) * boost * (0.7 + seeded(`${dish.id}${dayKey(now)}`) * 0.6);
    return Math.floor(daily * dayProgress(dish, restaurant, now));
  }

  SF.schedule = {
    DAY_NAMES, startOfDay, addDays, sameDay, dayKey, fromDayKey, at, minutesOf,
    formatTime, formatDay, formatDayTime, relativeDayTime, walkMinutes, formatMiles,
    currentInterval, isOpenAt, nextOpening, openState, hoursOn, weekHours,
    dishWindow, windowLabel, dishAvailableAt, nextDishTime, dishAvailability,
    rushExtra, prepFor, orderPrep, typicalPrep, walkInWait,
    tableSlots, pickupSlots, orderedToday
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = SF;
})(typeof window !== 'undefined' ? window : globalThis);
