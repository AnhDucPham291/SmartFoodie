// Split the bill: evenly or by who had what, in integer cents so the shares always add up to the
// exact total. Also encodes a group link (reservation details, check-in code, and each person's
// share) that friends can open on their own phones. Pure functions, so they also run in Node.
(function (root) {
  const SF = root.SF || (root.SF = {});

  // Splits `total` cents into whole-cent parts proportional to `weights` (largest remainder
  // method). Equal parts when every weight is 0.
  function allocate(total, weights) {
    const count = weights.length;
    if (!count) return [];
    const clean = weights.map(weight => (Number.isFinite(weight) && weight > 0 ? weight : 0));
    const sum = clean.reduce((a, b) => a + b, 0);
    const shares = sum > 0 ? clean.map(weight => weight / sum) : clean.map(() => 1 / count);
    const exact = shares.map(share => share * total);
    const parts = exact.map(Math.floor);
    let rest = total - parts.reduce((a, b) => a + b, 0);
    const order = exact.map((value, index) => [value - Math.floor(value), index]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    for (let k = 0; rest > 0; k = (k + 1) % count) { parts[order[k][1]] += 1; rest -= 1; }
    return parts;
  }

  /**
   * @param {object} bill
   * @param {'even'|'items'} bill.method
   * @param {number} bill.count  number of people
   * @param {{cents:number, people:number[]}[]} [bill.lines]  each line's cost and who shares it
   *   (person indexes); an empty list means everyone shares it
   * @param {number} bill.subtotal  food subtotal in cents
   * @param {number} bill.total  amount to split in cents (food, fees, tax, and tip)
   * @returns {{totals:number[], food:number[]}} cents per person
   * By item, fees, tax, and tip are shared in proportion to what each person ordered.
   */
  function computeShares({ method = 'even', count = 1, lines = [], subtotal = 0, total = 0 }) {
    const people = Math.max(1, Math.floor(count));
    const everyone = [...Array(people).keys()];
    if (method === 'items' && lines.length && subtotal > 0) {
      const weights = Array(people).fill(0);
      lines.forEach(line => {
        const who = (line.people || []).filter(index => index >= 0 && index < people);
        const sharedBy = who.length ? who : everyone;
        sharedBy.forEach(index => { weights[index] += line.cents / sharedBy.length; });
      });
      return { totals: allocate(total, weights), food: allocate(subtotal, weights) };
    }
    const equal = Array(people).fill(1);
    return { totals: allocate(total, equal), food: allocate(subtotal, equal) };
  }

  // ---------- Group link ----------
  // UTF-8 safe base64url, so names like "Bảo" survive the trip through a URL.
  function toBase64Url(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromBase64Url(text) {
    const binary = atob(String(text).replace(/-/g, '+').replace(/_/g, '/'));
    return new TextDecoder().decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
  }

  const MODES = ['dinein', 'reservation', 'pickup'];
  const cleanText = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
  const cleanInt = (value, min, max) => {
    const number = Math.round(Number(value));
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : null;
  };

  /**
   * A group link holds only what friends need: restaurant id, order type, time, party size,
   * check-in code, the host's name, the guest list, and (optionally) everyone's share.
   */
  function encodeGroup(group) {
    const data = {
      v: 1,
      r: group.restaurantId,
      m: group.mode,
      t: Math.round(group.time / 60000),
      n: group.party,
      c: group.code,
      o: group.host,
      g: (group.guests || []).slice(0, 20),
      s: group.shares ? group.shares.slice(0, 20).map(share => [share.name, share.cents]) : undefined,
      a: group.total
    };
    return toBase64Url(JSON.stringify(data));
  }

  // Returns a clean group object, or null if the link is broken. Link contents are untrusted.
  function decodeGroup(text) {
    let data;
    try { data = JSON.parse(fromBase64Url(String(text).slice(0, 4000))); } catch { return null; }
    if (!data || data.v !== 1 || typeof data.r !== 'string') return null;
    const time = cleanInt(data.t, 0, 1e9);
    if (time == null) return null;
    const shares = Array.isArray(data.s)
      ? data.s.slice(0, 20).map(row => (Array.isArray(row) ? { name: cleanText(row[0], 40), cents: cleanInt(row[1], 0, 1e7) } : null)).filter(share => share && share.name && share.cents != null)
      : [];
    return {
      restaurantId: cleanText(data.r, 40),
      mode: MODES.includes(data.m) ? data.m : 'reservation',
      time: time * 60000,
      party: cleanInt(data.n, 1, 20) || 1,
      code: cleanText(data.c, 8).toUpperCase().replace(/[^A-Z0-9]/g, ''),
      host: cleanText(data.o, 40),
      guests: Array.isArray(data.g) ? data.g.slice(0, 20).map(name => cleanText(name, 40)).filter(Boolean) : [],
      shares,
      total: cleanInt(data.a, 0, 1e8)
    };
  }

  SF.split = { allocate, computeShares, encodeGroup, decodeGroup };
  if (typeof module !== 'undefined' && module.exports) module.exports = SF;
})(typeof window !== 'undefined' ? window : globalThis);
