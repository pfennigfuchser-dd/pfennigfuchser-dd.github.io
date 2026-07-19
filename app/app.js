/* Pfennigfuchser App — liest die tägliche today.json (dieselbe, die der Tageslauf pusht).
   Kein Konto, kein Tracker, kein Fremd-Request. Merkliste + Onboarding-Flag lokal (localStorage).
   USP: nie eine erfundene Zahl. Fehlt ein Beleg, steht "heute kein Beleg". */
(function () {
  "use strict";

  var CHAIN_CLASS = { Aldi: "aldi", Lidl: "lidl", Netto: "netto", Rewe: "rewe", Penny: "penny", Kaufland: "kaufland" };
  // Ketten, die wir tatsächlich beziehen (chains.json aktiv). Aldi hat KEINE Quelle -> nicht dabei.
  // Eine Quelle der Wahrheit: Nenner der Beleg-Dichte UND Kettenliste im Onboarding.
  var SOURCED_CHAINS = ["Lidl", "Netto", "Penny", "Kaufland", "Rewe"];
  var LS_KEY = "pf_liste", OB_KEY = "pf_onboarded";
  var SHARE_URL = "https://pfennigfuchser-dd.github.io/app/";
  var DATA = null, itemById = {}, editing = false, lastLoad = 0, shownDate = null;
  var radar = { sort: "kategorie", cat: "alle", chain: "alle" };
  var sheetTrigger = null, sheetOpen = false, infoTrigger = null;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function fmtDate(iso) { var p = (iso || "").split("-"); return p.length === 3 ? p[2] + "." + p[1] + "." + p[0] : "–"; }
  function fmtDateShort(iso) { var p = (iso || "").split("-"); return p.length === 3 ? p[2] + "." + p[1] + "." : "–"; }
  function chainSpan(name) { return '<span class="chain ' + (CHAIN_CLASS[name] || "") + '">' + esc(name) + "</span>"; }
  function eur(s) { var n = parseFloat(String(s).replace(/[^0-9,.-]/g, "").replace(/\./g, "").replace(",", ".")); return isNaN(n) ? 0 : n; }
  function fmtEur(n) { return n.toFixed(2).replace(".", ",") + " €"; }
  // Grundpreis-Cents aus "1,10 €/100 g" -> 110 ; Einheit -> "€/100 g"
  function centsFromPrice(s) { var m = String(s || "").match(/(\d+)[.,](\d{2})/); return m ? parseInt(m[1], 10) * 100 + parseInt(m[2], 10) : null; }
  function unitFromPrice(s) { var m = String(s || "").match(/€\s*(\/\s*\S.*)?$/); return m && m[1] ? "€" + m[1].replace(/\s+/g, " ").replace(/€/, "") : "€"; }

  function getListe() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch (e) { return []; } }
  function setListe(a) { try { localStorage.setItem(LS_KEY, JSON.stringify(a)); } catch (e) {} }
  function getFlag(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function setFlag(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  // ---- Daten laden -----------------------------------------------------------
  function load() {
    var tries = ["today.json", "../today.json", "/today.json"];
    (function next(i) {
      if (i >= tries.length) { fail(); return; }
      fetch(tries[i] + "?t=" + Date.now(), { cache: "no-store" })
        .then(function (r) { if (!r.ok) throw 0; return r.json(); })
        .then(function (d) { DATA = d; lastLoad = Date.now(); render(); })
        .catch(function () { next(i + 1); });
    })(0);
  }
  function fail() {
    $("heute-body").innerHTML = '<p class="mut center small">Der heutige Bon ist noch nicht geladen. '
      + 'Prüfe deine Verbindung — oder schau in den <a href="https://whatsapp.com/channel/0029Vb8NHt37j6g4Fl8fg63E">WhatsApp-Kanal</a>.</p>';
  }

  function render() {
    var d = DATA;
    if (!d || !d.date) { fail(); return; }
    itemById = {}; (d.items || []).forEach(function (it) { itemById[it.id] = it; });
    if (d.catalog && d.catalog.length) {
      var valid = {}; d.catalog.forEach(function (p) { valid[p.id] = 1; });
      var cur = getListe(), cleaned = cur.filter(function (id) { return valid[id]; });
      if (cleaned.length !== cur.length) setListe(cleaned);
    }
    if (shownDate && shownDate !== d.date) radar = { sort: "kategorie", cat: "alle", chain: "alle" };
    shownDate = d.date;
    var src = (d.sources || []).join(", ");
    $("datebar").textContent = "STAND: " + fmtDate(d.date) + (src ? " · Quelle: " + src : "");
    $("usp-stand").textContent = "Angaben ohne Gewähr · Stand " + fmtDate(d.date) + ".";
    $("demo-banner").hidden = !d.is_demo;
    renderHeute(d);
    renderRadar(d);
    renderListe(d);
    if (!getFlag(OB_KEY)) openInfo(true);
  }

  // ---- gemeinsame Zeile (Heute + Radar): Kopf öffnet das Detail-Sheet --------
  function offerRowHTML(it, lead) {
    var c = it.cheapest || {};
    var promo = c.is_promo ? ' <span class="promo">%</span>' : "";
    var hasSave = it.savings && it.savings !== "0,00 €";
    var belegt = (it.offers || []).length;
    var dichte = belegt <= 1 ? "nur 1 Kette belegt" : belegt + " von " + SOURCED_CHAINS.length + " Ketten belegt";
    return '<div class="row"><div class="rowhead" role="button" tabindex="0" aria-haspopup="dialog" data-id="' + esc(it.id) + '">'
      + '<div class="l1"><span class="pname">' + lead + esc(it.name) + promo + "</span>"
      + '<span class="price">' + esc(c.price || "—") + "</span></div>"
      + '<div class="l2"><span class="spec">' + esc((c.brand ? c.brand + " · " : "") + (it.spec || "")) + "</span>" + chainSpan(c.chain || "") + "</div>"
      + '<div class="l3"><span class="chev">▸ Detail</span>'
      + (hasSave ? '<span class="save">' + esc(it.savings) + (c.vs ? " unter " + esc(c.vs) : "") + "</span>" : '<span class="cover mut small">' + dichte + "</span>")
      + "</div></div></div>";
  }
  function bindRows(container) {
    container.querySelectorAll(".rowhead[data-id]").forEach(function (head) {
      function go() { var it = itemById[head.getAttribute("data-id")]; if (it) openDetail(it, head); }
      head.addEventListener("click", go);
      head.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    });
  }

  // ---- Ansicht HEUTE ---------------------------------------------------------
  function renderHeute(d) {
    var items = d.items || [];
    if (!items.length) {
      $("heute-body").innerHTML = '<div class="head"><div class="claim">Wo ist es heute am günstigsten?</div></div>'
        + '<hr class="dash"><p class="mut center small">Heute liegt noch kein belegter Bon vor. Lieber Lücke als Lüge — '
        + 'schau später wieder rein oder in den WhatsApp-Kanal.</p>';
      return;
    }
    var total = (d.catalog && d.catalog.length) ? d.catalog.length : items.length;
    var html = '<div class="head"><div class="claim">Wo ist es heute am günstigsten?</div>';
    if (d.basket_savings) html += '<div class="basket">Bis ' + esc(d.basket_savings) + " günstiger als die teuerste Kette</div>";
    html += "</div>";
    html += '<div class="sum"><span>' + items.length + " VON " + total + " HEUTE VERGLEICHBAR</span><span>" + esc(fmtDate(d.date)) + "</span></div>";
    html += '<hr class="dash">';
    items.forEach(function (it, i) { html += offerRowHTML(it, (i + 1) + ". "); });
    if (d.fun_fact) html += '<hr class="dash"><div class="fakt"><b>FUCHS-FAKT</b> ' + esc(d.fun_fact) + "</div>";
    html += '<div class="bon-actions"><button id="share" class="btn share" type="button">Bon teilen</button></div>';
    html += '<div class="disclaimer">* Angebots-/Onlinepreise. % = Aktion · Eigenmarken-Vergleich per Grundpreis · Preise je Filiale abweichend. Von keiner Kette bezahlt.</div>';
    html += '<div class="served">ES BEDIENTE SIE: DER PFENNIGFUCHSER</div>';
    var body = $("heute-body");
    body.innerHTML = html;
    bindRows(body);
    var sb = $("share"); if (sb) sb.addEventListener("click", function () { shareBon(d); });
  }

  // ---- Ansicht RADAR (S3) ----------------------------------------------------
  function belegteKetten(d) {
    var set = {}; (d.items || []).forEach(function (it) { if (it.cheapest && it.cheapest.chain) set[it.cheapest.chain] = 1; });
    return SOURCED_CHAINS.filter(function (c) { return set[c]; });
  }
  function belegteKategorien(d) {
    var seen = {}, out = [];
    (d.items || []).forEach(function (it) { var c = it.category || ""; if (c && !seen[c]) { seen[c] = 1; out.push(c); } });
    return out;
  }
  function chipRow(label, values, active, group) {
    var chips = ['<button class="chip sm' + (active === "alle" ? " on" : "") + '" data-group="' + group + '" data-val="alle" aria-pressed="' + (active === "alle") + '">Alle</button>'];
    values.forEach(function (v) {
      var on = active === v;
      var inner = group === "chain" ? chainSpan(v) : esc(v);
      chips.push('<button class="chip sm' + (on ? " on" : "") + '" data-group="' + group + '" data-val="' + esc(v) + '" aria-pressed="' + on + '">' + inner + "</button>");
    });
    return '<div class="rlabel">' + label + '</div><div class="chiprow">' + chips.join("") + "</div>";
  }
  function renderRadar(d) {
    var body = $("radar-body");
    var items = d.items || [];
    var total = (d.catalog && d.catalog.length) ? d.catalog.length : items.length;
    if (!items.length) {
      body.innerHTML = '<div class="radar-head"><div class="rtitle">ANGEBOTS-RADAR</div></div>'
        + '<p class="mut center small pad-t">Heute liegt noch kein belegtes Angebot vor. Lieber Lücke als Lüge.</p>';
      return;
    }
    var cats = belegteKategorien(d), chains = belegteKetten(d);
    var allPromo = items.every(function (it) { return it.cheapest && it.cheapest.is_promo; });
    var head = '<div class="radar-head">'
      + '<div class="rtitle">ANGEBOTS-RADAR</div>'
      + '<div class="sum"><span>' + items.length + " VON " + total + " HEUTE BELEGT</span><span>" + esc(fmtDate(d.date)) + "</span></div>"
      + '<div class="mut small rintro">Heutige Angebote sortieren und filtern. Nichts vorsortiert. Die Reihenfolge ist keine Empfehlung.</div></div>';
    var ctrl = '<div class="radar-controls">'
      + '<div class="rlabel">SORTIEREN</div><div class="segrow">'
      + '<button class="seg' + (radar.sort === "kategorie" ? " on" : "") + '" data-sort="kategorie" aria-pressed="' + (radar.sort === "kategorie") + '">Kategorie</button>'
      + '<button class="seg' + (radar.sort === "ersparnis" ? " on" : "") + '" data-sort="ersparnis" aria-pressed="' + (radar.sort === "ersparnis") + '">Größte Ersparnis</button>'
      + '<button class="seg' + (radar.sort === "az" ? " on" : "") + '" data-sort="az" aria-pressed="' + (radar.sort === "az") + '">A–Z</button>'
      + "</div>"
      + chipRow("KATEGORIE", cats, radar.cat, "cat")
      + chipRow("KETTE", chains, radar.chain, "chain")
      + (allPromo ? '<div class="mut small rhint">Heute sind alle ' + items.length + " Angebote Aktionen (%).</div>" : "")
      + '<div class="radar-meta"><span id="radar-count"></span></div>'
      + "</div>";
    body.innerHTML = head + ctrl + '<div id="radar-list"></div>' + radarNobelegHTML(d);
    body.querySelectorAll(".seg").forEach(function (b) {
      b.addEventListener("click", function () { radar.sort = b.dataset.sort; renderRadar(d); });
    });
    body.querySelectorAll(".chip.sm").forEach(function (b) {
      b.addEventListener("click", function () {
        if (b.dataset.group === "cat") radar.cat = b.dataset.val; else radar.chain = b.dataset.val;
        renderRadar(d);
      });
    });
    var nb = body.querySelector(".radar-nobeleg .nbtoggle");
    if (nb) nb.addEventListener("click", function () {
      var l = body.querySelector(".radar-nobeleg .nblist"); var open = l.hidden; l.hidden = !open;
      nb.setAttribute("aria-expanded", open ? "true" : "false");
    });
    applyRadar(d);
  }
  function applyRadar(d) {
    var items = (d.items || []).slice();
    var filtered = items.filter(function (it) {
      if (radar.cat !== "alle" && (it.category || "") !== radar.cat) return false;
      if (radar.chain !== "alle" && !(it.cheapest && it.cheapest.chain === radar.chain)) return false;
      return true;
    });
    if (radar.sort === "ersparnis") filtered.sort(function (a, b) { return eur(b.savings) - eur(a.savings) || a.name.localeCompare(b.name, "de"); });
    else if (radar.sort === "az") filtered.sort(function (a, b) { return a.name.localeCompare(b.name, "de"); });
    else filtered.sort(function (a, b) { return (a.category || "").localeCompare(b.category || "", "de") || a.name.localeCompare(b.name, "de"); });

    var list = $("radar-list"), count = $("radar-count");
    var active = radar.cat !== "alle" || radar.chain !== "alle";
    if (count) count.innerHTML = (active ? filtered.length + " von " + items.length + " Angeboten" : items.length + " Angebote")
      + (active ? ' · <button class="linkbtn" id="radar-reset">Filter zurücksetzen</button>' : "");
    if (radar.sort === "ersparnis") {
      var cap = '<div class="rcaption">Ersparnis = Abstand zwischen den heute belegten Ketten. Kein Marktbestpreis.</div>';
    } else cap = "";
    if (!filtered.length) {
      var msg = "Kein Beleg für " + (radar.cat !== "alle" ? radar.cat : "diese Auswahl")
        + (radar.chain !== "alle" ? " bei " + radar.chain : "") + ". Filter zurücksetzen.";
      list.innerHTML = cap + '<p class="mut center small pad-t">' + esc(msg) + "</p>";
    } else {
      var rows = filtered.map(function (it) { return offerRowHTML(it, ""); }).join("");
      list.innerHTML = cap + '<div class="bon">' + rows + "</div>";
      bindRows(list);
    }
    var rr = $("radar-reset");
    if (rr) rr.addEventListener("click", function () { radar.cat = "alle"; radar.chain = "alle"; renderRadar(d); });
  }
  function radarNobelegHTML(d) {
    if (!d.catalog || !d.catalog.length) return "";
    var have = {}; (d.items || []).forEach(function (it) { have[it.id] = 1; });
    var miss = d.catalog.filter(function (p) { return !have[p.id]; });
    if (!miss.length) return "";
    return '<div class="radar-nobeleg"><button class="nbtoggle" aria-expanded="false">Heute ohne Beleg (' + miss.length + ')</button>'
      + '<div class="nblist" hidden>' + miss.map(function (p) {
        return '<div class="nbitem"><span>' + esc(p.name) + '</span><span class="mut">heute kein Beleg</span></div>';
      }).join("") + "</div></div>";
  }

  // ---- Produkt-Detail als Bottom-Sheet (S3) ---------------------------------
  function openDetail(it, trigger) {
    sheetTrigger = trigger || null;
    var c = it.cheapest || {};
    var todayCents = centsFromPrice(c.price), unit = unitFromPrice(c.price);
    var spark = (it.spark || []).map(Number), dates = it.spark_dates || [];
    var unitProven = spark.length >= 1 && todayCents != null && Math.round(spark[spark.length - 1]) === todayCents;

    var h = '<button class="sheet-x" id="sheet-x" type="button" aria-label="Detail schließen">×</button>';
    h += '<div class="sheet-head"><h2 id="sheet-name">' + esc(it.name) + "</h2>"
      + '<div class="sheet-sub mut">' + esc([c.brand, it.spec, it.category].filter(Boolean).join(" · ")) + "</div></div>";
    // Günstigster heute
    h += '<div class="sheet-best"><div class="lbl mut small">GÜNSTIGSTER HEUTE</div>'
      + '<div class="big">' + chainSpan(c.chain || "—") + " " + esc(c.price || "—") + (c.is_promo ? ' <span class="promo">%</span>' : "") + "</div>";
    if (it.savings && it.savings !== "0,00 €") h += '<div class="save">' + esc(it.savings) + (c.vs ? " unter " + esc(c.vs) : "") + "</div>";
    else if ((it.offers || []).length <= 1) h += '<div class="mut small">Heute nur 1 Beleg (' + esc(c.chain || "?") + "). Kein Vergleich möglich.</div>";
    else h += '<div class="mut small">Heute überall gleich belegt.</div>';
    h += "</div><hr class=\"dash\">";
    // Verlauf
    h += '<div class="sheet-chart">' + buildChart(spark, dates, unit, unitProven, it) + "</div>";
    // Angebote
    h += '<hr class="dash"><div class="sheet-offers"><div class="lbl mut small">ALLE ANGEBOTE HEUTE</div>';
    var offers = (it.offers || []).slice().sort(function (a, b) { return (centsFromPrice(a.price) || 9e9) - (centsFromPrice(b.price) || 9e9); });
    offers.forEach(function (o, i) {
      h += '<div class="offer"><span>' + chainSpan(o.chain) + (o.brand ? ' <span class="mut">' + esc(o.brand) + "</span>" : "") + (o.is_promo ? ' <span class="promo">%</span>' : "") + (i === 0 ? ' <span class="mut">✓</span>' : "") + "</span><span class=\"op\">" + esc(o.price) + "</span></div>";
    });
    h += "</div>";
    if (c.raw_label) h += '<div class="sheet-raw mut small">Artikel: ' + esc(c.raw_label) + "</div>";
    h += '<hr class="dash"><div class="disclaimer">Angebots-/Onlinepreise, Grundpreis, je Filiale abweichend. Quelle: ' + esc((DATA.sources || []).join(", ") || "—") + ". Von keiner Kette bezahlt.</div>";
    h += '<button class="btn" id="sheet-close2" type="button">Schließen</button>';

    $("sheet-body").innerHTML = h;
    var chartToggle = $("values-toggle");
    if (chartToggle) chartToggle.addEventListener("click", function () {
      var t = $("values-table"); var open = t.hidden; t.hidden = !open;
      chartToggle.setAttribute("aria-expanded", open ? "true" : "false");
      chartToggle.textContent = open ? "Werte ausblenden" : "Werte anzeigen";
    });
    $("sheet-x").addEventListener("click", closeDetail);
    $("sheet-close2").addEventListener("click", closeDetail);

    // öffnen
    $("scrim").hidden = false;
    var sh = $("sheet"); sh.hidden = false;
    document.body.classList.add("locked");
    lockScroll();
    sheetOpen = true;
    try { history.pushState({ pf: "sheet" }, ""); } catch (e) {}
    var x = $("sheet-x"); if (x) x.focus();
    $("sheet-live").textContent = "Detail geöffnet: " + it.name;
  }
  function closeDetail(fromPop) {
    if (!sheetOpen) return;
    sheetOpen = false;
    $("sheet").hidden = true; $("scrim").hidden = true;
    document.body.classList.remove("locked");
    unlockScroll();
    $("sheet-live").textContent = "Detail geschlossen";
    if (!fromPop) { try { if (history.state && history.state.pf === "sheet") history.back(); } catch (e) {} }
    if (sheetTrigger && sheetTrigger.focus) sheetTrigger.focus();
    sheetTrigger = null;
  }
  var savedScrollY = 0;
  function lockScroll() { savedScrollY = window.scrollY || 0; document.body.style.top = "-" + savedScrollY + "px"; }
  function unlockScroll() { document.body.style.top = ""; window.scrollTo(0, savedScrollY); }

  function buildChart(spark, dates, unit, unitProven, it) {
    if (!spark.length) return '<div class="charttitle">PREISVERLAUF</div><p class="mut small">Für dieses Produkt liegt heute kein Verlauf vor.</p>';
    if (spark.length === 1) return '<div class="charttitle">PREISVERLAUF</div><p class="mut small">Erst ein Messpunkt' + (dates[0] ? ", seit " + fmtDate(dates[0]) : "") + '. Ein Verlauf braucht mehr Tage.</p>';
    if (!unitProven) {
      return '<div class="charttitle">PREISVERLAUF</div><p class="mut small">Verlauf gerade nicht sauber belegbar — die Preisbasis wechselt je Tag. '
        + 'Heute günstigster Grundpreis: ' + esc((it.cheapest || {}).price || "—") + ".</p>";
    }
    var mn = Math.min.apply(null, spark), mx = Math.max.apply(null, spark), rng = (mx - mn) || 1;
    var n = spark.length;
    // Datumsbasierte X-Position (macht Lücken sichtbar), Fallback Index wenn Daten fehlen
    var t0 = dates.length === n ? Date.parse(dates[0]) : 0;
    var tN = dates.length === n ? Date.parse(dates[n - 1]) : n - 1;
    var span = (tN - t0) || 1;
    function px(i) { var t = dates.length === n ? Date.parse(dates[i]) : i; return 56 + (dates.length === n ? (t - t0) / span : i / (n - 1)) * (528 - 56 - 12); }
    function py(v) { return 16 + (1 - (v - mn) / rng) * (230 - 16 - 26); }
    var flat = mx === mn;
    var pts = [];
    for (var i = 0; i < n; i++) pts.push([px(i), py(spark[i])]);
    // Stufenlinie (Preise sind tageweise konstant)
    var dpath = "M" + pts[0][0].toFixed(1) + "," + pts[0][1].toFixed(1);
    for (i = 1; i < n; i++) dpath += " L" + pts[i][0].toFixed(1) + "," + pts[i - 1][1].toFixed(1) + " L" + pts[i][0].toFixed(1) + "," + pts[i][1].toFixed(1);
    var lastX = pts[n - 1][0], lastY = pts[n - 1][1];
    var dots = "";
    for (i = 0; i < n; i++) dots += '<circle cx="' + pts[i][0].toFixed(1) + '" cy="' + pts[i][1].toFixed(1) + '" r="2.5" fill="#1A1A1A"/>';
    function lab(v) { return (v / 100).toFixed(2).replace(".", ",") + " " + unit; }
    function labAxis(v) { return (v / 100).toFixed(2).replace(".", ",") + " €"; }  // Einheit steht im Titel -> Achse kurz
    var svg = '<svg viewBox="0 0 528 230" class="chartsvg" role="img" aria-label="Preisverlauf günstigster Grundpreis, ' + n + ' Messungen von ' + fmtDate(dates[0] || "") + ' bis heute">'
      + '<line x1="56" y1="' + py(mx).toFixed(1) + '" x2="516" y2="' + py(mx).toFixed(1) + '" stroke="#C9C3B8" stroke-dasharray="3 4"/>'
      + '<line x1="56" y1="' + py(mn).toFixed(1) + '" x2="516" y2="' + py(mn).toFixed(1) + '" stroke="#C9C3B8" stroke-dasharray="3 4"/>'
      + '<text x="52" y="' + (py(mx) + 5).toFixed(1) + '" text-anchor="end" class="ct">' + labAxis(mx) + "</text>"
      + '<text x="52" y="' + (py(mn) + 5).toFixed(1) + '" text-anchor="end" class="ct">' + labAxis(mn) + "</text>"
      + '<path d="' + dpath + '" fill="none" stroke="#1A1A1A" stroke-width="3"/>' + dots
      + '<circle cx="' + lastX.toFixed(1) + '" cy="' + lastY.toFixed(1) + '" r="5" fill="#E85D26"/>'
      + '<text x="' + Math.min(lastX, 470).toFixed(1) + '" y="' + Math.max(lastY - 10, 14).toFixed(1) + '" text-anchor="end" class="ct">heute ' + lab(spark[n - 1]) + "</text>"
      + '<text x="56" y="226" class="ct">' + fmtDateShort(dates[0] || "") + "</text>"
      + '<text x="516" y="226" text-anchor="end" class="ct">heute</text>'
      + "</svg>";
    // Titel + Ehrlichkeits-/Tief-Zeilen
    var title = "GÜNSTIGSTER GRUNDPREIS · " + unit.toUpperCase() + " · " + n + " MESSUNGEN";
    var extra = "";
    if (flat) extra += '<div class="mut small">' + n + " Messungen unverändert bei " + lab(spark[0]) + ".</div>";
    var histDays = it.history_days || 0;
    if (!flat && spark[n - 1] === mn) {   // Badge nur bei echter Preisbewegung, nie bei konstanter Reihe
      if (it.is_30d_low) extra += '<div class="lowbadge">30-TAGE-TIEF</div>';
      else extra += '<div class="lowbadge">TIEFPREIS SEIT MESSBEGINN' + (dates[0] ? " (SEIT " + fmtDateShort(dates[0]) + ")" : "") + "</div>";
    }
    if (histDays < 28) extra += '<div class="mut small">Erst ' + (dates.length ? "seit " + fmtDate(dates[0]) : histDays + " Tage") + " gemessen. Für den 30-Tage-Vergleich fehlen noch Tage.</div>";
    extra += '<div class="mut small">Günstigster über die belegten Ketten je Tag. Lücken = an dem Tag kein Beleg.</div>';
    // Werte-Tabelle (nachprüfbar, screenreaderfest)
    var trows = "";
    for (i = n - 1; i >= 0; i--) trows += "<tr><td>" + esc(fmtDate(dates[i] || "")) + "</td><td>" + lab(spark[i]) + "</td></tr>";
    var table = '<button class="values-toggle linkbtn" id="values-toggle" aria-expanded="false">Werte anzeigen</button>'
      + '<table class="values-table" id="values-table" hidden><thead><tr><th>Tag</th><th>Günstigster</th></tr></thead><tbody>' + trows + "</tbody></table>";
    return '<div class="charttitle">' + esc(title) + "</div>" + svg + extra + table;
  }

  // ---- Ansicht MEINE LISTE (S2) ----------------------------------------------
  function renderListe(d) {
    var body = $("liste-body");
    var catalog = d.catalog || [];
    var sel = getListe();
    if (!catalog.length) {
      body.innerHTML = '<div class="liste-intro"><h2>Meine Liste</h2><p class="mut">Der Produktkatalog ist gerade nicht verfügbar. Bitte später erneut öffnen.</p></div>';
      return;
    }
    if (!sel.length || editing) {
      var html = '<div class="liste-intro"><h2>Meine Liste</h2>'
        + '<p>Tipp die Produkte an, die du regelmäßig kaufst. Morgens zeigt dir die App, '
        + 'welche davon heute in Dresden im Angebot sind und wo. Lokal gespeichert, kein Konto.</p></div>';
      html += '<div class="grid">' + catalog.map(function (p) {
        var on = sel.indexOf(p.id) !== -1;
        return '<button class="chip' + (on ? " on" : "") + '" data-id="' + esc(p.id) + '" aria-pressed="' + on + '">'
          + '<span class="em" aria-hidden="true">' + esc(p.emoji || "•") + '</span> ' + esc(p.name) + "</button>";
      }).join("") + "</div>";
      html += '<div class="actions"><button class="btn primary" id="liste-save">Liste anzeigen</button></div>';
      body.innerHTML = html;
      body.querySelectorAll(".chip").forEach(function (ch) {
        ch.addEventListener("click", function () {
          var id = ch.dataset.id, cur = getListe(), k = cur.indexOf(id);
          if (k === -1) cur.push(id); else cur.splice(k, 1);
          setListe(cur); var on = k === -1; ch.classList.toggle("on", on); ch.setAttribute("aria-pressed", on);
        });
      });
      $("liste-save").addEventListener("click", function () { editing = false; renderListe(d); window.scrollTo(0, 0); });
      return;
    }
    var belegt = 0, savingsSum = 0, chainWins = {};
    var rows = sel.map(function (id) {
      var p = catalog.filter(function (x) { return x.id === id; })[0] || { id: id, name: id, emoji: "" };
      var it = itemById[id];
      if (it) {
        belegt++;
        var c = it.cheapest || {};
        if (c.chain) chainWins[c.chain] = (chainWins[c.chain] || 0) + 1;
        savingsSum += eur(it.savings);
        var save = (it.savings && it.savings !== "0,00 €") ? '<span class="save small">' + esc(it.savings) + " gespart</span>" : '<span class="mut small">' + ((it.offers || []).length <= 1 ? "nur 1 Kette belegt" : "überall gleich") + "</span>";
        return '<div class="row"><div class="rowhead mrowhead" role="button" tabindex="0" aria-haspopup="dialog" data-id="' + esc(it.id) + '"><span class="mn">' + esc(p.name) + "</span>"
          + '<span class="mcol">' + chainSpan(c.chain || "") + " <span class=\"mprice\">" + esc(c.price || "") + "</span><br>" + save + "</span></div></div>";
      }
      return '<div class="mrow gap"><span class="mn">' + esc(p.name) + '</span><span class="mprice">heute kein Beleg</span></div>';
    }).join("");

    var head = '<div class="result-head"><div class="big">' + belegt + " von " + sel.length + " heute im Angebot</div>";
    if (belegt) head += '<div class="sub">Bis ' + fmtEur(savingsSum) + " gespart (je Einheit, aufaddiert)</div>";
    head += '<div class="note">Nur belegte Preise — keine erfundene Korbsumme. Stand ' + esc(fmtDate(d.date)) + ".</div></div>";

    var korb = "";
    var top = Object.keys(chainWins).sort(function (a, b) { return chainWins[b] - chainWins[a]; })[0];
    if (top && belegt >= 2) {
      korb = '<div class="korb"><div class="ktitle">Dein Korb-Tipp</div>'
        + '<div class="kbig">' + chainSpan(top) + " ist bei " + chainWins[top] + " von " + belegt + " deiner Produkte heute am günstigsten.</div>"
        + '<div class="knote">Eine echte „dein Korb kostet bei Laden X"-Summe kommt, sobald wir Normalpreise aller Ketten haben. '
        + "Bis dahin raten wir nicht — pro Produkt der belegte günstigste Laden.</div></div>";
    }
    body.innerHTML = head + korb + '<div class="bon">' + rows + "</div>"
      + '<div class="actions"><button class="btn" id="liste-edit">Liste bearbeiten</button></div>';
    bindRows(body);
    $("liste-edit").addEventListener("click", function () { editing = true; renderListe(d); window.scrollTo(0, 0); });
  }

  // ---- Teilen (S4) -----------------------------------------------------------
  function buildShareText(d) {
    var total = (d.catalog && d.catalog.length) ? d.catalog.length : (d.items || []).length;
    var lines = ["Pfennigfuchser Dresden — Bon vom " + fmtDate(d.date),
      (d.items || []).length + " von " + total + " Produkten heute vergleichbar."];
    if (d.basket_savings) lines.push("Bis " + d.basket_savings + " günstiger als die teuerste Kette.");
    var src = (d.sources || []).join(", ");
    lines.push((src ? "Quelle: " + src + ". " : "") + "Von keiner Kette bezahlt.");
    return lines.join("\n");
  }
  function shareBon(d) {
    var text = buildShareText(d);
    if (navigator.share) { navigator.share({ title: "Pfennigfuchser Dresden", text: text, url: SHARE_URL }).catch(function () {}); return; }
    var full = text + "\n" + SHARE_URL;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(full).then(function () { toast("In die Zwischenablage kopiert."); }).catch(function () { selectFallback(full); });
    } else selectFallback(full);
  }
  function selectFallback(text) {
    var ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", "");
    ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); toast("In die Zwischenablage kopiert."); } catch (e) { toast("Text markiert. Mit langem Tippen kopieren."); }
    setTimeout(function () { document.body.removeChild(ta); }, 50);
  }
  var toastT = null;
  // Toast bleibt im A11y-Baum (aria-live liest nur Änderungen vor, solange die Region präsent ist);
  // sichtbar/unsichtbar über .show, nicht über hidden/display:none.
  function toast(msg) { var t = $("toast"); if (!t) return; t.textContent = msg; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("show"); }, 2600); }

  // ---- Onboarding / So funktioniert's (S4) ----------------------------------
  function openInfo(auto, trigger) {
    infoTrigger = trigger || null;
    var chains = SOURCED_CHAINS.join(", ");
    var usps = [
      ["Von keiner Kette bezahlt.", "Kein Cent vom Handel."],
      ["Jeder Preis hat Quelle und Datum.", ""],
      ['Fehlt der Beleg, steht „heute kein Beleg".', "Wir raten nicht."],
      ["Dresden.", chains + "."],
      ["Jeden Morgen ein neuer Bon.", "Der Stand steht oben."]
    ];
    var lis = usps.map(function (u) { return '<li><span class="mk" aria-hidden="true">✓</span><span><b>' + esc(u[0]) + "</b>" + (u[1] ? " " + esc(u[1]) : "") + "</span></li>"; }).join("");
    $("info-body").innerHTML = '<button id="info-skip" class="info-skip" type="button">Überspringen ×</button>'
      + '<div class="info-head"><div id="info-title" class="info-title">PFENNIGFUCHSER DRESDEN</div>'
      + '<div class="info-sub mut">Fünf Zeilen, dann weißt du Bescheid.</div></div><hr class="dash">'
      + '<ol class="promise">' + lis + "</ol><hr class=\"dash\">"
      + '<div class="howto"><p>Tippe eine Zeile an. Preisverlauf und alle Angebote klappen auf.</p>'
      + '<p>In „Meine Liste" tippst du deine Produkte an. Morgens siehst du, was im Angebot ist.</p>'
      + '<p>„heute kein Beleg" heißt: heute keine Quelle. Kein Schätzwert.</p></div>'
      + '<button id="info-go" class="btn primary" type="button">Bon ansehen</button>'
      + '<div class="served">ES BEDIENTE SIE: DER PFENNIGFUCHSER</div>';
    $("info").hidden = false; document.body.classList.add("locked"); if (!sheetOpen) lockScroll();
    try { history.pushState({ pf: "info" }, ""); } catch (e) {}
    $("info-skip").addEventListener("click", function () { closeInfo(); });
    $("info-go").addEventListener("click", function () { closeInfo(); });
    var go = $("info-go"); if (go) go.focus();
  }
  function closeInfo(fromPop) {
    if ($("info").hidden) return;
    $("info").hidden = true; setFlag(OB_KEY, "1");
    if (!sheetOpen) { document.body.classList.remove("locked"); unlockScroll(); }
    if (!fromPop) { try { if (history.state && history.state.pf === "info") history.back(); } catch (e) {} }
    if (infoTrigger && infoTrigger.focus) infoTrigger.focus(); infoTrigger = null;
  }

  // ---- Tabs ------------------------------------------------------------------
  function switchView(v) {
    ["heute", "radar", "liste"].forEach(function (name) { $("view-" + name).hidden = v !== name; });
    document.querySelectorAll(".tab").forEach(function (t) {
      var on = t.dataset.view === v; t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on); t.setAttribute("tabindex", on ? "0" : "-1");   // Roving-Tabindex
    });
    window.scrollTo(0, 0);
  }
  var tabs = [].slice.call(document.querySelectorAll(".tab"));
  tabs.forEach(function (t, i) {
    t.addEventListener("click", function () { switchView(t.dataset.view); });
    t.addEventListener("keydown", function (e) {
      var j = e.key === "ArrowLeft" ? i - 1 : e.key === "ArrowRight" ? i + 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : -1;
      if (j < 0) return;
      e.preventDefault(); j = (j + tabs.length) % tabs.length;
      switchView(tabs[j].dataset.view); tabs[j].focus();
    });
  });

  // ---- globale Handler (Overlays, Fokusfalle, Zurück, Sichtbarkeit) ----------
  $("scrim").addEventListener("click", function () { closeDetail(); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { if (sheetOpen) closeDetail(); else if (!$("info").hidden) closeInfo(); return; }
    if (e.key !== "Tab") return;
    var host = sheetOpen ? $("sheet") : (!$("info").hidden ? $("info") : null);
    if (!host) return;
    var f = host.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"])');
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  window.addEventListener("popstate", function () { if (sheetOpen) closeDetail(true); else if (!$("info").hidden) closeInfo(true); });
  var howBtn = $("how"); if (howBtn) howBtn.addEventListener("click", function () { openInfo(false, howBtn); });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && Date.now() - lastLoad > 300000) load();
  });

  // ---- Install-Prompt (PWA) + iOS-Hinweis -----------------------------------
  var deferred = null, ib = $("install");
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferred = e; if (ib) ib.hidden = false; });
  if (ib) ib.addEventListener("click", function () {
    if (deferred) { deferred.prompt(); deferred.userChoice.finally(function () { deferred = null; ib.hidden = true; }); return; }
    var hint = $("ios-hint"); if (hint) hint.hidden = !hint.hidden;
  });
  window.addEventListener("appinstalled", function () { if (ib) ib.hidden = true; });
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  if (isIOS && !window.navigator.standalone && ib) { ib.hidden = false; ib.textContent = "So installieren"; }

  // ---- Service Worker --------------------------------------------------------
  if ("serviceWorker" in navigator) {
    var refreshing = false;
    var hadController = !!navigator.serviceWorker.controller;   // Erststart hat noch keinen -> kein Reload
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (!hadController || refreshing) return;   // nur bei echtem Update reloaden, nicht bei clients.claim() beim Erstbesuch
      refreshing = true; window.location.reload();
    });
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).catch(function () {}); });
  }

  load();
})();
