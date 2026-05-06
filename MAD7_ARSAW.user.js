// ==UserScript==
// @name         MAD7 — ARSAW Station Scraper
// @namespace    https://mad7.internal/arsaw
// @version      1.0.0
// @description  Scrapes station-work data from Vantage (current-station-work) or Roboscout and sends to MAD7 OB Shift Manager via localStorage. Handles both pages.
// @author       MAD7 Team
// @match        https://vantage.amazon.com/app/fulfillment-dashboards/current-station-work*
// @match        https://roboscout-dub.amazon.com/*
// @match        https://roboscout.amazon.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  var LS_KEY     = 'mad7_import_arsaw';
  var MAX_TRIES  = 50;   // up to ~25s
  var INTERVAL   = 500;  // ms
  var attempts   = 0;
  var sent       = false;

  // ── Parse a rendered HTML table into station rows ─────────────────
  // Expected columns (Vantage station-work): Station | Login | Shift | ...
  // We look for rows where the first or second cell looks like a station number
  function scrapeTable() {
    var rows = [];
    var tables = document.querySelectorAll('table');

    tables.forEach(function (tbl) {
      var trs = tbl.querySelectorAll('tbody tr, tr');
      trs.forEach(function (tr) {
        var cells = Array.from(tr.querySelectorAll('td'));
        if (!cells.length) return;

        // Try to find a 4-digit station number in first two cells
        var stIdx = -1, stNum = null;
        for (var i = 0; i < Math.min(cells.length, 3); i++) {
          var txt = cells[i].textContent.trim();
          var m = txt.match(/^(\d{4,5})$/);
          if (m) { stNum = parseInt(m[1], 10); stIdx = i; break; }
        }
        if (!stNum) return;

        // Extract remaining fields relative to station column position
        var priority = null;
        if (stIdx > 0) {
          var pTxt = cells[0].textContent.trim();
          if (/^\d{1,2}$/.test(pTxt)) priority = parseInt(pTxt, 10);
        }

        var login = '';
        var shift = '';
        var rate  = null;

        if (cells[stIdx + 1]) login = cells[stIdx + 1].textContent.trim().toLowerCase();
        if (cells[stIdx + 2]) shift = cells[stIdx + 2].textContent.trim();
        // PPR / rate — may be in stIdx+3 or stIdx+4
        for (var j = stIdx + 3; j <= stIdx + 5 && j < cells.length; j++) {
          var v = parseFloat(cells[j].textContent.trim());
          if (!isNaN(v) && v > 0 && v < 10000) { rate = v; break; }
        }

        rows.push({ priority: priority, station: stNum, login: login, shift: shift, rate: rate });
      });
    });

    return rows;
  }

  // ── Build CSV string from rows ────────────────────────────────────
  function rowsToCsv(rows) {
    var lines = ['Priority,Station,Login,Shift,Rate'];
    rows.forEach(function (r) {
      lines.push([
        r.priority != null ? r.priority : '',
        r.station,
        r.login || '',
        r.shift || '',
        r.rate  != null ? r.rate : '',
      ].join(','));
    });
    return lines.join('\n');
  }

  // ── Send to MAD7 tool ─────────────────────────────────────────────
  function sendToMAD7(rows) {
    if (!rows.length) return;
    try {
      var payload = {
        ts:   Date.now(),
        csv:  rowsToCsv(rows),
        rows: rows,
        mad7: true,
      };
      localStorage.setItem(LS_KEY, JSON.stringify(payload));
      console.log('[MAD7 ARSAW] Sent ' + rows.length + ' stations (' +
        rows.filter(function(r){return r.login;}).length + ' staffed)');
    } catch (e) {
      console.warn('[MAD7 ARSAW] localStorage write failed:', e);
    }
    // Try postMessage to opener
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ type: 'arsaw_stations', rows: rows, ts: Date.now(), mad7: true }, '*');
      }
    } catch (e) {}
  }

  function tryExtract() {
    attempts++;
    var rows = scrapeTable();
    if (rows.length >= 5) {
      sendToMAD7(rows);
      sent = true;
      return true;
    }
    return false;
  }

  // MutationObserver — react to SPA renders
  var observer = new MutationObserver(function () {
    if (sent) { observer.disconnect(); return; }
    if (tryExtract()) { observer.disconnect(); clearInterval(poller); }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Polling fallback
  var poller = setInterval(function () {
    if (sent || attempts >= MAX_TRIES) {
      clearInterval(poller);
      observer.disconnect();
      if (!sent) console.warn('[MAD7 ARSAW] No station rows found after ' + MAX_TRIES + ' attempts.');
      return;
    }
    tryExtract();
  }, INTERVAL);

  // Extra attempts after page fully loads
  window.addEventListener('load', function () {
    [1500, 3000, 5000, 8000].forEach(function (ms) {
      setTimeout(function () { if (!sent) tryExtract(); }, ms);
    });
  });

  // Re-export on visibility change (tab comes back into focus)
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && !sent) {
      setTimeout(function () { tryExtract(); }, 800);
    }
  });

  // Allow manual re-trigger via console: window.mad7arsawResend()
  window.mad7arsawResend = function () {
    sent = false; attempts = 0;
    if (tryExtract()) console.log('[MAD7 ARSAW] Resent.');
    else console.warn('[MAD7 ARSAW] No rows found on resend.');
  };

  console.log('[MAD7 ARSAW v1.0.0] Waiting for station table…');
})();
