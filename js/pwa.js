/* Add-to-home-screen prompt + service worker registration. */
(function () {
  "use strict";

  var DISMISS_KEY = "hb-install-dismissed";

  function $(id) { return document.getElementById(id); }

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
  }

  function isIos() {
    var ua = window.navigator.userAgent || "";
    var iOS = /iPad|iPhone|iPod/.test(ua);
    var iPadOs = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
    return iOS || iPadOs;
  }

  function dismissed() {
    try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch (e) { return false; }
  }

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch (e) { /* private mode */ }
    var el = $("install-banner");
    if (el) el.hidden = true;
  }

  function showBanner(mode, deferred) {
    var el = $("install-banner");
    if (!el) return;
    var text = $("install-text");
    var action = $("install-action");
    if (mode === "ios") {
      text.innerHTML = "Add to your phone: tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.";
      action.hidden = true;
    } else {
      text.textContent = "Add this map to your phone for a home-screen icon and offline use.";
      action.hidden = false;
      action.onclick = function () {
        if (!deferred || !deferred.prompt) return;
        deferred.prompt();
        deferred.userChoice.then(function () { dismiss(); }).catch(function () { dismiss(); });
      };
    }
    el.hidden = false;
  }

  function setup() {
    $("install-dismiss") && $("install-dismiss").addEventListener("click", dismiss);
    if (isStandalone() || dismissed()) return;

    var deferredPrompt = null;
    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault();
      deferredPrompt = e;
      showBanner("android", deferredPrompt);
    });

    if (isIos()) showBanner("ios");
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function (err) {
        console.warn("Service worker not registered", err);
      });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup);
  else setup();
})();
