// Pfennigfuchser Website — rendert den Tagesbon aus today.json.
// Kein Framework, keine Fremd-Requests. Design-Regeln: 02_Design/CI.md.
(function(){
  "use strict";

  var CHAIN_CLASS = { "Aldi":"aldi", "Lidl":"lidl", "Netto":"netto", "Rewe":"rewe",
                      "Penny":"penny", "Kaufland":"kaufland" };

  function fmtDate(iso){ var p=(iso||"").split("-"); return p.length===3 ? p[2]+"."+p[1]+"."+p[0] : iso; }
  function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g, function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); }
  function chainSpan(name){
    var cls = CHAIN_CLASS[name] || "";
    return '<span class="chain '+cls+'">'+esc(name)+'</span>';
  }

  function load(){
    fetch("today.json", {cache:"no-store"})
      .then(function(r){ if(!r.ok) throw new Error(r.status); return r.json(); })
      .then(render)
      .catch(function(){
        var el = document.getElementById("bon-body");
        if(el) el.innerHTML = '<p class="mut small center">Der heutige Bon ist noch nicht gedruckt. '+
          'Die aktuellen Preise findest du im <a href="https://whatsapp.com/channel/0029Vb8NHt37j6g4Fl8fg63E">WhatsApp-Kanal</a>.</p>';
      });
  }

  function render(d){
    var body = document.getElementById("bon-body");
    if(!body) return;

    var html = "";

    if(d.is_demo){
      html += '<div class="demo-banner">DEMO-DATEN — KEINE ECHTEN PREISE</div>';
    }

    var meta = document.getElementById("bon-meta");
    if(meta) meta.textContent = "DRESDEN · STAND: " + fmtDate(d.date);

    // Frische-Hinweis, wenn der Bon nicht von heute ist
    var today = new Date();
    var iso = today.getFullYear()+"-"+String(today.getMonth()+1).padStart(2,"0")+"-"+String(today.getDate()).padStart(2,"0");
    var stale = d.date && d.date !== iso;

    var items = d.items || [];
    html += '<div class="sum"><span>'+items.length+' VON 21 PRODUKTEN HEUTE VERGLEICHBAR</span><span>'+esc(fmtDate(d.date))+'</span></div>';
    html += '<hr class="dash" style="margin:8px 0">';

    items.forEach(function(it, i){
      var c = it.cheapest || {};
      var promo = c.is_promo ? ' <span class="promo">%</span>' : '';
      var vs = c.vs ? ' unter '+esc(c.vs) : '';
      var hasSave = it.savings && it.savings !== "0,00 €";
      html += '<div class="row" data-i="'+i+'">'
        + '<div class="l1"><span class="pname">'+(i+1)+'. '+esc(it.name)+promo+'</span>'
        + '<span class="price">'+esc(c.price||"—")+'</span></div>'
        + '<div class="l2"><span class="spec">'+esc((c.brand?c.brand+" · ":"")+(it.spec||""))+'</span>'+chainSpan(c.chain||"")+'</div>'
        + '<div class="l3"><span class="chev">▾ Details</span>'
        + (hasSave ? '<span class="save">'+esc(it.savings)+vs+'</span>' : '<span class="mut small">überall gleich</span>')
        + '</div>'
        + '<div class="detail" hidden>'
        + (it.offers||[]).map(function(o){
            return '<div class="offer"><span>'+chainSpan(o.chain)+(o.brand?' <span class="mut">'+esc(o.brand)+'</span>':'')+(o.is_promo?' <span class="promo" style="color:var(--fox)">%</span>':'')+'</span>'
                 + '<span class="op">'+esc(o.price)+'</span></div>';
          }).join("")
        + (c.raw_label ? '<div class="raw">Artikel: '+esc(c.raw_label)+'</div>' : '')
        + ((it.spark||[]).length>2 ? '<div class="charttitle">Günstigster Preis · letzte '+it.spark.length+' Tage</div><canvas class="spark" width="640" height="128"></canvas>' : '')
        + '</div></div>';
    });

    if(d.fun_fact){
      html += '<hr class="dash"><div class="fakt"><b>FUCHS-FAKT</b> '+esc(d.fun_fact)+'</div>';
    }

    html += '<div class="disclaimer">* Angebots-/Onlinepreise, Angaben ohne Gewähr. % = Aktion · '
          + 'Eigenmarken-Vergleich per Grundpreis · Preise können je Filiale abweichen. Stand: '+esc(fmtDate(d.date))+'</div>';

    if(stale && !d.is_demo){
      html += '<p class="stale">Der Bon von heute ist noch nicht gedruckt — das hier ist der letzte Stand.</p>';
    }

    body.innerHTML = html;

    // Ausklappen + Sparkline
    body.querySelectorAll(".row").forEach(function(row){
      row.addEventListener("click", function(){
        var det = row.querySelector(".detail");
        if(!det) return;
        det.hidden = !det.hidden;
        var chev = row.querySelector(".chev");
        if(chev) chev.textContent = det.hidden ? "▾ Details" : "▴ zuklappen";
        if(!det.hidden){
          var cv = det.querySelector("canvas.spark");
          var it = items[+row.dataset.i];
          if(cv && it) drawSpark(cv, it.spark||[]);
        }
      });
    });
  }

  // Sparkline in Bon-Sprache: Tintenlinie auf Papier, heutiger Punkt in Spar-Grün.
  function drawSpark(cv, data){
    if(!cv || data.length < 2) return;
    var ctx = cv.getContext("2d");
    var W = cv.width, H = cv.height, pad = 20;
    ctx.clearRect(0,0,W,H);
    var min = Math.min.apply(null,data), max = Math.max.apply(null,data), rng = (max-min)||1;
    function x(i){ return pad + i*(W-2*pad)/(data.length-1); }
    function y(v){ return H-pad - (v-min)*(H-2*pad)/rng; }
    ctx.beginPath(); ctx.moveTo(x(0),y(data[0]));
    data.forEach(function(v,i){ ctx.lineTo(x(i),y(v)); });
    ctx.strokeStyle = "#1A1A1A"; ctx.lineWidth = 3; ctx.stroke();
    var li = data.length-1;
    ctx.beginPath(); ctx.arc(x(li),y(data[li]),5,0,7); ctx.fillStyle = "#1B7A45"; ctx.fill();
    ctx.fillStyle = "#8A857C"; ctx.font = "20px monospace";
    ctx.fillText((max/100).toFixed(2).replace(".",",")+" €", 4, 20);
    ctx.fillText((min/100).toFixed(2).replace(".",",")+" €", 4, H-6);
  }

  load();
})();
