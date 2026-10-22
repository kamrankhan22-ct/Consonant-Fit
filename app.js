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

  // ---- Weight gain plan + workout schedule ----
  var ps = document.createElement("style");
  ps.textContent =
    ".x-form{display:flex;flex-direction:column;gap:10px;margin-top:12px}.x-form[hidden]{display:none}" +
    ".x-btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:4px}" +
    ".x-days{display:flex;gap:6px;margin-top:6px}" +
    ".x-days button{flex:1;min-width:0;font:600 13px \"Archivo\",sans-serif;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:10px 0;cursor:pointer}" +
    ".x-days button[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:var(--surface)}" +
    ".x-wk{margin-top:12px}.x-wk span.meta{display:block;font-size:12px}.x-wk li.today b{color:var(--accent)}" +
    ".x-big2{font-size:22px;font-weight:800;letter-spacing:-.02em;margin:0}.x-big2 .meta{font-size:15px;font-weight:600}" +
    ".x-sub{margin:18px 0 0;font-size:14px;font-weight:800}" +
    ".x-msw{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}.x-ms{font-size:12px;font-weight:700;border:1px solid var(--line);border-radius:999px;padding:4px 10px;color:var(--mute)}.x-ms.on{background:var(--accent);border-color:var(--accent);color:var(--surface)}";
  document.head.appendChild(ps);

  var gain = sec("x-gain", "Weight gain plan",
    '<div id="x-gv"></div><div class="x-form" id="x-ge" hidden>' +
    '<label>Current weight (kg)<input id="g-cur" type="number" min="30" max="300" step="0.1" inputmode="decimal"></label>' +
    '<label>Target weight (kg)<input id="g-tar" type="number" min="30" max="300" step="0.1" inputmode="decimal"></label>' +
    '<label>Pace<select id="g-rate"><option value="0.25">Steady \u00b7 0.25 kg/week</option><option value="0.4">Moderate \u00b7 0.4 kg/week</option><option value="0.5">Fast \u00b7 0.5 kg/week</option></select></label>' +
    '<p class="meta" style="margin:4px 0 0">Optional, for a daily calorie and protein estimate (adults 18+):</p>' +
    '<label>Height (cm)<input id="g-h" type="number" min="120" max="230" inputmode="numeric"></label>' +
    '<label>Age<input id="g-age" type="number" min="14" max="90" inputmode="numeric"></label>' +
    '<label>Sex<select id="g-sex"><option value="">Skip</option><option value="m">Male</option><option value="f">Female</option></select></label>' +
    '<label>Activity<select id="g-act"><option value="l">Light (1\u20132 workouts/week)</option><option value="m">Moderate (3\u20135 per week)</option><option value="a">High (6+ per week)</option></select></label>' +
    '<label>Food preference<select id="g-diet"><option value="veg">Vegetarian</option><option value="egg">Vegetarian + eggs</option><option value="non">Non-vegetarian</option></select></label>' +
    '<p class="meta" id="g-msg" role="status" style="margin:0"></p>' +
    '<div class="x-btns"><button class="chip" id="g-save" type="button">Save plan</button><button class="chip" id="g-cancel" type="button">Cancel</button><button class="chip x-danger" id="g-del" type="button">Remove plan</button></div></div>');
  var sched = sec("x-sched", "Workout plan",
    '<div id="x-sv"></div><div class="x-form" id="x-se" hidden>' +
    '<div><span class="meta">Workout days (pick up to 6)</span><div class="x-days" id="s-days"></div></div>' +
    '<label>Start time<input id="s-time" type="time" value="18:00"></label>' +
    '<label>Session length (minutes)<input id="s-min" type="number" min="20" max="180" step="5" inputmode="numeric" value="60"></label>' +
    '<label class="x-row">Remind me 30 min before (this device)<input type="checkbox" id="s-rem"></label>' +
    '<p class="meta" id="s-rn" role="status" style="margin:0"></p>' +
    '<div class="x-btns"><button class="chip" id="s-save" type="button">Save schedule</button><button class="chip" id="s-cancel" type="button">Cancel</button><button class="chip x-danger" id="s-del" type="button">Remove</button></div></div>');
  rest.before(gain);
  rest.before(sched);

  var editG = false, editS = false, draftDays = [];
  var DN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  var DFULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  var SPLIT = { 1: ["Full body"], 2: ["Full body A", "Full body B"], 3: ["Full body A", "Full body B", "Full body C"], 4: ["Upper", "Lower", "Upper", "Lower"], 5: ["Push", "Pull", "Legs", "Upper", "Lower"], 6: ["Push", "Pull", "Legs", "Push", "Pull", "Legs"] };
  var FOCUS = { "Full body": "Squat \u00b7 press \u00b7 row \u00b7 hinge", Push: "Chest \u00b7 shoulders \u00b7 triceps", Pull: "Back \u00b7 biceps \u00b7 rear delts", Legs: "Quads \u00b7 hamstrings \u00b7 glutes \u00b7 calves", Upper: "Chest \u00b7 back \u00b7 shoulders \u00b7 arms", Lower: "Quads \u00b7 hamstrings \u00b7 glutes \u00b7 core" };
  function r1(x) { return Math.round(x * 10) / 10; }
  function fo(l) { return FOCUS[l] || FOCUS[l.replace(/ [A-C]$/, "")] || ""; }
  function plan7(sc) {
    var n = sc.days.filter(Boolean).length, seq = SPLIT[n] || [], k = 0, out = [];
    sc.days.forEach(function (on, i) { out[i] = on ? (seq[k++] || "Workout") : null; });
    return out;
  }
  function fmt(t) { var p = (t || "18:00").split(":"), h = +p[0]; return ((h + 11) % 12 + 1) + ":" + (p[1] || "00") + " " + (h < 12 ? "AM" : "PM"); }
  function monIdx(d) { return (d.getDay() + 6) % 7; }
  function nextSession(sc) {
    var now = new Date(), f = plan7(sc), p = (sc.time || "18:00").split(":");
    for (var i = 0; i < 14; i++) {
      var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, +p[0], +p[1] || 0, 0), wi = monIdx(d);
      if (f[wi] && d > now) return { date: d, i: i, focus: f[wi], wi: wi };
    }
    return null;
  }
  function latestKg(S) {
    var ws = (S.weights || []).slice().sort(function (x, y) { return x.t - y.t; });
    return ws.length ? ws[ws.length - 1].kg : null;
  }

  function lk(d) { d = d || new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
  function gainTargets(g, cur) {
    if (!g.h || !g.age || !g.sex || g.age < 18) return null;
    var bmr = 10 * cur + 6.25 * g.h - 5 * g.age + (g.sex === "m" ? 5 : -161);
    var tdee = Math.round(bmr * ({ l: 1.375, m: 1.55, a: 1.725 }[g.act] || 1.55) / 10) * 10;
    var sur = Math.round(g.rate * 1100 / 5) * 5, kc = Math.round((tdee + sur) / 10) * 10;
    var pT = Math.round(1.8 * cur), fat = Math.round(kc * 0.25 / 9), carb = Math.max(0, Math.round((kc - pT * 4 - fat * 9) / 4));
    return { tdee: tdee, sur: sur, kc: kc, pT: pT, pLo: Math.round(1.6 * cur), pHi: Math.round(2.2 * cur), fat: fat, carb: carb };
  }
  function trajChart(S, g) {
    var ws = (S.weights || []).filter(function (w) { return w.t >= g.startT - 864e5; }).sort(function (x, y) { return x.t - y.t; });
    var now = Date.now(), wk = (g.target - g.startKg) / g.rate, endT = g.startT + wk * 6048e5, t1 = Math.max(now, endT);
    var vals = ws.map(function (w) { return w.kg; }).concat([g.startKg, g.target]);
    var mn = Math.min.apply(null, vals) - 0.5, mx = Math.max.apply(null, vals) + 0.5, W = 300, H = 110, P = 10;
    var X = function (t) { return P + (Math.max(t, g.startT) - g.startT) / (t1 - g.startT) * (W - 2 * P); };
    var Y = function (v) { return H - P - (v - mn) / (mx - mn) * (H - 2 * P); };
    var plan = "M" + X(g.startT).toFixed(1) + " " + Y(g.startKg).toFixed(1) + "L" + X(endT).toFixed(1) + " " + Y(g.target).toFixed(1);
    var act = ws.map(function (w, i) { return (i ? "L" : "M") + X(w.t).toFixed(1) + " " + Y(w.kg).toFixed(1); }).join("");
    var last = ws.length ? ws[ws.length - 1] : null;
    return '<svg viewBox="0 0 300 110" role="img" aria-label="Planned versus actual weight" style="width:100%;height:auto;display:block;margin-top:12px"><path d="' + plan + '" fill="none" style="stroke:var(--mute)" stroke-width="2" stroke-dasharray="5 5"/>' +
      (act ? '<path d="' + act + '" fill="none" style="stroke:var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' : "") +
      (last ? '<circle cx="' + X(last.t).toFixed(1) + '" cy="' + Y(last.kg).toFixed(1) + '" r="5" style="fill:var(--heat)"/>' : "") +
      '</svg><p class="meta" style="margin:4px 0 0;font-size:12px">Dashed line: planned pace. Solid line: your weigh-ins.</p>';
  }
  function milestones(g, cur) {
    var gained = cur - g.startKg, total = Math.floor(g.target - g.startKg), h = "";
    if (total < 1) return "";
    for (var i = 1; i <= Math.min(total, 10); i++) h += '<span class="x-ms' + (gained >= i ? " on" : "") + '">' + (gained >= i ? "\u2713 " : "") + "+" + i + " kg</span>";
    return '<div class="x-msw">' + h + "</div>";
  }
  function paceTip(S, g) {
    var now = Date.now(), ws = (S.weights || []).filter(function (w) { return w.t >= now - 21 * 864e5 && w.t >= g.startT - 864e5; }).sort(function (x, y) { return x.t - y.t; });
    if (ws.length < 2) return "";
    var days = (ws[ws.length - 1].t - ws[0].t) / 864e5; if (days < 10) return "";
    var r = (ws[ws.length - 1].kg - ws[0].kg) / (days / 7), rr = Math.round(r * 100) / 100, t;
    if (r <= 0) t = "Your weight is flat or dropping over the last weeks. Add 200\u2013300 kcal a day and keep weighing in.";
    else if (r < g.rate * 0.5) t = "You are gaining about " + rr + " kg/week, slower than your " + g.rate + " kg plan. Try adding 150\u2013250 kcal a day, for example a glass of milk with a banana or a handful of nuts.";
    else if (r > Math.max(0.6, g.rate * 1.6)) t = "You are gaining about " + rr + " kg/week, faster than planned. To stay lean, trim about 150\u2013200 kcal a day.";
    else t = "Your recent pace (" + rr + " kg/week) matches the plan. Keep going.";
    return '<p class="meta" style="margin:10px 0 0"><b style="color:var(--ink)">Pace check:</b> ' + t + "</p>";
  }
  var FOODS = {
    veg: [["Breakfast", "Oats cooked in milk with banana and nuts, paneer paratha with curd, peanut butter toast"], ["Lunch", "Rice or roti, dal, paneer or soya chunks, sabzi, curd"], ["Snack", "Banana milkshake, roasted chana and peanuts, sprouts chaat, dry fruits"], ["Dinner", "Roti, rajma or chole or paneer bhurji, salad, a glass of milk"]],
    egg: [["Breakfast", "Omelette with toast and milk, oats with banana, boiled eggs"], ["Lunch", "Rice or roti, dal, egg curry, sabzi, curd"], ["Snack", "Peanut butter sandwich, banana shake, boiled eggs, nuts"], ["Dinner", "Roti, paneer or egg bhurji, dal, salad, a glass of milk"]],
    non: [["Breakfast", "Eggs with toast, oats with milk and banana"], ["Lunch", "Rice or roti, chicken or fish curry, dal, sabzi"], ["Snack", "Peanut butter sandwich, banana shake, boiled eggs, nuts"], ["Dinner", "Roti, chicken or fish, vegetables, curd or milk"]]
  };
  var SHARE = [0.25, 0.3, 0.15, 0.3];
  function mealPlan(S, g, T) {
    var rows = FOODS[g.diet] || FOODS.veg;
    var h = '<details style="margin-top:12px"><summary style="cursor:pointer;font-weight:700">Sample meal plan</summary><div style="margin-top:8px">';
    rows.forEach(function (r, i) {
      h += '<div class="x-mr"><div><b>' + r[0] + '</b> <span class="meta">~' + (Math.round(T.kc * SHARE[i] / 10) * 10) + " kcal \u00b7 " + Math.round(T.pT * SHARE[i]) + ' g protein</span><span class="meta" style="display:block;font-size:12px">' + r[1] + "</span></div></div>";
    });
    var sc = S.plan && S.plan.sched, tip = "";
    if (sc) {
      var p = (sc.time || "18:00").split(":"), m = (((+p[0]) * 60 + (+p[1] || 0) - 90) % 1440 + 1440) % 1440;
      tip = "You train at " + fmt(sc.time) + ": eat a carb and protein meal around " + fmt(("0" + Math.floor(m / 60)).slice(-2) + ":" + ("0" + m % 60).slice(-2)) + " and get 25\u201330 g of protein within 2 hours after.";
    }
    return h + "</div>" + (tip ? '<p class="meta" style="margin:8px 0 0">' + tip + "</p>" : "") + '<p class="meta" style="margin:8px 0 0;font-size:12px">Approximate guide. Adjust portions to your appetite, culture and any allergies.</p></details>';
  }
  function burnedLine(S) {
    var b = 0, tk = dayKey(Date.now());
    (S.log || []).forEach(function (w) { if (dayKey(w.t) === tk) b += w.kcal || 0; });
    return b ? '<p class="meta" style="margin:8px 0 0">Tracked activity burned about ' + b.toLocaleString() + " kcal today. Consider adding it to your target to stay in surplus.</p>" : "";
  }
  function intakeBlock(S, T) {
    var f = S.plan && S.plan.food, d = (f && f[lk()]) || { k: 0, p: 0 };
    var pk = Math.min(100, Math.round(d.k / T.kc * 100)), pp = Math.min(100, Math.round(d.p / T.pT * 100));
    function bar(label, val, tgt, unit, pc) { return '<div class="row" style="margin-top:8px"><span>' + label + "</span><span><b>" + val.toLocaleString() + "</b> / " + tgt.toLocaleString() + " " + unit + '</span></div><div class="bar" style="margin:4px 0 0"><i style="width:' + pc + '%"></i></div>'; }
    function btns(arr, key, unit) { return arr.map(function (n) { return '<button class="chip" data-act="f-add" data-key="' + key + '" data-n="' + n + '" type="button">+' + n + " " + unit + "</button>"; }).join(" "); }
    return '<h3 class="x-sub">Today\u2019s intake</h3>' + bar("Calories", d.k, T.kc, "kcal", pk) + bar("Protein", d.p, T.pT, "g", pp) + burnedLine(S) +
      '<div class="x-btns" style="margin-top:10px">' + btns([150, 300, 500, 700], "k", "kcal") + '</div><div class="x-btns">' + btns([10, 20, 30, 40], "p", "g") + '<button class="chip x-danger" data-act="f-reset" type="button">Reset today</button></div>';
  }

  function gainView(S) {
    var g = S.plan && S.plan.gain;
    if (!g) return '<p class="meta" style="margin:0 0 12px">Set a target weight and a steady pace. You get a progress tracker, an estimated date, a calorie and macro guide, a meal plan and a daily intake tracker.</p><button class="chip" data-act="g-edit">Create plan</button>';
    var cur = latestKg(S); if (cur === null) cur = g.startKg;
    var span = g.target - g.startKg, pct = span > 0 ? Math.max(0, Math.min(100, Math.round((cur - g.startKg) / span * 100))) : 0;
    var left = r1(g.target - cur), weeks = (Date.now() - g.startT) / 6048e5;
    var exp = Math.min(g.target, g.startKg + g.rate * weeks), diff = r1(cur - exp), st;
    if (left <= 0) st = "Goal reached. Nice work. Edit the plan to set a new target.";
    else if (weeks < 1) st = "Plan started. Weigh in each week to see how you are tracking.";
    else st = diff >= 0.5 ? "Ahead of pace by " + diff + " kg." : diff >= -0.5 ? "On track." : "Behind pace by " + Math.abs(diff) + " kg. Check your food intake and sleep.";
    var h = '<p class="x-big2">' + cur + ' kg <span class="meta">\u2192 ' + g.target + ' kg</span></p>' +
      '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
      '<div class="row"><span><b>' + pct + '%</b> of the way</span><span>' + (left > 0 ? left + " kg to go" : "Goal reached") + "</span></div>" +
      '<p class="meta" style="margin:10px 0 0">' + st + "</p>";
    if (left > 0) {
      var eta = new Date(Date.now() + left / g.rate * 6048e5);
      h += '<p class="meta" style="margin:4px 0 0">At ' + g.rate + " kg/week you could get there around " + eta.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) + ".</p>";
    }
    if (span > 0) h += trajChart(S, g);
    h += milestones(g, cur) + paceTip(S, g);
    if (g.age && g.age < 18) {
      h += '<p class="meta" style="margin:10px 0 0">Calorie targets are shown for adults only. A doctor or dietitian can advise on a growing body.</p>';
    } else {
      var T = gainTargets(g, cur);
      if (T) {
        h += '<h3 class="x-sub">Daily targets</h3><p style="margin:6px 0 0"><b>About ' + T.kc.toLocaleString() + ' kcal/day</b> <span class="meta">(maintenance ~' + T.tdee.toLocaleString() + " + " + T.sur + ")</span></p>" +
          '<p class="meta" style="margin:4px 0 0">Protein ' + T.pT + " g \u00b7 Carbs " + T.carb + " g \u00b7 Fat " + T.fat + " g</p>" +
          '<p class="meta" style="margin:2px 0 0;font-size:12px">Protein range: ' + T.pLo + "\u2013" + T.pHi + " g/day</p>" +
          intakeBlock(S, T) + mealPlan(S, g, T);
      } else {
        h += '<p class="meta" style="margin:10px 0 0">Add your height, age and sex in Edit plan to unlock daily calories, macros, a meal plan and the intake tracker.</p>';
      }
    }
    h += '<p class="meta" style="margin:12px 0 0;font-size:12px">Estimates only, not medical advice. If you have a health condition, check with a doctor or dietitian.</p>' +
      '<button class="chip" data-act="g-edit" style="margin-top:12px">Edit plan</button>';
    return h;
  }

  function schedView(S) {
    var sc = S.plan && S.plan.sched;
    if (!sc) return '<p class="meta" style="margin:0 0 12px">Pick your workout days and a time. You get a weekly split and an optional reminder.</p><button class="chip" data-act="s-edit">Create schedule</button>';
    var f = plan7(sc), nx = nextSession(sc), now = new Date(), ti = monIdx(now), h = "";
    if (nx) {
      var ms = nx.date - now, hr = Math.floor(ms / 36e5), mn = Math.round(ms % 36e5 / 6e4);
      h += '<p class="x-big2">' + (nx.i === 0 ? "Today" : nx.i === 1 ? "Tomorrow" : DFULL[nx.wi]) + " \u00b7 " + fmt(sc.time) + '</p>' +
        '<p class="meta" style="margin:4px 0 0">' + nx.focus + " \u00b7 " + sc.mins + " min" + (ms < 864e5 ? " \u00b7 in " + (hr ? hr + " h " : "") + mn + " min" : "") + '</p>';
    }
    h += '<ul class="x-wk">' + DN.map(function (n, i) {
      var date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ti + i);
      var done = (S.log || []).some(function (w) { return dayKey(w.t) === dayKey(date.getTime()); });
      var s = done ? "Done \u2713" : !f[i] ? "Rest" : i < ti ? "Missed" : fmt(sc.time);
      return "<li" + (i === ti ? ' class="today"' : "") + "><div><b>" + n + "</b>" + (f[i] ? '<span class="meta">' + f[i] + " \u00b7 " + fo(f[i]) + "</span>" : "") + '</div><span class="meta" style="font-size:13px">' + s + "</span></li>";
    }).join("") + "</ul>" +
      '<p class="meta" style="margin:12px 0 0">Tips: eat a protein and carb meal 1\u20132 h before training, have protein within a couple of hours after, and leave a day between hard sessions for the same muscles. Aim for 7\u20139 h of sleep.</p>' +
      '<button class="chip" data-act="s-edit" style="margin-top:12px">Edit schedule</button>';
    return h;
  }

  function updatePlan() {
    var S = window.fitGet();
    $("x-gv").innerHTML = gainView(S); $("x-gv").hidden = editG; $("x-ge").hidden = !editG;
    $("x-sv").innerHTML = schedView(S); $("x-sv").hidden = editS; $("x-se").hidden = !editS;
  }

  // weight gain plan: edit / save
  function openG() {
    var S = window.fitGet(), g = S.plan && S.plan.gain, lk = latestKg(S);
    $("g-cur").value = lk !== null ? lk : (g ? g.startKg : ""); $("g-tar").value = g ? g.target : "";
    $("g-rate").value = String(g ? g.rate : 0.25); $("g-h").value = (g && g.h) || ""; $("g-age").value = (g && g.age) || "";
    $("g-sex").value = (g && g.sex) || ""; $("g-act").value = (g && g.act) || "m"; $("g-diet").value = (g && g.diet) || "veg"; $("g-msg").textContent = "";
    editG = true; updatePlan(); $("g-cur").focus();
  }
  gain.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-act]"); if (!b) return;
    var act = b.getAttribute("data-act");
    if (act === "g-edit") { openG(); return; }
    if (act !== "f-add" && act !== "f-reset") return;
    var S = window.fitGet(); S.plan = S.plan || {}; S.plan.food = S.plan.food || {};
    var key = lk();
    if (act === "f-reset") delete S.plan.food[key];
    else {
      var d = S.plan.food[key] || { k: 0, p: 0 }, f = b.getAttribute("data-key");
      d[f] = Math.min(20000, (d[f] || 0) + (+b.getAttribute("data-n") || 0)); d.t = Date.now(); S.plan.food[key] = d;
    }
    Object.keys(S.plan.food).forEach(function (k) { if (Date.now() - (S.plan.food[k].t || 0) > 14 * 864e5) delete S.plan.food[k]; });
    commit(S);
  });
  $("g-cancel").addEventListener("click", function () { editG = false; updatePlan(); });
  $("g-del").addEventListener("click", function () {
    var S = window.fitGet(); if (S.plan) S.plan.gain = null; editG = false; commit(S);
  });
  $("g-save").addEventListener("click", function () {
    var cur = parseFloat($("g-cur").value), tar = parseFloat($("g-tar").value), rate = parseFloat($("g-rate").value);
    var h = parseFloat($("g-h").value), age = parseInt($("g-age").value, 10), sex = $("g-sex").value, act = $("g-act").value, m = $("g-msg");
    if (!(cur >= 30 && cur <= 300)) { m.textContent = "Enter your current weight (30\u2013300 kg)."; return; }
    if (!(tar > cur && tar <= 300)) { m.textContent = "Target must be above your current weight."; return; }
    if (tar - cur > 30) { m.textContent = "Pick a closer first target (up to 30 kg above now). You can raise it later."; return; }
    var S = window.fitGet(); S.plan = S.plan || {};
    var old = S.plan.gain, keep = old && old.startKg < tar;
    S.plan.gain = {
      target: r1(tar), rate: [0.25, 0.4, 0.5].indexOf(rate) >= 0 ? rate : 0.25,
      startKg: keep ? old.startKg : r1(cur), startT: keep ? old.startT : Date.now(),
      h: h >= 120 && h <= 230 ? Math.round(h) : 0, age: age >= 14 && age <= 90 ? age : 0,
      sex: sex === "m" || sex === "f" ? sex : "", act: ["l", "m", "a"].indexOf(act) >= 0 ? act : "m",
      diet: ["veg", "egg", "non"].indexOf($("g-diet").value) >= 0 ? $("g-diet").value : "veg"
    };
    var lk = latestKg(S);
    if (lk === null || Math.abs(lk - cur) >= 0.05) { S.weights = S.weights || []; S.weights.push({ id: Date.now(), t: Date.now(), kg: r1(cur) }); }
    editG = false; commit(S);
  });

  // workout schedule: edit / save
  function drawDays() {
    var box = $("s-days"); box.innerHTML = "";
    DN.forEach(function (n, i) {
      var b = document.createElement("button");
      b.type = "button"; b.textContent = n; b.setAttribute("data-i", i); b.setAttribute("aria-pressed", String(!!draftDays[i]));
      box.appendChild(b);
    });
  }
  function remindOn() { try { return localStorage.getItem("fit-remind") === "1"; } catch (e) { return false; } }
  function openS() {
    var S = window.fitGet(), sc = S.plan && S.plan.sched;
    draftDays = sc ? sc.days.slice() : [true, false, true, false, true, false, false];
    $("s-time").value = sc ? sc.time : "18:00"; $("s-min").value = sc ? sc.mins : 60;
    $("s-rem").checked = remindOn() && "Notification" in window && Notification.permission === "granted";
    $("s-rn").textContent = ""; drawDays(); editS = true; updatePlan();
  }
  sched.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest("[data-act]"); if (b && b.getAttribute("data-act") === "s-edit") openS(); });
  $("s-days").addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("button"); if (!b) return;
    var i = +b.getAttribute("data-i");
    if (!draftDays[i] && draftDays.filter(Boolean).length >= 6) { $("s-rn").textContent = "Pick at most 6 days. Rest days are when you grow."; return; }
    draftDays[i] = !draftDays[i]; $("s-rn").textContent = ""; b.setAttribute("aria-pressed", String(!!draftDays[i]));
  });
  $("s-cancel").addEventListener("click", function () { editS = false; updatePlan(); });
  $("s-del").addEventListener("click", function () {
    var S = window.fitGet(); if (S.plan) S.plan.sched = null; editS = false; commit(S);
  });
  $("s-save").addEventListener("click", function () {
    if (!draftDays.some(Boolean)) { $("s-rn").textContent = "Pick at least one workout day."; return; }
    var tm = $("s-time").value, mins = parseInt($("s-min").value, 10);
    var S = window.fitGet(); S.plan = S.plan || {};
    S.plan.sched = { days: draftDays.map(Boolean), time: /^\d\d:\d\d$/.test(tm) ? tm : "18:00", mins: mins >= 20 && mins <= 180 ? mins : 60 };
    editS = false; commit(S);
  });
  $("s-rem").addEventListener("change", function () {
    var cb = this, rn = $("s-rn");
    if (!cb.checked) { try { localStorage.setItem("fit-remind", "0"); } catch (e) {} rn.textContent = ""; return; }
    if (!("Notification" in window)) { cb.checked = false; rn.textContent = "This browser does not support notifications."; return; }
    Notification.requestPermission().then(function (p) {
      if (p === "granted") { try { localStorage.setItem("fit-remind", "1"); } catch (e) {} rn.textContent = "Reminders work while the app is open or still running in the background."; }
      else { cb.checked = false; rn.textContent = "Notifications are blocked. Allow them in your browser or phone settings."; }
    });
  });

  function checkRemind() {
    var S = window.fitGet(), sc = S.plan && S.plan.sched;
    if (!sc || !remindOn() || !("Notification" in window) || Notification.permission !== "granted") return;
    var n = nextSession(sc); if (!n) return;
    var mins = (n.date - Date.now()) / 6e4;
    if (mins <= 0 || mins > 30) return;
    var key = n.date.toDateString(), last = null;
    try { last = localStorage.getItem("fit-remind-last"); } catch (e) {}
    if (last === key) return;
    try { localStorage.setItem("fit-remind-last", key); } catch (e) {}
    var title = "Workout in " + Math.round(mins) + " min", opts = { body: n.focus + " \u00b7 " + fmt(sc.time), tag: "fit-session" };
    if (navigator.serviceWorker && navigator.serviceWorker.ready) navigator.serviceWorker.ready.then(function (r) { r.showNotification(title, opts); }).catch(function () { try { new Notification(title, opts); } catch (e) {} });
    else { try { new Notification(title, opts); } catch (e) {} }
  }
  setInterval(checkRemind, 30000);
  setInterval(function () { if (!editG && !editS) updatePlan(); }, 60000);
  document.addEventListener("fit:render", updatePlan);
  updatePlan();

  // ---- Leaderboard ----
  var lcs = document.createElement("style");
  lcs.textContent =
    ".lb-list{margin:12px 0 0}.lb-list li{gap:12px}" +
    ".lb-list li.me{background:var(--bg);border-radius:10px;padding-left:8px;padding-right:8px;margin:0 -8px}" +
    ".lb-r{flex:none;width:24px;text-align:center;font-weight:800;color:var(--mute)}" +
    ".lb-list .lb-av{width:36px;height:36px;font-size:15px}" +
    ".lb-n{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}" +
    ".lb-v{flex:none;font-weight:800;font-variant-numeric:tabular-nums}" +
    "#x-lbv .x-seg{margin-top:2px}";
  document.head.appendChild(lcs);
  var lbSec = sec("x-lb", "Leaderboard", '<div id="x-lbv"></div>');
  rest.before(lbSec);

  var lbTab = "wMin", lbList = [], lbMsg = "", lbBusy = false, lastPub = "", pubTimer = 0, thumbSrc = "", thumbOut = null;
  var LBT = [["wMin", "Minutes"], ["wCnt", "Workouts"], ["streak", "Streak"]];
  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function utcMon(t) { var d = new Date(t), k = (d.getUTCDay() + 6) % 7; return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - k); }
  function myStats(S) {
    var m0 = utcMon(Date.now()), cnt = 0, min = 0, days = {};
    (S.log || []).forEach(function (w) { if (w.t >= m0 && w.t < m0 + 7 * D) { cnt++; min += w.mins; } days[dayKey(w.t)] = 1; });
    var s = 0, c = new Date(); if (!days[dayKey(c.getTime())]) c.setDate(c.getDate() - 1);
    while (days[dayKey(c.getTime())]) { s++; c.setDate(c.getDate() - 1); }
    return { wk: new Date(m0).toISOString().slice(0, 10), wMin: Math.min(10080, min), wCnt: Math.min(200, cnt), streak: Math.min(3650, s) };
  }
  function myName(S) { var u = window.fitUser; return (String((S.profile && S.profile.name) || (u && u.name) || "Athlete").trim().slice(0, 30)) || "Athlete"; }
  function avFill(e, photo, name) {
    if (typeof photo === "string" && /^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(photo)) e.style.backgroundImage = 'url("' + photo + '")';
    else e.textContent = (String(name || "?").trim().charAt(0)) || "?";
  }
  function thumb(src, cb) {
    if (!src || !/^data:image\/jpeg;base64,/.test(src)) { cb(null); return; }
    if (thumbSrc === src) { cb(thumbOut); return; }
    var im = new Image();
    im.onload = function () {
      var c = document.createElement("canvas"); c.width = c.height = 64;
      c.getContext("2d").drawImage(im, 0, 0, 64, 64);
      thumbSrc = src; thumbOut = c.toDataURL("image/jpeg", 0.7); cb(thumbOut);
    };
    im.onerror = function () { cb(null); };
    im.src = src;
  }
  function publish() {
    var S = window.fitGet();
    if (!window.fitLB || !window.fitUser || !(S.profile && S.profile.lb)) return;
    var st = myStats(S), name = myName(S);
    thumb(S.profile.photo, function (ph) {
      var d = { name: name, photo: ph || null, weekKey: st.wk, wMin: st.wMin, wCnt: st.wCnt, streak: st.streak, updated: Date.now() };
      var sig = JSON.stringify([d.name, d.photo, d.weekKey, d.wMin, d.wCnt, d.streak]);
      if (sig === lastPub) return;
      window.fitLB.publish(d).then(function () { lastPub = sig; lbLoad(); }).catch(function () {});
    });
  }
  function schedulePublish() { clearTimeout(pubTimer); pubTimer = setTimeout(publish, 1500); }
  function lbLoad() {
    var S = window.fitGet();
    if (!window.fitLB || !window.fitUser || !(S.profile && S.profile.lb)) return;
    lbBusy = true; lbMsg = ""; renderLB();
    window.fitLB.fetch(myStats(S).wk).then(function (l) { lbList = l; lbBusy = false; renderLB(); })
      .catch(function (e) {
        lbBusy = false;
        lbMsg = e && e.code === "permission-denied" ? "The leaderboard needs the updated Firestore rules. Publish them in the Firebase console." : "Could not load the leaderboard. Check your connection and try again.";
        renderLB();
      });
  }
  function setLB(on) {
    var S = window.fitGet(); S.profile = S.profile || {}; S.profile.lb = !!on;
    clearTimeout(pubTimer); lastPub = "";
    if (!on) { lbList = []; if (window.fitLB && window.fitUser) window.fitLB.remove().catch(function () {}); }
    commit(S);
  }
  function renderLB() {
    var S = window.fitGet(), box = $("x-lbv"), u = window.fitUser, joined = !!(S.profile && S.profile.lb);
    box.textContent = "";
    if (!window.fitLB || !u) {
      box.appendChild(el("p", "meta", "Sign up to see how you rank against other Consonant-Fit users."));
      if (document.body.classList.contains("tour")) {
        var sb2 = el("button", "chip", "Sign up free"); sb2.type = "button"; sb2.style.marginTop = "10px";
        sb2.addEventListener("click", function () { if (window.fitTour) window.fitTour.signup(); });
        box.appendChild(sb2);
      }
      return;
    }
    if (!joined) {
      var p = el("p", "meta", "Compete on weekly minutes, workouts and streak. If you join, your display name (" + myName(S) + "), photo and weekly totals are visible to other signed-in users. You can leave any time. Totals are self-reported.");
      p.style.margin = "0 0 12px"; box.appendChild(p);
      var jb = el("button", "chip", "Join leaderboard"); jb.type = "button";
      jb.addEventListener("click", function () { setLB(true); }); box.appendChild(jb);
      return;
    }
    var seg = el("div", "x-seg"); seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "Rank by");
    LBT.forEach(function (t) {
      var b = el("button", null, t[1]); b.type = "button"; b.setAttribute("aria-pressed", String(lbTab === t[0]));
      b.addEventListener("click", function () { lbTab = t[0]; renderLB(); }); seg.appendChild(b);
    });
    box.appendChild(seg);
    var me = window.fitLB.uid(), st = myStats(S);
    var mine = { uid: me, name: myName(S), photo: S.profile.photo || null, wMin: st.wMin, wCnt: st.wCnt, streak: st.streak };
    var list = lbList.filter(function (r) { return r.uid !== me; }).concat([mine]);
    var key = lbTab;
    list.sort(function (x, y) { return (Number(y[key]) || 0) - (Number(x[key]) || 0) || (Number(y.wMin) || 0) - (Number(x.wMin) || 0) || String(x.name).localeCompare(String(y.name)); });
    function val(r) { var v = Number(r[key]) || 0; return key === "wMin" ? v + " min" : key === "streak" ? v + (v === 1 ? " day" : " days") : String(v); }
    function row(r, i) {
      var li = el("li", r.uid === me ? "me" : ""), rk = el("span", "lb-r", String(i + 1));
      if (i === 0) rk.style.color = "var(--heat)"; else if (i < 3) rk.style.color = "var(--accent)";
      var av = el("span", "x-av lb-av"); avFill(av, r.photo, r.name);
      li.appendChild(rk); li.appendChild(av);
      li.appendChild(el("span", "lb-n", String(r.name || "Athlete") + (r.uid === me ? " (you)" : "")));
      li.appendChild(el("span", "lb-v", val(r)));
      return li;
    }
    var ul = el("ul", "lb-list");
    list.slice(0, 20).forEach(function (r, i) { ul.appendChild(row(r, i)); });
    var mi = list.indexOf(mine);
    if (mi >= 20) ul.appendChild(row(mine, mi));
    box.appendChild(ul);
    var note2 = lbBusy ? "Loading\u2026" : lbMsg || (list.length === 1 ? "You are the first one here this week. Invite a friend!" : "Resets every Monday (UTC).");
    var n = el("p", "meta", note2); n.style.margin = "10px 0 0"; box.appendChild(n);
    var bt = el("div", "x-btns"), rf = el("button", "chip", "Refresh"), lv = el("button", "chip x-danger", "Leave leaderboard");
    rf.type = lv.type = "button";
    rf.addEventListener("click", lbLoad);
    lv.addEventListener("click", function () { if (confirm("Leave the leaderboard? Your entry will be removed.")) setLB(false); });
    bt.appendChild(rf); bt.appendChild(lv); box.appendChild(bt);
  }
  document.addEventListener("fit:render", function () { renderLB(); schedulePublish(); });
  document.addEventListener("fit:auth", function () { lastPub = ""; renderLB(); schedulePublish(); lbLoad(); });
  renderLB();

  // ---- Activity tracker (GPS distance + step counting) ----
  var tcs = document.createElement("style");
  tcs.textContent =
    ".t-read{display:grid;grid-template-columns:repeat(3,1fr);gap:12px 8px;text-align:center;margin:14px 0}" +
    ".t-read b{display:block;font-size:22px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums}" +
    ".t-read span{font-size:12px;color:var(--mute)}" +
    "#t-route svg{width:100%;height:auto;display:block;background:var(--bg);border-radius:12px;margin-bottom:10px}" +
    ".x-btns .go{flex:1 1 100%}";
  document.head.appendChild(tcs);
  var trk = sec("x-trk", "Activity tracker",
    '<div class="x-seg" id="t-type" role="group" aria-label="Activity type"><button type="button" data-v="Walk" aria-pressed="true">Walk</button><button type="button" data-v="Run" aria-pressed="false">Run</button><button type="button" data-v="Cycle" aria-pressed="false">Cycle</button></div>' +
    '<div class="t-read"><div><b id="t-km">0.00</b><span>km</span></div><div><b id="t-time">0:00</b><span>time</span></div><div><b id="t-kcal">0</b><span>kcal burned</span></div><div><b id="t-pace">--</b><span>min/km</span></div><div><b id="t-steps">0</b><span id="t-sl">steps</span></div><div><b id="t-spd">--</b><span>km/h</span></div></div>' +
    '<div id="t-route"></div><p class="meta" id="t-gps" role="status" style="margin:0 0 10px"></p>' +
    '<div class="x-btns"><button class="go" id="t-start" type="button">Start</button><button class="chip" id="t-pause" type="button" hidden>Pause</button><button class="chip" id="t-res" type="button" hidden>Resume</button><button class="chip" id="t-stop" type="button" hidden>Stop and save</button><button class="chip x-danger" id="t-disc" type="button" hidden>Discard</button></div>' +
    '<p class="meta" id="t-today" style="margin:12px 0 0"></p>' +
    '<p class="meta" style="margin:6px 0 0;font-size:12px">Your location stays on this device. Only distance, time, steps and calories are saved. Calories are estimated from your speed and latest logged body weight (70 kg if none). Keep the app open and the screen on while tracking. Add your height in the weight gain plan for better step estimates.</p>');
  prog.before(trk);

  var tState = "idle", tType = "Walk", tDist = 0, tRoute = [], tLast = null, tAcc = 0, tT0 = 0, tWid = null, tGps = null, tErr = "", mSteps = 0, gotMotion = false, wl = null, sm = 9.8, base = 9.8, prevDev = 0, lastStep = 0;

  function hav(p, q) {
    var R = 6371000, r = Math.PI / 180, dl = (q.la - p.la) * r, dn = (q.lo - p.lo) * r;
    var x = Math.sin(dl / 2) * Math.sin(dl / 2) + Math.cos(p.la * r) * Math.cos(q.la * r) * Math.sin(dn / 2) * Math.sin(dn / 2);
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  function stride() {
    var S = window.fitGet(), h = S.plan && S.plan.gain && S.plan.gain.h;
    return tType === "Run" ? (h ? h * 0.0065 : 1.1) : (h ? h * 0.00414 : 0.75);
  }
  function stepsNow() {
    if (tType === "Cycle") return { n: 0, est: false };
    var est = Math.round(tDist / stride());
    if (gotMotion && mSteps > 0 && (tDist < 200 || (mSteps >= est * 0.5 && mSteps <= est * 1.8))) return { n: mSteps, est: false };
    return { n: est, est: true };
  }
  var MET = {
    Walk: [[2, 2], [3.2, 2.8], [4, 3], [4.8, 3.5], [5.6, 4.3], [6.4, 5], [7.2, 7], [8, 8.3]],
    Run: [[6, 6], [8, 8.3], [9.7, 9.8], [11.3, 11], [12.9, 11.8], [14.5, 12.8], [16.1, 14.5]],
    Cycle: [[8, 3.5], [16, 4], [19, 6.8], [22, 8], [26, 10], [30, 12]]
  };
  function interp(t, v) {
    if (v <= t[0][0]) return t[0][1];
    for (var i = 1; i < t.length; i++) if (v <= t[i][0]) return t[i - 1][1] + (t[i][1] - t[i - 1][1]) * (v - t[i - 1][0]) / (t[i][0] - t[i - 1][0]);
    return t[t.length - 1][1];
  }
  function bodyKg(S) { var k = latestKg(S), g = S.plan && S.plan.gain; return k || (g && g.startKg) || 70; }
  function burn(type, distM, ms) {
    var h = ms / 3.6e6; if (h <= 0) return 0;
    var met = distM < 50 ? 2 : interp(MET[type] || MET.Walk, distM / 1000 / h);
    return met * bodyKg(window.fitGet()) * h;
  }
  function elapsed() { return tAcc + (tState === "run" ? Date.now() - tT0 : 0); }
  function mmss(ms) { var s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); s = s % 60; return (h ? h + ":" + ("0" + m).slice(-2) : m) + ":" + ("0" + s).slice(-2); }

  function drawRoute() {
    var box = $("t-route");
    if (tRoute.length < 2) { box.innerHTML = ""; return; }
    var las = tRoute.map(function (p) { return p.la; }), los = tRoute.map(function (p) { return p.lo; });
    var minLa = Math.min.apply(null, las), maxLa = Math.max.apply(null, las), minLo = Math.min.apply(null, los), maxLo = Math.max.apply(null, los);
    var k = Math.cos((minLa + maxLa) / 2 * Math.PI / 180), w = (maxLo - minLo) * k || 1e-6, h = (maxLa - minLa) || 1e-6;
    var W = 300, H = 150, P = 14, sc = Math.min((W - 2 * P) / w, (H - 2 * P) / h), ox = (W - w * sc) / 2, oy = (H - h * sc) / 2;
    var pts = tRoute.map(function (p) { return [ox + (p.lo - minLo) * k * sc, H - oy - (p.la - minLa) * sc]; });
    var d = pts.map(function (c, i) { return (i ? "L" : "M") + c[0].toFixed(1) + " " + c[1].toFixed(1); }).join("");
    var s0 = pts[0], e = pts[pts.length - 1];
    box.innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Your route"><path d="' + d + '" fill="none" style="stroke:var(--accent)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="' + s0[0].toFixed(1) + '" cy="' + s0[1].toFixed(1) + '" r="5" style="fill:var(--ink)"/><circle cx="' + e[0].toFixed(1) + '" cy="' + e[1].toFixed(1) + '" r="6" style="fill:var(--heat)"/></svg>';
  }
  function tUi() {
    var km = tDist / 1000, ms = elapsed(), st = stepsNow(), cyc = tType === "Cycle";
    $("t-km").textContent = km.toFixed(2); $("t-time").textContent = mmss(ms);
    if (km >= 0.02 && ms > 0) {
      var ps = Math.round(ms / 1000 / km);
      $("t-pace").textContent = Math.floor(ps / 60) + ":" + ("0" + ps % 60).slice(-2);
      $("t-spd").textContent = (km / (ms / 3.6e6)).toFixed(1);
    } else { $("t-pace").textContent = "--"; $("t-spd").textContent = "--"; }
    $("t-kcal").textContent = Math.round(burn(tType, tDist, ms)).toLocaleString();
    $("t-steps").textContent = cyc ? "-" : st.n.toLocaleString(); $("t-sl").textContent = st.est && !cyc && st.n ? "steps (est.)" : "steps";
    var g = tErr || (tState === "idle" ? "" : tGps === null ? "Searching for GPS\u2026" : tGps <= 20 ? "GPS signal good (\u00b1" + Math.round(tGps) + " m)" : "GPS signal weak (\u00b1" + Math.round(tGps) + " m)");
    if (tState !== "idle" || tErr) $("t-gps").textContent = g;
    $("t-start").hidden = tState !== "idle"; $("t-pause").hidden = tState !== "run"; $("t-res").hidden = tState !== "pause";
    $("t-stop").hidden = tState === "idle"; $("t-disc").hidden = tState === "idle";
    drawRoute();
  }
  function onPos(p) {
    if (tState !== "run") return;
    var c = p.coords, acc = c.accuracy; tGps = acc; tErr = "";
    if (acc > 35) { tUi(); return; }
    var cur = { la: c.latitude, lo: c.longitude, t: p.timestamp || Date.now() };
    if (!tLast) { tLast = cur; tRoute.push(cur); tUi(); return; }
    var d = hav(tLast, cur), dt = (cur.t - tLast.t) / 1000;
    if (d < Math.max(3, acc * 0.6)) return;
    if (dt > 0 && d / dt > (tType === "Cycle" ? 20 : 11)) { tLast = cur; return; }
    tDist += d; tLast = cur; tRoute.push(cur); tUi();
  }
  function onErr(e) {
    tErr = e.code === 1 ? "Location permission is blocked. Allow it in your browser or phone settings." : e.code === 2 ? "Position unavailable. Try going outdoors." : "GPS is taking a while. Still trying\u2026";
    if (e.code === 1) { pauseTrack(); }
    tUi();
  }
  function watchOn() { if (tWid === null) tWid = navigator.geolocation.watchPosition(onPos, onErr, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 }); }
  function watchOff() { if (tWid !== null) { navigator.geolocation.clearWatch(tWid); tWid = null; } }
  function lock() { if (navigator.wakeLock && !wl) navigator.wakeLock.request("screen").then(function (l) { wl = l; l.addEventListener("release", function () { wl = null; }); }).catch(function () {}); }
  function unlock() { if (wl) { wl.release().catch(function () {}); wl = null; } }
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible" && tState === "run") lock(); });

  function onMotion(e) {
    var a = e.accelerationIncludingGravity; if (!a || a.x == null || tState !== "run") return;
    gotMotion = true;
    var g = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
    sm = sm * 0.6 + g * 0.4; base = base * 0.98 + sm * 0.02;
    var dev = sm - base, t = Date.now();
    if (dev > 1.2 && prevDev <= 1.2 && t - lastStep > 280) { mSteps++; lastStep = t; }
    prevDev = dev;
  }
  function motionOn() {
    var M = window.DeviceMotionEvent; if (!M) return;
    var bind = function () { window.removeEventListener("devicemotion", onMotion); window.addEventListener("devicemotion", onMotion); };
    if (typeof M.requestPermission === "function") M.requestPermission().then(function (r) { if (r === "granted") bind(); }).catch(function () {});
    else bind();
  }
  function motionOff() { window.removeEventListener("devicemotion", onMotion); }

  function resetTrack() {
    watchOff(); unlock(); motionOff();
    tState = "idle"; tDist = 0; tRoute = []; tLast = null; tAcc = 0; tGps = null; tErr = ""; mSteps = 0; gotMotion = false; sm = base = 9.8; prevDev = 0;
    tUi();
  }
  function pauseTrack() { if (tState !== "run") return; tAcc += Date.now() - tT0; tState = "pause"; watchOff(); unlock(); tUi(); }
  $("t-type").addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("button"); if (!b || tState !== "idle") return;
    tType = b.getAttribute("data-v");
    this.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
    tUi();
  });
  $("t-start").addEventListener("click", function () {
    if (!("geolocation" in navigator)) { tErr = "This browser does not support location."; $("t-gps").textContent = tErr; return; }
    resetTrack(); motionOn();
    tState = "run"; tT0 = Date.now(); watchOn(); lock(); tUi();
  });
  $("t-pause").addEventListener("click", pauseTrack);
  $("t-res").addEventListener("click", function () { tErr = ""; tT0 = Date.now(); tState = "run"; tLast = null; watchOn(); lock(); tUi(); });
  $("t-disc").addEventListener("click", function () { if (confirm("Discard this activity?")) { resetTrack(); $("t-gps").textContent = ""; } });
  $("t-stop").addEventListener("click", function () {
    pauseTrack();
    var ms = tAcc, km = tDist / 1000, st = stepsNow(), kc = Math.round(burn(tType, tDist, ms));
    if (ms < 30000 && km < 0.02) { resetTrack(); $("t-gps").textContent = "Too short to save."; return; }
    var S = window.fitGet(); S.log = S.log || [];
    S.log.push({ id: Date.now(), t: Date.now(), name: tType, mins: Math.max(1, Math.round(ms / 60000)), sr: "", kg: 0, km: Math.round(km * 100) / 100, steps: st.n, kcal: kc });
    var msg = "Saved: " + km.toFixed(2) + " km" + (st.n ? " \u00b7 " + st.n.toLocaleString() + " steps" : "") + " \u00b7 " + kc + " kcal \u00b7 " + mmss(ms);
    resetTrack(); commit(S); $("t-gps").textContent = msg;
  });
  function todayLine() {
    var S = window.fitGet(), tk = dayKey(Date.now()), km = 0, steps = 0, kc = 0;
    (S.log || []).forEach(function (w) { if (dayKey(w.t) === tk) { km += w.km || 0; steps += w.steps || 0; kc += w.kcal || 0; } });
    $("t-today").textContent = km || steps || kc ? "Today: " + steps.toLocaleString() + " steps \u00b7 " + (Math.round(km * 100) / 100) + " km \u00b7 " + kc.toLocaleString() + " kcal burned" : "No tracked activity today yet.";
  }
  setInterval(function () { if (tState === "run") tUi(); }, 1000);
  document.addEventListener("fit:render", todayLine);
  todayLine(); tUi();

  // ---- Coming soon (Monk Mode challenge + roadmap) ----
  var scs = document.createElement("style");
  scs.textContent =
    ".x-mm{background:linear-gradient(135deg,color-mix(in srgb,var(--accent) 18%,var(--surface)),var(--surface));border:1px solid color-mix(in srgb,var(--accent) 35%,var(--line));border-radius:16px;padding:16px}" +
    ".x-soon-h{display:flex;align-items:center;justify-content:space-between;gap:10px}.x-soon-h b{font-size:18px;font-weight:800;letter-spacing:-.02em}" +
    ".x-tag{flex:none;font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--surface);background:var(--heat);border-radius:999px;padding:3px 10px}" +
    ".x-fi{display:flex;gap:10px;align-items:flex-start;padding:5px 0;font-size:14px}" +
    ".x-ck{flex:none;width:16px;height:16px;border-radius:50%;border:2px solid var(--accent);margin-top:2px}" +
    ".x-more-h{margin:18px 0 4px;font-size:13px;font-weight:800;color:var(--mute);text-transform:uppercase;letter-spacing:.05em}" +
    ".x-mr{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;font-size:14px;border-top:1px solid var(--line)}" +
    ".x-mr:first-of-type{border-top:0}" +
    ".chip[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:var(--surface)}";
  document.head.appendChild(scs);
  var MONK = ["Pick a length: 7, 14 or 30 days", "Daily checklist: workout, steps goal, water, early sleep, no junk food, no doomscrolling", "Add your own custom rules", "Strict mode: miss a day and the streak resets", "Morning plan and evening check-in reminders", "Distraction-free focus timer for deep work", "Calendar heatmap of your clean days", "Milestone badges at day 7, 14 and 30", "Weekly reflection notes", "Invite friends and rank on a challenge board"];
  var MORE = [["push", "Reminders when the app is fully closed"], ["meals", "Meal and calorie log"], ["friends", "Friends and group challenges"], ["templates", "Workout templates and routines"]];
  var soon = sec("x-soon", "Coming soon",
    '<div class="x-mm"><div class="x-soon-h"><b>Monk Mode challenge</b><span class="x-tag">Coming soon</span></div>' +
    '<p class="meta" style="margin:6px 0 10px">A focused challenge to build discipline: train daily, cut distractions and sleep on time.</p>' +
    MONK.map(function (t) { return '<div class="x-fi"><span class="x-ck"></span><span>' + t + "</span></div>"; }).join("") +
    '<button class="chip" id="x-mmb" data-k="monk" type="button" style="margin-top:12px"></button></div>' +
    '<p class="x-more-h">Also on the way</p>' +
    MORE.map(function (m) { return '<div class="x-mr"><span>' + m[1] + '</span><button class="chip" data-k="' + m[0] + '" type="button"></button></div>'; }).join("") +
    '<p class="meta" style="margin:12px 0 0;font-size:12px">Tap to show you want a feature. It helps decide what gets built first.</p>');
  $("list").parentNode.after(soon);
  function renderSoon() {
    var S = window.fitGet(), want = (S.profile && S.profile.soon) || {};
    soon.querySelectorAll("button[data-k]").forEach(function (b) {
      var on = !!want[b.getAttribute("data-k")], isMonk = b.getAttribute("data-k") === "monk";
      b.setAttribute("aria-pressed", String(on));
      b.textContent = on ? "You\u2019re on the list \u2713" : isMonk ? "Count me in" : "I want this";
    });
  }
  soon.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("button[data-k]"); if (!b) return;
    var k = b.getAttribute("data-k"), S = window.fitGet();
    S.profile = S.profile || {}; S.profile.soon = S.profile.soon || {};
    S.profile.soon[k] = !S.profile.soon[k];
    commit(S);
  });
  document.addEventListener("fit:render", renderSoon);
  renderSoon();

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
    [["Weekly summary", sum], ["Log a workout", $("f") && $("f").parentNode], ["Activity tracker", trk], ["Progress", prog], ["Body weight", body], ["Weight gain plan", gain], ["Workout plan", sched], ["Leaderboard", lbSec], ["Rest timer", $("rest")], ["History", $("list").parentNode], ["Coming soon", soon]].forEach(function (it) {
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

  // ---- Settings page + profile photo ----
  var ss = document.createElement("style");
  ss.textContent =
    ".x-hav{margin-left:auto;flex:none;width:44px;height:44px;padding:0;display:flex;align-items:center;justify-content:center;border:1px solid var(--line);border-radius:50%;background:var(--accent) center/cover no-repeat;color:var(--surface);font:800 18px \"Archivo\",sans-serif;text-transform:uppercase;cursor:pointer}" +
    ".x-burger{margin-left:0}" +
    ".x-av{background-size:cover;background-position:center}.x-big{width:96px;height:96px;font-size:36px}" +
    "#x-set{position:fixed;inset:0;z-index:70;background:var(--bg);overflow-y:auto;visibility:hidden;transform:translateY(100%);transition:transform .25s ease,visibility 0s .25s}" +
    "#x-set.open{visibility:visible;transform:none;transition-delay:0s,0s}" +
    ".x-sheet{max-width:520px;margin:0 auto;padding:calc(16px + env(safe-area-inset-top,0px)) 16px calc(32px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:16px}" +
    ".x-pro{display:flex;flex-direction:column;align-items:center;gap:12px;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:20px}" +
    ".x-pbtns{display:flex;gap:8px}" +
    ".x-f{display:flex;flex-direction:column;gap:8px;font-size:13px;color:var(--mute);background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px}" +
    ".x-seg{display:flex;gap:6px}" +
    ".x-seg button{flex:1;font:600 14px \"Archivo\",sans-serif;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:10px;cursor:pointer}" +
    ".x-seg button[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:var(--surface)}" +
    ".x-sw{display:flex;flex-wrap:wrap;gap:12px}.x-sw button{width:40px;height:40px;padding:0;border-radius:50%;border:3px solid var(--surface);box-shadow:0 0 0 1px var(--line);cursor:pointer}" +
    ".x-sw button[aria-pressed=true]{box-shadow:0 0 0 3px var(--ink)}" +
    "label.x-row{flex-direction:row;align-items:center;justify-content:space-between;font-size:15px;color:var(--ink)}" +
    "label.x-row input{width:24px;height:24px;padding:0;flex:none;accent-color:var(--accent)}" +
    ".x-f .x-pbtns{flex-wrap:wrap;justify-content:flex-start}" +
    ".x-danger{color:var(--heat);border-color:var(--heat)}" +
    "@media(prefers-reduced-motion:reduce){#x-set{transition:none}}";
  document.head.appendChild(ss);

  var sh = document.createElement("div");
  sh.id = "x-set";
  sh.innerHTML = '<div class="x-sheet" role="dialog" aria-modal="true" aria-label="Settings">' +
    '<div class="x-top"><b>Settings</b><button type="button" class="x-close" id="x-sclose" aria-label="Close settings">\u00d7</button></div>' +
    '<div class="x-pro"><span class="x-av x-big" id="x-sav">?</span><div class="x-pbtns"><button class="chip" id="x-up" type="button">Change photo</button><button class="chip" id="x-rm" type="button">Remove</button></div>' +
    '<input id="x-file" type="file" accept="image/*" hidden></div>' +
    '<label class="x-f">Display name<input id="x-pn" maxlength="30" placeholder="Your name" autocomplete="name"></label>' +
    '<label class="x-f">Weekly goal (minutes)<input id="x-gl" type="number" min="10" step="10" inputmode="numeric"></label>' +
    '<div class="x-f"><span>Appearance</span><div class="x-seg" role="group" aria-label="Appearance"><button type="button" data-t="">Auto</button><button type="button" data-t="light">Light</button><button type="button" data-t="dark">Dark</button></div></div>' +
    '<div class="x-f"><span>Accent color</span><div class="x-sw" id="x-sw" role="group" aria-label="Accent color"></div></div>' +
    '<div class="x-f"><span>Card style</span><div class="x-seg" id="x-card" role="group" aria-label="Card style"><button type="button" data-v="">Soft</button><button type="button" data-v="outline">Outline</button></div></div>' +
    '<div class="x-f"><span>Layout density</span><div class="x-seg" id="x-den" role="group" aria-label="Layout density"><button type="button" data-v="">Comfortable</button><button type="button" data-v="compact">Compact</button></div></div>' +
    '<label class="x-f x-row">Vibrate when rest timer ends<input type="checkbox" id="x-vb"></label>' +
    '<label class="x-f x-row">Show me on the leaderboard<input type="checkbox" id="x-lb"></label>' +
    '<div class="x-f"><span>Your data</span><p class="meta" id="x-ds" style="margin:0"></p><div class="x-pbtns"><button class="chip" id="x-bk" type="button">Download backup</button><button class="chip" id="x-rs" type="button">Restore backup</button><button class="chip x-danger" id="x-da" type="button">Delete all data</button></div><input id="x-rf" type="file" accept="application/json,.json" hidden></div>' +
    '<p class="meta" id="x-sn" role="status"></p></div>';
  document.body.appendChild(sh);

  var hav = document.createElement("button");
  hav.type = "button"; hav.className = "x-hav"; hav.setAttribute("aria-label", "Open settings");
  if (brand) brand.insertBefore(hav, burger);

  function okPhoto(p) { return !!(p && typeof p.photo === "string" && /^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(p.photo)); }
  function paint(el, S, fb) {
    var pr = S.profile || {};
    if (okPhoto(pr)) { el.style.backgroundImage = 'url("' + pr.photo + '")'; el.textContent = ""; }
    else { el.style.backgroundImage = ""; el.textContent = ((pr.name || fb || "?").trim().charAt(0)) || "?"; }
  }
  function paintAll() {
    var S = window.fitGet(), u = window.fitUser, mail = (u && u.email) || "";
    var fb = (u && u.name) || mail.split("@")[0] || "";
    paint(hav, S, fb); paint($("x-av"), S, fb); paint($("x-sav"), S, fb);
    $("x-name").textContent = (S.profile && S.profile.name) || fb || "Local only";
    $("x-rm").hidden = !okPhoto(S.profile || {});
  }
  function note(t) { $("x-sn").textContent = t; }
  function toThumb(file, cb) {
    var img = new Image(), url = URL.createObjectURL(file);
    img.onload = function () {
      var s = Math.min(img.width, img.height), c = document.createElement("canvas");
      c.width = c.height = 192;
      c.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 192, 192);
      URL.revokeObjectURL(url); cb(c.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = function () { URL.revokeObjectURL(url); cb(null); };
    img.src = url;
  }
  $("x-up").addEventListener("click", function () { $("x-file").click(); });
  $("x-file").addEventListener("change", function () {
    var f = this.files && this.files[0]; this.value = "";
    if (!f) return;
    if (!/^image\//.test(f.type)) { note("Please choose an image."); return; }
    toThumb(f, function (d) {
      if (!d) { note("Could not read that image."); return; }
      var S = window.fitGet(); S.profile = S.profile || {}; S.profile.photo = d;
      commit(S); note("Photo updated.");
    });
  });
  $("x-rm").addEventListener("click", function () {
    var S = window.fitGet(); if (S.profile) { S.profile.photo = null; commit(S); note("Photo removed."); }
  });
  $("x-pn").addEventListener("change", function () {
    var S = window.fitGet(); S.profile = S.profile || {}; S.profile.name = this.value.trim().slice(0, 30); commit(S);
  });
  $("x-gl").addEventListener("change", function () {
    var S = window.fitGet(); S.goal = Math.max(10, parseInt(this.value, 10) || 150); commit(S);
  });

  function applyTheme(t) {
    var r = document.documentElement;
    if (t) r.setAttribute("data-theme", t); else r.removeAttribute("data-theme");
    try { if (t) localStorage.setItem("fit-theme", t); else localStorage.removeItem("fit-theme"); } catch (e) {}
  }
  function markTheme() {
    var t = document.documentElement.getAttribute("data-theme") || "";
    sh.querySelectorAll('.x-seg[aria-label="Appearance"] button').forEach(function (b) { b.setAttribute("aria-pressed", String((b.getAttribute("data-t") || "") === t)); });
  }
  sh.querySelector('.x-seg[aria-label="Appearance"]').addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("button"); if (!b) return;
    applyTheme(b.getAttribute("data-t") || ""); markTheme();
  });

  // accent colors
  var ACC = { "": ["Teal", "#0f8b8d"], violet: ["Violet", "#6d4aff"], blue: ["Blue", "#2563eb"], rose: ["Rose", "#d6336c"], green: ["Green", "#15803d"], orange: ["Orange", "#c2410c"], sky: ["Sky", "#0369a1"] };
  Object.keys(ACC).forEach(function (k) {
    var b = document.createElement("button");
    b.type = "button"; b.setAttribute("data-a", k); b.setAttribute("aria-label", ACC[k][0]); b.style.background = ACC[k][1];
    $("x-sw").appendChild(b);
  });
  function markAccent() {
    var k = document.documentElement.getAttribute("data-accent") || "";
    $("x-sw").querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-a") === k)); });
  }
  $("x-sw").addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("button"); if (!b) return;
    var k = b.getAttribute("data-a") || "", r = document.documentElement;
    if (k) r.setAttribute("data-accent", k); else r.removeAttribute("data-accent");
    try { if (k) localStorage.setItem("fit-accent", k); else localStorage.removeItem("fit-accent"); } catch (x) {}
    markAccent();
  });

  // vibration
  function vibOnS() { try { return localStorage.getItem("fit-vib") !== "0"; } catch (e) { return true; } }
  $("x-vb").addEventListener("change", function () { try { localStorage.setItem("fit-vib", this.checked ? "1" : "0"); } catch (e) {} });

  // data: backup, restore, delete
  function statsLine() { var S = window.fitGet(); $("x-ds").textContent = (S.log || []).length + " workouts \u00b7 " + (S.weights || []).length + " weigh-ins"; }
  function mergeById(a, b) { var m = {}; (a || []).concat(b || []).forEach(function (w) { m[w.id] = w; }); return Object.keys(m).map(function (k) { return m[k]; }); }
  $("x-bk").addEventListener("click", function () {
    var S = window.fitGet();
    var txt = JSON.stringify({ app: "consonant-fit", v: 1, exported: new Date().toISOString(), log: S.log || [], weights: S.weights || [], goal: S.goal });
    var l = document.createElement("a"); l.href = URL.createObjectURL(new Blob([txt], { type: "application/json" }));
    l.download = "consonant-fit-backup.json"; document.body.appendChild(l); l.click(); l.remove();
    note("Backup downloaded.");
  });
  $("x-rs").addEventListener("click", function () { $("x-rf").click(); });
  $("x-rf").addEventListener("change", function () {
    var f = this.files && this.files[0]; this.value = "";
    if (!f) return;
    if (f.size > 5e6) { note("That file is too large."); return; }
    var rd = new FileReader();
    rd.onload = function () {
      var d; try { d = JSON.parse(rd.result); } catch (e) { note("That is not a valid backup file."); return; }
      if (!d || d.app !== "consonant-fit" || !Array.isArray(d.log)) { note("That is not a Consonant-Fit backup."); return; }
      var num = function (v) { return typeof v === "number" && isFinite(v); };
      var log = d.log.filter(function (w) { return w && num(w.t) && typeof w.name === "string" && num(w.mins); }).slice(0, 5000).map(function (w) {
        return { id: w.id != null ? w.id : w.t, t: w.t, name: w.name.slice(0, 40), mins: Math.max(1, Math.round(w.mins)), sr: typeof w.sr === "string" ? w.sr.slice(0, 20) : "", kg: num(w.kg) && w.kg > 0 ? w.kg : 0, km: num(w.km) && w.km > 0 && w.km < 1000 ? w.km : 0, steps: num(w.steps) && w.steps > 0 && w.steps < 200000 ? Math.round(w.steps) : 0, kcal: num(w.kcal) && w.kcal > 0 && w.kcal < 20000 ? Math.round(w.kcal) : 0 };
      });
      var wts = (Array.isArray(d.weights) ? d.weights : []).filter(function (w) { return w && num(w.t) && num(w.kg) && w.kg >= 20 && w.kg <= 400; }).slice(0, 5000).map(function (w) {
        return { id: w.id != null ? w.id : w.t, t: w.t, kg: w.kg };
      });
      if (!log.length && !wts.length) { note("Nothing to restore in that file."); return; }
      if (!confirm("Add " + log.length + " workouts and " + wts.length + " weigh-ins from this backup? Your current data stays.")) return;
      var S = window.fitGet(); S.log = mergeById(S.log, log); S.weights = mergeById(S.weights, wts);
      commit(S); statsLine(); note("Restored " + log.length + " workouts and " + wts.length + " weigh-ins.");
    };
    rd.onerror = function () { note("Could not read that file."); };
    rd.readAsText(f);
  });
  $("x-da").addEventListener("click", function () {
    if (!confirm("Delete ALL workouts and weigh-ins? This cannot be undone. Download a backup first if unsure.")) return;
    var S = window.fitGet(); S.log = []; S.weights = [];
    commit(S); statsLine(); note("All workout data deleted.");
  });

  $("x-lb").addEventListener("change", function () { setLB(this.checked); });
  function bindSeg(id, attr, key) {
    var box = $(id);
    function mark() {
      var v = document.documentElement.getAttribute(attr) || "";
      box.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", String((b.getAttribute("data-v") || "") === v)); });
    }
    box.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("button"); if (!b) return;
      var v = b.getAttribute("data-v") || "", r = document.documentElement;
      if (v) r.setAttribute(attr, v); else r.removeAttribute(attr);
      try { if (v) localStorage.setItem(key, v); else localStorage.removeItem(key); } catch (x) {}
      mark();
    });
    return mark;
  }
  var markCard = bindSeg("x-card", "data-card", "fit-card"), markDen = bindSeg("x-den", "data-density", "fit-density");

  var setFocus = null;
  function openSet() {
    setFocus = document.activeElement;
    var S = window.fitGet();
    $("x-pn").value = (S.profile && S.profile.name) || ""; $("x-gl").value = S.goal || 150;
    note(""); markTheme(); markAccent(); markCard(); markDen(); $("x-vb").checked = vibOnS(); $("x-lb").checked = !!(S.profile && S.profile.lb); statsLine(); paintAll();
    sh.classList.add("open"); document.body.style.overflow = "hidden";
    setTimeout(function () { $("x-sclose").focus(); }, 50);
  }
  function closeSet() {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    sh.classList.remove("open"); document.body.style.overflow = "";
    if (setFocus && setFocus.focus) setFocus.focus({ preventScroll: true });
  }
  $("x-sclose").addEventListener("click", closeSet);
  hav.addEventListener("click", openSet);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && sh.classList.contains("open")) closeSet(); });
  var sb = document.createElement("button");
  sb.type = "button"; sb.className = "x-act"; sb.id = "x-setb"; sb.textContent = "Settings";
  $("x-acts").insertBefore(sb, $("x-acts").firstChild);
  sb.addEventListener("click", function () { closeNav(); openSet(); });
  var su = document.createElement("button");
  su.type = "button"; su.className = "x-act x-su"; su.textContent = "Sign up to save your data";
  $("x-acts").insertBefore(su, $("x-acts").firstChild);
  su.addEventListener("click", function () { closeNav(); if (window.fitTour) window.fitTour.signup(); });

  document.addEventListener("fit:render", paintAll);
  document.addEventListener("fit:auth", paintAll);
  paintAll();

  // ---- Hero card (greeting + progress ring) ----
  var QUOTES = ["Small sessions still count.", "Show up today, thank yourself later.", "One more set. Then another.", "Progress is quiet. Keep logging.", "Strong is built on ordinary days.", "Rest is part of the plan.", "Beat yesterday's you.", "Consistency beats intensity.", "Start light, finish proud.", "Your future self is watching.", "Do it for the next version of you.", "Every rep is a vote for who you become."];
  var hero = document.createElement("section");
  hero.id = "x-hero";
  hero.innerHTML = '<p class="hg" id="hg-g"></p><p class="hq" id="hg-q"></p><div class="hr"><div class="ringw">' +
    '<svg viewBox="0 0 120 120" aria-hidden="true"><defs><linearGradient id="hg-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--accent)"/><stop offset="1" style="stop-color:var(--heat)"/></linearGradient></defs>' +
    '<circle class="tr" cx="60" cy="60" r="50" fill="none" stroke-width="11"/><circle class="pg" id="hg-ring" cx="60" cy="60" r="50" fill="none" stroke="url(#hg-grad)" stroke-width="11" stroke-linecap="round" stroke-dasharray="314.16" stroke-dashoffset="314.16"/></svg>' +
    '<div class="ringc"><b id="hg-m">0</b><span id="hg-of"></span></div></div>' +
    '<div class="hstats"><div class="hs"><b id="hg-s">0</b><span>day streak</span></div><div class="hs"><b id="hg-c">0</b><span>workouts this week</span></div><div class="hs"><b id="hg-p">0%</b><span>of weekly goal</span></div><div class="hs"><b id="hg-st">0</b><span>steps today</span></div></div></div>';
  if (brand) brand.after(hero);
  var tb = document.createElement("div");
  tb.id = "x-tour";
  tb.innerHTML = '<span>Guest mode. Your data stays on this phone.</span><button type="button" id="x-tsu">Sign up free</button>';
  if (brand) brand.after(tb);
  $("x-tsu").addEventListener("click", function () { if (window.fitTour) window.fitTour.signup(); });
  ["main > h1", "main > .big", "main > .bar", "main > .row", "main > .goal"].forEach(function (q) { var e = document.querySelector(q); if (e) e.style.display = "none"; });
  function updateHero() {
    var S = window.fitGet(), u = window.fitUser, d0 = new Date(); d0.setHours(0, 0, 0, 0);
    var s1 = d0.getTime() - 6 * D, min = 0, cnt = 0, today = false, stepsT = 0, tk = dayKey(Date.now());
    (S.log || []).forEach(function (w) { if (w.t >= s1) { min += w.mins; cnt++; } if (dayKey(w.t) === tk) { today = true; stepsT += w.steps || 0; } });
    var goal = S.goal || 150, pct = Math.min(100, Math.round(min / goal * 100)), st = myStats(S).streak, hr = new Date().getHours();
    var nm = ((S.profile && S.profile.name) || (u && u.name) || "").trim().split(/\s+/)[0];
    $("hg-g").textContent = (hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening") + (nm ? ", " + nm : "");
    $("hg-q").textContent = today ? "You trained today. Great work, now recover well." : st > 0 ? "Keep your " + st + "-day streak going." : QUOTES[Math.floor(Date.now() / 864e5) % QUOTES.length];
    $("hg-m").textContent = min; $("hg-of").textContent = "of " + goal + " min";
    $("hg-ring").style.strokeDashoffset = String(314.16 * (1 - pct / 100));
    $("hg-s").textContent = st; $("hg-c").textContent = cnt; $("hg-p").textContent = pct + "%"; $("hg-st").textContent = stepsT.toLocaleString();
  }
  document.addEventListener("fit:render", updateHero);
  document.addEventListener("fit:auth", updateHero);
  updateHero();

  // ---- Section icons ----
  var ICONS = { "Last 7 days": "M3 3v18h18M7 14v4M12 9v9M17 5v13", "Log a workout": "M12 5v14M5 12h14", "Weekly summary": "M3 17l6-6 4 4 8-8M15 7h6v6", "Progress": "M3 3v18h18M7 15l4-4 3 3 5-6", "Activity tracker": "M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z", "Body weight": "M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM8 10a4 4 0 0 1 8 0M12 10l2-2", "Weight gain plan": "M5 21V4M5 4h12l-2 4 2 4H5", "Workout plan": "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4", "Leaderboard": "M8 4h8v5a4 4 0 0 1-8 0zM8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3M12 13v4M8 20h8", "Rest timer": "M12 7v5l3 2M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z", "History": "M4 6h16M4 12h16M4 18h10", "Coming soon": "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" };
  document.querySelectorAll("main h2").forEach(function (h) {
    var d = ICONS[h.textContent.trim()];
    if (d && !h.querySelector("svg")) h.insertAdjacentHTML("afterbegin", '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '"/></svg>');
  });

  document.addEventListener("fit:render", update);
  update();
})();
