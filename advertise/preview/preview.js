/* Sample-ad preview: generates ads in the browser from businesses.geojson.
   SHEET_TITLE is the only brand line to rename later. */
(function () {
  "use strict";

  var SHEET_TITLE = "Your ad on the Holden Beach Insider map";

  var GENERIC_VISIT = "Visit us on Holden Beach";
  var GENERIC_OFFER = "Your offer here.";
  var LOGO_PH = "SAMPLE AD – your logo & photo here";
  var LOGO_NOTE = "SAMPLE – logo from your website";
  var SV_ATTR = "Street View © Google";
  var LOGOS = {};
  var SV = {};
  var SHORTLINKS = {};
  var QR_LABEL = "Sample tracked QR – scans counted for you.";

  function logoSrc(biz) {
    var rel = (biz && biz.logo) || LOGOS[biz && biz.id] || "";
    if (!rel) return "";
    if (rel.indexOf("advertise/assets/") === 0) return "../" + rel.slice("advertise/".length);
    if (rel.indexOf("assets/") === 0) return "../" + rel;
    return "../assets/logos/" + rel.replace(/^.*\//, "");
  }

  function svRecord(biz) {
    return (biz && SV[biz.id]) || null;
  }

  function svUrl(rec) {
    var cfg = window.HB_STREETVIEW || {};
    if (!cfg.key || !rec) return "";
    if (rec.status === "ZERO_RESULTS") return "";
    var loc = rec.query;
    if (!loc && rec.lat != null && rec.lng != null) loc = rec.lat + "," + rec.lng;
    if (!loc) return "";
    var size = cfg.size || "640x400";
    var fov = cfg.fov || 80;
    return "https://maps.googleapis.com/maps/api/streetview?size=" + encodeURIComponent(size)
      + "&location=" + encodeURIComponent(loc)
      + "&fov=" + encodeURIComponent(fov)
      + "&key=" + encodeURIComponent(cfg.key);
  }

  /* If the Street View image fails (no coverage, or the key is still propagating),
     fall back to the logo or the name-only placeholder. */
  function svFallback(img) {
    var box = img && img.closest ? img.closest(".ph") : null;
    if (!box) return;
    img.style.display = "none";
    box.classList.remove("has-photo");
    var attr = box.querySelector(".sv-attr");
    if (attr) attr.remove();
    var logo = box.querySelector(".logo-overlay");
    if (logo) {
      box.classList.add("has-logo");
      logo.classList.remove("logo-overlay");
    } else {
      box.innerHTML = "";
      box.appendChild(document.createTextNode(LOGO_PH));
    }
  }
  if (window.HB) window.HB.svFallback = svFallback;

  function mediaBox(biz, extraClass, kind) {
    var cls = "ph" + (extraClass ? " " + extraClass : "");
    var style = (kind === "realty") ? ' style="width:88px;height:88px;flex:none"' : "";
    var src = logoSrc(biz);
    var rec = svRecord(biz);
    var url = svUrl(rec);
    /* Realty partner uses a small logo square, not a photo slot. */
    var allowSv = kind !== "realty" && !!url;
    if (allowSv) {
      var h = '<div class="' + cls + ' has-photo"' + style + '>'
        + '<img class="sv" src="' + HB.esc(url) + '" alt="Google Street View of the storefront" onerror="HB.svFallback(this)">'
        + (src ? '<img class="logo-overlay" src="' + HB.esc(src) + '" alt="">' : "")
        + '<span class="sv-attr">' + HB.esc(SV_ATTR) + "</span>"
        + (src ? '<span class="logo-note">' + HB.esc(LOGO_NOTE) + "</span>" : "")
        + "</div>";
      return h;
    }
    if (src) {
      return '<div class="' + cls + ' has-logo"' + style + '>'
        + '<img src="' + HB.esc(src) + '" alt="">'
        + '<span class="logo-note">' + HB.esc(LOGO_NOTE) + "</span>"
        + "</div>";
    }
    var ph = kind === "realty" ? "Your logo here" : LOGO_PH;
    return '<div class="' + cls + '"' + style + '>' + HB.esc(ph) + "</div>";
  }


  /* Layout units from the 22x17 print back/front, mapped onto the bleed preview JPGs
     (6675 x 5175 px at 300 dpi, including a 1/8 in bleed). */
  var BLEED_W = 6675, BLEED_H = 5175, SCALE = 1.1, BLEED = 37.5;
  function slotPct(x, y, w, h) {
    return {
      left: ((x * SCALE + BLEED) / BLEED_W * 100).toFixed(3) + "%",
      top: ((y * SCALE + BLEED) / BLEED_H * 100).toFixed(3) + "%",
      width: (w * SCALE / BLEED_W * 100).toFixed(3) + "%",
      height: (h * SCALE / BLEED_H * 100).toFixed(3) + "%"
    };
  }
  /* Fallback coordinates if ad-slots.json has not loaded. The live overlay uses
     advertise/data/ad-slots.json so a business is shown in its category zone. */
  var FALLBACK_SLOTS = {
    standard: { img: "back", box: slotPct(38, 856, 702, 704), cap: "A standard space in a category zone on the back of the map." },
    double: { img: "back", box: slotPct(38, 132, 1424, 704), cap: "A double space: two adjacent standard cells in a category zone on the back of the map." },
    premium: { img: "front", box: slotPct(36, 36, 1150, 410), cap: "A premium corner on the front map border (highest-visibility corner)." },
    realty: { img: "back", box: slotPct(4500, 0, 1500, 2318), cap: "Realty Partner: your logo takes the top spot on the folded front cover of the maps you hand out. The Insider family and logo are resized beneath it. Only 4 covers are printed this way — one plate per partner." }
  };

  var CAT_TO_ZONE = {
    "Restaurants": "eat",
    "Seafood Markets": "eat",
    "Coffee, Sweets & Treats": "eat",
    "Shopping & Groceries": "shop",
    "Rentals & Water Sports": "play",
    "Fun & Attractions": "play",
    "Realty & Vacation Rentals": "stay",
    "Services & Lodging": "services"
  };
  var ZONE_NAME = {
    eat: "Eat & Drink",
    shop: "Shop",
    play: "Play & Rentals",
    stay: "Stay & Realty",
    services: "Services"
  };
  var SLOTS_DATA = null;

  function zoneOf(biz) {
    return CAT_TO_ZONE[(biz && biz.category) || ""] || "eat";
  }

  function slotFor(kind, biz) {
    var zone = zoneOf(biz);
    var zname = ZONE_NAME[zone] || "this";
    var caps = {
      standard: "A standard space in the " + zname + " section on the back of the map (about 2.6 × 2.6 inches).",
      double: "A double space in the " + zname + " section on the back of the map: two adjacent standard cells (about 5.2 × 2.6 inches).",
      premium: FALLBACK_SLOTS.premium.cap,
      realty: FALLBACK_SLOTS.realty.cap
    };
    var rec = null;
    if (SLOTS_DATA && SLOTS_DATA.examples) {
      var ex = SLOTS_DATA.examples;
      if (kind === "premium") rec = ex.premium;
      else if (kind === "realty") rec = ex.realty;
      else rec = (ex[kind + "_by_zone"] || {})[zone] || (ex[kind + "_by_zone"] || {}).eat;
    }
    if (rec) {
      return {
        img: rec.side || (kind === "premium" ? "front" : "back"),
        box: slotPct(rec.x, rec.y, rec.w, rec.h),
        cap: caps[kind] || FALLBACK_SLOTS[kind].cap
      };
    }
    var fb = FALLBACK_SLOTS[kind];
    return { img: fb.img, box: fb.box, cap: caps[kind] || fb.cap };
  }

  var ICONS = {
    "Restaurants": "fork",
    "Seafood Markets": "fish",
    "Coffee, Sweets & Treats": "cone",
    "Shopping & Groceries": "bag",
    "Rentals & Water Sports": "life",
    "Fun & Attractions": "star",
    "Realty & Vacation Rentals": "house",
    "Services & Lodging": "wrench"
  };

  function iconSvg(kind) {
    var p = {
      fork: '<path fill="currentColor" d="M7 2v8a2 2 0 1 0 4 0V2h2v8a4 4 0 0 1-3 3.87V22H8v-8.13A4 4 0 0 1 5 10V2h2zm10 0h2v20h-2V13h-2V8a5 5 0 0 1 2-4z"/>',
      fish: '<path fill="currentColor" d="M14 5c4 0 8 3 9 7-1 4-5 7-9 7-3 0-5.5-1.2-8-3.5L2 17l1-5-1-5 4 1.5C8.5 6.2 11 5 14 5zm-1 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/>',
      cone: '<path fill="currentColor" d="M12 2a6 6 0 0 1 6 6c0 1.5-.5 2.8-1.3 3.8L12 22 7.3 11.8A6 6 0 0 1 6 8a6 6 0 0 1 6-6zm0 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/>',
      bag: '<path fill="currentColor" d="M6 8h12l-1 12H7L6 8zm3-2V5a3 3 0 0 1 6 0v1h2V5a5 5 0 0 0-10 0v1h2z"/>',
      life: '<path fill="currentColor" d="M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zm0 4a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 2.2 1.7 1.7L15.4 9l1.4 1.4-1.7 1.7 1.7 1.7-1.4 1.4-1.7-1.7L12 14.8l-1.7 1.7-1.4-1.4 1.7-1.7-1.7-1.7L9 9l1.3.9L12 9.2z"/>',
      star: '<path fill="currentColor" d="M12 3 14.9 9h6.1l-4.9 3.7 1.9 6.3L12 15.8 5.9 19l1.9-6.3L3 9h6.1z"/>',
      house: '<path fill="currentColor" d="M12 3 3 11h2v10h6v-6h2v6h6V11h2z"/>',
      wrench: '<path fill="currentColor" d="M21 7a5 5 0 0 1-6.7 4.7L6 20.1 3.9 18l8.4-8.3A5 5 0 1 1 21 7zm-3.2.8a1.6 1.6 0 1 0-2.2-2.2 1.6 1.6 0 0 0 2.2 2.2z"/>'
    };
    return '<svg class="icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">' + (p[kind] || p.star) + "</svg>";
  }

  function isRealty(biz) {
    return /realty|vacation rental/i.test(biz.category || "");
  }
  function telHref(phone) {
    var d = String(phone || "").replace(/[^0-9]/g, "");
    if (d.length === 10) d = "1" + d;
    return d ? "tel:+" + d : "";
  }
  function safeUrl(u) { return /^https?:\/\//i.test(u || "") ? u : ""; }
  function siteLabel(u) {
    try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return u; }
  }

  function qrSrc(biz) {
    return biz && biz.id ? "../assets/qr/" + encodeURIComponent(biz.id) + ".png" : "";
  }
  function qrMarkup(biz) {
    var src = qrSrc(biz);
    if (!src) return '<div class="qr" aria-hidden="true">QR</div>';
    var rec = SHORTLINKS[biz.id] || {};
    var shortUrl = rec.shortURL || rec.short_url || "";
    var img = '<img src="' + src + '" width="86" height="86" alt="Sample tracked QR code for ' + HB.esc(biz.name) + '">';
    if (shortUrl && /^https?:\/\//i.test(shortUrl)) {
      img = '<a href="' + HB.esc(shortUrl) + '" target="_blank" rel="noopener noreferrer">' + img + "</a>";
    }
    return '<figure class="qr">' + img + "<figcaption>" + HB.esc(QR_LABEL) + "</figcaption></figure>";
  }

  function contactLines(biz) {
    var lines = [];
    if (biz.phone) lines.push(HB.esc(biz.phone));
    if (biz.address) lines.push(HB.esc(biz.address));
    if (safeUrl(biz.website)) lines.push(HB.esc(siteLabel(biz.website)));
    return lines.join("<br>");
  }

  function wordmark(name) { return '<div class="wordmark">' + HB.esc(name) + "</div>"; }

  function printChrome(biz, extraClass) {
    return '<div class="wm">SAMPLE</div>'
      + '<div class="cat">' + iconSvg(ICONS[biz.category] || "star") + " " + HB.esc(biz.category || "") + "</div>"
      + wordmark(biz.name)
      + (biz.pin ? '<div class="pin">Pin ' + HB.esc(String(biz.pin)) + " on the map</div>" : "");
  }

  function renderStandard(biz) {
    return '<article class="ad standard" aria-label="Standard sample ad">'
      + '<div class="wm">SAMPLE</div>'
      + '<div class="top">' + iconSvg(ICONS[biz.category] || "star") + wordmark(biz.name) + "</div>"
      + mediaBox(biz, "", "standard")
      + '<div class="cat">' + HB.esc(biz.category || "") + "</div>"
      + (biz.pin ? '<div class="pin">Pin ' + HB.esc(String(biz.pin)) + "</div>" : "")
      + '<p class="blurb">' + HB.esc(GENERIC_VISIT) + "</p>"
      + '<p class="offer">' + HB.esc(GENERIC_OFFER) + "</p>"
      + '<div class="row"><div class="meta">' + contactLines(biz) + "</div>" + qrMarkup(biz) + "</div>"
      + "</article>";
  }
  function renderDouble(biz) {
    return '<article class="ad double" aria-label="Double sample ad">'
      + '<div class="wm">SAMPLE</div>'
      + mediaBox(biz, "", "double")
      + '<div class="copy">' + iconSvg(ICONS[biz.category] || "star")
      + wordmark(biz.name)
      + '<div class="cat">' + HB.esc(biz.category || "") + (biz.pin ? " · Pin " + HB.esc(String(biz.pin)) : "") + "</div>"
      + '<p class="blurb">' + HB.esc(GENERIC_VISIT) + "</p>"
      + '<p class="offer">' + HB.esc(GENERIC_OFFER) + "</p>"
      + '<div class="meta">' + contactLines(biz) + "</div></div>"
      + qrMarkup(biz)
      + "</article>";
  }
  function renderPremium(biz) {
    return '<article class="ad premium" aria-label="Premium corner sample ad">'
      + '<div class="wm">SAMPLE</div>'
      + mediaBox(biz, "", "premium")
      + '<div class="copy"><div class="cat">Premium corner · ' + HB.esc(biz.category || "") + "</div>"
      + wordmark(biz.name)
      + (biz.pin ? '<div class="pin">Pin ' + HB.esc(String(biz.pin)) + "</div>" : "")
      + '<p class="blurb">' + HB.esc(GENERIC_VISIT) + " " + HB.esc(GENERIC_OFFER) + "</p>"
      + '<div class="meta">' + contactLines(biz) + "</div></div>"
      + qrMarkup(biz)
      + "</article>";
  }
  function isAlanHolden(biz) {
    var id = (biz && biz.id) || "";
    var name = (biz && biz.name) || "";
    return /alan-holden/i.test(id) || /alan holden/i.test(name);
  }

  function renderRealty(biz) {
    var src = logoSrc(biz);
    var logo = src
      ? '<img src="' + HB.esc(src) + '" alt="">'
        + '<div class="rc-name">' + HB.esc(biz.name) + "</div>"
      : '<div class="rc-ph">REALTY PARTNER<br>LOGO HERE</div>'
        + '<div class="rc-name">' + HB.esc(biz.name) + "</div>";
    return '<article class="ad realty-cover" aria-label="Realty Partner cover sample">'
      + '<div class="wm">SAMPLE</div>'
      + '<div class="rc-head">FREE MAP &amp; GUIDE</div>'
      + '<div class="rc-eye">Compliments of</div>'
      + '<div class="rc-logo-slot">'
      + '<span class="rc-flag">SAMPLE</span>'
      + logo
      + "</div>"
      + '<div class="rc-brand">'
      + '<img class="rc-family" src="../assets/insider-family.webp" alt="Holden Beach Insider family">'
      + '<img class="rc-insider" src="../assets/insider-logo.webp" alt="Holden Beach Insider logo">'
      + "</div>"
      + '<p class="rc-tag">Your Local Guide to the Best of Holden Beach</p>'
      + '<p class="rc-ribbon">Real Locals. Real Deals. Real Good Times.</p>'
      + '<p class="rc-season">2027 SEASON</p>'
      + '<p class="rc-url">tourholdenbeach.com</p>'
      + "</article>";
  }

  function coverFig(biz) {
    var sample = isAlanHolden(biz);
    var src = sample
      ? "../assets/cover-realty-partner-sample.jpg"
      : "../assets/cover-realty-partner-mockup.jpg";
    var alt = sample
      ? "Printed folded-cover sample for Alan Holden Realty, marked SAMPLE"
      : "Printed folded-cover mockup with a Realty Partner logo placeholder";
    var cap = sample
      ? "Printed-cover sample (marked SAMPLE). Your logo is in the top spot; the Insider family and logo sit beneath it."
      : "Printed-cover mockup: your logo goes in the top box. The Insider family and logo are resized beneath it. This is a layout proof, not a paid placement.";
    return '<figure class="place cover-proof"><div class="map-wrap cover">'
      + '<img src="' + src + '" alt="' + HB.esc(alt) + '">'
      + "</div><figcaption>" + HB.esc(cap) + "</figcaption></figure>";
  }
  function renderOnline(biz, tier) {
    var featured = tier === "featured";
    var h = '<article class="online-card ' + (featured ? "featured" : "enhanced") + '" aria-label="' + (featured ? "Premium" : "Enhanced") + ' online listing sample">';
    h += '<div class="wm">SAMPLE</div>';
    if (featured) h += '<span class="badge">Featured</span>' + mediaBox(biz, "photo", "featured");
    h += "<b>" + HB.esc(biz.name) + "</b>";
    h += '<span class="sub">' + HB.esc(biz.category || "") + (biz.address ? " · " + HB.esc(biz.address) : "") + "</span>";
    if (featured) h += '<div class="deal">Deal: ' + HB.esc(GENERIC_OFFER) + "</div>";
    h += '<div class="acts">';
    if (biz.phone) h += '<span class="call">Call ' + HB.esc(biz.phone) + "</span>";
    h += "<span>Directions</span>";
    if (safeUrl(biz.website)) h += '<span class="web">Website</span>';
    else if (featured) h += '<span class="web">Website</span>';
    h += "</div></article>";
    return h;
  }

  function placementFig(kind, biz) {
    var s = slotFor(kind, biz);
    if (!s) return "";
    var src = s.img === "front" ? "../assets/map-front.jpg" : "../assets/map-back.jpg";
    var alt = s.img === "front" ? "Front of the printed map, with this ad space highlighted" : "Back of the printed map, with this ad space highlighted";
    var b = s.box;
    return '<figure class="place"><div class="map-wrap">'
      + '<img src="' + src + '" alt="' + alt + '">'
      + '<div class="slot" style="left:' + b.left + ";top:" + b.top + ";width:" + b.width + ";height:" + b.height + '"></div>'
      + "</div><figcaption>" + HB.esc(s.cap) + "</figcaption></figure>";
  }

  function moneyPair(season, prepaid) {
    if (typeof prepaid !== "number" && typeof season !== "number") {
      return '<div class="tbd">Pricing coming soon</div>';
    }
    var html = '<div class="amt">';
    if (typeof prepaid === "number") html += HB.money(prepaid) + " <small>prepaid</small>";
    if (typeof season === "number") html += (typeof prepaid === "number" ? " " : "") + "<small>season rate " + HB.money(season) + "</small>";
    return html + "</div>";
  }

  function chooseBtn(href, label, disabled) {
    if (disabled) return '<a class="btn btn-coral" aria-disabled="true">' + HB.esc(label) + "</a>";
    return '<a class="btn btn-coral" href="' + HB.esc(href) + '">' + HB.esc(label) + "</a>";
  }

  function section(opts) {
    return '<section class="format" id="' + opts.id + '"><h2>' + HB.esc(opts.title) + "</h2>"
      + '<p class="sum">' + HB.esc(opts.summary) + "</p>"
      + '<div class="format-grid"><div class="ad-stage">' + opts.ad + "</div>"
      + (opts.place || "") + "</div>"
      + '<div class="price-row">' + opts.price + "</div>"
      + '<div class="choose">' + opts.btn + "</div>"
      + (opts.fine ? '<p class="fine">' + opts.fine + "</p>" : "")
      + "</section>";
  }

  function findBiz(fc, id) {
    var feats = (fc && fc.features) || [];
    for (var i = 0; i < feats.length; i++) {
      var p = feats[i].properties || {};
      if (p.id === id) return p;
    }
    return null;
  }

  function renderPage(biz) {
    document.getElementById("sheet-title").textContent = SHEET_TITLE;
    document.title = SHEET_TITLE + " — " + biz.name;
    var logo = document.getElementById("brand-logo");
    if (logo) logo.textContent = "Holden Beach Insider";
    var bits = ["Sample ads for " + biz.name];
    if (biz.pin) bits.push("pin " + biz.pin);
    if (biz.category) bits.push(biz.category);
    var intro = bits.join(" · ") + ". ";
    if (svUrl(svRecord(biz)) && logoSrc(biz)) {
      intro += "Your logo is pulled from your website, and a Google Street View of the storefront is shown in the photo slot. The offer line is a placeholder. Each proof is marked SAMPLE.";
    } else if (logoSrc(biz)) {
      intro += "Your logo is pulled from your website. The photo and offer are placeholders until you send yours. Each proof is marked SAMPLE.";
    } else if (svUrl(svRecord(biz))) {
      intro += "A Google Street View of the storefront is shown in the photo slot. Logo and offer are placeholders until you send yours. Each proof is marked SAMPLE.";
    } else {
      intro += "These use only your name, category, pin and the contact details we already have. Logo, photo and offer are placeholders. Each proof is marked SAMPLE.";
    }
    intro += " Each print ad includes a sample tracked QR code — scans are counted for you.";
    document.getElementById("intro").textContent = intro;

    var st = HB.product("standard") || {};
    var pr = HB.product("premium") || {};
    var ry = HB.product("realty") || {};
    var ft = HB.product("featured") || {};
    var name = biz.name;
    var claimBase = "../claim/?business=" + encodeURIComponent(name)
      + "&pin=" + encodeURIComponent(biz.pin || "")
      + "&id=" + encodeURIComponent(biz.id || "");

    var parts = [];
    var dbl = HB.product("double") || {};
    var zname = ZONE_NAME[zoneOf(biz)] || "its category";
    parts.push(section({
      id: "fmt-standard",
      title: "Small / standard print ad",
      summary: "One standard space in the " + zname + " section on the back of the map, or on the front map border. About 2.6 × 2.6 inches on the back.",
      ad: renderStandard(biz),
      place: placementFig("standard", biz),
      price: moneyPair(st.season_price, st.prepaid_price),
      btn: chooseBtn(HB.buyUrl("../", "standard", "prepaid", name), "Choose this ad"),
      fine: "Choose this ad continues to checkout for a Standard ad space (Stripe links are not connected yet)."
    }));
    parts.push(section({
      id: "fmt-double",
      title: "Medium / double print ad",
      summary: "Two adjacent standard spaces in the " + zname + " section on the back of the map. About 5.2 × 2.6 inches. Priced as two standard spaces.",
      ad: renderDouble(biz),
      place: placementFig("double", biz),
      price: moneyPair(
        typeof dbl.season_price === "number" ? dbl.season_price : (typeof st.season_price === "number" ? st.season_price * 2 : null),
        typeof dbl.prepaid_price === "number" ? dbl.prepaid_price : (typeof st.prepaid_price === "number" ? st.prepaid_price * 2 : null)
      ),
      btn: chooseBtn(dbl.id ? HB.buyUrl("../", "double", "prepaid", name)
                            : "../checkout/?product=standard&plan=prepaid&biz=" + encodeURIComponent(name) + "&unit=double",
                     "Choose this ad"),
      fine: "A double space is its own product on the rate card, at the two-standard-space rate."
    }));
    parts.push(section({
      id: "fmt-premium",
      title: "Premium corner",
      summary: "One of the four corners of the front map border, priced as two standard spaces.",
      ad: renderPremium(biz),
      place: placementFig("premium", biz),
      price: moneyPair(pr.season_price, pr.prepaid_price),
      btn: chooseBtn(HB.buyUrl("../", "premium", "prepaid", name), "Choose this ad"),
      fine: ""
    }));
    if (isRealty(biz)) {
      parts.push(section({
        id: "fmt-realty",
        title: "Realty Partner",
        summary: "Your logo takes the top spot on the folded front cover of the 500 maps you hand out. The Insider family and logo are resized beneath it so the cover stays clearly branded. Includes a featured pin and an online listing. Only 4 available.",
        ad: renderRealty(biz),
        place: coverFig(biz) + placementFig("realty", biz),
        price: moneyPair(ry.season_price, ry.prepaid_price),
        btn: chooseBtn(HB.buyUrl("../", "realty", "prepaid", name), "Choose this ad"),
        fine: "Shown only for realty and vacation-rental companies. Four Realty Partner slots are available, at $2,500 a season ($2,325 prepaid, $1,250 deposit). Each partner gets their own cover plate."
      }));
    }
    var featuredPriced = typeof ft.prepaid_price === "number" || typeof ft.season_price === "number";
    var featuredBtn = featuredPriced
      ? chooseBtn(HB.buyUrl("../", "featured", "prepaid", name), "Choose this ad")
      : chooseBtn(HB.mailto("Interest: Premium Featured Listing for " + name,
          "Hi,\n\nI'd like to know when the Premium Featured Listing is available for " + name + ".\n\nPhone:\nWebsite: " + (biz.website || "") + "\n"),
          "Tell me when it's available");
    parts.push(section({
      id: "fmt-enhanced",
      title: "Enhanced online listing",
      summary: "How an enhanced listing could appear in a pin popup on the online map: name, category, phone, directions and a website button.",
      ad: renderOnline(biz, "enhanced"),
      place: "",
      price: '<div class="tbd">Included with a Standard print ad</div>',
      btn: chooseBtn(claimBase + "&plan=standard", "Choose a print ad that includes this"),
      fine: "A standalone Enhanced online price is not on the rate card yet, so this is shown as part of a Standard print ad."
    }));
    parts.push(section({
      id: "fmt-featured",
      title: "Premium online listing",
      summary: "How a Premium Featured Listing could appear on the online map: photo, a Featured badge, and your offer.",
      ad: renderOnline(biz, "featured"),
      place: "",
      price: featuredPriced ? moneyPair(ft.season_price, ft.prepaid_price) : '<div class="tbd">Pricing coming soon</div>',
      btn: featuredBtn,
      fine: featuredPriced ? "" : "The Premium Featured Listing is listed on the sales site; a price has not been set yet."
    }));

    var box = document.getElementById("formats");
    box.innerHTML = parts.join("");
    box.hidden = false;
    var stEl = document.getElementById("status");
    stEl.hidden = true;
    Array.prototype.forEach.call(document.querySelectorAll("a.em"), function (a) {
      a.href = "mailto:" + HB.email; a.textContent = HB.email;
    });
  }

  var id = HB.clean(HB.param("id") || "");
  document.getElementById("sheet-title").textContent = SHEET_TITLE;

  function fail(msg) {
    var el = document.getElementById("status");
    el.className = "notice err";
    el.innerHTML = HB.esc(msg) + ' <a href="../../">Back to the map</a>';
  }

  function optJson(url) {
    return fetch(url, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("opt");
      return r.json();
    }).catch(function () { return null; });
  }

  Promise.all([
    HB.load("../"),
    fetch("../../data/businesses.geojson", { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("listings");
      return r.json();
    }),
    fetch("../data/ad-slots.json", { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("slots");
      return r.json();
    }).catch(function () { return null; }),
    optJson("../data/logos.json"),
    optJson("../data/streetview.json"),
    optJson("../data/shortlinks.json")
  ]).then(function (pair) {
    var fc = pair[1];
    SLOTS_DATA = pair[2];
    LOGOS = pair[3] || {};
    SV = pair[4] || {};
    SHORTLINKS = pair[5] || {};
    if (!id) {
      fail("Open this page from a business pin, using See your sample ad, so we know which listing to show.");
      return;
    }
    var biz = findBiz(fc, id);
    if (!biz) { fail("We couldn’t find that listing. It may have been removed from the map."); return; }
    // Never show the known-bad watersports domain if it were still present.
    if (/holdenbeachwatersports\.com/i.test(biz.website || "")) biz.website = "";
    if (!biz.logo && LOGOS[biz.id]) biz.logo = "advertise/" + LOGOS[biz.id];
    renderPage(biz);
  }).catch(function () {
    fail("The sample ads didn’t load. Please refresh, or email tourholdenbeach@gmail.com.");
  });
})();
