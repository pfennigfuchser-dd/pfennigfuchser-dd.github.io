/* Pfennigfuchser App — liest die tägliche today.json (dieselbe, die der Tageslauf pusht).
   Kein Konto, kein Tracker, kein Fremd-Request. Merkliste liegt lokal (localStorage).
   USP: nie eine erfundene Korbsumme — fehlt ein Beleg, steht "heute kein Beleg". */
(function () {
  "use strict";

  var CHAIN_CLASS = { Aldi: "aldi", Lidl: "lidl", Netto: "netto", Rewe: "rewe", Penny: "penny", Kaufland: "kaufland" };
  var LS_KEY = "pf_liste";
  var DATA = null, editing = false, lastLoad = 0;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function fmtDate(iso) { var p = (iso || "").split("-"); return p.length === 3 ? p[2] + "." + p[1] + "." + p[0] : "–"; }
  function chainSpan(name) { return '<span class="chain ' + (CHAIN_CLASS[name] || "") + '">' + esc(name) + "</span>"; }
  // deutsche Zahl inkl. Tausenderpunkt: "1.234,56 €" -> 1234.56
  function eur(s) { var n = parseFloat(String(s).replace(/[^0-9,.-]/g, "").replace(/\./g, "").replace(",", ".")); return isNaN(n) ? 0 : n; }
  function fmtEur(n) { return n.toFixed(2).replace(".", ",") + " €"; }

  function getListe() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch (e) { return []; } }
  function setListe(a) { try { localStorage.setItem(LS_KEY, JSON.stringify(a)); } catch (e) {} }

  // ---- Daten laden -----------------------------------------------------------
  // today.json liegt IN-SCOPE (neben der App), damit der Service Worker sie offline
  // cachen kann; der Tageslauf pusht dieselbe Pipeline-Datei hierher UND nach Root.
  // ../today.json ist nur Fallback (Root der Website), falls die App-Kopie mal fehlt.
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
    // Verwaiste Merkliste-Einträge (nicht mehr im Katalog) bereinigen — nur wenn Katalog da ist
    if (d.catalog && d.catalog.length) {
      var valid = {}; d.catalog.forEach(function (p) { valid[p.id] = 1; });
      var cur = getListe(), cleaned = cur.filter(function (id) { return valid[id]; });
      if (cleaned.length !== cur.length) setListe(cleaned);
    }
    var src = (d.sources || []).join(", ");
    $("datebar").textContent = "STAND: " + fmtDate(d.date) + (src ? " · Quelle: " + src : "");
    $("usp-stand").textContent = "Angaben ohne Gewähr · Stand " + fmtDate(d.date) + ".";
    $("demo-banner").hidden = !d.is_demo;
    renderHeute(d);
    renderListe(d);
  }

  // ---- Ansicht HEUTE (Tagesbon) ---------------------------------------------
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
    if (d.basket_savings) html += '<div class="basket">Warenkorb bis ' + esc(d.basket_savings) + " günstiger</div>";
    html += "</div>";
    html += '<div class="sum"><span>' + items.length + " VON " + total + " HEUTE VERGLEICHBAR</span><span>" + esc(fmtDate(d.date)) + "</span></div>";
    html += '<hr class="dash">';
    items.forEach(function (it, i) {
      var c = it.cheapest || {};
      var promo = c.is_promo ? ' <span class="promo">%</span>' : "";
      var vs = c.vs ? " unter " + esc(c.vs) : "";
      var hasSave = it.savings && it.savings !== "0,00 €";
      var did = "det" + i;
      html += '<div class="row">'
        + '<div class="rowhead" role="button" tabindex="0" aria-expanded="false" aria-controls="' + did + '" data-i="' + i + '">'
        + '<div class="l1"><span class="pname">' + (i + 1) + ". " + esc(it.name) + promo + "</span>"
        + '<span class="price">' + esc(c.price || "—") + "</span></div>"
        + '<div class="l2"><span class="spec">' + esc((c.brand ? c.brand + " · " : "") + (it.spec || "")) + "</span>" + chainSpan(c.chain || "") + "</div>"
        + '<div class="l3"><span class="chev">▾ Verlauf</span>'
        + (hasSave ? '<span class="save">' + esc(it.savings) + vs + "</span>" : '<span class="mut small">überall gleich</span>')
        + "</div></div>"
        + '<div class="detail" id="' + did + '" hidden>'
        + (it.offers || []).map(function (o) {
            return '<div class="offer"><span>' + chainSpan(o.chain) + (o.brand ? ' <span class="mut">' + esc(o.brand) + "</span>" : "") + (o.is_promo ? ' <span class="promo">%</span>' : "") + "</span><span class=\"op\">" + esc(o.price) + "</span></div>";
          }).join("")
        + (c.raw_label ? '<div class="raw">Artikel: ' + esc(c.raw_label) + "</div>" : "")
        + ((it.spark || []).length > 2 ? '<div class="charttitle">Günstigster Preis · letzte ' + it.spark.length + ' Tage</div><canvas class="spark" width="640" height="120" role="img" aria-label="Preisverlauf ' + esc(it.name) + ', letzte ' + it.spark.length + ' Tage"></canvas>' : "")
        + "</div></div>";
    });
    if (d.fun_fact) html += '<hr class="dash"><div class="fakt"><b>FUCHS-FAKT</b> ' + esc(d.fun_fact) + "</div>";
    html += '<div class="disclaimer">* Angebots-/Onlinepreise. % = Aktion · Eigenmarken-Vergleich per Grundpreis · Preise je Filiale abweichend. Von keiner Kette bezahlt.</div>';
    html += '<div class="served">ES BEDIENTE SIE: DER PFENNIGFUCHSER</div>';
    $("heute-body").innerHTML = html;

    $("heute-body").querySelectorAll(".rowhead").forEach(function (head) {
      function toggle() {
        var det = document.getElementById(head.getAttribute("aria-controls")); if (!det) return;
        var open = det.hidden; det.hidden = !open;
        head.setAttribute("aria-expanded", open ? "true" : "false");
        var chev = head.querySelector(".chev"); if (chev) chev.textContent = open ? "▴ zuklappen" : "▾ Verlauf";
        if (open) { var cv = det.querySelector("canvas.spark"); var it = items[+head.dataset.i]; if (cv && it) drawSpark(cv, it.spark || []); }
      }
      head.addEventListener("click", toggle);
      head.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
    });
  }

  function drawSpark(cv, data) {
    if (!cv || data.length < 2) return;
    var ctx = cv.getContext("2d"), W = cv.width, H = cv.height, pad = 20;
    ctx.clearRect(0, 0, W, H);
    var mn = Math.min.apply(null, data), mx = Math.max.apply(null, data), rng = (mx - mn) || 1;
    function x(i) { return pad + i * (W - 2 * pad) / (data.length - 1); }
    function y(v) { return H - pad - (v - mn) * (H - 2 * pad) / rng; }
    ctx.beginPath(); ctx.moveTo(x(0), y(data[0]));
    data.forEach(function (v, i) { ctx.lineTo(x(i), y(v)); });
    ctx.strokeStyle = "#1A1A1A"; ctx.lineWidth = 3; ctx.stroke();
    var li = data.length - 1;
    ctx.beginPath(); ctx.arc(x(li), y(data[li]), 5, 0, 7); ctx.fillStyle = "#E85D26"; ctx.fill(); // Tinte-Kontext: Punkt in Fuchs-Orange, nicht Grün (CI: Grün nur Ersparnis)
    ctx.fillStyle = "#63605A"; ctx.font = "20px monospace";
    ctx.fillText((mx / 100).toFixed(2).replace(".", ",") + " €", 4, 20);
    ctx.fillText((mn / 100).toFixed(2).replace(".", ",") + " €", 4, H - 6);
  }

  // ---- Ansicht MEINE LISTE ---------------------------------------------------
  function renderListe(d) {
    var body = $("liste-body");
    var catalog = d.catalog || [];
    var sel = getListe();
    var itemById = {}; (d.items || []).forEach(function (it) { itemById[it.id] = it; });

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

    // Ergebnis: ehrliche Summe (nur belegte Produkte), Lücken sichtbar
    var belegt = 0, savingsSum = 0, chainWins = {};
    var rows = sel.map(function (id) {
      var p = catalog.filter(function (x) { return x.id === id; })[0] || { id: id, name: id, emoji: "" };
      var it = itemById[id];
      if (it) {
        belegt++;
        var c = it.cheapest || {};
        if (c.chain) chainWins[c.chain] = (chainWins[c.chain] || 0) + 1;
        savingsSum += eur(it.savings);
        var save = (it.savings && it.savings !== "0,00 €") ? '<span class="save small">' + esc(it.savings) + " gespart</span>" : '<span class="mut small">überall gleich</span>';
        return '<div class="mrow"><span class="mn">' + esc(p.emoji) + " " + esc(p.name) + "</span>"
          + '<span style="text-align:right">' + chainSpan(c.chain || "") + " <span class=\"mprice\">" + esc(c.price || "") + "</span><br>" + save + "</span></div>";
      }
      return '<div class="mrow gap"><span class="mn">' + esc(p.emoji) + " " + esc(p.name) + '</span><span class="mprice">heute kein Beleg</span></div>';
    }).join("");

    var head = '<div class="result-head">'
      + '<div class="big">' + belegt + " von " + sel.length + " heute im Angebot</div>";
    if (belegt) head += '<div class="sub">Bis ' + fmtEur(savingsSum) + " gespart (je Einheit, aufaddiert)</div>";
    head += '<div class="note">Nur belegte Preise — keine erfundene Korbsumme. Stand ' + esc(fmtDate(d.date)) + ".</div></div>";

    // Korb-Tipp (ehrlich): welcher Laden ist für die meisten deiner Produkte heute am günstigsten?
    var korb = "";
    var top = Object.keys(chainWins).sort(function (a, b) { return chainWins[b] - chainWins[a]; })[0];
    if (top && belegt >= 2) {
      korb = '<div class="korb"><div class="ktitle">🛒 Dein Korb-Tipp</div>'
        + '<div class="kbig">' + chainSpan(top) + " ist bei " + chainWins[top] + " von " + belegt + " deiner Produkte heute am günstigsten.</div>"
        + '<div class="knote">Eine echte „dein Korb kostet bei Laden X"-Summe kommt, sobald wir Normalpreise aller Ketten haben. '
        + "Bis dahin raten wir nicht — pro Produkt der belegte günstigste Laden.</div></div>";
    }

    body.innerHTML = head + korb + '<div class="bon">' + rows + "</div>"
      + '<div class="actions"><button class="btn" id="liste-edit">Liste bearbeiten</button></div>';
    $("liste-edit").addEventListener("click", function () { editing = true; renderListe(d); window.scrollTo(0, 0); });
  }

  // ---- Tabs ------------------------------------------------------------------
  function switchView(v) {
    $("view-heute").hidden = v !== "heute";
    $("view-liste").hidden = v !== "liste";
    document.querySelectorAll(".tab").forEach(function (t) {
      var on = t.dataset.view === v; t.classList.toggle("active", on); t.setAttribute("aria-selected", on);
    });
    window.scrollTo(0, 0);
  }
  document.querySelectorAll(".tab").forEach(function (t) {
    t.addEventListener("click", function () { switchView(t.dataset.view); });
  });

  // ---- Bei App-Rückkehr frische Preise (gedrosselt) --------------------------
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
  // iOS: kein beforeinstallprompt -> Button als "So installieren" zeigen
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  if (isIOS && !window.navigator.standalone && ib) { ib.hidden = false; ib.textContent = "So installieren"; }

  // ---- Service Worker (mit sauberem Auto-Update) -----------------------------
  if ("serviceWorker" in navigator) {
    var refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (refreshing) return; refreshing = true; window.location.reload();
    });
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).catch(function () {});
    });
  }

  load();
})();
