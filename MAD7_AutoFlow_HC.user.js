// ==UserScript==
// @name         MAD7 — AutoFlow HC Detector
// @namespace    https://mad7.internal/autoflow-hc
// @version      1.2.0
// @description  Scrapes detected + recommended HC from the AutoFlow MAD7 dashboard and sends to MAD7 OB Shift Manager. Uses GM_setValue so the Bridge userscript on file:// can pick it up cross-origin.
// @author       MAD7 Team
// @match        https://autoflow-cascade-eu.amazon.com/MAD7/dashboard*
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // PP codes we care about — must match MAD7 tool's PLAN.p1 codes
  var KNOWN_PPS = [
    'PPAFE1',
    'PPSingleMedium',
    'PPSingleSIOBC',
    'PPSingleNoSLAM2',
    'PPSingleNoSLAM',
    'PPSingleMediumMix',
    'PPPickToRebin2',
    'PPPickToRebin3',
    'PPPickToRebin4',
  ];

  // Read HC values from the rendered table.
  // The AutoFlow dashboard renders a table where each row has:
  //   PP code | ... | Detected | Recommended | ...
  // We look for rows containing known PP codes and extract integers from their cells.
  function scrapeTable() {
    var detected    = {};
    var recommended = {};

    // Try all tables on the page
    var tables = document.querySelectorAll('table');
    tables.forEach(function (table) {
      var rows = table.querySelectorAll('tr');
      rows.forEach(function (row) {
        var text = row.textContent || '';
        // Find which PP code this row contains
        var ppCode = null;
        for (var i = 0; i < KNOWN_PPS.length; i++) {
          if (text.indexOf(KNOWN_PPS[i]) !== -1) { ppCode = KNOWN_PPS[i]; break; }
        }
        if (!ppCode) return;

        // Get all cell text values
        var cells = Array.from(row.querySelectorAll('td, th'));
        var nums  = cells.map(function (c) {
          var n = parseInt(c.textContent.trim(), 10);
          return isNaN(n) ? null : n;
        }).filter(function (n) { return n !== null && n >= 0 && n < 10000; });

        // Heuristic: first integer after the PP code = detected, second = recommended
        // Works for most AF dashboard layouts; adjust if needed.
        if (nums.length >= 1) detected[ppCode]    = nums[0];
        if (nums.length >= 2) recommended[ppCode] = nums[1];
      });
    });

    return { detected: detected, recommended: recommended };
  }

  // Post data to MAD7.
  // PRIMARY: GM_setValue — Bridge userscript on file:// polls GM_getValue cross-domain.
  // FALLBACK: window.opener.postMessage (works if MAD7 opened this tab).
  function sendToMAD7(detected, recommended) {
    var n = Object.keys(detected).length;
    if (n === 0) return;
    var payload = {
      type:        'autoflow_hc',
      detected:    detected,
      recommended: recommended,
      ts:          Date.now(),
      mad7:        true,
    };
    var payloadStr = JSON.stringify(payload);

    // Channel 1: GM_setValue (Bridge userscript reads this via GM_getValue on file://)
    try {
      GM_setValue('mad7_af_hc', payloadStr);
      console.log('[MAD7 AF HC] Sent ' + n + ' PPs via GM_setValue.');
    } catch (e) {
      console.warn('[MAD7 AF HC] GM_setValue failed:', e);
    }

    // Channel 2: postMessage to opener (if MAD7 opened this tab)
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(payload, '*');
      }
    } catch (e) {}
  }

  var sent        = false;
  var attempts    = 0;
  var MAX_TRIES   = 40;   // ~20 s total
  var INTERVAL_MS = 500;

  function tryExtract() {
    attempts++;
    var result = scrapeTable();
    var n = Object.keys(result.detected).length;

    if (n > 0) {
      sendToMAD7(result.detected, result.recommended);
      sent = true;
      return true;
    }
    return false;
  }

  // Use MutationObserver to react to DOM changes (SPA renders table asynchronously)
  var observer = new MutationObserver(function () {
    if (sent) { observer.disconnect(); return; }
    if (tryExtract()) { observer.disconnect(); clearInterval(poller); }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Fallback: interval-based polling in case MutationObserver fires before data is ready
  var poller = setInterval(function () {
    if (sent || attempts >= MAX_TRIES) {
      clearInterval(poller);
      observer.disconnect();
      if (!sent) console.warn('[MAD7 AF HC] Could not detect any PP rows after ' + MAX_TRIES + ' attempts.');
      return;
    }
    tryExtract();
  }, INTERVAL_MS);

  // Also try immediately after the page load event
  window.addEventListener('load', function () {
    setTimeout(function () { if (!sent) tryExtract(); }, 1500);
    setTimeout(function () { if (!sent) tryExtract(); }, 3000);
    setTimeout(function () { if (!sent) tryExtract(); }, 5000);
  });

  console.log('[MAD7 AF HC v1.1.0] Waiting for AutoFlow table to render…');
})();
