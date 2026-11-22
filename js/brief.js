/* Today's Beach Brief: tides, NWS forecast, UV, beach-day rating, fishing window, rip current. */
(function () {
  "use strict";

  var CACHE_KEY = "hb-brief-cache-v1";
  var CACHE_MS = 30 * 60 * 1000;
  var STATION_ID = "8659414";
  var STATION_NAME = "Varnamtown, Lockwoods Folly River";
  var LAT = 33.914;
  var LON = -78.27;
  var NWS_POINTS = "https://api.weather.gov/points/" + LAT + "," + LON;
  var NWS_FORECAST = "https://api.weather.gov/gridpoints/ILM/79,60/forecast";
  var NWS_SRF_LIST = "https://api.weather.gov/products/types/SRF/locations/ILM";
  var BEACH_FORECAST_URL = "https://www.weather.gov/beach/ilm";
  var RIP_SAFETY_URL = "https://www.weather.gov/safety/ripcurrent";
  var UV_URL = "https://api.open-meteo.com/v1/forecast?latitude=" + LAT +
    "&longitude=" + LON + "&daily=uv_index_max&timezone=America%2FNew_York";
  var ADVERTISE_URL = "advertise/";

  function $(id) { return document.getElementById(id); }

  function nyDateStr(d) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric", month: "2-digit", day: "2-digit"
    }).format(d);
  }

  function nyWeekday(d) {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", weekday: "long"
    }).format(d);
  }

  function nyMonth(d) {
    return Number(new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", month: "numeric"
    }).format(d));
  }

  function addDaysYmd(ymd, days) {
    var p = ymd.split("-").map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + days));
    return d.toISOString().slice(0, 10);
  }

  function formatClock(t) {
    var hm = (t.split(" ")[1] || "00:00").split(":");
    var h = parseInt(hm[0], 10);
    var m = hm[1];
    var ap = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return h + ":" + m + " " + ap;
  }

  function parseTideDate(t) { return t.split(" ")[0]; }

  function parseTideMinutes(t) {
    var parts = t.split(" ");
    var hm = (parts[1] || "00:00").split(":");
    return parseInt(hm[0], 10) * 60 + parseInt(hm[1], 10);
  }

  function minutesToClock(mins) {
    mins = (mins + 24 * 60) % (24 * 60);
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    var ap = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return h + ":" + String(m).padStart(2, "0") + " " + ap;
  }

  function tideUrl(begin, hours) {
    return "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter" +
      "?product=predictions&application=HoldenBeachMap" +
      "&begin_date=" + begin.replace(/-/g, "") +
      "&range=" + hours +
      "&datum=MLLW&station=" + STATION_ID +
      "&time_zone=lst_ldt&units=english&interval=hilo&format=json";
  }

  function getCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || !obj.ts) return null;
      return obj;
    } catch (e) { return null; }
  }

  function setCache(data) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (e) { /* private mode */ }
  }

  function fetchJson(url, opts) {
    opts = opts || {};
    var headers = opts.headers || {};
    return fetch(url, { headers: headers }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    });
  }

  function settledValue(p) {
    return p.then(function (v) { return { ok: true, value: v }; },
      function (e) { return { ok: false, error: e }; });
  }

  function parseWindMph(s) {
    var nums = String(s || "").match(/\d+/g);
    if (!nums) return 0;
    return Math.max.apply(null, nums.map(Number));
  }

  function uvLabel(v) {
    if (v == null || isNaN(v)) return null;
    var n = Number(v);
    var name = n < 3 ? "Low" : n < 6 ? "Moderate" : n < 8 ? "High" : n < 11 ? "Very High" : "Extreme";
    return { value: Math.round(n * 10) / 10, name: name };
  }

  function beachRating(period) {
    if (!period) return { label: "—", note: "Need a forecast to rate the beach day." };
    var temp = Number(period.temperature);
    var wind = parseWindMph(period.windSpeed);
    var popObj = period.probabilityOfPrecipitation || {};
    var pop = popObj.value;
    var forecast = String(period.shortForecast || "").toLowerCase();
    if (pop == null) {
      if (/thunderstorm|heavy rain/.test(forecast)) pop = 80;
      else if (/rain|shower/.test(forecast)) pop = 50;
      else if (/slight chance/.test(forecast)) pop = 20;
      else pop = 10;
    }
    var score = 3; // Good, then adjust
    if (pop >= 70 || /thunderstorm|heavy rain/.test(forecast)) score -= 2;
    else if (pop >= 50 || /likely/.test(forecast)) score -= 1;
    else if (pop >= 40 || /rain|shower/.test(forecast)) score -= 1;
    if (wind >= 25) score -= 2;
    else if (wind >= 18) score -= 1;
    if (!isNaN(temp) && (temp <= 55 || temp >= 98)) score -= 1;
    if (!isNaN(temp) && temp >= 72 && temp <= 88 && pop < 30 && wind < 15) score += 1;
    score = Math.max(1, Math.min(4, score));
    return {
      label: ["", "Poor", "Fair", "Good", "Great"][score],
      score: score,
      note: "Rough guide from today’s forecast."
    };
  }

  function pickForecast(periods) {
    var today = nyDateStr(new Date());
    var now = Date.now();
    var day = null, night = null, overnight = null;
    (periods || []).forEach(function (p) {
      var d = p.startTime ? nyDateStr(new Date(p.startTime)) : "";
      var name = p.name || "";
      var end = p.endTime ? new Date(p.endTime).getTime() : 0;
      if (p.isDaytime && (d === today || !day) && !day) {
        if (d === today) day = p;
      }
      if (!p.isDaytime) {
        if (/^Overnight$/i.test(name) && end > now) overnight = p;
        if (/(Tonight|\bNight)$/i.test(name) && d === today && !night) night = p;
      }
    });
    if (!day) {
      day = (periods || []).filter(function (p) { return p.isDaytime; })[0] || (periods || [])[0] || null;
    }
    if (!night) night = overnight;
    if (!night) {
      night = (periods || []).filter(function (p) {
        return !p.isDaytime && (p.endTime ? new Date(p.endTime).getTime() > now : true);
      })[0] || null;
    }
    return { day: day, night: night };
  }

  function fishingWindows(predictions, today, tomorrow) {
    var items = (predictions || []).filter(function (p) {
      var d = parseTideDate(p.t);
      return d === today || d === tomorrow;
    });
    var out = [];
    items.forEach(function (p) {
      var mid = parseTideMinutes(p.t);
      var start = mid - 60;
      var end = mid + 60;
      var d = parseTideDate(p.t);
      // If the window crosses midnight, still label by the tide's date
      out.push({
        date: d,
        text: minutesToClock(start) + " – " + minutesToClock(end),
        tide: p.type === "H" ? "high" : "low",
        when: formatClock(p.t)
      });
    });
    return out;
  }

  function inRipSeason(d) {
    var m = nyMonth(d || new Date());
    return m >= 5 && m <= 9;
  }

  function parseRipText(text) {
    if (!text) return null;
    if (/SURF ZONE FORECAST HAS ENDED/i.test(text) || /have ended/i.test(text) && /resume/i.test(text)) {
      return { ended: true };
    }
    var idx = text.search(/Coastal Brunswick/i);
    if (idx < 0) return null;
    var rest = text.slice(idx);
    var end = rest.search(/\n\$\$/);
    if (end > 0) rest = rest.slice(0, end);

    var todayName = nyWeekday(new Date()).toUpperCase();
    var blocks = rest.split(/\n\./);
    var block = null;
    var prefer = ["TODAY", "REST OF TODAY", todayName];
    for (var i = 0; i < blocks.length; i++) {
      var head = (blocks[i].split("...")[0] || "").replace(/^\s+/, "").toUpperCase();
      if (prefer.indexOf(head) >= 0) { block = blocks[i]; break; }
    }
    if (!block) return null;

    var ripSection = block.match(/Rip Current Risk\*?\s*\.{0,}\s*([\s\S]*?)(?:\nSurf Height|\nThunderstorm|\nUV |\nWater |\nWeather|\nHigh Temperature|\nWinds|\nTides|\nRemarks|$)/i);
    var chunk = ripSection ? ripSection[1] : block;
    var east = chunk.match(/East of Ocean Isle Beach\s*\.{0,}\s*(Low|Moderate|High)/i);
    var any = chunk.match(/\b(Low|Moderate|High)\b/i);
    var level = east ? east[1] : (any ? any[1] : null);
    if (!level) {
      var compact = block.match(/rip current risk\*?\s*[:.\s]*(Low|Moderate|High)/i);
      if (compact) level = compact[1];
    }
    if (!level) return null;
    return {
      ended: false,
      level: level.charAt(0).toUpperCase() + level.slice(1).toLowerCase(),
      zone: "Brunswick County beaches (east of Ocean Isle, including Holden Beach)"
    };
  }

  function loadRip() {
    if (!inRipSeason()) return Promise.resolve({ offSeason: true });
    return fetchJson(NWS_SRF_LIST).then(function (list) {
      var items = list["@graph"] || list.products || [];
      if (!items.length) return { offSeason: false, missing: true };
      var latest = items[0];
      var id = latest["@id"] || latest.id;
      if (!id) return { offSeason: false, missing: true };
      return fetchJson(id).then(function (prod) {
        var parsed = parseRipText(prod.productText || prod.product_text || "");
        if (!parsed) return { offSeason: false, unparsed: true };
        if (parsed.ended) return { offSeason: true };
        return parsed;
      });
    });
  }

  function loadAll(force) {
    var cached = getCache();
    if (!force && cached && Date.now() - cached.ts < CACHE_MS && cached.ok) {
      return Promise.resolve(cached);
    }
    var today = nyDateStr(new Date());
    var tidesP = fetchJson(tideUrl(today, 60));
    var wxP = fetchJson(NWS_FORECAST);
    var uvP = fetchJson(UV_URL);
    var ripP = loadRip();
    return Promise.all([settledValue(tidesP), settledValue(wxP), settledValue(uvP), settledValue(ripP)])
      .then(function (parts) {
        var data = { ts: Date.now(), ok: false };
        if (parts[0].ok && parts[0].value && parts[0].value.predictions) {
          data.tides = parts[0].value.predictions;
          data.stationName = STATION_NAME;
          data.stationId = STATION_ID;
        } else if (cached && cached.tides) {
          data.tides = cached.tides;
          data.stationName = cached.stationName;
          data.stationId = cached.stationId;
          data.stale = true;
        } else {
          data.tideError = true;
        }
        if (parts[1].ok && parts[1].value && parts[1].value.properties) {
          data.forecast = pickForecast(parts[1].value.properties.periods || []);
        } else if (cached && cached.forecast) {
          data.forecast = cached.forecast;
          data.stale = true;
        } else {
          data.forecastError = true;
        }
        if (parts[2].ok && parts[2].value && parts[2].value.daily) {
          var days = parts[2].value.daily.time || [];
          var uvs = parts[2].value.daily.uv_index_max || [];
          var i = days.indexOf(today);
          data.uv = uvLabel(i >= 0 ? uvs[i] : uvs[0]);
        } else if (cached && cached.uv) {
          data.uv = cached.uv;
        }
        if (parts[3].ok) data.rip = parts[3].value;
        else data.rip = { unparsed: true };
        data.ok = !!(data.tides || data.forecast);
        if (data.ok) setCache(data);
        else if (cached && (cached.tides || cached.forecast)) {
          cached.stale = true;
          return cached;
        }
        return data;
      });
  }

  function ft(v) {
    var n = Number(v);
    if (isNaN(n)) return v;
    return (Math.round(n * 10) / 10).toFixed(1) + " ft";
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function renderTides(data, today, tomorrow) {
    if (data.tideError && !data.tides) {
      return '<p class="brief-error">Tide times could not be loaded right now.</p>';
    }
    var groups = {};
    groups[today] = [];
    groups[tomorrow] = [];
    (data.tides || []).forEach(function (p) {
      var d = parseTideDate(p.t);
      if (groups[d]) groups[d].push(p);
    });
    function rows(list) {
      if (!list.length) return "<tr><td colspan=\"3\">Not available</td></tr>";
      return list.map(function (p) {
        var kind = p.type === "H" ? "High" : "Low";
        return "<tr><th>" + kind + "</th><td>" + formatClock(p.t) + "</td><td>" + ft(p.v) + "</td></tr>";
      }).join("");
    }
    return '<div class="brief-split">' +
      '<div><h4>Today</h4><table class="brief-table">' + rows(groups[today]) + "</table></div>" +
      '<div><h4>Tomorrow</h4><table class="brief-table">' + rows(groups[tomorrow]) + "</table></div>" +
      "</div>" +
      '<p class="brief-meta">Station: ' + escapeHtml(data.stationName || STATION_NAME) +
      " (NOAA). Heights are in feet, MLLW.</p>";
  }

  function renderWeather(data) {
    if (data.forecastError && !data.forecast) {
      return '<p class="brief-error">The forecast could not be loaded right now.</p>';
    }
    var f = data.forecast || {};
    var day = f.day;
    var night = f.night;
    var html = "";
    if (day) {
      html += '<p class="brief-lead"><strong>' + escapeHtml(day.name || "Today") + ":</strong> " +
        escapeHtml(String(day.temperature)) + "°" + escapeHtml(day.temperatureUnit || "F") +
        " · " + escapeHtml(day.shortForecast || "") + "</p>";
      html += '<p class="brief-line">Wind ' + escapeHtml(day.windDirection || "") + " " +
        escapeHtml(day.windSpeed || "") + "</p>";
      var pop = day.probabilityOfPrecipitation && day.probabilityOfPrecipitation.value;
      if (pop != null) html += '<p class="brief-line">Rain chance ' + pop + "%</p>";
    }
    if (night) {
      html += '<p class="brief-line"><strong>' + escapeHtml(night.name || "Tonight") + ":</strong> " +
        escapeHtml(String(night.temperature)) + "°" + escapeHtml(night.temperatureUnit || "F") +
        " · " + escapeHtml(night.shortForecast || "") + "</p>";
    }
    if (data.uv) {
      html += '<p class="brief-line">UV index ' + data.uv.value + " (" + data.uv.name + ")</p>";
    }
    var rating = beachRating(day);
    html += '<div class="brief-rating score-' + (rating.score || 0) + '">' +
      '<span class="brief-rating-label">Beach day</span>' +
      '<span class="brief-rating-value">' + escapeHtml(rating.label) + "</span>" +
      '<span class="brief-rating-note">' + escapeHtml(rating.note) + "</span></div>";
    return html;
  }

  function renderFishing(data, today, tomorrow) {
    if (!data.tides) {
      return '<p class="brief-error">Fishing windows need tide times.</p>';
    }
    var wins = fishingWindows(data.tides, today, tomorrow);
    var todayWins = wins.filter(function (w) { return w.date === today; });
    var html = '<p class="brief-meta">Best times are about 1 hour around each tide change, based on tide changes — not a bite guarantee.</p>';
    if (!todayWins.length) {
      html += "<p>No tide changes listed for today.</p>";
    } else {
      html += '<ul class="brief-windows">' + todayWins.map(function (w) {
        return "<li>" + escapeHtml(w.text) + " <span>(" + w.tide + " at " + w.when + ")</span></li>";
      }).join("") + "</ul>";
    }
    html += '<p class="brief-sponsor">Presented by <a href="' + ADVERTISE_URL + '">Your business here</a></p>';
    return html;
  }

  function renderRip(data) {
    var rip = data.rip || {};
    var links = '<p class="brief-links"><a href="' + BEACH_FORECAST_URL +
      '" target="_blank" rel="noopener">NWS Wilmington beach forecast</a>' +
      ' · <a href="' + RIP_SAFETY_URL + '" target="_blank" rel="noopener">Rip current safety</a></p>';
    if (inRipSeason() && rip.level) {
      return '<p class="brief-lead"><strong>Rip current risk:</strong> ' +
        escapeHtml(rip.level) + "</p>" +
        '<p class="brief-meta">' + escapeHtml(rip.zone || "Brunswick County beaches") + ".</p>" +
        links;
    }
    return '<p class="brief-lead">Check today’s rip current risk before you go in.</p>' + links;
  }

  function render(data) {
    var body = $("brief-content");
    if (!body) return;
    if (!data || (!data.tides && !data.forecast)) {
      body.innerHTML = '<p class="brief-error">Today’s beach brief could not be loaded. Check your connection and try again.</p>' +
        '<p class="brief-links"><a href="' + BEACH_FORECAST_URL + '" target="_blank" rel="noopener">NWS Wilmington beach forecast</a></p>';
      return;
    }
    var today = nyDateStr(new Date());
    var tomorrow = addDaysYmd(today, 1);
    var stale = data.stale ? '<p class="brief-meta">Showing the last saved brief. Some information may be out of date.</p>' : "";
    body.innerHTML = stale +
      '<section class="brief-sec"><h3>Tides</h3>' + renderTides(data, today, tomorrow) + "</section>" +
      '<section class="brief-sec"><h3>Weather</h3>' + renderWeather(data) + "</section>" +
      '<section class="brief-sec"><h3>Fishing window</h3>' + renderFishing(data, today, tomorrow) + "</section>" +
      '<section class="brief-sec"><h3>Rip current</h3>' + renderRip(data) + "</section>";
  }

  function positionPanel() {
    var panel = $("brief-panel");
    var bar = document.querySelector(".topbar");
    if (!panel || !bar) return;
    var r = bar.getBoundingClientRect();
    panel.style.top = Math.round(r.bottom + 8) + "px";
  }

  function setOpen(open) {
    var panel = $("brief-panel");
    var btn = $("btn-brief");
    if (!panel || !btn) return;
    panel.hidden = !open;
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.classList.toggle("open", open);
    if (open) positionPanel();
  }

  function setup() {
    var btn = $("btn-brief");
    var panel = $("brief-panel");
    if (!btn || !panel) return;
    $("btn-brief-close").addEventListener("click", function () { setOpen(false); });
    btn.addEventListener("click", function () {
      var open = panel.hidden;
      setOpen(open);
      if (open) loadAll(false).then(render);
    });
    window.addEventListener("resize", function () {
      if (!panel.hidden) positionPanel();
    });
    ["btn-dir", "btn-layers"].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener("click", function () { setOpen(false); });
    });
    var wantOpen = false;
    try {
      wantOpen = /(?:\?|&)brief=(1|open)\b/i.test(location.search);
    } catch (e) { wantOpen = false; }
    loadAll(false).then(function (data) {
      render(data);
      if (wantOpen) setOpen(true);
    });
    window.HBBrief = {
      open: function () {
        setOpen(true);
        loadAll(false).then(render);
      }
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup);
  else setup();
})();
