// Your orders: order history and status, group check-in, splitting the bill, reviews with
// photos, the "Coming up" strip, the fresh photos and reviews feed, and group links that
// friends open on their own phones. Everything is saved on this device only.
(() => {
  const SF = window.SF;
  const app = SF.app;
  const { $, $$, esc, icon, cents, store, toast, img, openDialog, stars, timeAgo, initials, plural, makeQr, copyText, shareText } = SF.ui;
  const S = SF.schedule;
  const MODES = SF.MODES;
  const MINUTE = 60000;
  const HOUR = 60 * MINUTE;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const time = ms => S.formatTime(new Date(ms));
  const dayTime = ms => S.formatDayTime(new Date(ms));
  const dishOf = item => SF.dishById.get(item.dishId);
  const restaurantIdsOf = order => (Array.isArray(order.restaurantIds) && order.restaurantIds.length
    ? order.restaurantIds
    : [...new Set(order.items.map(item => dishOf(item)?.restaurantId).filter(Boolean))]).filter(id => SF.restaurantById.has(id));
  const placeName = order => restaurantIdsOf(order).map(id => SF.restaurantById.get(id).name).join(' and ') || 'SmartFoodie';
  const modeLabel = order => MODES[order.mode]?.label || 'Order';
  const modeIcon = order => MODES[order.mode]?.icon || 'receipt';
  const itemCount = order => order.items.reduce((sum, item) => sum + item.quantity, 0);
  const tableMode = order => order.mode === 'dinein' || order.mode === 'reservation';
  const hashText = text => [...String(text)].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) % 100003, 7);

  // ---------- Status ----------
  // The time an order is about: the table time, arrival, or pickup time.
  const keyTime = order => (order.mode === 'reservation' ? order.reservedFor : order.mode === 'dinein' ? order.arriveAt : order.mode === 'pickup' ? order.readyAt : order.placedAt) || order.placedAt;
  // When food reaches the table: dine-in starts at check-in; a reservation pre-order is timed
  // for the table time (or comes out a few minutes after a late check-in).
  function servedAt(order) {
    if (!order.checkedInAt || !order.items.length) return null;
    const prep = (order.prepMinutes || 15) * MINUTE;
    if (order.mode === 'reservation') return Math.max(order.checkedInAt + 3 * MINUTE, Math.min(order.reservedFor, order.checkedInAt + prep));
    return order.checkedInAt + prep;
  }

  function orderStatus(order, now = Date.now()) {
    if (order.cancelledAt) return { key: 'cancelled', label: 'Cancelled', tone: 'muted', active: false, step: -1 };
    if (order.mode === 'pickup') {
      if (order.pickedUpAt) return { key: 'done', label: `Picked up at ${time(order.pickedUpAt)}`, tone: 'done', active: false, step: 3 };
      const start = order.readyAt - (order.prepMinutes || 15) * MINUTE;
      if (now < start) return { key: 'scheduled', label: `Scheduled · ready ${dayTime(order.readyAt)}`, tone: 'info', active: true, step: 0 };
      if (now < order.readyAt) return { key: 'preparing', label: `Preparing · ready about ${time(order.readyAt)}`, tone: 'active', active: true, step: 1 };
      if (now < order.readyAt + 3 * HOUR) return { key: 'ready', label: 'Ready for pickup', tone: 'ready', active: true, step: 2 };
      return { key: 'done', label: 'Completed', tone: 'done', active: false, step: 3 };
    }
    if (tableMode(order)) {
      const startAt = keyTime(order);
      if (order.checkedInAt) {
        const served = servedAt(order);
        const table = order.table ? ` · table ${order.table}` : '';
        if (served && now < served) return { key: 'preparing', label: `Checked in${table} · food about ${time(served)}`, tone: 'active', active: true, step: 2 };
        if (now < order.checkedInAt + 2 * HOUR) return { key: 'seated', label: `Seated${table}${order.items.length ? ' · food served' : ''}`, tone: 'ready', active: true, step: 3 };
        return { key: 'done', label: 'Completed', tone: 'done', active: false, step: 3 };
      }
      if (now > startAt + 2 * HOUR) return { key: 'missed', label: 'Not checked in', tone: 'muted', active: false, step: 0 };
      if (order.mode === 'reservation' && now < startAt - 30 * MINUTE) return { key: 'upcoming', label: `Upcoming · ${dayTime(startAt)}`, tone: 'info', active: true, step: 0, canCheckIn: true };
      return { key: 'checkin', label: order.mode === 'reservation' ? `Check in · table at ${time(startAt)}` : `Check in when you arrive (about ${time(startAt)})`, tone: 'action', active: true, step: 0, canCheckIn: true };
    }
    return { key: 'done', label: 'Completed', tone: 'done', active: false, step: 3 }; // orders from older versions
  }
  const activeOrders = (now = Date.now()) => app.orders.all().filter(order => orderStatus(order, now).active).sort((a, b) => keyTime(a) - keyTime(b));

  function whenText(order) {
    if (order.mode === 'reservation') return `${dayTime(order.reservedFor)} · ${plural(order.party || 1, 'person', 'people')}`;
    if (order.mode === 'dinein') return `${S.formatDay(new Date(order.arriveAt))} · arrive about ${time(order.arriveAt)} · ${plural(order.party || 1, 'person', 'people')}`;
    if (order.mode === 'pickup') return `Pickup ${dayTime(order.readyAt)}`;
    return new Date(order.placedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  const itemsText = order => (order.items.length
    ? order.items.map(item => `${item.quantity} × ${dishOf(item)?.name || 'Item'}`).join(', ')
    : 'Table only, order at the restaurant');

  // ---------- Buttons for one order ----------
  function orderActions(order, { detail = false } = {}) {
    const status = orderStatus(order);
    const id = esc(order.id);
    const buttons = [];
    if (status.canCheckIn) buttons.push(`<button type="button" class="button button-primary button-small" data-order-checkin="${id}">${icon('checkin')} Check in</button>`);
    if (order.mode === 'pickup' && status.key === 'ready') buttons.push(`<button type="button" class="button button-primary button-small" data-order-pickedup="${id}">${icon('check')} I picked it up</button>`);
    if (tableMode(order) && order.checkedInAt && status.active) buttons.push(`<button type="button" class="button button-secondary button-small" data-order-checkin="${id}">${icon('users')} Who's here</button>`);
    if (!detail) buttons.push(`<button type="button" class="button button-secondary button-small" data-order-view="${id}">Details</button>`);
    if (!order.cancelledAt && (order.totals.total > 0 || tableMode(order))) buttons.push(`<button type="button" class="button button-secondary button-small" data-order-split="${id}">${icon('split')} Split bill</button>`);
    if (detail && order.mode === 'reservation' && status.active) buttons.push(`<button type="button" class="button button-secondary button-small" data-order-calendar="${id}">${icon('calendar')} Add to calendar</button>`);
    if (!status.active && order.items.length && !order.cancelledAt) buttons.push(`<button type="button" class="button button-secondary button-small" data-order-rate="${id}">${icon('star')} Rate</button>`);
    if (order.items.length && (detail || !status.active)) buttons.push(`<button type="button" class="button button-secondary button-small" data-order-reorder="${id}">Reorder</button>`);
    if (detail && status.active && !order.checkedInAt && ['upcoming', 'checkin', 'scheduled'].includes(status.key)) buttons.push(`<button type="button" class="link-button danger" data-order-cancel="${id}">Cancel ${order.mode === 'reservation' ? 'reservation' : 'order'}</button>`);
    return `<div class="order-actions">${buttons.join('')}</div>`;
  }

  // ---------- Badge and "Coming up" strip ----------
  function updateBadge() {
    const count = activeOrders().length;
    const badge = $('#ordersBadge');
    badge.hidden = count === 0;
    badge.textContent = count;
    $('#ordersButton').setAttribute('aria-label', count ? `Your orders: ${count} upcoming` : 'Your orders and reservations');
  }
  function upcomingCard(order) {
    const status = orderStatus(order);
    return `<article class="upcoming-card" data-tone="${status.tone}">
      <div class="order-card-head"><span class="mode-pill">${icon(modeIcon(order))} ${esc(modeLabel(order))}</span><span class="order-code">#${esc(order.code || '')}</span></div>
      <h3>${esc(placeName(order))}</h3>
      <p class="status-line" data-tone="${status.tone}">${esc(status.label)}</p>
      <p class="muted">${esc(whenText(order))}</p>
      ${orderActions(order)}
    </article>`;
  }
  function renderUpcoming() {
    const list = activeOrders().slice(0, 6);
    $('#upcoming').hidden = list.length === 0;
    $('#upcomingRow').innerHTML = list.map(upcomingCard).join('');
    app.syncAllScrollButtons?.($('#upcoming'));
  }

  // ---------- Order history ----------
  let ordersTab = 'active';
  function orderCard(order) {
    const status = orderStatus(order);
    const split = order.split ? `<p class="split-progress">${icon('split')} Split ${order.split.count} ways · ${order.split.paid ? order.split.paid.filter(Boolean).length : 0} of ${order.split.count} paid</p>` : '';
    return `<article class="order-card">
      <div class="order-card-head"><span class="mode-pill">${icon(modeIcon(order))} ${esc(modeLabel(order))}</span><span class="status-pill" data-tone="${status.tone}">${esc(status.label)}</span></div>
      <h3>${esc(placeName(order))}</h3>
      <p class="muted">${esc(whenText(order))}</p>
      <p class="order-items">${esc(itemsText(order))}</p>
      <p class="order-meta"><b>${order.totals.total ? cents(order.totals.total) : 'No charge'}</b> · ${esc(order.id)} · placed ${new Date(order.placedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
      ${split}
      ${orderActions(order)}
    </article>`;
  }
  function renderList() {
    const now = Date.now();
    const all = app.orders.all();
    const active = all.filter(order => orderStatus(order, now).active).sort((a, b) => keyTime(a) - keyTime(b));
    const past = all.filter(order => !orderStatus(order, now).active);
    $('#ordersTabActive').textContent = `Upcoming (${active.length})`;
    $('#ordersTabPast').textContent = `Past (${past.length})`;
    $$('[data-orders-tab]').forEach(tab => tab.setAttribute('aria-selected', String(tab.dataset.ordersTab === ordersTab)));
    $('#ordersList').setAttribute('aria-labelledby', ordersTab === 'active' ? 'ordersTabActive' : 'ordersTabPast');
    const list = ordersTab === 'active' ? active : past;
    $('#ordersList').innerHTML = list.length ? list.map(orderCard).join('')
      : `<div class="empty-state small-empty">${icon('receipt')}<strong>${ordersTab === 'active' ? 'Nothing coming up' : 'No past orders yet'}</strong><p>${ordersTab === 'active' ? 'Book a table, order for dine-in, or schedule a pickup. It shows up here with your check-in code.' : 'Orders you finish show up here, so you can reorder, rate them, and settle the bill.'}</p></div>`;
  }
  function openList(tab) {
    ordersTab = tab || (activeOrders().length ? 'active' : 'past');
    renderList();
    const dialog = $('#ordersDialog');
    openDialog(dialog);
    dialog.scrollTop = 0;
  }
  $('#ordersDialog').addEventListener('click', event => {
    const tab = event.target.closest('[data-orders-tab]');
    if (tab) { ordersTab = tab.dataset.ordersTab; renderList(); }
  });

  // ---------- One order (confirmation and details) ----------
  let shownId = null;
  let justPlaced = false;
  const TRACKS = {
    pickup: ['Order confirmed', 'Preparing', 'Ready for pickup', 'Picked up'],
    dinein: ['Order confirmed', 'Checked in', 'Preparing', 'Served'],
    reservation: ['Table booked', 'Checked in', 'Pre-order cooking', 'Seated and served'],
    reservationNoFood: ['Table booked', 'Checked in', 'Seated']
  };
  function tracker(order, status) {
    if (!MODES[order.mode] || order.cancelledAt) return '';
    const steps = order.mode === 'reservation' && !order.items.length ? TRACKS.reservationNoFood : TRACKS[order.mode];
    let current = status.step;
    if (tableMode(order)) current = !order.checkedInAt ? 0 : status.key === 'preparing' ? 2 : steps.length - 1;
    if (order.mode === 'reservation' && !order.items.length && order.checkedInAt) current = steps.length - 1;
    const done = !status.active;
    return `<ol class="tracker">${steps.map((title, index) => {
      const cls = done || index < current ? 'done' : index === current ? 'current' : '';
      return `<li class="tracker-step ${cls}"><span class="tracker-dot">${done || index < current ? icon('check') : index + 1}</span><div><strong>${title}</strong></div></li>`;
    }).join('')}</ol>`;
  }

  function receipt(order) {
    const t = order.totals;
    const known = (t.subtotal || 0) + (t.service || 0) + (t.smallOrder || 0) + (t.tax || 0) + (t.tip || 0);
    const rows = [
      ['Food subtotal', t.subtotal], ['Service fee', t.service], ['Small order fee', t.smallOrder],
      [`Sales tax (${esc(order.taxState || '')} ${t.taxRate ?? ''}%)`, t.tax], [MODES[order.mode]?.tipLabel || 'Tip', t.tip],
      ['Other fees', t.total - known]
    ].filter(([label, value]) => value > 0 || label.startsWith('Sales tax'));
    return `<div class="summary-items">${order.items.map(item => {
      const dish = dishOf(item);
      return dish ? `<div class="summary-item"><span>${item.quantity} × <button type="button" class="link-button" data-open-dish="${dish.id}">${esc(dish.name)}</button>${item.note ? ` <small>“${esc(item.note)}”</small>` : ''}</span><b>${cents(Math.round(dish.price * 100) * item.quantity)}</b></div>` : '';
    }).join('')}</div>
      <div class="totals" style="margin-top:12px">${rows.map(([label, value]) => `<div class="totals-row"><span>${label}</span><span>${cents(value)}</span></div>`).join('')}
      <div class="totals-row totals-total"><span>${MODES[order.mode] ? 'Total, paid at the restaurant' : 'Total'}</span><span>${cents(t.total)}</span></div></div>`;
  }

  function hostName(order) {
    return order.name || (store.get('contact', {}) || {}).name || '';
  }
  function groupLink(order) {
    const total = order.split ? splitTotals(order).total : order.totals.total;
    const shares = order.split && total > 0 ? splitShares(order).map(share => ({ name: share.name, cents: share.cents })) : null;
    const data = SF.split.encodeGroup({
      restaurantId: restaurantIdsOf(order)[0] || '', mode: MODES[order.mode] ? order.mode : 'reservation', time: keyTime(order),
      party: order.party || 1, code: order.code || '', host: hostName(order), guests: (order.guests || []).map(guest => guest.name),
      shares, total
    });
    const url = new URL(location.href);
    url.hash = `group=${data}`;
    return url.href;
  }

  function renderOrder() {
    const order = app.orders.get(shownId);
    if (!order) return;
    const status = orderStatus(order);
    const titles = {
      reservation: [justPlaced ? 'Table booked!' : 'Your reservation', `${placeName(order)} · ${whenText(order)}`],
      dinein: [justPlaced ? 'Dine-in order placed!' : 'Your dine-in order', `${placeName(order)} · ${whenText(order)}`],
      pickup: [justPlaced ? 'Pickup order placed!' : 'Your pickup order', `${placeName(order)} · ready ${dayTime(order.readyAt)}`]
    };
    const [title, sub] = titles[order.mode] || ['Your order', placeName(order)];
    const guests = order.guests || [];
    const here = guests.filter(guest => guest.here).length;
    const codeLabel = order.mode === 'pickup' ? 'Pickup code · show it at the counter' : 'Check-in code · tell the host';
    const groupBlock = tableMode(order) && !order.cancelledAt ? `
      <section class="order-section" aria-labelledby="groupHead">
        <h3 id="groupHead">${icon('users')} Your group</h3>
        <p class="muted">${plural(guests.length || order.party || 1, 'person', 'people')}: ${esc(guests.map(guest => guest.name).join(', '))}${order.checkedInAt ? ` · ${here} of ${guests.length} here` : ''}</p>
        <div class="invite-box">
          <div class="qr-code qr-small" id="orderQr" aria-label="QR code for the group link"></div>
          <div>
            <strong>Invite your group</strong>
            <p class="field-hint">Friends scan this or open the link to see the time, the check-in code${order.split ? ', and their share of the bill' : ''}.</p>
            <div class="share-actions"><button type="button" class="button button-secondary button-small" data-order-copy="${esc(order.id)}">${icon('copy')} Copy link</button><button type="button" class="button button-primary button-small" data-order-share="${esc(order.id)}">${icon('share')} Share</button></div>
          </div>
        </div>
      </section>` : '';
    const splitBlock = order.split ? `
      <section class="order-section" aria-labelledby="splitHead">
        <h3 id="splitHead">${icon('split')} Bill split</h3>
        <div class="split-shares">${SF.splitUI.sharesList(order.split, splitLines(order), splitTotals(order), { paid: order.split.paid, readOnly: true })}</div>
        <button type="button" class="button button-secondary button-small" data-order-split="${esc(order.id)}">Edit split</button>
      </section>` : '';
    $('#orderBody').innerHTML = `
      <div class="confirm-hero">
        ${justPlaced ? `<span class="confirm-check">${icon('check')}</span>` : `<span class="mode-pill">${icon(modeIcon(order))} ${esc(modeLabel(order))}</span>`}
        <h2 id="orderTitle">${esc(title)}</h2>
        <p>${esc(sub)}</p>
        <span class="status-pill" data-tone="${status.tone}">${esc(status.label)}</span>
      </div>
      ${order.code && !order.cancelledAt ? `<div class="code-box"><span>${codeLabel}</span><strong>${esc(order.code)}</strong><small>Order ${esc(order.id)}</small></div>` : ''}
      ${tracker(order, status)}
      ${orderActions(order, { detail: true })}
      ${order.mode === 'reservation' && (order.notes || order.phone) ? `<p class="muted order-notes">${order.notes ? `Notes: ${esc(order.notes)}` : ''}${order.notes && order.phone ? ' · ' : ''}${order.phone ? `Phone: ${esc(order.phone)}` : ''}</p>` : ''}
      ${groupBlock}
      ${splitBlock}
      <section class="order-section confirm-box" aria-labelledby="receiptHead">
        <h3 id="receiptHead">${order.items.length ? (order.mode === 'reservation' ? 'Pre-order' : 'Receipt') : 'Pre-order'}</h3>
        ${order.items.length ? receipt(order) : '<p class="muted">No pre-order. Order at the table, then use Split bill to share the total.</p>'}
      </section>
      <p class="sample-note">Demo: restaurants don't receive this ${order.mode === 'reservation' ? 'reservation' : 'order'}, and nothing is charged.</p>
      <button type="button" class="button button-primary button-block" data-close style="margin-top:16px">Done</button>`;
    const qr = $('#orderQr');
    if (qr) makeQr(qr, groupLink(order), 132);
  }
  let orderTimer = null;
  function show(orderId, { justPlaced: placed = false } = {}) {
    if (!app.orders.get(orderId)) return;
    shownId = orderId;
    justPlaced = placed;
    renderOrder();
    const dialog = $('#orderDialog');
    openDialog(dialog);
    dialog.scrollTop = 0;
    clearInterval(orderTimer);
    orderTimer = setInterval(() => { if (dialog.open) renderOrder(); else clearInterval(orderTimer); }, 30000);
  }

  // ---------- Calendar file for a reservation ----------
  const icsText = text => String(text).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const icsDate = date => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  function downloadCalendar({ id, start, title, details }) {
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SmartFoodie//Reservation//EN', 'BEGIN:VEVENT',
      `UID:${id}@smartfoodie`, `DTSTAMP:${icsDate(new Date())}`, `DTSTART:${icsDate(new Date(start))}`, `DTEND:${icsDate(new Date(start + 90 * MINUTE))}`,
      `SUMMARY:${icsText(title)}`, `DESCRIPTION:${icsText(details)}`, 'END:VEVENT', 'END:VCALENDAR'];
    const url = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `smartfoodie-${String(id).replace(/[^\w-]/g, '')}.ics`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // ---------- Group check-in ----------
  let checkinId = null;
  function renderCheckin() {
    const order = app.orders.get(checkinId);
    if (!order) return;
    const restaurant = SF.restaurantById.get(restaurantIdsOf(order)[0]);
    const now = Date.now();
    const startAt = keyTime(order);
    const guests = order.guests && order.guests.length ? order.guests : [{ name: 'You', here: false }];
    const here = guests.filter(guest => guest.here).length;
    const guestRows = guests.map((guest, index) => `<li><button type="button" class="guest${guest.here ? ' is-here' : ''}" data-guest="${index}" aria-pressed="${guest.here}">
        <span class="avatar" aria-hidden="true">${esc(initials(guest.name))}</span><span class="guest-name">${esc(guest.name)}</span><span class="guest-state">${guest.here ? `${icon('check')} Here` : 'Not here yet'}</span></button></li>`).join('');
    const addGuest = `<form class="add-guest" data-add-guest><label class="sr-only" for="addGuestName">Add a person to your group</label><input id="addGuestName" maxlength="40" placeholder="Someone else coming? Add a name"><button type="submit" class="button button-secondary button-small">Add</button></form>`;
    if (order.checkedInAt) {
      const served = servedAt(order);
      $('#checkinBody').innerHTML = `
        <div class="confirm-hero"><span class="confirm-check">${icon('check')}</span><h2 id="checkinTitle">You're checked in</h2>
        <p>${esc(restaurant?.name || placeName(order))} · checked in at ${time(order.checkedInAt)}</p></div>
        <div class="code-box"><span>Your table</span><strong>${esc(order.table || '—')}</strong><small>${served ? (now < served ? `Food comes out about ${time(served)}` : 'Your food is on the table. Enjoy!') : 'Order at the table when you are ready.'}</small></div>
        <h3 class="checkin-head">Who's here <span class="muted">${here} of ${guests.length}</span></h3>
        <ul class="guest-list">${guestRows}</ul>
        ${addGuest}
        <p class="field-hint">Mark friends as they arrive. When you're done, use Split bill so everyone pays their share.</p>
        <div class="share-actions" style="margin-top:14px"><button type="button" class="button button-secondary" data-order-split="${esc(order.id)}">${icon('split')} Split bill</button><button type="button" class="button button-primary" data-close>Done</button></div>`;
      return;
    }
    const early = now < startAt - 15 * MINUTE;
    const late = now > startAt + 15 * MINUTE;
    const note = order.mode === 'reservation'
      ? (early ? `You're early. Your table is at ${time(startAt)}; the host will seat you as soon as one is free.` : late ? `You're running late. Tables are held for 15 minutes, so check in now and the host will do their best.` : 'Right on time. Check in and the host will seat you.')
      : 'Check in when you get there. The kitchen starts your order as soon as you do.';
    $('#checkinBody').innerHTML = `
      <h2 id="checkinTitle">Check in at ${esc(restaurant?.name || placeName(order))}</h2>
      <p class="muted">${esc(modeLabel(order))} · ${esc(whenText(order))}</p>
      <p class="checkin-note">${esc(note)}</p>
      <div class="code-box"><span>Check-in code · tell the host</span><strong>${esc(order.code || '')}</strong><small>Order ${esc(order.id)}</small></div>
      <h3 class="checkin-head">Who's here? <span class="muted">Tap each person who has arrived</span></h3>
      <ul class="guest-list">${guestRows}</ul>
      ${addGuest}
      <p class="checkin-progress" aria-live="polite">${here} of ${guests.length} here</p>
      <button type="button" class="button button-primary button-block" data-confirm-checkin${here ? '' : ' disabled'}>${here === guests.length ? 'Check in our group' : here ? `Check in now (${here} of ${guests.length} here)` : 'Mark who is here first'}</button>
      <p class="field-hint">${here && here < guests.length ? 'The rest of your group can join at the table; mark them here when they arrive.' : 'The host seats your group as soon as you check in.'}${order.items.length ? ' Your order goes to the kitchen at check-in.' : ''}</p>`;
  }
  function checkIn(orderId) {
    const order = app.orders.get(orderId);
    if (!order || !tableMode(order)) return;
    if (!order.guests || !order.guests.length) app.orders.update(orderId, { guests: [{ name: 'You', here: false }] });
    checkinId = orderId;
    renderCheckin();
    openDialog($('#checkinDialog'));
  }
  function checkInNext() {
    const next = activeOrders().find(order => tableMode(order) && !order.checkedInAt);
    if (next) checkIn(next.id);
    else toast('Nothing to check in yet. Book a table or place a dine-in order first.');
  }
  const checkinDialog = $('#checkinDialog');
  checkinDialog.addEventListener('click', event => {
    const order = app.orders.get(checkinId);
    if (!order) return;
    const guest = event.target.closest('[data-guest]');
    if (guest) {
      const index = Number(guest.dataset.guest);
      app.orders.update(order.id, current => ({ guests: current.guests.map((item, i) => (i === index ? { ...item, here: !item.here } : item)) }));
      renderCheckin();
      $(`[data-guest="${index}"]`, checkinDialog)?.focus();
      return;
    }
    if (event.target.closest('[data-confirm-checkin]')) {
      const table = order.table || String(1 + (hashText(order.id) % 28));
      app.orders.update(order.id, { checkedInAt: Date.now(), table });
      renderCheckin();
      toast(`Checked in. Table ${table} is yours.`);
    }
  });
  checkinDialog.addEventListener('submit', event => {
    if (!event.target.matches('[data-add-guest]')) return;
    event.preventDefault();
    const input = $('input', event.target);
    const name = input.value.trim().slice(0, 40);
    if (!name) return;
    app.orders.update(checkinId, current => {
      const guests = [...(current.guests || []), { name, here: true }].slice(0, 12);
      return { guests, party: Math.max(current.party || 1, guests.length) };
    });
    renderCheckin();
    $('#addGuestName', checkinDialog)?.focus();
  });

  // ---------- Split the bill (shared editor, also used in checkout) ----------
  const displayName = (model, index) => String(model.names?.[index] || '').trim() || (index === 0 ? 'You' : `Friend ${index}`);
  function normalizeModel(model) {
    model.count = clamp(Math.round(Number(model.count) || 2), 2, 12);
    model.names = Array.from({ length: model.count }, (_, i) => String(model.names?.[i] ?? ''));
    const assign = {};
    Object.entries(model.assign || {}).forEach(([line, people]) => { assign[line] = (people || []).filter(index => index < model.count); });
    model.assign = assign;
    if (Array.isArray(model.paid)) model.paid = Array.from({ length: model.count }, (_, i) => Boolean(model.paid[i]));
    if (model.method !== 'items') model.method = 'even';
    return model;
  }
  function computeShares(model, lines, totals) {
    normalizeModel(model);
    const method = model.method === 'items' && lines.length ? 'items' : 'even';
    const result = SF.split.computeShares({ method, count: model.count, lines: lines.map((line, index) => ({ cents: line.cents, people: model.assign[index] || [] })), subtotal: totals.subtotal, total: totals.total });
    return result.totals.map((amount, index) => ({ name: displayName(model, index), cents: amount, food: result.food[index] }));
  }
  function itemsHtml(model, lines) {
    return `<div class="split-items"><p class="field-hint">Tap who had each item. Items with nobody selected are shared by everyone.</p>
      ${lines.map((line, lineIndex) => {
        const who = model.assign[lineIndex] || [];
        return `<div class="split-line"><div class="split-line-head"><span>${esc(line.label)}</span><b>${cents(line.cents)}</b></div>
          <div class="chip-group" role="group" aria-label="Who had ${esc(line.label)}">${Array.from({ length: model.count }, (_, person) => `<button type="button" class="chip chip-small" data-split-assign="${lineIndex}:${person}" aria-pressed="${who.includes(person)}">${esc(displayName(model, person))}</button>`).join('')}${who.length ? '' : '<span class="split-shared">Shared by everyone</span>'}</div></div>`;
      }).join('')}</div>`;
  }
  function sharesList(model, lines, totals, { paid = null, readOnly = false } = {}) {
    const shares = computeShares(model, lines, totals);
    const extra = totals.total !== totals.subtotal;
    const owed = shares.reduce((sum, share, index) => sum + (paid && paid[index] ? 0 : share.cents), 0);
    const paidControl = index => {
      if (!paid) return '';
      if (readOnly) return `<span class="paid-state${paid[index] ? ' is-paid' : ''}">${paid[index] ? `${icon('check')} Paid` : 'Owes'}</span>`;
      return `<button type="button" class="chip chip-small paid-toggle" data-split-paid="${index}" aria-pressed="${Boolean(paid[index])}" aria-label="${esc(shares[index].name)} paid">${paid[index] ? `${icon('check')} Paid` : 'Mark paid'}</button>`;
    };
    return `${shares.map((share, index) => `<div class="share-row">
        <span class="avatar" aria-hidden="true">${esc(initials(share.name))}</span>
        <span class="share-name">${esc(share.name)}${extra && share.cents ? `<small>${cents(share.food)} food + ${cents(share.cents - share.food)} tax and fees${totals.tip ? ' with tip' : ''}</small>` : ''}</span>
        <b>${cents(share.cents)}</b>
        ${paidControl(index)}
      </div>`).join('')}
      ${paid ? `<p class="split-progress">${paid.filter(Boolean).length} of ${shares.length} paid · ${cents(owed)} still owed</p>` : ''}`;
  }
  SF.splitUI = {
    editor(model, lines, totals, { paid = null } = {}) {
      normalizeModel(model);
      const method = model.method === 'items' && lines.length ? 'items' : 'even';
      return `<div class="split-editor">
        <div class="split-controls">
          <div class="split-count"><span class="split-label">People</span>
            <div class="stepper" role="group" aria-label="Number of people">
              <button type="button" data-split-count="-1" aria-label="One fewer person"${model.count <= 2 ? ' disabled' : ''}>${icon('minus')}</button><output>${model.count}</output><button type="button" data-split-count="1" aria-label="One more person"${model.count >= 12 ? ' disabled' : ''}>${icon('plus')}</button>
            </div>
          </div>
          <div class="segmented split-method" role="group" aria-label="How to split">
            <button type="button" data-split-method="even" aria-pressed="${method === 'even'}">Evenly</button>
            <button type="button" data-split-method="items" aria-pressed="${method === 'items'}"${lines.length ? '' : ' disabled'}>By item</button>
          </div>
        </div>
        <div class="split-names">${Array.from({ length: model.count }, (_, i) => `<label class="split-name"><span class="avatar" aria-hidden="true">${i + 1}</span><input data-split-name="${i}" value="${esc(model.names[i])}" placeholder="${i === 0 ? 'You' : `Friend ${i}`}" maxlength="30" aria-label="Name of person ${i + 1}"></label>`).join('')}</div>
        ${method === 'items' ? itemsHtml(model, lines) : ''}
        <div class="split-shares" data-split-shares>${sharesList(model, lines, totals, { paid })}</div>
      </div>`;
    },
    sharesList,
    summary(model, lines, totals) {
      const shares = computeShares(model, lines, totals);
      return `<div class="split-summary"><p>${icon('split')} ${model.method === 'items' && lines.length ? `Split by item, ${shares.length} people` : `Split evenly ${shares.length} ways`}</p>${shares.map(share => `<div class="summary-item"><span>${esc(share.name)}</span><b>${cents(share.cents)}</b></div>`).join('')}</div>`;
    },
    // Returns true when the editor needs to redraw.
    handleClick(event, model) {
      const count = event.target.closest('[data-split-count]');
      if (count) { model.count = clamp(model.count + Number(count.dataset.splitCount), 2, 12); normalizeModel(model); return true; }
      const method = event.target.closest('[data-split-method]');
      if (method && !method.disabled) { model.method = method.dataset.splitMethod; return true; }
      const assign = event.target.closest('[data-split-assign]');
      if (assign) {
        const [line, person] = assign.dataset.splitAssign.split(':').map(Number);
        const who = new Set(model.assign[line] || []);
        if (who.has(person)) who.delete(person); else who.add(person);
        model.assign[line] = [...who].sort((a, b) => a - b);
        return true;
      }
      return false;
    },
    // Name typing: updates names in place (no redraw, so typing isn't interrupted).
    handleInput(event, model) {
      const input = event.target.closest('[data-split-name]');
      if (!input) return false;
      const index = Number(input.dataset.splitName);
      model.names[index] = input.value.slice(0, 30);
      const scope = input.closest('.split-editor') || document;
      $$(`[data-split-assign$=":${index}"]`, scope).forEach(chip => { chip.textContent = displayName(model, index); });
      return true;
    },
    toOrder(model) {
      normalizeModel(model);
      return {
        method: model.method, count: model.count,
        names: Array.from({ length: model.count }, (_, i) => displayName(model, i)),
        assign: JSON.parse(JSON.stringify(model.assign)),
        paid: Array.from({ length: model.count }, (_, i) => i === 0)
      };
    }
  };

  // Lines and totals of a placed order, in cents, for splitting.
  const splitLines = order => order.items.map(item => {
    const dish = dishOf(item);
    return dish ? { label: `${item.quantity} × ${dish.name}`, cents: Math.round(dish.price * 100) * item.quantity } : null;
  }).filter(Boolean);
  const splitTotals = order => (order.items.length
    ? { subtotal: order.totals.subtotal, total: order.totals.total, tip: order.totals.tip }
    : { subtotal: order.split?.amount || 0, total: order.split?.amount || 0, tip: 0 });
  const splitShares = order => computeShares(order.split, splitLines(order), splitTotals(order));

  // The split dialog works on a saved order, or on any bill typed in by hand.
  let splitTarget = null; // { orderId } or { custom: model }
  const splitContext = () => {
    if (splitTarget?.orderId) {
      const order = app.orders.get(splitTarget.orderId);
      if (!order) return null;
      return { order, model: order.split, lines: splitLines(order), totals: splitTotals(order), needsAmount: !order.items.length };
    }
    const model = splitTarget.custom;
    return { order: null, model, lines: [], totals: { subtotal: model.amount || 0, total: model.amount || 0, tip: 0 }, needsAmount: true };
  };
  function shareMessage() {
    const context = splitContext();
    const shares = computeShares(context.model, context.lines, context.totals);
    const place = context.order ? `${placeName(context.order)} · ${new Date(keyTime(context.order)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Our bill';
    return [`SmartFoodie bill split · ${place}`, `Total ${cents(context.totals.total)}`, ...shares.map((share, i) => `${share.name}: ${cents(share.cents)}${context.model.paid?.[i] ? ' (paid)' : ''}`)].join('\n');
  }
  function splitLink() {
    const context = splitContext();
    if (context.order) return groupLink(context.order);
    const shares = computeShares(context.model, [], context.totals).map(share => ({ name: share.name, cents: share.cents }));
    const url = new URL(location.href);
    url.hash = `group=${SF.split.encodeGroup({ restaurantId: '', mode: 'dinein', time: Date.now(), party: shares.length, code: '', host: displayName(context.model, 0) === 'You' ? '' : displayName(context.model, 0), guests: shares.map(share => share.name), shares, total: context.totals.total })}`;
    return url.href;
  }
  let qrTimer = 0;
  function renderSplitQr() {
    clearTimeout(qrTimer);
    qrTimer = setTimeout(() => {
      const box = $('#splitQr');
      if (!box) return;
      const context = splitContext();
      if (!context || !context.totals.total) { box.innerHTML = '<p class="muted">Enter the bill total to get a QR code.</p>'; return; }
      makeQr(box, splitLink(), 132);
    }, 250);
  }
  function renderSplitDialog() {
    const context = splitContext();
    if (!context) return;
    const { order, model, lines, totals, needsAmount } = context;
    const sub = order ? `${placeName(order)} · ${modeLabel(order)} · ${new Date(keyTime(order)).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}` : 'Type in the total from any receipt, then choose who pays what.';
    $('#splitBody').innerHTML = `
      <h2 id="splitTitle">Split the bill</h2>
      <p class="muted">${esc(sub)}</p>
      ${needsAmount
        ? `<label class="form-field split-amount"><span>Bill total, including tax and tip</span><span class="money-input">$<input id="splitAmount" type="number" min="0" step="0.01" inputmode="decimal" value="${model.amount ? (model.amount / 100).toFixed(2) : ''}" placeholder="0.00"></span></label>`
        : `<p class="split-total">Total <b>${cents(totals.total)}</b> <small>with tax and fees${totals.tip ? ' and tip' : ''}</small></p>`}
      ${SF.splitUI.editor(model, lines, totals, { paid: model.paid })}
      <div class="invite-box">
        <div class="qr-code qr-small" id="splitQr" aria-label="QR code with everyone's share"></div>
        <div>
          <strong>Send everyone their share</strong>
          <p class="field-hint">Friends scan the code or open the link to see what they owe. Settle up in cash or with your usual payment app, or pay at the counter.</p>
          <div class="share-actions"><button type="button" class="button button-secondary button-small" data-split-copy>${icon('copy')} Copy amounts</button><button type="button" class="button button-primary button-small" data-split-share>${icon('share')} Share link</button></div>
        </div>
      </div>
      <button type="button" class="button button-primary button-block" data-close style="margin-top:16px">Done</button>`;
    renderSplitQr();
  }
  function refreshSplitShares() {
    const context = splitContext();
    const box = $('#splitBody [data-split-shares]');
    if (context && box) box.innerHTML = sharesList(context.model, context.lines, context.totals, { paid: context.model.paid });
    renderSplitQr();
  }
  function openSplit() {
    renderSplitDialog();
    const dialog = $('#splitDialog');
    openDialog(dialog);
    dialog.scrollTop = 0;
  }
  function split(orderId) {
    const order = app.orders.get(orderId);
    if (!order) return;
    if (!order.split) {
      const names = (order.guests || []).map(guest => guest.name);
      app.orders.update(orderId, { split: normalizeModel({ method: 'even', count: clamp(order.party || names.length || 2, 2, 12), names, assign: {}, paid: [true] }) });
    }
    splitTarget = { orderId };
    openSplit();
  }
  const customModel = { method: 'even', count: 2, names: [], assign: {}, paid: [true], amount: 0 };
  function splitCustom() {
    splitTarget = { custom: customModel };
    openSplit();
  }
  function splitLatest() {
    const order = app.orders.all().find(item => !item.cancelledAt && (item.totals.total > 0 || tableMode(item)));
    if (order) split(order.id); else splitCustom();
  }
  // Typing saves after a short pause, so other open screens aren't redrawn on every key.
  let splitSaveTimer = 0;
  const saveSplit = ({ soon = false } = {}) => {
    clearTimeout(splitSaveTimer);
    splitSaveTimer = 0;
    if (!splitTarget?.orderId) return;
    if (soon) splitSaveTimer = setTimeout(() => { splitSaveTimer = 0; app.orders.save(); }, 400);
    else app.orders.save();
  };
  // Save anything still waiting when the dialog closes.
  $('#splitDialog').addEventListener('close', () => { if (splitSaveTimer) saveSplit(); });
  const splitDialog = $('#splitDialog');
  splitDialog.addEventListener('click', event => {
    const context = splitContext();
    if (!context) return;
    const paidButton = event.target.closest('[data-split-paid]');
    if (paidButton) {
      const index = Number(paidButton.dataset.splitPaid);
      context.model.paid = Array.from({ length: context.model.count }, (_, i) => Boolean(context.model.paid?.[i]));
      context.model.paid[index] = !context.model.paid[index];
      saveSplit();
      refreshSplitShares();
      $(`[data-split-paid="${index}"]`, splitDialog)?.focus();
      return;
    }
    if (event.target.closest('[data-split-copy]')) { copyText(shareMessage(), 'Amounts copied'); return; }
    if (event.target.closest('[data-split-share]')) { shareText({ title: 'Our bill on SmartFoodie', text: shareMessage(), url: splitLink() }); return; }
    if (SF.splitUI.handleClick(event, context.model)) {
      const active = document.activeElement;
      const selector = active && [...active.attributes].find(attr => attr.name.startsWith('data-split'));
      saveSplit();
      renderSplitDialog();
      if (selector) $(`[${selector.name}="${CSS.escape(selector.value)}"]`, splitDialog)?.focus();
    }
  });
  splitDialog.addEventListener('input', event => {
    const context = splitContext();
    if (!context) return;
    if (event.target.id === 'splitAmount') {
      const value = Number(event.target.value);
      context.model.amount = Number.isFinite(value) && value > 0 ? Math.round(value * 100) : 0;
      saveSplit({ soon: true });
      refreshSplitShares();
      return;
    }
    if (SF.splitUI.handleInput(event, context.model)) { saveSplit({ soon: true }); refreshSplitShares(); }
  });

  // ---------- Reviews with photos (saved on this device) ----------
  const REVIEW_KEY = 'myReviews';
  const validPhoto = photo => (typeof photo === 'string' && photo.startsWith('data:image/') ? photo : null);
  const readReviews = () => (Array.isArray(store.get(REVIEW_KEY, [])) ? store.get(REVIEW_KEY, []) : [])
    .filter(review => review && SF.dishById.has(review.dishId) && review.rating >= 1 && review.rating <= 5 && Number.isFinite(review.createdAt))
    .map(review => ({ ...review, text: String(review.text || '').slice(0, 500), photo: validPhoto(review.photo) }));
  // Photos use most of the storage, so older reviews drop their photo first when space runs out.
  function saveReviews(list) {
    const copy = list.slice(0, 30);
    for (let keep = copy.length; keep >= 0; keep -= 1) {
      const attempt = copy.map((review, index) => (index < keep ? review : { ...review, photo: null }));
      if (store.set(REVIEW_KEY, attempt)) return keep === copy.length ? 'ok' : 'trimmed';
    }
    return 'failed';
  }
  SF.reviews = {
    all: readReviews,
    forDish: dishId => readReviews().filter(review => review.dishId === dishId)
      .map(review => ({ name: 'You', mine: true, rating: review.rating, text: review.text, photo: review.photo, ageMinutes: (Date.now() - review.createdAt) / MINUTE }))
  };

  async function resizePhoto(file) {
    if (!file || !/^image\//.test(file.type)) throw new Error('Choose a photo (JPG, PNG, or HEIC from your camera).');
    if (file.size > 20 * 1024 * 1024) throw new Error('That photo is larger than 20 MB. Choose a smaller one.');
    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("This browser can't open that photo. Try a JPG or PNG."));
        el.src = url;
      });
      const scale = Math.min(1, 640 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.78);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const review = { dishId: null, orderId: null, dishIds: [], rating: 0, photo: null };
  function renderReviewForm() {
    const dish = SF.dishById.get(review.dishId);
    const restaurant = dish && SF.restaurantById.get(dish.restaurantId);
    $('#reviewForm').innerHTML = `
      <h2 id="reviewTitle">Rate your meal</h2>
      ${review.dishIds.length > 1
        ? `<label class="form-field"><span>Dish</span><select id="reviewDish">${review.dishIds.map(id => `<option value="${id}"${id === review.dishId ? ' selected' : ''}>${esc(SF.dishById.get(id).name)}${readReviews().some(item => item.dishId === id && item.orderId === review.orderId) ? ' (rated)' : ''}</option>`).join('')}</select></label>`
        : ''}
      <div class="place-card">${img(dish.image, '', { widths: [120], width: 120, sizes: '56px' })}<div><strong>${esc(dish.name)}</strong><small>${esc(restaurant.name)}</small></div></div>
      <fieldset class="star-fieldset"><legend>Your rating</legend>
        <div class="star-input" data-value="${review.rating}">${[1, 2, 3, 4, 5].map(n => `<label class="star-option"><input type="radio" name="reviewStars" value="${n}"${review.rating === n ? ' checked' : ''}>${icon('star')}<span class="sr-only">${plural(n, 'star')}</span></label>`).join('')}</div>
      </fieldset>
      <label class="form-field"><span>Your review <small>(optional)</small></span><textarea id="reviewText" maxlength="500" placeholder="How was it? Portion, flavor, wait time…"></textarea></label>
      <div class="photo-field">
        <label class="button button-secondary photo-pick">${icon('camera')} ${review.photo ? 'Change photo' : 'Add a photo'}<input type="file" id="reviewPhoto" accept="image/*" class="sr-only"></label>
        ${review.photo ? `<div class="photo-preview"><img src="${esc(review.photo)}" alt="Your photo of ${esc(dish.name)}"><button type="button" class="link-button" data-remove-photo>Remove photo</button></div>` : '<small class="muted">Optional. Photos are shrunk and kept on this device.</small>'}
      </div>
      <p class="form-error" id="reviewError" role="alert" hidden></p>
      <button type="submit" class="button button-primary button-block">Post review</button>
      <p class="sample-note">Your review shows on this dish and in Fresh photos and reviews on this device only.</p>`;
  }
  function writeReview(dishId, orderId = null) {
    const order = orderId ? app.orders.get(orderId) : null;
    const dishIds = order ? [...new Set(order.items.map(item => item.dishId))].filter(id => SF.dishById.has(id)) : [dishId].filter(id => SF.dishById.has(id));
    if (!dishIds.length) return;
    const rated = new Set(readReviews().filter(item => order && item.orderId === order.id).map(item => item.dishId));
    Object.assign(review, { dishId: dishIds.find(id => !rated.has(id)) || dishIds[0], orderId, dishIds, rating: 0, photo: null });
    renderReviewForm();
    openDialog($('#reviewDialog'));
  }
  const reviewForm = $('#reviewForm');
  reviewForm.addEventListener('change', async event => {
    if (event.target.name === 'reviewStars') {
      review.rating = Number(event.target.value);
      $('.star-input', reviewForm).dataset.value = review.rating;
      return;
    }
    if (event.target.id === 'reviewDish') {
      const text = $('#reviewText').value;
      review.dishId = event.target.value;
      renderReviewForm();
      $('#reviewText').value = text;
      return;
    }
    if (event.target.id === 'reviewPhoto') {
      const file = event.target.files?.[0];
      const error = $('#reviewError');
      const text = $('#reviewText').value;
      try {
        review.photo = await resizePhoto(file);
        error.hidden = true;
      } catch (problem) {
        error.textContent = problem.message;
        error.hidden = false;
        return;
      }
      renderReviewForm();
      $('#reviewText').value = text;
    }
  });
  reviewForm.addEventListener('click', event => {
    if (!event.target.closest('[data-remove-photo]')) return;
    const text = $('#reviewText').value;
    review.photo = null;
    renderReviewForm();
    $('#reviewText').value = text;
  });
  reviewForm.addEventListener('submit', event => {
    event.preventDefault();
    const error = $('#reviewError');
    if (!review.rating) {
      error.textContent = 'Choose a star rating.';
      error.hidden = false;
      $('input[name="reviewStars"]', reviewForm).focus();
      return;
    }
    const entry = { id: `R${Date.now().toString(36)}`, dishId: review.dishId, orderId: review.orderId, rating: review.rating, text: $('#reviewText').value.trim().slice(0, 500), photo: review.photo, createdAt: Date.now() };
    const result = saveReviews([entry, ...readReviews()]);
    if (result === 'failed') { error.textContent = "This device is out of storage, so the review couldn't be saved."; error.hidden = false; return; }
    if (review.orderId) app.orders.update(review.orderId, current => ({ reviewed: { ...(current.reviewed || {}), [review.dishId]: true } }));
    $('#reviewDialog').close();
    toast(result === 'trimmed' ? 'Review posted. Older photos were removed to make room.' : 'Thanks! Your review is posted.');
    renderFeed();
    if ($('#dishDialog').open) app.openDish(review.dishId);
  });

  // ---------- Fresh photos and reviews ----------
  let feedCategory = 'all';
  function feedCard(item) {
    const { dish } = item;
    const restaurant = SF.restaurantById.get(dish.restaurantId);
    return `<article class="feed-card${item.mine ? ' is-mine' : ''}">
      <button type="button" class="feed-photo" data-open-dish="${dish.id}" aria-label="${esc(dish.name)}: details and reviews">
        ${item.photo ? `<img src="${esc(item.photo)}" alt="Your photo of ${esc(dish.name)}" loading="lazy">` : img(dish.image, dish.imageAlt, { sizes: '(max-width: 760px) 70vw, 280px' })}
        <span class="feed-time">${item.mine ? 'Your review · ' : ''}${timeAgo(item.ageMinutes)}</span>
      </button>
      <div class="feed-body">
        <div class="review-head"><div class="review-person"><span class="avatar" aria-hidden="true">${esc(initials(item.name))}</span><div><strong>${esc(item.name)}</strong><small>${esc(dish.name)}</small></div></div>${stars(item.rating)}</div>
        ${item.text ? `<p class="feed-text">“${esc(item.text)}”</p>` : ''}
        <button type="button" class="world-rest" data-open-restaurant="${restaurant.id}">${icon('store')}<span>${esc(restaurant.name)}</span></button>
      </div>
    </article>`;
  }
  function renderFeed() {
    const inCategory = dish => SF.dishMatchesCategory(dish, feedCategory);
    const mine = readReviews().map(item => ({ ...item, dish: SF.dishById.get(item.dishId), name: 'You', mine: true, ageMinutes: (Date.now() - item.createdAt) / MINUTE }))
      .filter(item => inCategory(item.dish)).slice(0, 8);
    const sample = SF.dishes.filter(inCategory).flatMap(dish => dish.reviews.map(item => ({ ...item, dish })))
      .filter(item => item.text && item.ageMinutes <= 7 * 1440).sort((a, b) => a.ageMinutes - b.ageMinutes).slice(0, 18);
    const items = [...mine, ...sample];
    $('#feed').hidden = items.length === 0;
    $('#feedRow').innerHTML = items.map(feedCard).join('');
    app.syncAllScrollButtons?.($('#feed'));
  }
  window.addEventListener('sf:category', event => { feedCategory = event.detail.category; renderFeed(); });

  // ---------- A group link a friend opened ----------
  function showGroup(group) {
    const restaurant = SF.restaurantById.get(group.restaurantId);
    const t = new Date();
    const mode = MODES[group.mode];
    const title = restaurant ? (group.host ? `${group.host} invited you` : "You're invited") : 'Your share of the bill';
    $('#groupBody').innerHTML = `
      <h2 id="groupTitle">${esc(title)}</h2>
      ${restaurant ? `<p class="muted">${esc(mode.label)} at ${esc(restaurant.name)} · ${esc(S.formatDayTime(new Date(group.time), t))} · ${plural(group.party, 'person', 'people')}</p>
      <div class="place-card">${img(restaurant.image, '', { widths: [120], width: 120, sizes: '56px' })}<div><strong>${esc(restaurant.name)}</strong><small>${esc(S.openState(restaurant, t).label)} · ${S.formatMiles(restaurant.distance)} away</small></div></div>` : ''}
      ${group.code ? `<div class="code-box"><span>Check-in code · tell the host when you arrive</span><strong>${esc(group.code)}</strong><small>${group.host ? `Booked by ${esc(group.host)}` : 'Shared from SmartFoodie'}</small></div>` : ''}
      ${group.guests.length ? `<p class="detail-label">Who's coming</p><p class="muted">${esc(group.guests.join(', '))}</p>` : ''}
      ${group.shares.length ? `<p class="detail-label" style="margin-top:14px">Each person's share</p>
        <div class="split-shares">${group.shares.map(share => `<div class="share-row"><span class="avatar" aria-hidden="true">${esc(initials(share.name))}</span><span class="share-name">${esc(share.name)}</span><b>${cents(share.cents)}</b></div>`).join('')}</div>
        ${group.total ? `<p class="split-progress">Total ${cents(group.total)}</p>` : ''}
        <p class="field-hint">Find your name and pay that amount${group.host ? ` to ${esc(group.host)}` : ''} or at the counter. SmartFoodie doesn't take payments.</p>` : ''}
      <div class="share-actions" style="margin-top:16px">
        ${restaurant && group.mode === 'reservation' && group.time > Date.now() ? '<button type="button" class="button button-secondary" data-group-calendar>Add to calendar</button>' : ''}
        ${restaurant ? `<button type="button" class="button button-secondary" data-open-restaurant="${restaurant.id}">See the menu</button>` : ''}
        <button type="button" class="button button-primary" data-close>Done</button>
      </div>
      <p class="sample-note">Shared with a SmartFoodie group link (demo). Nothing here is sent to the restaurant.</p>`;
    const dialog = $('#groupDialog');
    dialog.onclick = event => {
      if (event.target.closest('[data-group-calendar]')) downloadCalendar({ id: `${group.code || 'group'}-${group.time}`, start: group.time, title: `Table at ${restaurant.name}`, details: `Check-in code ${group.code}. ${group.host ? `Booked by ${group.host}. ` : ''}Shared from SmartFoodie (demo).` });
      if (event.target.closest('[data-open-restaurant]')) dialog.close();
    };
    dialog.addEventListener('close', () => {
      if (location.hash.startsWith('#group=')) history.replaceState(null, '', location.pathname + location.search);
    }, { once: true });
    openDialog(dialog);
  }
  function openGroupFromLink() {
    if (!location.hash.startsWith('#group=')) return;
    const group = SF.split.decodeGroup(location.hash.slice(7));
    if (group) showGroup(group);
    else toast('That group link is incomplete. Ask your friend to send it again.');
  }
  window.addEventListener('hashchange', openGroupFromLink);

  // ---------- Buttons on order cards, details, and the strip ----------
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-order-view], [data-order-checkin], [data-order-split], [data-order-pickedup], [data-order-cancel], [data-order-reorder], [data-order-rate], [data-order-calendar], [data-order-share], [data-order-copy]');
    if (!button) return;
    const data = button.dataset;
    const id = data.orderView || data.orderCheckin || data.orderSplit || data.orderPickedup || data.orderCancel || data.orderReorder || data.orderRate || data.orderCalendar || data.orderShare || data.orderCopy;
    const order = app.orders.get(id);
    if (!order) return;
    if (data.orderView) { show(id); return; }
    if (data.orderCheckin) { checkIn(id); return; }
    if (data.orderSplit) { split(id); return; }
    if (data.orderPickedup) { app.orders.update(id, { pickedUpAt: Date.now() }); toast('Enjoy your meal! Rate it from Your orders.'); return; }
    if (data.orderCancel) {
      if (window.confirm(`Cancel this ${order.mode === 'reservation' ? 'reservation' : 'order'} at ${placeName(order)}?`)) {
        app.orders.update(id, { cancelledAt: Date.now() });
        toast(order.mode === 'reservation' ? 'Reservation cancelled' : 'Order cancelled');
      }
      return;
    }
    if (data.orderReorder) { app.reorderOrder(id); return; }
    if (data.orderRate) { writeReview(null, id); return; }
    if (data.orderCalendar) {
      downloadCalendar({ id: order.id, start: order.reservedFor, title: `Table at ${placeName(order)} (${plural(order.party || 1, 'person', 'people')})`, details: `Check-in code ${order.code}. Order ${order.id}. Booked with SmartFoodie (demo).` });
      return;
    }
    if (data.orderShare) { shareText({ title: `Join us at ${placeName(order)}`, text: `${modeLabel(order)} at ${placeName(order)}, ${whenText(order)}. Check-in code ${order.code}.`, url: groupLink(order) }); return; }
    if (data.orderCopy) copyText(groupLink(order), 'Group link copied');
  });

  // Keep everything in sync with saved orders and the clock.
  function refresh() {
    updateBadge();
    renderUpcoming();
    if ($('#ordersDialog').open) renderList();
    if ($('#orderDialog').open) renderOrder();
    if (checkinDialog.open) renderCheckin();
  }
  window.addEventListener('sf:orders', refresh);
  window.addEventListener('sf:tick', refresh);
  setInterval(() => { if (!document.hidden) { updateBadge(); renderUpcoming(); } }, 60000);

  SF.orders = { openList, show, checkIn, checkInNext, split, splitCustom, splitLatest, writeReview, status: orderStatus };
  refresh();
  renderFeed();
  // Deferred scripts (including the QR library) have all run by DOMContentLoaded.
  if (document.readyState === 'complete') openGroupFromLink();
  else document.addEventListener('DOMContentLoaded', openGroupFromLink);
})();
