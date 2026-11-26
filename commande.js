/* Sparta Chicken — expérience de commande : panier en tiroir, options par plat,
   zone/frais de livraison, horaires, délai estimé et suivi de commande. */
(() => {
  'use strict';
  const productsEl = document.getElementById('products');
  if (!productsEl) return;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = cents => (Number(cents || 0) / 100).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' });
  const mem = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* stockage indisponible */ } }
  };
  const slug = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const SPICES = [['classique', 'Classique'], ['moyen', 'Moyen'], ['épicé', 'Épicé']];
  function optionSet(category) {
    const c = slug(category);
    if (c.startsWith('poulet') || c.startsWith('menus-fam')) return { spice: true, removals: ['Sauce à part'] };
    if (c.startsWith('burger')) return { spice: false, removals: ['Sans oignon', 'Sans tomate', 'Sans laitue', 'Sans cornichons', 'Sans fromage', 'Sauce à part'] };
    if (c.startsWith('sandwich') || c.startsWith('pita')) return { spice: false, removals: ['Sans oignon', 'Sans tomate', 'Sans laitue', 'Sans mayo', 'Sans fromage', 'Sauce à part'] };
    if (c.startsWith('poutine')) return { spice: false, removals: ['Sauce à part'] };
    if (c.startsWith('salade')) return { spice: false, removals: ['Sans oignon', 'Sans tomate', 'Sans olives', 'Sans fromage', 'Sauce à part'] };
    return { spice: false, removals: [] };
  }

  const ICON = {
    trash: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
    bag: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    back: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5 10 17.5 19 7"/></svg>'
  };

  const S = {
    cart: [], step: 'cart', fulfillment: 'pickup', status: null, quote: null, order: null, track: null,
    busy: false, error: '', form: { name: '', phone: '', email: '', address: '', notes: '' }
  };
  const FINAL = ['completed', 'delivered', 'cancelled'];
  const totals = () => {
    const sub = S.cart.reduce((a, l) => a + l.price_cents * l.quantity, 0);
    const fee = S.fulfillment === 'delivery' ? (S.status ? S.status.delivery_fee_cents : 699) : 0;
    return { sub, fee, total: sub + fee, units: S.cart.reduce((a, l) => a + l.quantity, 0) };
  };
  const lineKey = (id, o) => [id, o.spice || '', [...(o.removals || [])].sort().join(','), (o.note || '').toLowerCase()].join('|');
  const optionText = o => [o.spice ? 'Épices : ' + o.spice : '', ...(o.removals || []), o.note ? '« ' + o.note + ' »' : ''].filter(Boolean).join(' · ');
  const etaText = r => (r ? r.min + '–' + r.max + ' min' : '');
  const etaNow = () => {
    if (!S.status) return null;
    if (S.fulfillment === 'delivery') return S.quote && S.quote.eta_min ? { min: S.quote.eta_min, max: S.quote.eta_max } : S.status.eta.delivery;
    return S.status.eta.pickup;
  };
  const isOpen = () => !S.status || S.status.open;

  /* ---------- Persistance ---------- */
  function saveCart() { mem.set('sparta_cart_v1', { t: Date.now(), cart: S.cart, fulfillment: S.fulfillment }); }
  function loadState() {
    const c = mem.get('sparta_cart_v1');
    if (c && Date.now() - c.t < 6 * 3600 * 1000 && Array.isArray(c.cart)) {
      S.cart = c.cart.filter(l => l && Number.isSafeInteger(l.id) && l.quantity > 0 && l.quantity <= 20).slice(0, 30);
      S.fulfillment = c.fulfillment === 'delivery' ? 'delivery' : 'pickup';
    }
    const cust = mem.get('sparta_customer_v1');
    if (cust) Object.assign(S.form, { name: cust.name || '', phone: cust.phone || '', email: cust.email || '', address: cust.address || '' });
    const o = mem.get('sparta_order_v1');
    if (o && o.id && o.token && Date.now() - o.t < 12 * 3600 * 1000) S.order = o;
    const q = new URLSearchParams(location.search).get('suivi') || '';
    const m = q.match(/^(\d+)-([a-f0-9]{24})$/);
    if (m) { S.order = { id: Number(m[1]), token: m[2], t: Date.now() }; mem.set('sparta_order_v1', S.order); S.step = 'track'; S.openOnLoad = true; }
  }

  /* ---------- Éléments ---------- */
  const drawer = document.createElement('div');
  drawer.className = 'od';
  drawer.innerHTML = '<div class="od-backdrop" data-close></div><aside class="od-panel" role="dialog" aria-modal="true" aria-labelledby="od-title"><header class="od-head" id="od-head"></header><div class="od-body" id="od-body"></div><footer class="od-foot" id="od-foot"></footer></aside>';
  const sheet = document.createElement('div');
  sheet.className = 'os';
  sheet.innerHTML = '<div class="os-backdrop" data-sclose></div><div class="os-panel" role="dialog" aria-modal="true" aria-label="Personnaliser" id="os-panel"></div>';
  const fab = document.createElement('button');
  fab.type = 'button'; fab.className = 'od-fab'; fab.id = 'od-fab';
  const toast = document.createElement('div');
  toast.className = 'od-toast'; toast.setAttribute('role', 'status'); toast.setAttribute('aria-live', 'polite');
  document.body.append(drawer, sheet, fab, toast);
  const head = $('#od-head'), body = $('#od-body'), foot = $('#od-foot');
  let toastTimer;
  function say(msg) { toast.textContent = msg; toast.classList.add('is-on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('is-on'), 2200); }

  /* ---------- Tiroir ---------- */
  let lastFocus = null;
  function openDrawer(step) {
    if (step) S.step = step;
    lastFocus = document.activeElement;
    drawer.classList.add('is-open');
    document.documentElement.classList.add('od-lock');
    renderDrawer();
    refreshStatus();
    if (S.order) refreshTrack();
    setTimeout(() => { const x = $('[data-close].od-x', drawer); if (x) x.focus(); }, 60);
  }
  function closeDrawer() {
    drawer.classList.remove('is-open');
    if (!sheet.classList.contains('is-open')) document.documentElement.classList.remove('od-lock');
    renderFab();
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch { /* ignoré */ } }
  }
  const drawerOpen = () => drawer.classList.contains('is-open');

  function renderFab() {
    const t = totals();
    const active = S.order && S.track && !FINAL.includes(S.track.stage);
    let label = '';
    if (t.units) label = '<span class="od-fab-badge">' + t.units + '</span><span>Voir le panier</span><b>' + money(t.sub) + '</b>';
    else if (active) label = '<span class="od-fab-badge">' + ICON.bag.replace('width="22" height="22"', 'width="16" height="16"') + '</span><span>Suivre ma commande #' + S.order.id + '</span>';
    fab.innerHTML = label;
    fab.classList.toggle('is-visible', Boolean(label) && !drawerOpen() && !sheet.classList.contains('is-open'));
    document.body.classList.toggle('od-has-fab', fab.classList.contains('is-visible'));
  }

  function bannerHtml() {
    if (!S.status) return '';
    if (S.status.open) return '<div class="od-banner is-open"><i></i><span>Ouvert · ' + esc(S.status.today_label) + '</span></div>';
    const why = S.status.paused ? 'Commandes en pause pour le moment' : 'Fermé pour le moment' + (S.status.next_open_label ? ' · ouverture ' + esc(S.status.next_open_label) : '');
    return '<div class="od-banner is-closed"><i></i><span>' + why + '</span></div>';
  }

  function fulfillmentToggle() {
    return '<div class="od-seg" role="group" aria-label="Mode de réception"><button type="button" data-act="ful" data-v="pickup" class="' + (S.fulfillment === 'pickup' ? 'is-on' : '') + '">Ramassage</button><button type="button" data-act="ful" data-v="delivery" class="' + (S.fulfillment === 'delivery' ? 'is-on' : '') + '">Livraison</button></div>';
  }

  function summaryHtml() {
    const t = totals(), eta = etaNow();
    const feeText = S.fulfillment === 'delivery' ? money(t.fee) : '<span class="od-free">Gratuit</span>';
    return '<div class="od-sum"><div><span>Sous-total</span><b>' + money(t.sub) + '</b></div><div><span>' + (S.fulfillment === 'delivery' ? 'Livraison' : 'Ramassage') + '</span><b>' + feeText + '</b></div><div class="od-total"><span>Total avant taxes</span><b>' + money(t.total) + '</b></div></div>' +
      (eta && isOpen() ? '<p class="od-eta">Prêt dans environ <b>' + etaText(eta) + '</b></p>' : '');
  }

  function renderDrawer() {
    if (S.step === 'checkout') return renderCheckout();
    if (S.step === 'done' || S.step === 'track') return renderTrack();
    renderCart();
  }

  /* ----- Vue panier ----- */
  function renderCart() {
    const t = totals();
    head.innerHTML = '<div><h2 class="od-title" id="od-title">Panier</h2><p class="od-sub">' + t.units + ' article' + (t.units > 1 ? 's' : '') + '</p></div><button type="button" class="od-x" data-close aria-label="Fermer">' + ICON.close + '</button>';
    if (!S.cart.length) {
      body.innerHTML = bannerHtml() + '<div class="od-empty"><div class="od-empty-ico">' + ICON.bag + '</div><h3>Ton panier est vide</h3><p>Ajoute un plat du menu pour commencer ta commande.</p></div>' + trackShortcut();
      foot.innerHTML = '<button type="button" class="btn red" data-close>Voir le menu</button>';
      return;
    }
    body.innerHTML = bannerHtml() + '<ul class="od-lines">' + S.cart.map(l => {
      const opt = optionText(l.options || {});
      return '<li class="od-line"><img src="' + esc(l.image || 'grill.jpg') + '" alt=""><div class="od-line-main"><div class="od-line-top"><h3>' + esc(l.name) + '</h3><b>' + money(l.price_cents * l.quantity) + '</b></div>' +
        '<p class="od-line-desc">' + esc(opt || l.description || '') + '</p><button type="button" class="od-edit" data-act="edit" data-key="' + esc(l.key) + '">Modifier</button>' +
        '<div class="od-line-ctl"><div class="od-stepper"><button type="button" data-act="dec" data-key="' + esc(l.key) + '" aria-label="Diminuer ' + esc(l.name) + '">−</button><span>' + l.quantity + '</span><button type="button" data-act="inc" data-key="' + esc(l.key) + '" aria-label="Augmenter ' + esc(l.name) + '">+</button></div>' +
        '<button type="button" class="od-trash" data-act="del" data-key="' + esc(l.key) + '" aria-label="Retirer ' + esc(l.name) + '">' + ICON.trash + '</button>' +
        '</div></div></li>';
    }).join('') + '</ul>' + fulfillmentToggle() + trackShortcut();
    renderCartFoot();
  }
  function renderCartFoot() {
    const closed = !isOpen();
    foot.innerHTML = summaryHtml() +
      '<button type="button" class="btn red" data-act="checkout"' + (closed ? ' disabled' : '') + '>' + (closed ? 'Commandes fermées' : 'Passer la commande') + '</button>' +
      '<button type="button" class="btn outline" data-close>Continuer vos achats</button>';
  }
  function trackShortcut() {
    if (!S.order || (S.track && FINAL.includes(S.track.stage))) return '';
    return '<button type="button" class="od-track-link" data-act="gotrack">Suivre ma commande #' + S.order.id + ' →</button>';
  }

  /* ----- Vue paiement / coordonnées ----- */
  function renderCheckout() {
    const f = S.form, delivery = S.fulfillment === 'delivery';
    head.innerHTML = '<div><button type="button" class="od-back" data-act="back">' + ICON.back + ' Panier</button><h2 class="od-title" id="od-title">Ta commande</h2></div><button type="button" class="od-x" data-close aria-label="Fermer">' + ICON.close + '</button>';
    body.innerHTML = (S.error ? '<p class="od-error" role="alert">' + esc(S.error) + '</p>' : '') + bannerHtml() + fulfillmentToggle() +
      '<form id="od-form" class="od-form" novalidate>' +
      '<label>Nom complet<input name="name" autocomplete="name" maxlength="120" required value="' + esc(f.name) + '"></label>' +
      '<label>Téléphone<input name="phone" type="tel" inputmode="tel" autocomplete="tel" required value="' + esc(f.phone) + '"></label>' +
      '<label>Courriel <small>(facultatif)</small><input name="email" type="email" autocomplete="email" value="' + esc(f.email) + '"></label>' +
      (delivery ? '<label>Adresse de livraison<input name="address" autocomplete="street-address" maxlength="300" placeholder="Numéro, rue, ville, code postal" value="' + esc(f.address) + '"></label><div id="od-quote" class="od-quote" aria-live="polite"></div>' : '') +
      '<label>Instructions pour la commande <small>(facultatif)</small><textarea name="notes" rows="2" maxlength="500" placeholder="Ex. : sonner deux fois, allergie, etc.">' + esc(f.notes) + '</textarea></label>' +
      '<p class="od-note">Paiement : confirmé avec l’équipe à la réception. Le paiement en ligne arrive bientôt.</p>' +
      '<p class="od-note">En commandant, tu acceptes de recevoir des messages (SMS ou courriel) sur cette commande.</p>' +
      '</form>';
    renderCheckoutFoot();
    if (delivery) renderQuote();
  }
  function renderCheckoutFoot() {
    const t = totals(), closed = !isOpen();
    foot.innerHTML = summaryHtml() +
      '<button type="submit" form="od-form" class="btn red" id="od-submit"' + (closed || S.busy ? ' disabled' : '') + '>' + (closed ? 'Commandes fermées' : S.busy ? 'Envoi en cours…' : 'Confirmer ma commande · ' + money(t.total)) + '</button>';
  }
  function renderQuote(state, msg) {
    const el = $('#od-quote'); if (!el) return;
    if (state === 'loading') { el.className = 'od-quote is-loading'; el.textContent = 'Vérification de l’adresse…'; return; }
    if (state === 'error') { el.className = 'od-quote is-error'; el.textContent = msg; return; }
    if (S.quote && S.quote.address === S.form.address.trim()) {
      el.className = 'od-quote is-ok';
      el.innerHTML = '<b>✓ Adresse dans notre zone</b><span>' + S.quote.distance_km.toFixed(1).replace('.', ',') + ' km · frais de livraison ' + money(S.quote.delivery_fee_cents) + (S.quote.eta_min ? ' · environ ' + S.quote.eta_min + '–' + S.quote.eta_max + ' min' : '') + '</span>';
    } else {
      el.className = 'od-quote';
      el.innerHTML = '<span>Livraison dans un rayon de ' + (S.status ? S.status.delivery_radius_km : 15) + ' km · ' + money(S.status ? S.status.delivery_fee_cents : 699) + '. Entre ton adresse pour la vérifier.</span>';
    }
  }
  async function checkAddress() {
    const addr = S.form.address.trim();
    if (addr.length < 8) { renderQuote('error', 'Entre ton adresse complète (numéro, rue, ville).'); return false; }
    if (S.quote && S.quote.address === addr) return true;
    renderQuote('loading');
    try {
      const r = await fetch('/api/delivery/check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: addr, units: totals().units }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Adresse non admissible.');
      S.quote = { ...d, address: addr };
      renderQuote(); renderCheckoutFoot();
      return true;
    } catch (e) { S.quote = null; renderQuote('error', e.message || 'Adresse non admissible.'); return false; }
  }

  async function submitOrder() {
    if (S.busy) return;
    const f = S.form;
    S.error = '';
    if (!f.name.trim() || !/^[+()0-9 .-]{7,25}$/.test(f.phone.trim())) { S.error = 'Vérifie ton nom et ton numéro de téléphone.'; return renderCheckout(); }
    if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) { S.error = 'Le courriel ne semble pas valide.'; return renderCheckout(); }
    if (S.fulfillment === 'delivery' && !(await checkAddress())) { S.error = 'Vérifie l’adresse de livraison.'; return renderCheckout(); }
    S.busy = true; renderCheckoutFoot();
    try {
      const payload = {
        customer_name: f.name.trim(), customer_phone: f.phone.trim(), customer_email: f.email.trim(), fulfillment: S.fulfillment,
        address: S.fulfillment === 'delivery' ? f.address.trim() : '', notes: f.notes.trim(),
        items: S.cart.map(l => ({ product_id: l.id, quantity: l.quantity, options: l.options || {} }))
      };
      const r = await fetch('/api/orders', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { if (d.closed) await refreshStatus(); throw new Error(d.error || 'La commande n’a pas pu être enregistrée.'); }
      mem.set('sparta_customer_v1', { name: f.name.trim(), phone: f.phone.trim(), email: f.email.trim(), address: f.address.trim() });
      S.order = { id: d.order_id, token: d.tracking_token, t: Date.now(), notifications: d.notifications || {}, eta_min: d.eta_min, eta_max: d.eta_max };
      mem.set('sparta_order_v1', S.order);
      S.cart = []; S.quote = null; S.form.notes = ''; saveCart();
      S.track = { id: d.order_id, stage: 'received', label: 'Commande reçue', fulfillment: S.fulfillment, steps: stepsLocal(S.fulfillment), items: [], eta_min: d.eta_min, eta_max: d.eta_max, total_cents: d.total_cents, subtotal_cents: d.subtotal_cents, delivery_fee_cents: d.delivery_fee_cents };
      S.step = 'done'; S.busy = false; renderDrawer(); renderFab(); refreshTrack();
    } catch (e) { S.busy = false; S.error = e.message; renderCheckout(); }
  }
  const stepsLocal = ful => [['received', 'Commande reçue'], ['preparing', 'En préparation'], ['ready', 'Prête']].concat(ful === 'delivery' ? [['on_the_way', 'En route'], ['delivered', 'Livrée']] : []).map(([key, label]) => ({ key, label }));

  /* ----- Vue suivi ----- */
  function renderTrack() {
    const tr = S.track, o = S.order;
    head.innerHTML = '<div><h2 class="od-title" id="od-title">Suivi de commande</h2><p class="od-sub">' + (o ? 'Commande #' + o.id : '') + '</p></div><button type="button" class="od-x" data-close aria-label="Fermer">' + ICON.close + '</button>';
    if (!o) { body.innerHTML = '<p class="od-empty">Aucune commande à suivre.</p>'; foot.innerHTML = '<button type="button" class="btn red" data-close>Voir le menu</button>'; return; }
    if (!tr) { body.innerHTML = '<p class="od-sub">Chargement du suivi…</p>'; foot.innerHTML = ''; return; }
    const cancelled = tr.stage === 'cancelled', idx = tr.steps.findIndex(s => s.key === tr.stage);
    const finished = FINAL.includes(tr.stage) && !cancelled;
    const eta = tr.eta_min ? tr.eta_min + '–' + tr.eta_max + ' min' : '';
    const sent = o.notifications || {}, via = [sent.sms ? 'SMS' : '', sent.email ? 'courriel' : ''].filter(Boolean).join(' et ');
    body.innerHTML = '<div class="od-done ' + (cancelled ? 'is-bad' : '') + '"><div class="od-check">' + (cancelled ? ICON.close : ICON.check) + '</div><h3>' + esc(cancelled ? 'Commande annulée' : tr.label) + '</h3>' +
      (!cancelled && !finished && eta ? '<p class="od-eta">Délai estimé : environ <b>' + eta + '</b></p>' : '') +
      (cancelled ? '<p class="od-sub">Appelle-nous si tu as une question.</p>' : '') + '</div>' +
      (cancelled ? '' : '<ol class="od-steps">' + tr.steps.map((s, i) => '<li class="' + (finished || i < idx ? 'is-done' : i === idx ? 'is-now' : '') + '"><i></i><span>' + esc(s.label) + '</span></li>').join('') + '</ol>') +
      (via ? '<p class="od-note">Un message de confirmation t’a été envoyé par ' + via + '. Tu seras aussi prévenu quand ta commande sera prête.</p>' : '') +
      (tr.items && tr.items.length ? '<div class="od-recap"><h4>Ta commande</h4><ul>' + tr.items.map(i => '<li><span>' + esc(i.quantity + ' × ' + i.name) + (i.options ? '<small>' + esc(optionText(i.options)) + '</small>' : '') + '</span><b>' + money(i.line_total_cents) + '</b></li>').join('') + '</ul><div class="od-recap-total"><span>Total avant taxes</span><b>' + money(tr.total_cents) + '</b></div></div>' : '');
    foot.innerHTML = (finished || cancelled ? '<button type="button" class="btn red" data-act="newOrder">Nouvelle commande</button>' : '') + '<button type="button" class="btn outline" data-close>Retour au menu</button>';
  }
  async function refreshTrack() {
    if (!S.order) return;
    try {
      const r = await fetch('/api/orders/track?id=' + S.order.id + '&token=' + S.order.token, { cache: 'no-store' });
      if (r.status === 404) { S.order = null; S.track = null; mem.del('sparta_order_v1'); if (drawerOpen() && (S.step === 'done' || S.step === 'track')) { S.step = 'cart'; renderDrawer(); } renderFab(); return; }
      if (!r.ok) return;
      const d = await r.json();
      const changed = !S.track || S.track.stage !== d.stage;
      S.track = d;
      if (drawerOpen() && (S.step === 'done' || S.step === 'track')) renderTrack();
      if (changed) renderFab();
    } catch { /* réseau instable : on réessaie au prochain cycle */ }
  }
  setInterval(() => { if (!document.hidden && S.order && !(S.track && FINAL.includes(S.track.stage))) refreshTrack(); }, 20000);

  /* ----- Statut du restaurant ----- */
  async function refreshStatus() {
    try {
      const r = await fetch('/api/store/status', { cache: 'no-store' });
      if (!r.ok) return;
      S.status = await r.json();
      renderHub(); renderTopBanner();
      if (drawerOpen()) { if (S.step === 'cart') renderDrawer(); else if (S.step === 'checkout') renderCheckoutFoot(); }
    } catch { /* hors ligne */ }
  }
  setInterval(() => { if (!document.hidden) refreshStatus(); }, 60000);

  function renderTopBanner() {
    let el = $('#od-top-banner');
    if (!el) { el = document.createElement('div'); el.id = 'od-top-banner'; productsEl.parentNode.insertBefore(el, productsEl); }
    el.innerHTML = bannerHtml().replace('od-banner', 'od-banner od-banner-top');
  }
  function renderHub() {
    const hub = $('#order-hub'); if (!hub || !S.status) return;
    const st = S.status, t = totals();
    hub.innerHTML = '<div class="oh-card"><span class="eyebrow">COMMANDER EN LIGNE</span><h2>Ta commande, <em>sans attente</em></h2>' +
      '<p class="oh-lead">Choisis tes plats, personnalise-les, puis suis ta commande en direct.</p>' +
      bannerHtml() +
      '<div class="oh-grid"><div><b>Ramassage</b><span>Prêt dans environ ' + etaText(st.eta.pickup) + '</span></div><div><b>Livraison</b><span>Rayon de ' + st.delivery_radius_km + ' km · ' + money(st.delivery_fee_cents) + '</span></div><div><b>Aujourd’hui</b><span>' + esc(st.today_label) + '</span></div></div>' +
      '<button type="button" class="btn red" data-open>' + (t.units ? 'Ouvrir mon panier · ' + t.units + ' article' + (t.units > 1 ? 's' : '') : 'Ouvrir mon panier') + '</button>' +
      (S.order && !(S.track && FINAL.includes(S.track.stage)) ? '<button type="button" class="btn outline" data-open-track>Suivre ma commande #' + S.order.id + '</button>' : '') +
      '<details class="oh-hours"><summary>Voir tous les horaires</summary><ul>' + st.hours.map(h => '<li><span>' + esc(h.day.charAt(0).toUpperCase() + h.day.slice(1)) + '</span><b>' + esc(h.label) + '</b></li>').join('') + '</ul></details></div>';
  }

  /* ---------- Fenêtre d’options ---------- */
  let sheetState = null;
  function openSheet(p, existing) {
    const set = optionSet(p.category);
    const o = existing ? (existing.options || {}) : {};
    sheetState = { p, set, qty: existing ? existing.quantity : 1, spice: o.spice || (set.spice ? 'classique' : ''), removals: new Set(o.removals || []), note: o.note || '', editKey: existing ? existing.key : null };
    renderSheet();
    sheet.classList.add('is-open');
    document.documentElement.classList.add('od-lock');
    renderFab();
    setTimeout(() => { const x = $('.os-x', sheet); if (x) x.focus(); }, 60);
  }
  function closeSheet() {
    sheet.classList.remove('is-open');
    if (!drawerOpen()) document.documentElement.classList.remove('od-lock');
    sheetState = null; renderFab();
  }
  function sheetTotal() { return sheetState.p.price_cents * sheetState.qty; }
  function renderSheet() {
    const { p, set } = sheetState;
    $('#os-panel').innerHTML = '<button type="button" class="os-x" data-sclose aria-label="Fermer">' + ICON.close + '</button>' +
      '<div class="os-hero"><img src="' + esc(p.image_url || 'grill.jpg') + '" alt=""></div>' +
      '<div class="os-body"><span class="os-tag">' + esc(p.category || '') + '</span><h3>' + esc(p.name) + '</h3><p class="os-desc">' + esc(p.description || '') + '</p><p class="os-price">' + money(p.price_cents) + '</p>' +
      (set.spice ? '<fieldset class="os-group"><legend>Niveau d’épices</legend><div class="os-chips">' + SPICES.map(([v, l]) => '<label class="os-chip"><input type="radio" name="spice" value="' + v + '"' + (sheetState.spice === v ? ' checked' : '') + '><span>' + l + '</span></label>').join('') + '</div></fieldset>' : '') +
      (set.removals.length ? '<fieldset class="os-group"><legend>Retirer ou ajuster</legend><div class="os-chips">' + set.removals.map(r => '<label class="os-chip"><input type="checkbox" name="rm" value="' + esc(r) + '"' + (sheetState.removals.has(r) ? ' checked' : '') + '><span>' + esc(r) + '</span></label>').join('') + '</div></fieldset>' : '') +
      '<label class="os-note">Note pour ce plat <small>(facultatif)</small><input name="note" maxlength="120" placeholder="Ex. : bien cuit, sans sésame…" value="' + esc(sheetState.note) + '"></label></div>' +
      '<div class="os-foot"><div class="od-stepper"><button type="button" data-sact="dec" aria-label="Diminuer">−</button><span id="os-qty">' + sheetState.qty + '</span><button type="button" data-sact="inc" aria-label="Augmenter">+</button></div><button type="button" class="btn red" data-sact="confirm" id="os-confirm">' + (sheetState.editKey ? 'Mettre à jour' : 'Ajouter') + ' · ' + money(sheetTotal()) + '</button></div>';
  }
  function sheetConfirm() {
    const { p, qty, editKey } = sheetState;
    const options = {};
    if (sheetState.set.spice && sheetState.spice) options.spice = sheetState.spice;
    if (sheetState.removals.size) options.removals = [...sheetState.removals];
    if (sheetState.note.trim()) options.note = sheetState.note.trim().slice(0, 120);
    const key = lineKey(p.id, options);
    if (editKey) S.cart = S.cart.filter(l => l.key !== editKey || key === editKey);
    const found = S.cart.find(l => l.key === key);
    if (found) found.quantity = Math.min(20, (editKey === key ? 0 : found.quantity) + qty);
    else {
      if (S.cart.length >= 30) { say('Ton panier est plein (30 lignes maximum).'); return; }
      S.cart.push({ key, id: p.id, name: p.name, price_cents: Number(p.price_cents), quantity: Math.min(20, qty), image: p.image_url || '', description: p.description || '', category: p.category || '', options });
    }
    saveCart(); closeSheet(); renderFab(); renderHub();
    say(p.name + ' ajouté au panier');
    if (drawerOpen()) renderDrawer();
  }

  /* ---------- Événements ---------- */
  document.addEventListener('click', e => {
    const t = e.target;
    if (t.closest('[data-close]') && drawer.contains(t.closest('[data-close]'))) { closeDrawer(); return; }
    if (t.closest('[data-sclose]')) { closeSheet(); return; }
    if (t.closest('[data-open]')) { openDrawer('cart'); return; }
    if (t.closest('[data-open-track]')) { openDrawer('track'); return; }
    if (t.closest('#od-fab')) { openDrawer(S.cart.length ? 'cart' : 'track'); return; }
    const s = t.closest('[data-sact]');
    if (s && sheetState) {
      const a = s.dataset.sact;
      if (a === 'inc') sheetState.qty = Math.min(20, sheetState.qty + 1);
      else if (a === 'dec') sheetState.qty = Math.max(1, sheetState.qty - 1);
      else if (a === 'confirm') { sheetConfirm(); return; }
      $('#os-qty').textContent = sheetState.qty; $('#os-confirm').textContent = (sheetState.editKey ? 'Mettre à jour' : 'Ajouter') + ' · ' + money(sheetTotal());
      return;
    }
    const b = t.closest('[data-act]');
    if (!b || !drawer.contains(b)) return;
    const act = b.dataset.act, key = b.dataset.key, line = S.cart.find(l => l.key === key);
    if (act === 'inc' && line) line.quantity = Math.min(20, line.quantity + 1);
    else if (act === 'dec' && line) { line.quantity -= 1; if (line.quantity < 1) S.cart = S.cart.filter(l => l !== line); }
    else if (act === 'del') S.cart = S.cart.filter(l => l.key !== key);
    else if (act === 'edit' && line) { openSheet({ id: line.id, name: line.name, description: line.description, price_cents: line.price_cents, image_url: line.image, category: line.category }, line); return; }
    else if (act === 'ful') { S.fulfillment = b.dataset.v === 'delivery' ? 'delivery' : 'pickup'; if (S.fulfillment === 'pickup') S.quote = null; }
    else if (act === 'checkout') { if (!isOpen()) return; S.step = 'checkout'; S.error = ''; renderDrawer(); return; }
    else if (act === 'back') { S.step = 'cart'; S.error = ''; renderDrawer(); return; }
    else if (act === 'gotrack') { S.step = 'track'; renderDrawer(); refreshTrack(); return; }
    else if (act === 'newOrder') { S.order = null; S.track = null; mem.del('sparta_order_v1'); S.step = 'cart'; renderDrawer(); renderFab(); renderHub(); return; }
    else return;
    saveCart(); renderDrawer(); renderFab(); renderHub();
  });
  document.addEventListener('change', e => {
    if (!sheetState) return;
    const el = e.target;
    if (el.name === 'spice') sheetState.spice = el.value;
    else if (el.name === 'rm') { el.checked ? sheetState.removals.add(el.value) : sheetState.removals.delete(el.value); }
  });
  document.addEventListener('input', e => {
    const el = e.target;
    if (sheetState && el.name === 'note' && sheet.contains(el)) { sheetState.note = el.value; return; }
    if (!drawer.contains(el) || !el.name) return;
    if (el.name in S.form) { S.form[el.name] = el.value; if (el.name === 'address') { S.quote = null; renderQuote(); renderCheckoutFoot(); } }
  });
  document.addEventListener('focusout', e => { if (e.target && e.target.name === 'address' && drawer.contains(e.target) && S.fulfillment === 'delivery' && e.target.value.trim().length >= 8) checkAddress(); });
  document.addEventListener('submit', e => { if (e.target && e.target.id === 'od-form') { e.preventDefault(); submitOrder(); } });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (sheet.classList.contains('is-open')) closeSheet(); else if (drawerOpen()) closeDrawer(); return; }
    if (e.key !== 'Tab') return;
    const box = sheet.classList.contains('is-open') ? sheet : drawerOpen() ? drawer : null; if (!box) return;
    const f = $$('button:not([disabled]),input,textarea,select,a[href]', box).filter(x => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  /* ---------- API publique (utilisée par app.js) ---------- */
  window.SpartaOrder = { add(p) { openSheet({ id: Number(p.id), name: p.name, description: p.description, price_cents: Number(p.price_cents), image_url: p.image_url, category: p.category }); }, open() { openDrawer('cart'); } };

  loadState();
  renderFab(); renderHub();
  refreshStatus();
  if (S.order) refreshTrack().then(() => { if (S.openOnLoad) openDrawer('track'); });
  else if (location.hash === '#online-checkout' && S.cart.length) openDrawer('cart');
})();
