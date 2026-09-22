(() => {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Central State                                                       */
  /* ------------------------------------------------------------------ */
  const state = {
    recipientName: '',
    relationship: '',
    deliveryAddress: '',
    occasion: '',
    notes: '',
    budget: 3000,
    giftTypes: [],
    themes: [],
    selectedTheme: null,
    currency: 'INR',
    currencySymbol: '₹',
    currencyRate: 1,
  };

  const SCREEN_ORDER = ['home', 'recipient', 'occasion', 'budget', 'theme', 'checkout', 'confirm'];
  const PROGRESS_MAP = {
    recipient: 'recipient', occasion: 'occasion', budget: 'budget',
    theme: 'theme', checkout: 'checkout', confirm: 'checkout'
  };

  let currentScreen = 'home';
  let particlesActive = true;

  // Same-origin API base (server serves this frontend and the API together).
  const API_BASE = '';
  let lastOrderId = null;

  /* ------------------------------------------------------------------ */
  /* Currency Configuration                                              */
  /* ------------------------------------------------------------------ */
  const CURRENCY_MAP = {
    INR: { symbol: '₹',   rate: 1,       locale: 'en-IN', decimals: 0 },
    USD: { symbol: '$',   rate: 0.012,   locale: 'en-US', decimals: 2 },
    GBP: { symbol: '£',   rate: 0.0093,  locale: 'en-GB', decimals: 2 },
    NPR: { symbol: 'Rs.', rate: 1.6,     locale: 'en-NP', decimals: 0 },
    JPY: { symbol: '¥',   rate: 1.82,    locale: 'ja-JP', decimals: 0 },
    KRW: { symbol: '₩',   rate: 15.8,   locale: 'ko-KR', decimals: 0 },
  };

  /* ------------------------------------------------------------------ */
  /* Helpers                                                              */
  /* ------------------------------------------------------------------ */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  function announce(msg) {
    const live = $('#live-announcer');
    live.textContent = '';
    requestAnimationFrame(() => { live.textContent = msg; });
  }

  /* ------------------------------------------------------------------ */
  /* Particle System                                                     */
  /* ------------------------------------------------------------------ */
  function initParticles() {
    const canvas = $('#particleCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let particles = [];
    let animId = null;

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    const PARTICLE_COUNT = window.matchMedia('(max-width: 760px)').matches ? 15 : 30;

    class Particle {
      constructor() { this.reset(); }
      reset() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 2.5 + 0.5;
        this.speedX = (Math.random() - 0.5) * 0.4;
        this.speedY = (Math.random() - 0.5) * 0.4;
        this.opacity = Math.random() * 0.3 + 0.05;
        this.hue = Math.random() * 40 + 320;
      }
      update() {
        this.x += this.speedX;
        this.y += this.speedY;
        if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) this.reset();
      }
      draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${this.hue}, 50%, 60%, ${this.opacity})`;
        ctx.fill();
      }
    }

    for (let i = 0; i < PARTICLE_COUNT; i++) particles.push(new Particle());

    function animate() {
      if (!particlesActive) { animId = requestAnimationFrame(animate); return; }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => { p.update(); p.draw(); });

      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(180, 160, 170, ${0.06 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      animId = requestAnimationFrame(animate);
    }
    animate();

    // Pause when not visible
    document.addEventListener('visibilitychange', () => {
      particlesActive = !document.hidden;
    });
  }

  /* ------------------------------------------------------------------ */
  /* Counter Animation                                                   */
  /* ------------------------------------------------------------------ */
  function animateCounters() {
    $$('.meta-num[data-count]').forEach(el => {
      const target = parseInt(el.dataset.count);
      const duration = 1500;
      const start = performance.now();

      function update(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 4);
        const current = Math.round(eased * target);

        if (target === 50) {
          el.textContent = current === target ? '∞' : current + '+';
        } else {
          el.textContent = current;
        }

        if (progress < 1) requestAnimationFrame(update);
      }
      requestAnimationFrame(update);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Screen Navigation                                                   */
  /* ------------------------------------------------------------------ */
  function showScreen(name, opts = {}) {
    $$('.screen').forEach(s => s.classList.remove('is-active'));
    const target = $(`#screen-${name}`);
    target.classList.add('is-active');
    currentScreen = name;

    const heading = target.querySelector('h1, h2');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: false });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });

    updateProgress(name);
    if (opts.announceText) announce(opts.announceText);

    // Trigger animations on home screen
    if (name === 'home') {
      animateCounters();
    }
  }

  function updateProgress(screenName) {
    const stepKey = PROGRESS_MAP[screenName];
    $$('#progressList li').forEach(li => {
      li.classList.remove('is-current', 'is-done');
      if (!stepKey) return;
      const order = ['recipient', 'occasion', 'budget', 'theme', 'checkout'];
      const liIdx = order.indexOf(li.dataset.step);
      const curIdx = order.indexOf(stepKey);
      if (liIdx === curIdx) li.classList.add('is-current');
      else if (liIdx < curIdx) li.classList.add('is-done');
    });
  }

  function setFieldError(id, message) {
    const errEl = $(`#err-${id}`);
    const fieldEl = $(`#${id}`);
    if (errEl) errEl.textContent = message || '';
    const wrap = fieldEl ? fieldEl.closest('.field') : null;
    if (wrap) wrap.classList.toggle('has-error', Boolean(message));
  }

  /* ------------------------------------------------------------------ */
  /* Currency & Price Formatting                                         */
  /* ------------------------------------------------------------------ */
  function getCurrencyConfig() {
    return CURRENCY_MAP[state.currency] || CURRENCY_MAP.INR;
  }

  function formatPrice(amount, options = {}) {
    const cfg = getCurrencyConfig();
    const useSymbol = options.symbol !== false;
    const symbol = useSymbol ? cfg.symbol : '';
    const converted = Math.round(amount * cfg.rate);

    if (state.currency === 'INR') {
      return symbol + converted.toLocaleString(cfg.locale);
    }
    if (state.currency === 'USD' || state.currency === 'GBP') {
      return symbol + (amount * cfg.rate).toFixed(cfg.decimals);
    }
    return symbol + converted.toLocaleString(cfg.locale);
  }

  function updateCurrencyUI() {
    const cfg = getCurrencyConfig();
    // Update budget display
    syncBudgetDisplay();
    // Update hero currency symbol
    const heroCur = $('#heroCurrency');
    if (heroCur) heroCur.textContent = cfg.symbol;
    // Update price summary if visible
    updatePriceSummary();
  }

  function updatePriceSummary() {
    const subtotalEl = $('#priceSubtotal');
    const totalEl = $('#priceTotal');
    const noteEl = $('#priceNote');
    if (subtotalEl) subtotalEl.textContent = formatPrice(state.budget);
    if (totalEl) totalEl.textContent = formatPrice(state.budget);
    if (noteEl) noteEl.textContent = `Prices shown in ${state.currency}`;
  }

  function syncBudgetDisplay() {
    const budgetValue = $('#budgetValue');
    if (budgetValue) {
      budgetValue.textContent = formatPrice(state.budget);
    }
    // Update range slider fill
    updateRangeProgress();
  }

  function updateRangeProgress() {
    const range = $('#budgetRange');
    if (!range) return;
    const min = parseInt(range.min);
    const max = parseInt(range.max);
    const val = parseInt(range.value);
    const pct = ((val - min) / (max - min)) * 100;
    range.style.setProperty('--range-progress', pct + '%');
  }

  /* ------------------------------------------------------------------ */
  /* Occasion Theme                                                      */
  /* ------------------------------------------------------------------ */
  const OCCASION_META = {
    birthday:    { mood: 'Lively & bright',  badge: 'Confetti-bright' },
    anniversary: { mood: 'Romantic & soft',  badge: 'Rose & blush' },
    festival:    { mood: 'Golden & festive', badge: 'Marigold glow' },
    sorry:       { mood: 'Calm & gentle',    badge: 'Soft apology' },
    congrats:    { mood: 'Fresh & proud',    badge: 'Bright success' },
    other:       { mood: 'Considered',       badge: 'Quietly elegant' },
  };

  function applyOccasionTheme(occasion) {
    document.body.dataset.occasion = occasion || 'default';
  }

  /* ------------------------------------------------------------------ */
  /* HOME                                                                 */
  /* ------------------------------------------------------------------ */
  $('#btnStart').addEventListener('click', () => {
    showScreen('recipient', { announceText: 'Recipient details. Step 1 of 5.' });
  });

  /* ------------------------------------------------------------------ */
  /* RECIPIENT                                                            */
  /* ------------------------------------------------------------------ */
  const formRecipient = $('#formRecipient');
  formRecipient.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#recipientName').value.trim();
    const relationship = $('#relationship').value;
    const address = $('#deliveryAddress').value.trim();

    let valid = true;
    if (!name) { setFieldError('recipientName', "Please enter a name."); valid = false; }
    else setFieldError('recipientName', '');

    if (!relationship) { setFieldError('relationship', "Please choose a relationship."); valid = false; }
    else setFieldError('relationship', '');

    if (!address) { setFieldError('deliveryAddress', "Please enter a delivery address."); valid = false; }
    else setFieldError('deliveryAddress', '');

    if (!valid) {
      announce('Please fix the highlighted fields.');
      const firstError = formRecipient.querySelector('.has-error input, .has-error select, .has-error textarea');
      if (firstError) firstError.focus();
      return;
    }

    state.recipientName = name;
    state.relationship = relationship;
    state.deliveryAddress = address;

    showScreen('occasion', { announceText: 'Occasion. Step 2 of 5.' });
  });

  /* ------------------------------------------------------------------ */
  /* OCCASION                                                             */
  /* ------------------------------------------------------------------ */
  const occasionGrid = $('#occasionGrid');
  occasionGrid.addEventListener('click', (e) => {
    const card = e.target.closest('.occasion-card');
    if (!card) return;
    $$('.occasion-card', occasionGrid).forEach(c => {
      c.classList.remove('is-selected');
      c.setAttribute('aria-pressed', 'false');
    });
    card.classList.add('is-selected');
    card.setAttribute('aria-pressed', 'true');
    state.occasion = card.dataset.occasion;
    setFieldError('occasion', '');
    applyOccasionTheme(state.occasion);
    const meta = OCCASION_META[state.occasion];
    announce(`${card.querySelector('.occasion-label').textContent} selected. Theme set to ${meta.mood}.`);
  });

  occasionGrid.addEventListener('keydown', (e) => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
    const cards = $$('.occasion-card', occasionGrid);
    const idx = cards.indexOf(document.activeElement);
    if (idx === -1) return;
    e.preventDefault();
    let next = idx;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % cards.length;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + cards.length) % cards.length;
    cards[next].focus();
  });

  $('#btnOccasionNext').addEventListener('click', () => {
    if (!state.occasion) {
      setFieldError('occasion', 'Please choose an occasion.');
      announce('Please choose an occasion.');
      return;
    }
    state.notes = $('#notes').value.trim();
    showScreen('budget', { announceText: 'Budget and gift type. Step 3 of 5.' });
  });

  /* ------------------------------------------------------------------ */
  /* CURRENCY SELECTOR                                                    */
  /* ------------------------------------------------------------------ */
  const currencyOptions = $('#currencyOptions');
  if (currencyOptions) {
    currencyOptions.addEventListener('click', (e) => {
      const chip = e.target.closest('.currency-chip');
      if (!chip) return;

      $$('.currency-chip', currencyOptions).forEach(c => c.classList.remove('active'));
      chip.classList.add('active');

      state.currency = chip.dataset.currency;
      state.currencySymbol = chip.dataset.symbol;
      state.currencyRate = parseFloat(chip.dataset.rate);

      updateCurrencyUI();
      announce(`Currency changed to ${state.currency}`);
    });
  }

  /* ------------------------------------------------------------------ */
  /* BUDGET & GIFT TYPE                                                   */
  /* ------------------------------------------------------------------ */
  const budgetRange = $('#budgetRange');
  budgetRange.addEventListener('input', () => {
    state.budget = Number(budgetRange.value);
    syncBudgetDisplay();
  });
  syncBudgetDisplay();

  // Budget presets
  $$('.preset-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      $$('.preset-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const value = parseInt(chip.dataset.value);
      budgetRange.value = value;
      state.budget = value;
      syncBudgetDisplay();
    });
  });

