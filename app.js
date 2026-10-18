/* Consonant-Fit: extra features (weekly summary, exercise progress, body weight).
   Loaded by index.html. Talks to the main app through window.fitGet / fitSet / fitPush
   and re-draws whenever the main app fires the "fit:render" event. */
(function () {
  "use strict";
  var $ = function (i) { return document.getElementById(i); };
  var chartSec = $("chart") && $("chart").parentNode;
  if (!chartSec || !window.fitGet || !window.fitSet) return;

  var st = document.createElement("style");
  st.textContent =
    ".x-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;text-align:center}" +
    ".x-grid div{background:var(--bg);border-radius:10px;padding:10px 4px}" +
    ".x-grid b{display:block;font-size:24px;font-weight:800;letter-spacing:-.02em}" +
    ".x-grid span{display:block;font-size:12px;color:var(--mute)}" +
    ".x-grid i{display:block;font-style:normal;font-size:12px;font-weight:600;color:var(--accent);min-height:16px}" +
    ".x-grid i.dn{color:var(--mute)}" +
    "#x-ex{margin-bottom:10px}" +
    ".x-add{display:flex;gap:8px;align-items:center;margin-bottom:10px}.x-add input{flex:1}" +
    "#x-pc svg,#x-bc svg{display:block;width:100%;height:auto}" +
    "section[hidden]{display:none}";
  document.head.appendChild(st);

  function sec(id, title, html) {
    var s = document.createElement("section");
    s.id = id;
    s.innerHTML = "<h2>" + title + "</h2>" + html;
    return s;
  }
  var sum = sec("x-sum", "Weekly summary", '<div class="x-grid" id="x-stats"></div>');
  var prog = sec("x-prog", "Progress", '<select id="x-ex" aria-label="Exercise"></select><div id="x-pc"></div><p class="meta" id="x-pm"></p>');
  var body = sec("x-body", "Body weight",
    '<div class="x-add"><input id="x-kg" type="number" min="20" max="400" step="0.1" inputmode="decimal" placeholder="kg" aria-label="Body weight in kg">' +
    '<button class="chip" id="x-log" type="button">Log</button><button class="chip" id="x-del" type="button">Remove last</button></div>' +
    '<div id="x-bc"></div><p class="meta" id="x-bm"></p>');
  chartSec.after(sum);
  var rest = $("rest") || $("list").parentNode;
  rest.before(prog);
  rest.before(body);

  var D = 864e5, curEx = "";

  function vol(w) {
    var m = /(\d+)\s*[x\u00d7]\s*(\d+)/i.exec(w.sr || "");
    return m && w.kg ? m[1] * m[2] * w.kg : 0;
  }
  function agg(log, a, b) {
    var r = { n: 0, m: 0, v: 0 };
    log.forEach(function (w) { if (w.t >= a && w.t < b) { r.n++; r.m += w.mins; r.v += vol(w); } });
    return r;
  }
  function delta(c, p) {
    if (!p) return c ? "new" : "";
    var x = Math.round((c - p) / p * 100);
    return (x > 0 ? "\u2191 " : x < 0 ? "\u2193 " : "") + Math.abs(x) + "%";
  }
  function spark(el, pts) {
    if (pts.length < 2) { el.innerHTML = ""; return; }
    var W = 300, H = 90, P = 8, n = pts.length;
    var vs = pts.map(function (p) { return p.v; });
    var mn = Math.min.apply(null, vs), mx = Math.max.apply(null, vs), rg = (mx - mn) || 1;
    var xy = pts.map(function (p, i) {
      return [P + i * (W - 2 * P) / (n - 1), H - P - (p.v - mn) / rg * (H - 2 * P)];
    });
    var d = xy.map(function (c, i) { return (i ? "L" : "M") + c[0].toFixed(1) + " " + c[1].toFixed(1); }).join("");
    var l = xy[n - 1];
    el.innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Trend chart">' +
      '<path d="' + d + '" fill="none" style="stroke:var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="' + l[0].toFixed(1) + '" cy="' + l[1].toFixed(1) + '" r="5" style="fill:var(--heat)"/></svg>';
  }
  function dayKey(t) { var d = new Date(t); return d.getFullYear() * 400 + d.getMonth() * 32 + d.getDate(); }

  function update() {
    var S = window.fitGet(), log = S.log || [], ws = (S.weights || []).slice().sort(function (a, b) { return a.t - b.t; });

    // Weekly summary: last 7 calendar days vs the 7 before
    var d0 = new Date(); d0.setHours(0, 0, 0, 0);
    var s1 = d0.getTime() - 6 * D, s0 = s1 - 7 * D;
    var c = agg(log, s1, Infinity), p = agg(log, s0, s1);
    var items = [["Workouts", c.n, p.n], ["Minutes", c.m, p.m], ["Volume kg", Math.round(c.v), Math.round(p.v)]];
    $("x-stats").innerHTML = items.map(function (it) {
      var t = delta(it[1], it[2]);
      return "<div><b>" + it[1].toLocaleString() + "</b><span>" + it[0] + "</span><i" + (t.charAt(0) === "\u2193" ? ' class="dn"' : "") + ">" + (t ? t + " vs last wk" : "") + "</i></div>";
    }).join("");

    // Exercise progress: best weight per day for the chosen exercise
    var names = {}, order = [];
    log.slice().sort(function (a, b) { return b.t - a.t; }).forEach(function (w) {
      var k = w.name.toLowerCase();
      if (w.kg > 0 && !names[k]) { names[k] = w.name; order.push(k); }
    });
    prog.hidden = !order.length;
    if (order.length) {
      if (!names[curEx]) curEx = order[0];
      var sel = $("x-ex");
      if (sel.getAttribute("data-k") !== order.join("|")) {
        sel.innerHTML = "";
        order.forEach(function (k) { var o = document.createElement("option"); o.value = k; o.textContent = names[k]; sel.appendChild(o); });
        sel.setAttribute("data-k", order.join("|"));
      }
      sel.value = curEx;
      var byDay = {};
      log.forEach(function (w) {
        if (w.name.toLowerCase() === curEx && w.kg > 0) {
          var k = dayKey(w.t);
          if (!byDay[k] || w.kg > byDay[k].v) byDay[k] = { t: w.t, v: w.kg };
        }
      });
      var pts = Object.keys(byDay).map(function (k) { return byDay[k]; }).sort(function (a, b) { return a.t - b.t; }).slice(-30);
      spark($("x-pc"), pts);
      var best = Math.max.apply(null, pts.map(function (q) { return q.v; }));
      $("x-pm").textContent = "Best " + best + " kg \u00b7 latest " + pts[pts.length - 1].v + " kg \u00b7 " + pts.length + (pts.length === 1 ? " session" : " sessions");
    }

    // Body weight
    var last30 = ws.slice(-30);
    spark($("x-bc"), last30.map(function (w) { return { t: w.t, v: w.kg }; }));
    if (!ws.length) $("x-bm").textContent = "Log your weight to see the trend.";
    else {
      var diff = Math.round((ws[ws.length - 1].kg - ws[0].kg) * 10) / 10;
      $("x-bm").textContent = "Latest " + ws[ws.length - 1].kg + " kg" +
        (ws.length > 1 ? " \u00b7 " + (diff > 0 ? "+" : "") + diff + " kg since first entry" : " \u00b7 add another entry to see a trend");
    }
    $("x-del").disabled = !ws.length;
  }

  function commit(S) { window.fitSet(S); if (window.fitPush) window.fitPush(S); }

  $("x-ex").addEventListener("change", function () { curEx = this.value; update(); });
  $("x-log").addEventListener("click", function () {
    var v = parseFloat($("x-kg").value);
    if (!(v >= 20 && v <= 400)) { $("x-bm").textContent = "Enter a weight between 20 and 400 kg."; return; }
    var S = window.fitGet(); S.weights = S.weights || [];
    S.weights.push({ id: Date.now(), t: Date.now(), kg: Math.round(v * 10) / 10 });
    $("x-kg").value = "";
    commit(S);
  });
  $("x-kg").addEventListener("keydown", function (e) { if (e.key === "Enter") $("x-log").click(); });
  $("x-del").addEventListener("click", function () {
    var S = window.fitGet(), ws = (S.weights || []).slice().sort(function (a, b) { return a.t - b.t; });
    if (!ws.length) return;
    var gone = ws[ws.length - 1];
    S.weights = S.weights.filter(function (w) { return w.id !== gone.id; });
    commit(S);
  });

  document.addEventListener("fit:render", update);
  update();
})();
