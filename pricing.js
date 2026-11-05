// Order pricing: subtotal, fees, sales tax, tip, and total.
// All math runs in integer cents so totals never drift by a cent.
(function (root) {
  const SF = root.SF || (root.SF = {});

  // Statewide base sales tax rate for prepared/restaurant food (percent). Local city/county
  // add-ons are not included, so the real tax on a receipt can be higher. Several states use
  // a separate meals tax for restaurant food; that rate is used where it applies.
  const TAX_RATES = {
    AL: ['Alabama', 4], AK: ['Alaska', 0], AZ: ['Arizona', 5.6], AR: ['Arkansas', 6.5], CA: ['California', 7.25],
    CO: ['Colorado', 2.9], CT: ['Connecticut', 7.35], DE: ['Delaware', 0], DC: ['District of Columbia', 10], FL: ['Florida', 6],
    GA: ['Georgia', 4], HI: ['Hawaii', 4], ID: ['Idaho', 6], IL: ['Illinois', 6.25], IN: ['Indiana', 7],
    IA: ['Iowa', 6], KS: ['Kansas', 6.5], KY: ['Kentucky', 6], LA: ['Louisiana', 5], ME: ['Maine', 8],
    MD: ['Maryland', 6], MA: ['Massachusetts', 6.25], MI: ['Michigan', 6], MN: ['Minnesota', 6.875], MS: ['Mississippi', 7],
    MO: ['Missouri', 4.225], MT: ['Montana', 0], NE: ['Nebraska', 5.5], NV: ['Nevada', 6.85], NH: ['New Hampshire', 8.5],
    NJ: ['New Jersey', 6.625], NM: ['New Mexico', 4.875], NY: ['New York', 4], NC: ['North Carolina', 4.75], ND: ['North Dakota', 5],
    OH: ['Ohio', 5.75], OK: ['Oklahoma', 4.5], OR: ['Oregon', 0], PA: ['Pennsylvania', 6], RI: ['Rhode Island', 8],
    SC: ['South Carolina', 6], SD: ['South Dakota', 4.2], TN: ['Tennessee', 7], TX: ['Texas', 6.25], UT: ['Utah', 6.1],
    VT: ['Vermont', 9], VA: ['Virginia', 5.3], WA: ['Washington', 6.5], WV: ['West Virginia', 6], WI: ['Wisconsin', 5],
    WY: ['Wyoming', 4]
  };

  const FEES = {
    serviceRate: 0.05,        // 5% of the food subtotal...
    serviceMinCents: 100,     // ...at least $1.00
    serviceMaxCents: 500,     // ...at most $5.00
    smallOrderThresholdCents: 1000,
    smallOrderFeeCents: 200   // added when the food subtotal is under $10
  };

  const toCents = dollars => Math.round(Number(dollars) * 100);
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  // Percent of an amount in cents, rounded half-up. Rates are scaled to integers first
  // (6.875% -> 6875) so the multiplication is exact.
  const percentOf = (cents, percent) => Math.round(cents * Math.round(percent * 1000) / 100000);

  SF.TAX_RATES = TAX_RATES;
  SF.FEES = FEES;
  SF.taxRateFor = stateCode => (TAX_RATES[stateCode] ? TAX_RATES[stateCode][1] : 0);
  SF.formatMoney = cents => `${cents < 0 ? '-' : ''}$${(Math.abs(cents) / 100).toFixed(2)}`;

  /**
   * @param {object} order
   * @param {{price:number, quantity:number, restaurantId:string}[]} order.items
   * @param {'delivery'|'pickup'} order.mode
   * @param {string} order.state  two-letter state code used for sales tax
   * @param {Object<string, number>} order.deliveryFees  delivery fee in dollars per restaurant id
   * @param {number} [order.tipPercent]  percent of the food subtotal (delivery only)
   * @param {number|null} [order.tipAmount]  custom tip in dollars (delivery only); overrides tipPercent
   * Returns every line in cents plus the tax rate used.
   */
  SF.computeTotals = ({ items = [], mode = 'delivery', state = '', deliveryFees = {}, tipPercent = 0, tipAmount = null } = {}) => {
    const lines = items.filter(item => item.quantity > 0);
    const subtotal = lines.reduce((sum, item) => sum + toCents(item.price) * item.quantity, 0);
    const restaurantIds = [...new Set(lines.map(item => item.restaurantId))];
    const delivery = mode === 'delivery' && subtotal > 0
      ? restaurantIds.reduce((sum, id) => sum + toCents(deliveryFees[id] || 0), 0)
      : 0;
    const service = subtotal > 0 ? clamp(Math.round(subtotal * FEES.serviceRate), FEES.serviceMinCents, FEES.serviceMaxCents) : 0;
    const smallOrder = subtotal > 0 && subtotal < FEES.smallOrderThresholdCents ? FEES.smallOrderFeeCents : 0;
    const taxRate = SF.taxRateFor(state);
    // Sales tax is estimated on the food subtotal.
    const tax = percentOf(subtotal, taxRate);
    let tip = 0;
    if (mode === 'delivery' && subtotal > 0) {
      tip = tipAmount != null && Number.isFinite(Number(tipAmount))
        ? Math.max(0, toCents(tipAmount))
        : percentOf(subtotal, Math.max(0, tipPercent || 0));
    }
    const totalBeforeTip = subtotal + delivery + service + smallOrder + tax;
    return {
      subtotal, delivery, service, smallOrder, tax, tip, taxRate,
      restaurantCount: restaurantIds.length,
      totalBeforeTip,
      total: totalBeforeTip + tip
    };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = SF;
})(typeof window !== 'undefined' ? window : globalThis);