giftTypeGrid.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip-card');
  if (!chip) return;
  const pressed = chip.getAttribute('aria-pressed') === 'true';
  chip.setAttribute('aria-pressed', String(!pressed));
  setFieldError('giftType', '');
});

  $('#btnGenerate').addEventListener('click', () => {
    const selected = $$('.chip-card[aria-pressed="true"]', giftTypeGrid).map(c => c.dataset.gifttype);
    if (selected.length === 0) {
      setFieldError('giftType', 'Please choose at least one gift type.');
      announce('Please choose at least one gift type.');
      return;
    }
    state.budget = Number(budgetRange.value);
    state.giftTypes = selected;

    showScreen('theme', { announceText: 'Generating theme ideas. Step 4 of 5.' });
    runThemeGeneration();
  });

  /* ------------------------------------------------------------------ */
  /* AI THEME (deterministic, simulated)                                  */
  /* ------------------------------------------------------------------ */
  const PALETTES = {
    birthday: ['sherbet orange', 'sunshine yellow', 'candy pink'],
    anniversary: ['blush rose', 'champagne gold', 'soft burgundy'],
    festival: ['marigold gold', 'deep maroon', 'warm copper'],
    sorry: ['dusty lavender', 'powder blue', 'sage grey'],
    congrats: ['emerald green', 'mint', 'brushed gold'],
    other: ['warm plum', 'cream', 'soft taupe'],
  };
  const TONES = {
    birthday: 'Playful & celebratory',
    anniversary: 'Romantic & intimate',
    festival: 'Festive & abundant',
    sorry: 'Gentle & sincere',
    congrats: 'Bright & proud',
    other: 'Considered & warm',
  };
  const ITEM_BANK = {
    Food: ['artisanal chocolate box', 'gourmet snack trail', 'a small celebration cake', 'curated tea or coffee set'],
    Flowers: ['a hand-tied seasonal bouquet', 'a potted orchid', 'a single statement bloom arrangement', 'dried flower keepsake bunch'],
    Electronics: ['a compact Bluetooth speaker', 'a smart photo frame', 'wireless earbuds', 'a sleek desk lamp'],
    'Custom Hamper': ['a themed keepsake hamper', 'a personalised welcome box', 'a curated self-care hamper', 'a memory-jar gift set'],
  };
  const MESSAGE_IDEAS = {
    birthday: 'A bright card that reads: "Another year, even more you."',
    anniversary: 'A handwritten note: "Still choosing you, every year."',
    festival: 'A festive tag: "Wishing you light, warmth, and good company."',
    sorry: 'A soft note: "I\'m sorry — let\'s make it right, together."',
    congrats: 'A bold card: "You earned every bit of this."',
    other: 'A simple note: "Thinking of you, today and always."',
  };
  // Estimated price ranges per gift type (in INR)
  const PRICE_RANGES = {
    Food: { low: 300, high: 1500 },
    Flowers: { low: 400, high: 1200 },
    Electronics: { low: 800, high: 3000 },
    'Custom Hamper': { low: 500, high: 2000 },
  };

  function seededIndex(seedStr, mod) {
    let hash = 0;
    for (let i = 0; i < seedStr.length; i++) {
      hash = (hash * 31 + seedStr.charCodeAt(i)) >>> 0;
    }
    return hash % mod;
  }

  function generateThemes() {
    const occasion = state.occasion || 'other';
    const palette = PALETTES[occasion] || PALETTES.other;
    const tone = TONES[occasion] || TONES.other;
    const giftTypes = state.giftTypes.length ? state.giftTypes : ['Custom Hamper'];
    const budgetBand = state.budget < 1500 ? 'thoughtful & compact' : state.budget < 6000 ? 'generously composed' : 'premium & elaborate';
    const name = state.recipientName || 'them';
    const relationship = state.relationship || 'someone special';

    const themeNamePool = {
      birthday: ['Sunlit Celebration', 'Confetti Hour', 'Golden Birthday Hour'],
      anniversary: ['Quiet Romance', 'Two, Always', 'Blush & Candlelight'],
      festival: ['Festival of Light', 'Marigold Evening', 'Glow & Gather'],
      sorry: ['Soft Apology', 'Gentle Reset', 'A Calm Reconciliation'],
      congrats: ['Well Earned', 'Toast to You', 'Bright Milestone'],
      other: ['Quiet Gesture', 'Thoughtful Pause', 'Made for You'],
    };
    const names = themeNamePool[occasion] || themeNamePool.other;

    const themes = [];
    const count = 3 + (giftTypes.length > 2 ? 1 : 0);
    for (let i = 0; i < Math.min(count, names.length + 1); i++) {
      const seed = `${occasion}-${name}-${relationship}-${state.budget}-${giftTypes.join(',')}-${i}`;
      const themeName = names[i % names.length] + (i >= names.length ? ' — Encore' : '');
      const color1 = palette[seededIndex(seed + 'c1', palette.length)];
      const color2 = palette[(seededIndex(seed + 'c2', palette.length) + 1) % palette.length];
      const gType = giftTypes[i % giftTypes.length];
      const items = ITEM_BANK[gType] || ITEM_BANK['Custom Hamper'];
      const item1 = items[seededIndex(seed + 'i1', items.length)];
      const item2 = items[(seededIndex(seed + 'i2', items.length) + 1) % items.length];

      // Calculate estimated price
      const range = PRICE_RANGES[gType] || PRICE_RANGES['Custom Hamper'];
      const budgetRatio = state.budget / 20000;
      const estPrice = Math.round(range.low + (range.high - range.low) * (0.3 + budgetRatio * 0.7));
      // Distribute across items
      const item1Price = Math.round(estPrice * 0.55);
      const item2Price = estPrice - item1Price;

      themes.push({
        name: themeName,
        concept: `A ${budgetBand} idea built around ${color1} and ${color2}, designed for a ${relationship.toLowerCase()} on this occasion.`,
        items: `${item1}, ${item2}`,
        itemPrices: [item1Price, item2Price],
        tone,
        message: MESSAGE_IDEAS[occasion] || MESSAGE_IDEAS.other,
        palette: `${color1} + ${color2}`,
        totalPrice: estPrice,
        giftType: gType,
      });
    }
    return themes;
  }

  function renderThemes(themes) {
    const loader = $('#themeLoader');
    const grid = $('#themeGrid');
    const actions = $('#themeActions');

    state.themes = themes;
    state.selectedTheme = themes[0];

    grid.innerHTML = themes.map((t, i) => `
      <article class="theme-card${i === 0 ? ' is-selected-theme' : ''}" data-index="${i}">
        <div class="theme-card-head">
          <h3 class="theme-name">${escapeHTML(t.name)}</h3>
          <span class="theme-tone">${escapeHTML(t.tone)}</span>
        </div>
        <p class="theme-concept">${escapeHTML(t.concept)}</p>
        <div class="theme-row"><strong>Palette</strong><span>${escapeHTML(t.palette)}</span></div>
        <div class="theme-row"><strong>Suggested</strong><span>${escapeHTML(t.items)}</span></div>
        <div class="theme-price-tag">${formatPrice(t.totalPrice)}</div>
        <div class="theme-card-foot">${escapeHTML(t.message)}</div>
      </article>
    `).join('');

    // Theme card selection
    $$('.theme-card', grid).forEach(card => {
      card.addEventListener('click', () => {
        $$('.theme-card', grid).forEach(c => c.classList.remove('is-selected-theme'));
        card.classList.add('is-selected-theme');
        const idx = parseInt(card.dataset.index);
        state.selectedTheme = themes[idx];
      });
    });

    loader.style.display = 'none';
    grid.hidden = false;
    actions.hidden = false;
    announce(`${themes.length} theme ideas generated.`);
  }

  async function runThemeGeneration() {
    const loader = $('#themeLoader');
    const grid = $('#themeGrid');
    const actions = $('#themeActions');

    loader.style.display = 'flex';
    grid.hidden = true;
    actions.hidden = true;
    grid.innerHTML = '';

    $('#themeSubName').textContent = state.recipientName || 'your recipient';

    try {
      const res = await fetch(`${API_BASE}/api/themes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientName: state.recipientName,
          relationship: state.relationship,
          occasion: state.occasion,
          notes: state.notes,
          budget: state.budget,
          giftTypes: state.giftTypes,
          currency: state.currency,
        }),
      });

      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data.themes) || data.themes.length === 0) throw new Error('No themes returned');

      renderThemes(data.themes);
    } catch (err) {
      // Backend unreachable or errored — fall back to the local generator so
      // the flow still works (e.g. offline demo, missing API key on server).
      console.warn('Theme API failed, using local fallback:', err.message);
      const themes = generateThemes();
      themes.forEach((t, i) => {
        const scaleFactor = 0.95 - (i * 0.10);
        t.totalPrice = Math.max(Math.round(state.budget * scaleFactor), 15);
      });
      renderThemes(themes);
    }
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  $('#btnToCheckout').addEventListener('click', () => {
    buildCheckoutSummary();
    showScreen('checkout', { announceText: 'Review your gift before confirming.' });
  });

  /* ------------------------------------------------------------------ */
  /* CHECKOUT                                                             */
  /* ------------------------------------------------------------------ */
  function buildCheckoutSummary() {
    const list = $('#summaryList');
    const themeName = state.selectedTheme ? state.selectedTheme.name : '—';
    const themeTotal = state.selectedTheme ? state.selectedTheme.totalPrice : state.budget;
    const rows = [
      ['Recipient', `${state.recipientName} · ${state.relationship}`],
      ['Occasion', capitalize(state.occasion)],
      ['Budget', formatPrice(state.budget)],
      ['Gift types', state.giftTypes.join(', ')],
      ['Theme', themeName],
      ['Estimated', formatPrice(themeTotal)],
      ['Delivery address', state.deliveryAddress],
    ];
    list.innerHTML = rows.map(([label, value]) => `
      <div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd></div>
    `).join('');

    // Update checkout banner
    const banner = $('#checkoutBanner');
    const themeNameEl = $('#checkoutThemeName');
    if (banner && state.selectedTheme) {
      banner.style.background = 'var(--surface-2)';
    }
    if (themeNameEl) themeNameEl.textContent = state.selectedTheme ? state.selectedTheme.name : 'Selected Theme';

    // Update price summary
    updatePriceSummary();
  }

  function capitalize(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  async function submitOrder() {
    const payload = {
      recipientName: state.recipientName,
      relationship: state.relationship,
      deliveryAddress: state.deliveryAddress,
      occasion: state.occasion,
      notes: state.notes,
      budget: state.budget,
      currency: state.currency,
      giftTypes: state.giftTypes,
      selectedTheme: state.selectedTheme,
    };

    try {
      const res = await fetch(`${API_BASE}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const order = await res.json();
      return order.orderId;
    } catch (err) {
      // Backend unreachable — still let the user complete the flow, with a
      // locally generated reference id.
      console.warn('Order API failed, using local order id:', err.message);
      return `LOCAL-${Date.now().toString(36).toUpperCase()}`;
    }
  }

  $('#btnConfirm').addEventListener('click', async () => {
    const confirmBtn = $('#btnConfirm');
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Confirming…';

    const orderId = await submitOrder();
    lastOrderId = orderId;

    const themeName = state.selectedTheme ? state.selectedTheme.name.toLowerCase() : 'curated';
    $('#confirmDetail').textContent =
      `A ${themeName} gift is being arranged for ${state.recipientName}, delivered to the address you provided.`;

    // Build receipt
    buildReceipt(orderId);

    // Set confetti positions
    $$('.confirm-confetti span').forEach((el, i) => {
      const angles = [45, 90, 135, 225, 270, 315];
      const dist = 60 + Math.random() * 40;
      const angle = (angles[i] || Math.random() * 360) * Math.PI / 180;
      const tx = Math.cos(angle) * dist + 'px';
      const ty = Math.sin(angle) * dist + 'px';
      const rot = (Math.random() * 360) + 'deg';
      el.style.setProperty('--tx', tx);
      el.style.setProperty('--ty', ty);
      el.style.setProperty('--rot', rot);
    });

    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Confirm Gift';
    showScreen('confirm', { announceText: 'Gift confirmed and on its way.' });
  });

  function buildReceipt(orderId) {
    const dateEl = $('#receiptDate');
    const bodyEl = $('#receiptBody');
    const totalEl = $('#receiptTotal');

    if (dateEl) {
      const now = new Date();
      dateEl.textContent = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    if (bodyEl) {
      const themeTotal = state.selectedTheme ? state.selectedTheme.totalPrice : state.budget;
      bodyEl.innerHTML = `
        ${orderId ? `<div class="receipt-row"><span class="receipt-label">Order ID</span><span class="receipt-value">${escapeHTML(orderId)}</span></div>` : ''}
        <div class="receipt-row"><span class="receipt-label">For</span><span class="receipt-value">${escapeHTML(state.recipientName)}</span></div>
        <div class="receipt-row"><span class="receipt-label">Occasion</span><span class="receipt-value">${capitalize(state.occasion)}</span></div>
        <div class="receipt-row"><span class="receipt-label">Theme</span><span class="receipt-value">${state.selectedTheme ? escapeHTML(state.selectedTheme.name) : '—'}</span></div>
        <div class="receipt-row"><span class="receipt-label">Gift Type</span><span class="receipt-value">${escapeHTML(state.giftTypes.join(', '))}</span></div>
      `;
    }

    if (totalEl) {
      const themeTotal = state.selectedTheme ? state.selectedTheme.totalPrice : state.budget;
      totalEl.innerHTML = `
        <span>Total</span>
        <span>${formatPrice(themeTotal)}</span>
      `;
    }
  }

  $('#btnStartOver').addEventListener('click', () => {
    Object.assign(state, {
      recipientName: '', relationship: '', deliveryAddress: '',
      occasion: '', notes: '', budget: 3000, giftTypes: [], themes: [], selectedTheme: null,
    });
    lastOrderId = null;
    formRecipient.reset();
    $$('.occasion-card', occasionGrid).forEach(c => {
      c.classList.remove('is-selected');
      c.setAttribute('aria-pressed', 'false');
    });
    $('#notes').value = '';
    budgetRange.value = 3000;
    syncBudgetDisplay();
    $$('.chip-card', giftTypeGrid).forEach(c => c.setAttribute('aria-pressed', 'false'));
    // Reset presets
    $$('.preset-chip').forEach(c => c.classList.remove('active'));
    const defaultPreset = $('.preset-chip[data-value="3000"]');
    if (defaultPreset) defaultPreset.classList.add('active');
    applyOccasionTheme('default');
    showScreen('home', { announceText: 'Back to the start.' });
  });

  /* ------------------------------------------------------------------ */
  /* Back navigation (shared)                                             */
  /* ------------------------------------------------------------------ */
  $$('[data-back]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.back;
      showScreen(target, { announceText: `Back to ${target}.` });
    });
  });

  /* ------------------------------------------------------------------ */
  /* Mobile menu toggle                                                   */
  /* ------------------------------------------------------------------ */
  const menuToggle = $('#menuToggle');
  // Replace your existing menuToggle event listener with this:
if (menuToggle) {
  menuToggle.addEventListener('click', () => {
    const expanded = menuToggle.getAttribute('aria-expanded') === 'true';
    menuToggle.setAttribute('aria-expanded', String(!expanded));
    
    const progress = $('.progress-trail');
    if (progress) {
      // Toggle an active class name instead of applying deep inline string overrides
      progress.classList.toggle('is-mobile-open', !expanded);
    }
  });
}

  /* ------------------------------------------------------------------ */
  /* Init                                                                 */
  /* ------------------------------------------------------------------ */
  initParticles();
  applyOccasionTheme('default');
  updateRangeProgress();
  showScreen('home');
})();
