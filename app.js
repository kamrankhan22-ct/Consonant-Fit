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

  // ---- Hamburger menu ----
  var brand = document.querySelector(".brand"), so = $("so"), exp = $("exp");
  var ms = document.createElement("style");
  ms.textContent =
    ".x-burger{margin-left:auto;display:flex;align-items:center;justify-content:center;width:44px;height:44px;flex:none;background:none;border:1px solid var(--line);border-radius:12px;color:var(--ink);cursor:pointer}" +
    ".brand .x-burger svg{width:22px;height:22px;border-radius:0}" +
    "#x-nav{position:fixed;inset:0;z-index:60;visibility:hidden;transition:visibility 0s .25s}" +
    "#x-nav.open{visibility:visible;transition-delay:0s}" +
    ".x-scrim{position:absolute;inset:0;background:rgba(5,12,16,.55);opacity:0;transition:opacity .25s}" +
    ".open .x-scrim{opacity:1}" +
    ".x-panel{position:absolute;top:0;right:0;bottom:0;width:min(320px,86vw);background:var(--surface);border-left:1px solid var(--line);padding:calc(16px + env(safe-area-inset-top,0px)) 16px calc(16px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:16px;overflow-y:auto;transform:translateX(100%);transition:transform .25s ease}" +
    ".open .x-panel{transform:none}" +
    ".x-top{display:flex;justify-content:space-between;align-items:center}.x-top b{font-size:18px;font-weight:800}" +
    ".x-close{width:44px;height:44px;margin:-8px -8px -8px 0;font-size:28px;line-height:1;background:none;border:0;border-radius:10px;color:var(--ink);cursor:pointer}" +
    ".x-who{display:flex;align-items:center;gap:12px;padding:12px;background:var(--bg);border-radius:12px}" +
    ".x-av{flex:none;width:40px;height:40px;border-radius:50%;background:var(--accent);color:var(--surface);font-weight:800;display:flex;align-items:center;justify-content:center;text-transform:uppercase}" +
    ".x-who div{min-width:0}.x-who b,.x-who span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#x-mail{font-size:13px;color:var(--mute)}" +
    ".x-links,.x-acts{display:flex;flex-direction:column;gap:2px}" +
    ".x-acts{margin-top:auto;border-top:1px solid var(--line);padding-top:12px}" +
    ".x-links button,.x-panel .x-act{width:100%;text-align:left;margin:0;font:600 16px \"Archivo\",sans-serif;color:var(--ink);background:none;border:0;border-radius:10px;padding:12px;cursor:pointer}" +
    ".x-links button:hover,.x-panel .x-act:hover{background:var(--bg)}" +
    "@media(prefers-reduced-motion:reduce){#x-nav,.x-scrim,.x-panel{transition:none}}";
  document.head.appendChild(ms);

  var burger = document.createElement("button");
  burger.type = "button"; burger.className = "x-burger";
  burger.setAttribute("aria-label", "Open menu"); burger.setAttribute("aria-expanded", "false"); burger.setAttribute("aria-controls", "x-nav");
  burger.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
  if (brand) brand.appendChild(burger);

  var nav = document.createElement("div");
  nav.id = "x-nav";
  nav.innerHTML = '<div class="x-scrim"></div><aside class="x-panel" role="dialog" aria-modal="true" aria-label="Menu">' +
    '<div class="x-top"><b>Menu</b><button type="button" class="x-close" aria-label="Close menu">\u00d7</button></div>' +
    '<div class="x-who"><span class="x-av" id="x-av">?</span><div><b id="x-name"></b><span id="x-mail"></span></div></div>' +
    '<div class="x-links" id="x-links"></div><div class="x-acts" id="x-acts"><button type="button" class="x-act" id="x-exp">Export CSV</button></div></aside>';
  document.body.appendChild(nav);
  if (so) { so.classList.add("x-act"); $("x-acts").appendChild(so); }

  var lastFocus = null;
  function buildLinks() {
    var box = $("x-links"); box.innerHTML = "";
    [["Weekly summary", sum], ["Log a workout", $("f") && $("f").parentNode], ["Progress", prog], ["Body weight", body], ["Rest timer", $("rest")], ["History", $("list").parentNode]].forEach(function (it) {
      if (!it[1] || it[1].hidden) return;
      var b = document.createElement("button");
      b.type = "button"; b.textContent = it[0];
      b.addEventListener("click", function () {
        closeNav();
        var rm = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
        requestAnimationFrame(function () { it[1].scrollIntoView({ behavior: rm ? "auto" : "smooth", block: "start" }); });
      });
      box.appendChild(b);
    });
  }
  function openNav() {
    lastFocus = document.activeElement; buildLinks();
    nav.classList.add("open"); burger.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
    setTimeout(function () { nav.querySelector(".x-close").focus(); }, 50);
  }
  function closeNav() {
    nav.classList.remove("open"); burger.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  burger.addEventListener("click", openNav);
  nav.querySelector(".x-scrim").addEventListener("click", closeNav);
  nav.querySelector(".x-close").addEventListener("click", closeNav);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && nav.classList.contains("open")) closeNav(); });
  $("x-exp").addEventListener("click", function () { closeNav(); if (exp) exp.click(); });
  if (so) so.addEventListener("click", closeNav);

  function setWho() {
    var u = window.fitUser, mail = (u && u.email) || "", nm = (u && (u.name || mail.split("@")[0])) || "";
    $("x-name").textContent = nm || "Local only";
    $("x-mail").textContent = mail || "Not signed in";
    $("x-av").textContent = (nm || "?").charAt(0);
  }
  document.addEventListener("fit:auth", setWho);
  setWho();

  document.addEventListener("fit:render", update);
  update();
})();
