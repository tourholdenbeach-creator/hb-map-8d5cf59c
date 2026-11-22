/* Holden Beach interactive map. Self-contained Leaflet app. No measure tools. */
(function () {
  "use strict";

  var TILE_BOUNDS = L.latLngBounds([[33.877387, -78.390334], [33.955684, -78.228504]]);
  var ISLAND_BOUNDS = L.latLngBounds([[33.9035, -78.3605], [33.9205, -78.2315]]);
  // Illustrated base (final print art, UTM 17N rasters warped to Web Mercator): main map + Supply detail, z18 detail at the bridge
  var ILL_MAIN = L.latLngBounds([[33.85277, -78.38569], [33.94930, -78.22871]]);
  var ILL_SUPPLY = L.latLngBounds([[34.00249, -78.29403], [34.03329, -78.25208]]);
  var ILL_Z18 = L.latLngBounds([[33.91290, -78.27260], [33.91909, -78.26340]]);
  var ILL_BOUNDS = L.latLngBounds(ILL_MAIN.getSouthWest(), ILL_MAIN.getNorthEast()).extend(ILL_SUPPLY);
  // everything with a pin (Supply pins and Oak & Anchor sit outside the plain tiles)
  var VIEW_BOUNDS = L.latLngBounds(TILE_BOUNDS.getSouthWest(), TILE_BOUNDS.getNorthEast()).extend(ILL_SUPPLY).extend([33.93, -78.2150]);
  // Default opening view: Holden Beach Bridge / causeway landing / Jordan Blvd (sharp to z18)
  var BRIDGE_CENTER = L.latLng(33.91600, -78.26800);
  var BRIDGE_BOUNDS = L.latLngBounds([[33.9125, -78.2735], [33.9200, -78.2625]]);
  var MAIN_MAX_BOUNDS = ILL_MAIN.pad(0.02);
  var MIN_ZOOM = 11;          // floor when showing the whole island or Supply
  var DEFAULT_MIN_ZOOM = 14;  // everyday use: no zooming out into empty paper
  var DEFAULT_ZOOM = 16;
  var MAX_ZOOM = 18;
  var CLUSTER_DISABLE_ZOOM = 16;
  var MINOR_LAYER_MIN_ZOOM = 15; // hide accesses / restrooms / parking markers below this

  var COLORS = {
    park: "#1a4e2c",
    civic: "#081528",
    restaurant: "#d65440",
    business: "#d6b03e",
    gate: "#081528",
    teal: "#0a7080",
    access: "#0a7080",
    restroom: "#0a7080",
    cream: "#fffbf4",
    gold: "#d6b03e",
    navy: "#081528"
  };

  var state = {
    map: null,
    layers: {},
    tiles: {},
    userLatLng: null,
    locMarker: null,
    locCircle: null,
    locWatch: null,
    features: [], // searchable
    ready: false,
    includeSupply: false,
    viewMode: "bridge" // "bridge" | "full"
  };

  function $(id) { return document.getElementById(id); }

  function toast(msg, ms) {
    var el = $("toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.hidden = true; }, ms || 3200);
  }

  function mapsDirUrl(lat, lon, mode) {
    var url = "https://www.google.com/maps/dir/?api=1"
      + "&destination=" + encodeURIComponent(lat + "," + lon)
      + "&travelmode=" + mode;
    if (state.userLatLng) {
      url += "&origin=" + encodeURIComponent(state.userLatLng.lat + "," + state.userLatLng.lng);
    }
    return url;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function firstPoint(geom) {
    if (!geom) return null;
    if (geom.type === "Point") return geom.coordinates;
    if (geom.type === "LineString") {
      var mid = geom.coordinates[Math.floor(geom.coordinates.length / 2)];
      return mid;
    }
    if (geom.type === "MultiLineString") return geom.coordinates[0][0];
    if (geom.type === "Polygon") return geom.coordinates[0][0];
    return null;
  }

  /* ----------------------------- icons ----------------------------- */
  function svgIcon(html, size, className) {
    return L.divIcon({
      className: "hb-divicon",
      html: html,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor: [0, -size / 2]
    });
  }

  function ringMarker(fill, ring, glyph, size, ada) {
    size = size || 28;
    var inner = size - 6;
    var adaBadge = ada
      ? '<span class="hb-ada" title="ADA"><svg width="8" height="8" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="2.2" r="1.5" fill="#f2e09c"/><path d="M4.6 4h2.8L9 8.2H7.2L6.6 6.6 6 8.2H4z" fill="#f2e09c"/><circle cx="4.3" cy="9.2" r="1.6" fill="none" stroke="#f2e09c" stroke-width="1.1"/></svg></span>'
      : "";
    var html = '<div class="hb-marker" style="width:' + size + 'px;height:' + size + 'px;background:' + ring + '">'
      + '<div class="hb-marker" style="width:' + inner + 'px;height:' + inner + 'px;background:' + fill + '">'
      + glyph + "</div>" + adaBadge + "</div>";
    return svgIcon(html, size);
  }

  var GLYPH = {
    tree: '<svg width="14" height="14" viewBox="0 0 16 16" fill="#fffbf4"><path d="M8 1.4 3.2 8h2.3L3 12h3.1v2.5h3.8V12H13l-2.5-4h2.3z"/></svg>',
    civic: '<svg width="14" height="14" viewBox="0 0 16 16" fill="#fffbf4"><path d="M8 2 2.5 6.2h11zM3.2 7.1h9.6v1H3.2zm1 1.7h1.4V12H4.2zm2.2 0h1.4V12H6.4zm2.2 0h1.4V12H8.6zm2.2 0h1.4V12h-1.4zM3 12.7h10v1.2H3z"/></svg>',
    fork: '<svg width="14" height="14" viewBox="0 0 16 16" fill="#fffbf4"><path d="M5 2v4c0 1.2-.8 1.8-1.5 2v6h2V8.2C6.3 7.8 7 7 7 5.5V2H6v4H5.4V2H5zm6 0c1.8 0 3 1.5 2.7 3.6-.2 1.4-1 2.2-2 2.5V14h-1.6V8.1c-1-.3-1.8-1.1-2-2.5C7.8 3.5 9.2 2 11 2z"/></svg>',
    cup: '<svg width="14" height="14" viewBox="0 0 16 16" fill="#fffbf4"><path d="M5 2c-.7.8-.7 1.6 0 2.2S4.3 6 5 6.6M8 2c-.7.8-.7 1.6 0 2.2S7.3 6 8 6.6M11 2c-.7.8-.7 1.6 0 2.2S10.3 6 11 6.6M3 8h8l-.8 5H4.6L3 8zm8.2.6c1.6 0 2.6 1 2.3 2.5-.3 1.2-1.3 1.7-2.5 1.7"/></svg>',
    house: '<svg width="14" height="14" viewBox="0 0 16 16" fill="#fffbf4"><path d="M2 8 8 2.6 14 8h-1.4v6H9.2V10H6.8v4H3.4V8z"/></svg>',
    store: '<svg width="14" height="14" viewBox="0 0 16 16" fill="#081528"><path d="M2.2 6.4 8 2.4l5.8 4V7.8c-1.2-.8-2.5.4-3 .4s-1.6-1.2-2.8-1.2S5.6 8.2 4.4 8.2 2.8 7 2.2 7.8zM3.2 8.6h9.6v5.2h-3V11H6.2v2.8h-3z"/></svg>',
    gate: '<svg width="14" height="14" viewBox="0 0 16 16" fill="#f2e09c"><path d="M2.5 3.5h1.8v10H2.5zm9.2 0h1.8v10h-1.8zM5 5.2h6v1.4H5zm0 4.2h6v1.4H5zM6 5.2v5.6M8 5.2v5.6M10 5.2v5.6"/></svg>',
    pier: '<svg width="14" height="14" viewBox="0 0 16 16" fill="#fffbf4"><path d="M1.8 6.2h12.4v1.4H1.8zM3 7.6h1.2V11H3zm3 0h1.2V11H6zm3 0h1.2V11H9zm3 0h1.2V11H12zM2 12.2c1.2-1 2.2-.2 3 0s1.8-1 3 0 1.8 1 3 0 1.8-1 3 0"/></svg>',
    boat: '<svg width="14" height="14" viewBox="0 0 16 16" fill="#fffbf4"><path d="M8.2 2v6.2l4.2-.1L8.2 2zM2.2 9.2h11.6L12 12.2H4zM2 13.2c1.2-1 2.2-.2 3 0s1.8-1 3 0 1.8 1 3 0 1.8-1 3 0"/></svg>',
    kayak: '<svg width="14" height="14" viewBox="0 0 16 16" fill="#fffbf4"><path d="M1.5 8c2-2.3 11-2.3 13 0-2 2.3-11 2.3-13 0z"/><ellipse cx="8" cy="8" rx="1.5" ry="1.1" fill="#081528"/><path d="M3 4.2 13 11.8" stroke="#fffbf4" stroke-width="1.3"/></svg>',
    dock: '<svg width="14" height="14" viewBox="0 0 16 16" fill="#fffbf4"><path d="M2 5h12v2.2H2zM7 7.2h2V13H7zM3 7.2h1.4V11H3zM11.6 7.2H13V11h-1.4zM2 13.2c1.2-1 2.2-.2 3 0s1.8-1 3 0 1.8 1 3 0 1.8-1 3 0"/></svg>',
    fire: '<svg width="14" height="14" viewBox="0 0 16 16" fill="#fffbf4"><path d="M2.4 6.2 8 2.4l5.6 3.8V13H10V8.4H6V13H2.4z"/></svg>',
    restroom: '<svg width="14" height="14" viewBox="0 0 16 16" fill="#fffbf4"><rect x="3.2" y="2.2" width="9.6" height="11.6" rx="1.2" fill="none" stroke="#fffbf4" stroke-width="1.4"/><circle cx="8" cy="6" r="1.5"/><path d="M5.6 8.2h4.8v1.6H8.8V13H7.2V9.8H5.6z"/></svg>',
    porta: '<svg width="14" height="14" viewBox="0 0 16 16" fill="#0a7080"><path d="M7 1.6h2v1.2H7zM4 3.2h8l.6 10.2H3.4z"/><rect x="6.2" y="5.4" width="3.6" height="6.4" fill="#c5e6e8"/></svg>',
    walkway: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="5" y="2" width="6" height="8.2" rx="0.6" fill="#fffbf4"/><path d="M5 4.2h6M5 6.1h6M5 8h6" stroke="#0a7080" stroke-width="1"/><path d="M2.4 11.4c1.3-1 2.4-.2 3.2 0s1.8-1 3.2 0 1.8 1 3.2 0 1.8-1 3.2 0" stroke="#fffbf4" stroke-width="1.3" fill="none"/></svg>',
    water: '<svg width="14" height="14" viewBox="0 0 16 16" fill="#fffbf4"><path d="M5.2 3.2h5.6v3.2H5.2zM6.2 6.4 5.2 13h5.6L9.8 6.4z"/><path d="M6.4 9h3.2" stroke="#081528" stroke-width="1"/></svg>',
    chapel: '<svg width="14" height="14" viewBox="0 0 16 16" fill="#fffbf4"><path d="M8 1.5v3M6.6 2.7h2.8"/><path d="M8 4.2 4 8.2h8zM5 8.2h6V13H5z"/></svg>',
    bridge: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M1.6 8h12.8" stroke="#fffbf4" stroke-width="1.6"/><path d="M3 8c2.5-4 7.5-4 10 0" stroke="#fffbf4" stroke-width="1.3"/><path d="M4.5 8v3.6M11.5 8v3.6" stroke="#fffbf4" stroke-width="1.3"/></svg>',
    stage: '<svg width="14" height="14" viewBox="0 0 16 16" fill="#fffbf4"><path d="M1.5 6.5 8 2.5l6.5 4H13v1.2H3V6.5zM3 8.6h10v1.4H3zM3.6 10.6h1.4v3H3.6zm7.4 0h1.4v3H11z"/><circle cx="8" cy="12" r="1.3"/></svg>',
    camping: '<svg width="14" height="14" viewBox="0 0 16 16" fill="#fffbf4"><path d="M1.5 4.5h9.5l3 3.3v4.2h-1.3a1.7 1.7 0 0 0-3.4 0H5.7a1.7 1.7 0 0 0-3.4 0H1.5z"/><rect x="3" y="6" width="2.4" height="2" fill="#081528"/><rect x="6.4" y="6" width="2.4" height="2" fill="#081528"/><circle cx="4" cy="12.4" r="1.1"/><circle cx="11" cy="12.4" r="1.1"/></svg>',
    default: '<svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="3" fill="#fffbf4"/></svg>'
  };

  function landmarkIcon(prop) {
    var cat = prop.category || "civic";
    var icon = prop.icon || "civic";
    var fill = COLORS[cat] || COLORS.civic;
    var ring = (cat === "business") ? COLORS.navy : COLORS.gold;
    var glyphColorNeed = icon;
    var glyph = GLYPH[icon] || GLYPH.civic;
    if (icon === "restaurant") glyph = GLYPH.fork;
    if (icon === "coffee") glyph = GLYPH.cup;
    if (icon === "realty") glyph = GLYPH.house;
    if (icon === "store") glyph = GLYPH.store;
    if (icon === "fire_station") glyph = GLYPH.fire;
    if (icon === "boat_launch") glyph = GLYPH.boat;
    if (icon === "water_tower") glyph = GLYPH.water;
    if (icon === "town_hall") glyph = GLYPH.civic;
    if (icon === "restroom") glyph = GLYPH.restroom;
    if (icon === "pier") glyph = GLYPH.pier;
    if (icon === "kayak") glyph = GLYPH.kayak;
    if (icon === "dock") glyph = GLYPH.dock;
    if (icon === "chapel") glyph = GLYPH.chapel;
    if (icon === "bridge") glyph = GLYPH.bridge;
    if (icon === "gate") glyph = GLYPH.gate;
    if (icon === "stage") glyph = GLYPH.stage;
    if (icon === "camping") glyph = GLYPH.camping;
    return ringMarker(fill, ring, glyph, 28, false);
  }

  function parkIcon() {
    return ringMarker(COLORS.park, COLORS.gold, GLYPH.tree, 28, false);
  }
  function accessIcon(ada) {
    return ringMarker(COLORS.access, COLORS.gold, GLYPH.walkway, 28, !!ada);
  }
  function restroomIcon(prop) {
    var porta = prop.type === "porta_john";
    if (porta) return ringMarker("#fffbf4", COLORS.teal, GLYPH.porta, 24, !!prop.ada);
    return ringMarker(COLORS.restroom, COLORS.gold, GLYPH.restroom, 28, !!prop.ada);
  }

  /* ----------------------------- popups ----------------------------- */
  function layerLabel(kind) {
    return {
      park: "Park",
      trail: "Fit Trail",
      landmark: "Landmark",
      access: "Beach access",
      restroom: "Public restroom",
      porta_john: "Porta-john"
    }[kind] || kind;
  }

  function popupHtml(item) {
    var p = item.props;
    var kind = item.kind;
    var kicker = kind === "restroom" && p.type === "porta_john" ? "Porta-john" : layerLabel(kind);
    var name = p.name || p.map_label || "Place";
    var addr = p.address || "";
    var chips = [];
    if (p.ada) chips.push("ADA");
    if (kind === "access") {
      if (p.parking) chips.push(p.amenities && p.amenities.parking_count ? "Parking: " + p.amenities.parking_count + " spaces" : "Parking");
      if (p.restroom) chips.push("Restroom");
      if (p.golf_cart_parking) chips.push("Golf cart parking");
      if (p.bike_rack) chips.push("Bike rack");
      if (p.shower) chips.push("Shower");
      if (p.beach_mat) chips.push("Beach mat");
    }
    if (kind === "restroom" && p.type === "restroom") chips.push("Public restroom");
    var notes = p.notes || p.location_description || p.status_note || "";
    if (notes.length > 280) notes = notes.slice(0, 277) + "…";
    var ll = item.latlng;
    var walk = mapsDirUrl(ll.lat, ll.lng, "walking");
    var bike = mapsDirUrl(ll.lat, ll.lng, "bicycling");
    var chipsHtml = chips.length
      ? '<ul class="popup-chips">' + chips.map(function (c) { return "<li>" + escapeHtml(c) + "</li>"; }).join("") + "</ul>"
      : "";
    return '<div class="popup">'
      + '<div class="popup-kicker">' + escapeHtml(kicker) + "</div>"
      + "<h2>" + escapeHtml(name) + "</h2>"
      + (addr ? '<p class="popup-addr">' + escapeHtml(addr) + "</p>" : "")
      + chipsHtml
      + (notes ? '<p class="popup-notes">' + escapeHtml(notes) + "</p>" : "")
      + '<div class="popup-dirs">'
      + '<a class="dir-btn walk" href="' + walk + '" target="_blank" rel="noopener noreferrer">Walking directions</a>'
      + '<a class="dir-btn bike" href="' + bike + '" target="_blank" rel="noopener noreferrer">Biking directions</a>'
      + "</div></div>";
  }

  function bindPopup(layer, item) {
    layer.bindPopup(function () { return popupHtml(item); }, { maxWidth: 340 });
    var tip = item.props.map_label || item.props.name;
    if (tip) layer.bindTooltip(tip, { className: "hb-tip", direction: "top", offset: [0, -12], opacity: 0.95 });
  }

  function searchText(item) {
    var p = item.props;
    var bits = [
      p.id, p.name, p.map_label, p.address, p.notes, p.type, p.category,
      p.location_description, p.status_note, p.website_list_name,
      p.town_list_location, p.town_mymaps_description, item.kind, item.layerName
    ];
    if (Array.isArray(p.aka)) bits = bits.concat(p.aka);
    if (Array.isArray(p.sources)) bits = bits.concat(p.sources);
    if (p.amenities && typeof p.amenities === "object") bits.push(JSON.stringify(p.amenities));
    return bits.filter(Boolean).join(" ").toLowerCase();
  }

  function addSearchable(kind, layerName, feature, layer, latlng) {
    var item = {
      kind: kind,
      layerName: layerName,
      props: feature.properties || {},
      feature: feature,
      layer: layer,
      latlng: latlng,
      haystack: ""
    };
    item.haystack = searchText(item);
    state.features.push(item);
    bindPopup(layer, item);
    return item;
  }

  /* ----------------------------- data layers ----------------------------- */
  function loadJSON(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error("Failed to load " + url + " (" + r.status + ")");
      return r.json();
    });
  }

  function addParks(fc) {
    var group = L.layerGroup();
    var count = 0;
    fc.features.forEach(function (f) {
      var g = f.geometry;
      var p = f.properties || {};
      if (g && g.type === "LineString") {
        var line = L.polyline(g.coordinates.map(function (c) { return [c[1], c[0]]; }), {
          color: "#247a3c", weight: 4, dashArray: "10 8", opacity: 0.95, lineCap: "round"
        });
        var mid = firstPoint(g);
        var ll = L.latLng(mid[1], mid[0]);
        line.addTo(group);
        addSearchable("trail", "Parks & Fit Trail", f, line, ll);
        count += 1;
        return;
      }
      if (!g || g.type !== "Point") return;
      var ll = L.latLng(g.coordinates[1], g.coordinates[0]);
      var m = L.marker(ll, { icon: parkIcon(), title: p.map_label || p.name, keyboard: true, riseOnHover: true });
      m.addTo(group);
      addSearchable("park", "Parks & Fit Trail", f, m, ll);
      count += 1;
    });
    group.addTo(state.map);
    state.layers.parks = group;
    return count;
  }

  function addLandmarks(fc) {
    var group = L.layerGroup();
    var count = 0;
    fc.features.forEach(function (f) {
      var g = f.geometry;
      if (!g || g.type !== "Point") return;
      var p = f.properties || {};
      var ll = L.latLng(g.coordinates[1], g.coordinates[0]);
      var m = L.marker(ll, { icon: landmarkIcon(p), title: p.map_label || p.name, keyboard: true, riseOnHover: true });
      m.addTo(group);
      addSearchable("landmark", "Landmarks", f, m, ll);
      count += 1;
    });
    group.addTo(state.map);
    state.layers.landmarks = group;
    return count;
  }

  function addAccesses(fc) {
    var group = L.layerGroup();
    var count = 0;
    fc.features.forEach(function (f) {
      var g = f.geometry;
      if (!g || g.type !== "Point") return;
      var p = f.properties || {};
      var ll = L.latLng(g.coordinates[1], g.coordinates[0]);
      var m = L.marker(ll, { icon: accessIcon(p.ada), title: p.map_label || p.name, keyboard: true, riseOnHover: true });
      m.addTo(group);
      addSearchable("access", "Beach accesses", f, m, ll);
      count += 1;
    });
    group.addTo(state.map);
    state.layers.accesses = group;
    return count;
  }

  function addRestrooms(fc) {
    var group = L.layerGroup();
    var count = 0;
    fc.features.forEach(function (f) {
      var g = f.geometry;
      if (!g || g.type !== "Point") return;
      var p = f.properties || {};
      // Hard exclusions, in case a stale file is dropped in later.
      if (p.id === "rr_jordan_bridge" || p.id === "rr_131_jordan" || p.id === "rr_jordan_pavilion_merged") return;
      var lon = g.coordinates[0], lat = g.coordinates[1];
      if (Math.abs(lon - (-78.231778)) < 0.0003 && Math.abs(lat - 33.915826) < 0.0003) return;
      var ll = L.latLng(lat, lon);
      var m = L.marker(ll, { icon: restroomIcon(p), title: p.map_label || p.name, keyboard: true, riseOnHover: true });
      m.addTo(group);
      var kind = p.type === "porta_john" ? "porta_john" : "restroom";
      addSearchable(kind, "Public restrooms", f, m, ll);
      count += 1;
    });
    group.addTo(state.map);
    state.layers.restrooms = group;
    return count;
  }

  /* ----------------------------- businesses (numbered pins, as printed) ----------------------------- */
  var AREA_TITLE = {
    island: ["Holden Beach Island", "Bridge Area & Ocean Blvd"],
    causeway: ["Causeway (NC 130)", "Holden Beach Rd, mainland side of the bridge"],
    mainland: ["Mainland", "Stone Chimney Rd, Old Ferry, Clubhouse Dr"],
    supply: ["Supply (US 17 & NC 211)", "Around the Hardee's corner"]
  };
  var CAT_ORDER = ["Restaurants", "Seafood Markets", "Coffee, Sweets & Treats", "Shopping & Groceries", "Rentals & Water Sports",
                   "Fun & Attractions", "Realty & Vacation Rentals", "Services & Lodging"];

  function pinIcon(num) {
    var n = String(num);
    return L.divIcon({
      className: "hb-divicon",
      html: '<div class="hb-pin' + (n.length > 2 ? " n3" : "") + '">' + n + "</div>",
      iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -14]
    });
  }

  var CFG = window.HB_CONFIG || {};
  function claimHref(p) {
    var base = CFG.claimUrl || "claim.html";
    if (!p) return base;
    var q = "business=" + encodeURIComponent(p.name) + "&pin=" + encodeURIComponent(p.pin) + "&id=" + encodeURIComponent(p.id);
    return base + (base.indexOf("?") === -1 ? "?" : "&") + q;
  }
  function telHref(phone) {
    var d = String(phone || "").replace(/[^0-9]/g, "");
    if (d.length === 10) d = "1" + d;
    return "tel:+" + d;
  }
  function photoUrl(u) { return /^(https?:\/\/|[\w][\w.\/-]*$)/i.test(u || "") ? u : ""; }
  function safeUrl(u) { return /^https?:\/\//i.test(u || "") ? u : ""; }
  function bizDirUrl(p, fallback) {
    var tp = p.true_point || [fallback.lng, fallback.lat];
    var url = "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(tp[1] + "," + tp[0]);
    if (state.userLatLng) url += "&origin=" + encodeURIComponent(state.userLatLng.lat + "," + state.userLatLng.lng);
    return url;
  }

  function bizCardHtml(p, pin) {
    var ext = ' target="_blank" rel="noopener noreferrer"';
    var h = '<li class="biz-card' + (p.paid ? " paid" : "") + '">';
    if (p.paid && photoUrl(p.photo)) h += '<img class="biz-photo" src="' + escapeHtml(photoUrl(p.photo)) + '" alt="' + escapeHtml(p.name) + '" loading="lazy">';
    h += "<b>" + escapeHtml(p.name) + "</b><span>" + escapeHtml(p.category) + (p.address ? " • " + escapeHtml(p.address) : "") + "</span>";
    if (p.paid && p.deal) {
      h += safeUrl(p.deal_url) ? '<a class="biz-deal" href="' + escapeHtml(p.deal_url) + '"' + ext + ">Deal: " + escapeHtml(p.deal) + "</a>"
                               : '<div class="biz-deal">Deal: ' + escapeHtml(p.deal) + "</div>";
    }
    h += '<div class="biz-actions">';
    if (p.phone) h += '<a class="biz-btn call" href="' + telHref(p.phone) + '" aria-label="Call ' + escapeHtml(p.name) + '">Call ' + escapeHtml(p.phone) + "</a>";
    h += '<a class="biz-btn dirs" href="' + bizDirUrl(p, pin.latlng) + '"' + ext + ' aria-label="Directions to ' + escapeHtml(p.name) + '">Directions</a>';
    if (p.paid && safeUrl(p.website)) h += '<a class="biz-btn web" href="' + escapeHtml(p.website) + '"' + ext + ">Website</a>";
    h += "</div>";
    if (!p.paid) h += '<a class="biz-claim" href="' + escapeHtml(claimHref(p)) + '">Claim your listing</a>';
    return h + "</li>";
  }

  function bizPopupHtml(pin) {
    var first = pin.items[0].props;
    var area = (AREA_TITLE[first.area] || [first.area])[0];
    var lis = pin.items.map(function (it) { return bizCardHtml(it.props, pin); }).join("");
    return '<div class="popup">'
      + '<div class="popup-kicker">Pin ' + pin.num + " • " + escapeHtml(area) + "</div>"
      + '<ul class="popup-biz">' + lis + "</ul></div>";
  }

  function addBusinesses(fc) {
    var group = L.markerClusterGroup({
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      spiderfyOnMaxZoom: true,
      disableClusteringAtZoom: CLUSTER_DISABLE_ZOOM,
      maxClusterRadius: 48,
      animate: false,
      iconCreateFunction: function (cluster) {
        var n = cluster.getChildCount();
        var size = n >= 20 ? "lg" : n >= 8 ? "md" : "sm";
        var px = size === "lg" ? 50 : size === "md" ? 42 : 36;
        return L.divIcon({
          className: "hb-divicon",
          html: '<div class="hb-cluster ' + size + '">' + n + "</div>",
          iconSize: [px, px],
          iconAnchor: [px / 2, px / 2]
        });
      }
    });
    var pins = {};
    fc.features.forEach(function (f) {
      var p = f.properties || {};
      var c = f.geometry.coordinates;
      if (!pins[p.pin]) pins[p.pin] = { num: p.pin, latlng: L.latLng(c[1], c[0]), items: [] };
      pins[p.pin].items.push({ props: p, feature: f });
    });
    state.pins = pins;
    Object.keys(pins).forEach(function (k) {
      var pin = pins[k];
      var names = pin.items.map(function (i) { return i.props.name; });
      var m = L.marker(pin.latlng, { icon: pinIcon(pin.num), title: pin.num + " " + names.join(" • "), keyboard: true, riseOnHover: true, zIndexOffset: 400 });
      m.bindPopup(function () { return bizPopupHtml(pin); }, { maxWidth: 340, autoPanPaddingTopLeft: L.point(12, 136), autoPanPaddingBottomRight: L.point(12, 24) });
      m.bindTooltip(pin.num + " • " + names.join(" • "), { className: "hb-tip", direction: "top", offset: [0, -14], opacity: 0.95 });
      m.addTo(group);
      pin.marker = m;
      pin.items.forEach(function (it) {
        var item = { kind: "business", layerName: "Business • pin " + pin.num, props: it.props, feature: it.feature, layer: m, latlng: pin.latlng, haystack: "" };
        item.haystack = (searchText(item) + " pin " + pin.num + " #" + pin.num).toLowerCase();
        state.features.push(item);
      });
    });
    group.addTo(state.map);
    state.layers.business = group;
    return fc.features.length;
  }

  function addParking(fc) {
    var group = L.layerGroup();
    var n = 0;
    fc.features.forEach(function (f) {
      var p = f.properties || {};
      var poly = L.geoJSON(f, { style: { color: "#2a5d9f", weight: 2, fillColor: "#5b8fd6", fillOpacity: 0.28 } });
      var c = p.center;
      var ll = L.latLng(c[1], c[0]);
      var m = L.marker(ll, { icon: L.divIcon({ className: "hb-divicon", html: '<div class="hb-parking">P</div>', iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -11] }), title: p.name });
      var chips = [p.kind];
      if (p.access === "permit") chips.push("Permit required");
      if (p.fee === "no") chips.push("Free");
      if (p.surface) chips.push(p.surface.replace("_", " "));
      var html = function () {
        return '<div class="popup"><div class="popup-kicker">Parking (OpenStreetMap)</div><h2>' + escapeHtml(p.name) + "</h2>"
          + '<ul class="popup-chips">' + chips.map(function (x) { return "<li>" + escapeHtml(x) + "</li>"; }).join("") + "</ul>"
          + '<p class="popup-notes">Mapped parking area from OpenStreetMap (<a href="' + p.osm + '" target="_blank" rel="noopener">source</a>). Check posted signs for fees and rules. Beach-access parking counts are on each access.</p>'
          + '<div class="popup-dirs"><a class="dir-btn walk" href="' + mapsDirUrl(ll.lat, ll.lng, "driving") + '" target="_blank" rel="noopener noreferrer">Driving directions</a></div></div>';
      };
      poly.bindPopup(html, { maxWidth: 320 }); m.bindPopup(html, { maxWidth: 320 });
      poly.addTo(group); m.addTo(group); n += 1;
    });
    state.layers.parking = group;   // off by default (Layers panel)
    return n;
  }

  /* ----------------------------- navigate to a pin / place ----------------------------- */
  function isSupplyLatLng(ll) {
    return ILL_SUPPLY.pad(0.25).contains(ll);
  }

  function setIncludeSupply(on) {
    state.includeSupply = !!on;
    applyBase();
    if (state.map) {
      state.map.setMaxBounds(on ? VIEW_BOUNDS.pad(0.12) : MAIN_MAX_BOUNDS);
      if (on && state.map.getMinZoom() > MIN_ZOOM) state.map.setMinZoom(MIN_ZOOM);
    }
  }

  function prepareForTarget(ll) {
    if (isSupplyLatLng(ll)) setIncludeSupply(true);
  }

  function topbarPad() {
    var bar = document.querySelector(".topbar");
    var h = bar ? Math.ceil(bar.getBoundingClientRect().height) + 8 : 136;
    return L.point(16, h);
  }

  function goTo(latlng, zoom, marker, openPopup) {
    prepareForTarget(latlng);
    var z = Math.max(zoom || DEFAULT_ZOOM, MINOR_LAYER_MIN_ZOOM);
    function after() {
      applyOverlayVisibility();
      if (openPopup && marker && marker.openPopup) marker.openPopup(latlng);
    }
    var group = state.layers.business;
    var inCluster = marker && group && group.hasLayer && group.hasLayer(marker) && group.zoomToShowLayer;
    if (inCluster) {
      if (!state.map.hasLayer(group) && $("ly-business").checked) group.addTo(state.map);
      group.zoomToShowLayer(marker, after);
    } else {
      state.map.setView(latlng, Math.max(state.map.getZoom(), z), { animate: true });
      state.map.once("moveend", after);
      // If already on target, moveend may not fire.
      setTimeout(function () {
        if (state.map.getBounds().contains(latlng)) after();
      }, 900);
    }
  }

  /* ----------------------------- directory panel ----------------------------- */
  function setupDirectory(fc) {
    var panel = $("dir-panel"), list = $("dir-list"), filter = $("dir-filter");
    if ($("dir-claim-link")) $("dir-claim-link").href = claimHref(null);
    var rows = fc.features.map(function (f) { return f.properties; });
    function render(q) {
      q = (q || "").trim().toLowerCase().replace(/^#/, "");
      var isNum = /^\d+$/.test(q);
      var html = [];
      var total = 0;
      ["island", "causeway", "mainland", "supply"].forEach(function (a) {
        var inArea = rows.filter(function (p) { return p.area === a; }).filter(function (p) {
          if (!q) return true;
          if (isNum) return String(p.pin) === q || String(p.pin).indexOf(q) === 0;
          return p.name.toLowerCase().indexOf(q) !== -1 || (p.category || "").toLowerCase().indexOf(q) !== -1;
        });
        if (!inArea.length) return;
        html.push('<div class="dir-area">' + escapeHtml(AREA_TITLE[a][0]) + "<small>" + escapeHtml(AREA_TITLE[a][1]) + "</small></div>");
        CAT_ORDER.forEach(function (c) {
          var its = inArea.filter(function (p) { return p.category === c; });
          if (!its.length) return;
          its.sort(function (x, y) { return x.name.toLowerCase().localeCompare(y.name.toLowerCase()); });
          html.push('<div class="dir-cat">' + escapeHtml(c) + "</div>");
          its.forEach(function (p) {
            total += 1;
            html.push('<button type="button" class="dir-item" data-pin="' + p.pin + '"><span class="dir-num">' + p.pin + "</span><span>" + escapeHtml(p.name) + "</span></button>");
          });
        });
      });
      list.innerHTML = total ? html.join("") : '<div class="dir-empty">No businesses match “' + escapeHtml(q) + '”.</div>';
      return total;
    }
    render("");
    function open_() { panel.hidden = false; $("btn-dir").setAttribute("aria-expanded", "true"); $("layer-panel").hidden = true; }
    function close_() { panel.hidden = true; $("btn-dir").setAttribute("aria-expanded", "false"); }
    $("btn-dir").addEventListener("click", function () { if (panel.hidden) open_(); else close_(); });
    $("btn-dir-close").addEventListener("click", close_);
    filter.addEventListener("input", function () { render(filter.value); });
    list.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-pin]");
      if (!b) return;
      var pin = state.pins[b.getAttribute("data-pin")];
      if (!pin) return;
      close_();
      if (!state.map.hasLayer(state.layers.business)) { $("ly-business").checked = true; }
      goTo(pin.latlng, 17, pin.marker, true);
    });
    window.HBDirectory = { render: render, count: rows.length };
  }

  /* ----------------------------- search ----------------------------- */
  function setupSearch() {
    var input = $("search");
    var list = $("search-results");
    var clear = $("search-clear");

    function hide() { list.hidden = true; list.innerHTML = ""; }

    function showResults(q) {
      q = q.trim().toLowerCase();
      list._hits = [];
      if (q.length < 2 && !/^\d$/.test(q)) { hide(); return; }
      var words = q.split(/\s+/).filter(Boolean);
      var hits = [];
      // Category searches ("restrooms", "parks", "beach access") list that whole layer and nothing else.
      var CATS = [
        { re: /^(public )?(rest ?rooms?|bath ?rooms?|toilets?|porta[- ]?johns?|potties|potty)$/, kinds: ["restroom", "porta_john"] },
        { re: /^(public )?(parks?|parks? (and|&) (fit )?trails?|fit ?trails?)$/, kinds: ["park", "trail"] },
        { re: /^(beach )?(access(es)?|walkways?|beach accesses)$/, kinds: ["access"] },
        { re: /^landmarks?$/, kinds: ["landmark"] },
        { re: /^(businesses|business|shops?|stores?|restaurants?)$/, kinds: ["business"] }
      ];
      var cat = null;
      for (var c = 0; c < CATS.length; c++) { if (CATS[c].re.test(q)) { cat = CATS[c]; break; } }
      if (cat) {
        for (var k = 0; k < state.features.length; k++) {
          if (cat.kinds.indexOf(state.features[k].kind) !== -1) hits.push(state.features[k]);
        }
        words = [];
      }
      for (var i = 0; !cat && i < state.features.length; i++) {
        var item = state.features[i];
        var ok = true;
        for (var w = 0; w < words.length; w++) {
          if (item.haystack.indexOf(words[w]) === -1) { ok = false; break; }
        }
        if (ok) hits.push(item);
      }
      hits.sort(function (a, b) {
        var an = (a.props.name || "").toLowerCase();
        var bn = (b.props.name || "").toLowerCase();
        var ap = an.indexOf(q) === 0 ? 0 : 1;
        var bp = bn.indexOf(q) === 0 ? 0 : 1;
        return ap - bp || an.localeCompare(bn);
      });
      if (/^#?\d+$/.test(q)) {
        var num = Number(q.replace("#", ""));
        hits = state.features.filter(function (it) { return it.kind === "business" && it.props.pin === num; });
      }
      hits = hits.slice(0, 40);
      if (!hits.length) {
        list._hits = [];
        list.innerHTML = '<li class="search-empty">No matches for “' + escapeHtml(q) + '”</li>';
        list.hidden = false;
        return;
      }
      list.innerHTML = hits.map(function (item, idx) {
        var name = (item.kind === "business" ? item.props.pin + " • " : "") + (item.props.name || item.props.map_label || "Place");
        var addr = item.props.address || "";
        return '<li><button type="button" role="option" data-i="' + idx + '">'
          + '<div><div class="search-kicker">' + escapeHtml(item.layerName) + "</div>"
          + '<div class="search-title">' + escapeHtml(name) + "</div>"
          + (addr ? '<div class="search-sub">' + escapeHtml(addr) + "</div>" : "")
          + "</div></button></li>";
      }).join("");
      list._hits = hits;
      list.hidden = false;
    }

    function openItem(item) {
      hide();
      input.blur();
      var layerId = {
        park: "parks", trail: "parks", landmark: "landmarks",
        access: "accesses", restroom: "restrooms", porta_john: "restrooms", business: "business"
      }[item.kind];
      if (layerId) {
        var cb = { parks: "ly-parks", landmarks: "ly-landmarks", accesses: "ly-accesses", restrooms: "ly-restrooms", business: "ly-business" }[layerId];
        if (cb) $(cb).checked = true;
      }
      goTo(item.latlng, item.kind === "business" ? 17 : 16, item.layer, true);
    }

    input.addEventListener("input", function () {
      clear.hidden = !input.value;
      showResults(input.value);
    });
    input.addEventListener("focus", function () {
      if (input.value.trim().length >= 2) showResults(input.value);
    });
    clear.addEventListener("click", function () { input.value = ""; clear.hidden = true; hide(); input.focus(); });
    list.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-i]");
      if (!btn) return;
      var item = (list._hits || [])[Number(btn.getAttribute("data-i"))];
      if (item) openItem(item);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { hide(); $("layer-panel").hidden = true; $("dir-panel").hidden = true; }
    });
    document.addEventListener("click", function (e) {
      if (!e.target.closest(".search-wrap")) hide();
    });

    // Expose for tests
    window.HBSearch = { run: function (q) { showResults(q); return (list._hits || []).map(function (i) { return i.props.id || i.props.name; }); }, openItem: openItem };
  }

  /* ----------------------------- locate ----------------------------- */
  function setupLocate() {
    var btn = $("btn-locate");
    function onFound(e) {
      state.userLatLng = e.latlng;
      btn.classList.remove("locating");
      btn.classList.add("active");
      if (!state.locMarker) {
        state.locMarker = L.marker(e.latlng, {
          icon: L.divIcon({ className: "", html: '<div class="hb-loc-dot"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }),
          zIndexOffset: 1000, interactive: false, keyboard: false
        }).addTo(state.map);
      } else {
        state.locMarker.setLatLng(e.latlng);
      }
      var acc = Math.max(e.accuracy || 0, 12);
      if (!state.locCircle) {
        state.locCircle = L.circle(e.latlng, { radius: acc, color: "#1a73e8", weight: 1, fillColor: "#1a73e8", fillOpacity: 0.12, interactive: false }).addTo(state.map);
      } else {
        state.locCircle.setLatLng(e.latlng).setRadius(acc);
      }
      if (!VIEW_BOUNDS.pad(0.15).contains(e.latlng)) {
        toast("Your location is outside the Holden Beach map area.");
      } else {
        state.map.setView(e.latlng, Math.max(state.map.getZoom(), 16));
      }
    }
    function onError(e) {
      btn.classList.remove("locating");
      var msg = "Could not read your location.";
      if (e && e.code === 1) msg = "Location permission was denied. You can turn it on in the browser settings.";
      if (e && e.code === 2) msg = "Your location is currently unavailable.";
      if (e && e.code === 3) msg = "Location request timed out. Try again.";
      toast(msg);
    }
    btn.addEventListener("click", function () {
      if (!navigator.geolocation) { toast("This browser cannot share your location."); return; }
      btn.classList.add("locating");
      state.map.locate({ setView: false, enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 });
    });
    state.map.on("locationfound", onFound);
    state.map.on("locationerror", onError);
  }

  /* ----------------------------- layers panel ----------------------------- */
  function applyOverlayVisibility() {
    if (!state.map) return;
    var z = state.map.getZoom();
    function vis(layer, id, minZ) {
      if (!layer || !$(id)) return;
      var want = $(id).checked && (minZ == null || z >= minZ);
      if (want && !state.map.hasLayer(layer)) layer.addTo(state.map);
      if (!want && state.map.hasLayer(layer)) state.map.removeLayer(layer);
    }
    vis(state.layers.business, "ly-business", null);
    vis(state.layers.parks, "ly-parks", null);
    vis(state.layers.landmarks, "ly-landmarks", null);
    vis(state.layers.accesses, "ly-accesses", MINOR_LAYER_MIN_ZOOM);
    vis(state.layers.restrooms, "ly-restrooms", MINOR_LAYER_MIN_ZOOM);
    vis(state.layers.parking, "ly-parking", MINOR_LAYER_MIN_ZOOM);
  }

  function setupLayerPanel() {
    var panel = $("layer-panel");
    function toggle() {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) $("dir-panel").hidden = true;
      $("btn-layers").setAttribute("aria-expanded", panel.hidden ? "false" : "true");
    }
    $("btn-layers").addEventListener("click", toggle);
    $("btn-layers-close").addEventListener("click", function () { panel.hidden = true; });

    $("ly-streets").addEventListener("change", applyBase);
    $("bm-illustrated").addEventListener("change", applyBase);
    $("bm-plain").addEventListener("change", applyBase);
    ["ly-business", "ly-parking", "ly-parks", "ly-landmarks", "ly-accesses", "ly-restrooms"].forEach(function (id) {
      $(id).addEventListener("change", applyOverlayVisibility);
    });
    state.map.on("zoomend", applyOverlayVisibility);
  }

  /* ----------------------------- boot ----------------------------- */
  function applyBase() {
    var ill = $("bm-illustrated").checked;
    var names = $("ly-streets").checked;
    var t = state.tiles, map = state.map;
    function on(l, yes) { if (!l) return; if (yes && !map.hasLayer(l)) l.addTo(map); if (!yes && map.hasLayer(l)) map.removeLayer(l); }
    on(t.streets, !ill && names);
    on(t.base, !ill && !names);
    on(t.ill, ill); on(t.ill18, ill); on(t.names, ill && names);
    // Supply art sits far north of the island; only show it when a Supply listing is opened,
    // so the whole-island phone view is not a floating inset on empty paper.
    on(t.illSupply, ill && state.includeSupply);
    map.getContainer().classList.toggle("illustrated", ill);
    try { localStorage.setItem("hb-basemap", ill ? "illustrated" : "plain"); } catch (e) { /* private mode */ }
  }

  function illLayer(z18, bounds) {
    return L.tileLayer("tiles/illustrated/{z}/{x}/{y}.webp", {
      minZoom: z18 ? 18 : MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      minNativeZoom: z18 ? 18 : 11,
      maxNativeZoom: z18 ? 18 : 17,
      bounds: bounds || (z18 ? ILL_Z18 : ILL_MAIN),
      noWrap: true,
      errorTileUrl: "tiles/clear.png",
      zIndex: z18 ? 3 : 2,
      attribution: 'Illustrated map: Holden Beach Insider (Tour Holden Beach) • Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors, Brunswick County GIS'
    });
  }

  function tileLayer(kind) {
    return L.tileLayer("tiles/" + kind + "/{z}/{x}/{y}.png", {
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      maxNativeZoom: 16,
      bounds: TILE_BOUNDS,
      noWrap: true,
      errorTileUrl: "tiles/empty.png",
      attribution: 'Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
    });
  }

  function positionZoom() {
    if (state.map) state.map.invalidateSize();
  }

  function queryView() {
    try {
      return (new URLSearchParams(location.search).get("view") || "").toLowerCase();
    } catch (e) { return ""; }
  }

  function updateViewButton() {
    var btn = $("btn-island");
    if (!btn) return;
    var full = state.viewMode === "full";
    btn.textContent = full ? "Bridge Area" : "Whole island";
    btn.title = full ? "Open on the Bridge Area" : "Show the whole island";
    btn.setAttribute("aria-pressed", full ? "true" : "false");
  }

  function showBridgeArea(opts) {
    opts = opts || {};
    setIncludeSupply(false);
    state.viewMode = "bridge";
    state.map.setMinZoom(DEFAULT_MIN_ZOOM);
    state.map.setMaxBounds(MAIN_MAX_BOUNDS);
    // z16 is the target; fitBounds of the Bridge Area with topbar padding
    // keeps the landing on-screen under the header on a phone.
    var z = DEFAULT_ZOOM;
    try {
      z = state.map.getBoundsZoom(BRIDGE_BOUNDS, false, topbarPad());
    } catch (e) { z = DEFAULT_ZOOM; }
    if (!isFinite(z) || z < 1) z = DEFAULT_ZOOM;
    // Default is z16; only go a little lower if a narrow phone can't frame the landing at 16.
    z = Math.min(DEFAULT_ZOOM, Math.max(DEFAULT_MIN_ZOOM, z));
    if (Math.abs(z - DEFAULT_ZOOM) < 0.6) z = DEFAULT_ZOOM;
    state.map.setView(BRIDGE_CENTER, z, { animate: !!opts.animate });
    updateViewButton();
  }

  function showWholeIsland(opts) {
    opts = opts || {};
    setIncludeSupply(false);
    state.viewMode = "full";
    state.map.setMinZoom(MIN_ZOOM);
    state.map.setMaxBounds(MAIN_MAX_BOUNDS);
    var pad = topbarPad();
    var z = state.map.getBoundsZoom(ISLAND_BOUNDS, false, pad);
    if (!isFinite(z)) z = MIN_ZOOM;
    state.map.setMinZoom(Math.max(MIN_ZOOM, z));
    state.map.fitBounds(ISLAND_BOUNDS, {
      paddingTopLeft: pad,
      paddingBottomRight: L.point(16, 24),
      maxZoom: 15,
      animate: !!opts.animate
    });
    updateViewButton();
  }

  function applyInitialView() {
    var hm = /^#(\d{1,2})\/(-?\d+\.\d+)\/(-?\d+\.\d+)$/.exec(location.hash || "");
    if (hm) {
      var ll = L.latLng(Number(hm[2]), Number(hm[3]));
      if (isSupplyLatLng(ll)) setIncludeSupply(true);
      else {
        state.map.setMinZoom(DEFAULT_MIN_ZOOM);
        state.map.setMaxBounds(MAIN_MAX_BOUNDS);
      }
      state.map.setView(ll, Number(hm[1]));
      state.viewMode = "bridge";
      updateViewButton();
      return;
    }
    if (queryView() === "full") showWholeIsland({ animate: false });
    else showBridgeArea({ animate: false });
  }

  function setupViewButton() {
    var btn = $("btn-island");
    if (!btn) return;
    btn.addEventListener("click", function () {
      if (state.viewMode === "full") showBridgeArea({ animate: true });
      else showWholeIsland({ animate: true });
    });
    updateViewButton();
  }

  function init() {
    var map = L.map("map", {
      zoomControl: false,
      attributionControl: true,
      minZoom: DEFAULT_MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      zoomSnap: 0.25,
      zoomDelta: 1,
      maxBounds: MAIN_MAX_BOUNDS,
      maxBoundsViscosity: 0.85,
      bounceAtZoomLimits: true
    });
    state.map = map;
    L.control.zoom({ position: "bottomleft" }).addTo(map);
    // Deliberately no scale control and no measure tools.

    state.tiles.streets = tileLayer("streets");
    state.tiles.base = tileLayer("base");
    state.tiles.base.options.zIndex = 1; state.tiles.streets.options.zIndex = 1;
    state.tiles.ill = illLayer(false, ILL_MAIN);
    state.tiles.illSupply = illLayer(false, ILL_SUPPLY);
    state.tiles.ill18 = illLayer(true, ILL_Z18);
    state.tiles.names = L.tileLayer("tiles/names/{z}/{x}/{y}.png", {
      minZoom: MIN_ZOOM, maxZoom: 16, maxNativeZoom: 16, bounds: TILE_BOUNDS, noWrap: true, errorTileUrl: "tiles/clear.png", zIndex: 4
    });
    function zoomClass() { map.getContainer().classList.toggle("z-low", map.getZoom() < 14); }
    map.on("zoomend", zoomClass); zoomClass();
    var saved = null;
    try { saved = localStorage.getItem("hb-basemap"); } catch (e) { saved = null; }
    if (saved === "plain") $("bm-plain").checked = true;
    applyBase();

    applyInitialView();
    setupViewButton();
    positionZoom();
    window.addEventListener("resize", positionZoom);

    Promise.all([
      loadJSON("data/parks.geojson"),
      loadJSON("data/landmarks.geojson"),
      loadJSON("data/beach-accesses.geojson"),
      loadJSON("data/restrooms.geojson"),
      loadJSON("data/businesses.geojson"),
      loadJSON("data/parking.geojson")
    ]).then(function (all) {
      var parks = addParks(all[0]);
      var landmarks = addLandmarks(all[1]);
      var accesses = addAccesses(all[2]);
      var restrooms = addRestrooms(all[3]);
      var businesses = addBusinesses(all[4]);
      var parking = addParking(all[5]);
      setupDirectory(all[4]);
      setupSearch();
      setupLocate();
      setupLayerPanel();
      positionZoom();
      state.map.invalidateSize();
      applyInitialView();
      applyOverlayVisibility();
      state.ready = true;
      var counts = {
        parks: parks,
        landmarks: landmarks,
        accesses: accesses,
        restrooms: restrooms,
        businesses: businesses,
        pins: Object.keys(state.pins).length,
        parking: parking,
        searchable: state.features.length
      };
      window.HB_COUNTS = counts;
      window.HBMap = { map: map, state: state, counts: counts };
      document.documentElement.setAttribute("data-ready", "1");
      document.documentElement.setAttribute("data-counts", JSON.stringify(counts));
    }).catch(function (err) {
      console.error(err);
      toast("The map data could not be loaded. " + (err && err.message ? err.message : ""));
      document.documentElement.setAttribute("data-ready", "error");
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
