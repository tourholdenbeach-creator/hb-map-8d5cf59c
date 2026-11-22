/* Tour Holden Beach advertising site: shared helpers.
   Prices and inventory: data/products.json. Stripe links: data/payment-links.json. */
(function (w) {
  "use strict";
  var HB = {};
  HB.email = "tourholdenbeach@gmail.com";

  HB.load = function (base) {
    var bust = "?v=" + Math.floor(Date.now() / 60000); // admin edits show up within a minute or so of GitHub Pages publishing
    function get(u) { return fetch(base + u + bust, { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error(u); return r.json(); }); }
    return Promise.all([get("data/products.json"), get("data/payment-links.json").catch(function () { return {}; })])
      .then(function (a) { HB.data = a[0]; HB.links = a[1] || {}; if (a[0].contact_email) HB.email = a[0].contact_email; return HB; });
  };

  HB.money = function (n) {
    if (n === null || n === undefined || isNaN(n)) return "";
    var cents = Math.round(n * 100) % 100 !== 0;
    return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 });
  };
  HB.product = function (id) {
    var ps = (HB.data && HB.data.products) || [];
    for (var i = 0; i < ps.length; i++) if (ps[i].id === id) return ps[i];
    return null;
  };
  HB.left = function (p) { return Math.max(0, (p.total || 0) - (p.sold || 0)); };
  HB.slug = function (s) { return String(s || "").normalize("NFKD").replace(/[^\w\- ]/g, "").trim().replace(/\s+/g, "-").slice(0, 120); };
  HB.clean = function (s) { return String(s || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 90); };
  HB.esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };

  /* Where a Buy button goes: the Stripe Payment Link if one is set, otherwise the
     "checkout coming soon" page. base = path prefix back to /advertise/. */
  HB.buyUrl = function (base, id, plan, biz) {
    var l = (HB.links[id] || {})[plan] || "";
    if (/^https:\/\//i.test(l)) {
      return biz ? l + (l.indexOf("?") === -1 ? "?" : "&") + "client_reference_id=" + encodeURIComponent(HB.slug(biz)) : l;
    }
    var q = "product=" + encodeURIComponent(id) + "&plan=" + encodeURIComponent(plan);
    if (biz) q += "&biz=" + encodeURIComponent(biz);
    return base + "checkout/?" + q;
  };
  HB.planLabel = function (p, plan) {
    if (plan === "deposit") return "Reserve with 50% deposit: " + HB.money(p.deposit);
    if (plan === "annual") return "Pay annually: " + HB.money(p.annual_price) + " a year";
    if (plan === "monthly") return "Pay monthly: " + HB.money(p.monthly_price) + " a month";
    return "Pay in full: " + HB.money(p.prepaid_price);
  };
  HB.mailto = function (subject, body) {
    return "mailto:" + HB.email + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
  };
  HB.param = function (k) { try { return new URLSearchParams(w.location.search).get(k); } catch (e) { return null; } };
  w.HB = HB;
})(window);
