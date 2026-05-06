// ==UserScript==
// @name         MAD7 OB Shift Manager — Unified Bridge v1.0
// @namespace    https://mad7.internal/bridge
// @version      1.1.0
// @description  Single CORS bridge for MAD7 OBShiftManager. Forwards GM_xmlhttpRequest calls to the tool and relays cross-origin userscript data (AutoFlow HC, ARSAW) via GM_getValue polling.
// @author       MAD7 Team
// @match        file:///*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        unsafeWindow
// @connect      autoflow-cascade-eu.amazon.com
// @connect      app.eu-prod.milano-dev-tools.outbound-flow.aft.amazon.dev
// @connect      fclm-portal.amazon.com
// @connect      flow-sortation-eu.amazon.com
// @connect      insights.prod-eu.pack.aft.a2z.com
// @connect      picking-console.eu.picking.aft.a2z.com
// @connect      rodeo-dub.amazon.com
// @connect      trb-eu.corp.amazon.com
// @connect      fans-dub.amazon.com
// @connect      *
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  // Core request handler — wraps GM_xmlhttpRequest in a callback API
  // identical to the UFD Bridge pattern so both detection paths work.
  function bridgeRequest(opts, callback) {
    GM_xmlhttpRequest({
      method:          opts.method  || 'GET',
      url:             opts.url,
      headers:         opts.headers || {},
      data:            opts.data    || null,
      withCredentials: true,
      anonymous:       false,
      onload: function (response) {
        callback({
          status:       response.status,
          responseText: response.responseText,
          headers:      response.responseHeaders || '',
          finalUrl:     response.finalUrl        || opts.url,
        });
      },
      onerror: function () {
        callback({ error: 'Network error', status: 0 });
      },
      ontimeout: function () {
        callback({ error: 'Request timed out', status: 0 });
      },
    });
  }

  // ── Expose __mad7Bridge (native MAD7 detection path) ──────────────────
  unsafeWindow.__mad7Bridge = {
    ready:   true,
    version: '1.1.0',
    request: bridgeRequest,
    // Promise-based helper consumed directly by bridgeFetch() in the tool.
    // Use unsafeWindow.Promise so the returned Promise lives in page context
    // (Firefox Xray: sandbox Promises are opaque to page code).
    fetch: function (url, opts) {
      var P = unsafeWindow.Promise || Promise;
      return new P(function (resolve, reject) {
        bridgeRequest(
          Object.assign({ url: url }, opts || {}),
          function (resp) {
            if (resp && resp.error) reject(new Error(resp.error));
            else                    resolve(resp);
          }
        );
      });
    },
  };

  // ── Expose __ufdBridgeRequest (UFD Bridge compatibility path) ─────────
  // Keeps compatibility if the page detects the UFD pattern instead.
  unsafeWindow.__ufdBridgeRequest = bridgeRequest;
  unsafeWindow.__UFD_BRIDGE_READY = true;

  // ── Fire both ready events so either listener wakes up the tool ───────
  // Firefox Xray: CustomEvent must be constructed in the page's context,
  // not the sandbox, otherwise the page's addEventListener won't receive it.
  var CE = unsafeWindow.CustomEvent || CustomEvent;
  unsafeWindow.dispatchEvent(new CE('mad7-bridge-ready'));
  unsafeWindow.dispatchEvent(new CE('ufd-bridge-ready'));

  // ── Cross-origin data relay via GM_getValue ────────────────────────────
  // AutoFlow HC and ARSAW userscripts write to GM_setValue on their domain.
  // Since GM storage is shared across all userscripts from the same @namespace,
  // we can read it here on file:// and inject it into the MAD7 page.

  var _afHcTs   = 0;
  var _arsawTs  = 0;

  function relayAfHc() {
    try {
      var raw = GM_getValue('mad7_af_hc', '');
      if (!raw) return;
      var d = JSON.parse(raw);
      if (!d || d.ts <= _afHcTs) return;
      _afHcTs = d.ts;
      // Inject into the MAD7 page via its afApply function
      var fn = unsafeWindow.afApply || unsafeWindow.handleImportData;
      if (typeof unsafeWindow.afApply === 'function') {
        unsafeWindow.afApply(d.detected || {}, 'userscript', d.recommended || {});
        console.log('[MAD7 Bridge] Relayed AF HC:', Object.keys(d.detected || {}).length, 'PPs');
      } else if (typeof unsafeWindow.handleImportData === 'function') {
        unsafeWindow.handleImportData({ type: 'autoflow_hc', detected: d.detected || {}, recommended: d.recommended || {}, ts: d.ts, mad7: true });
      }
    } catch (e) {}
  }

  function relayArsaw() {
    try {
      var raw = GM_getValue('mad7_arsaw', '');
      if (!raw) return;
      var d = JSON.parse(raw);
      if (!d || d.ts <= _arsawTs) return;
      _arsawTs = d.ts;
      if (typeof unsafeWindow.arsawApply === 'function' && d.rows && d.rows.length) {
        unsafeWindow.arsawApply(d.rows, 'userscript');
        console.log('[MAD7 Bridge] Relayed ARSAW:', d.rows.length, 'stations');
      }
    } catch (e) {}
  }

  // Poll every 3 seconds — cache TTL of GM_getValue is negligible
  setInterval(function () {
    relayAfHc();
    relayArsaw();
  }, 3000);

  // Also relay immediately after page settles
  setTimeout(relayAfHc,  2000);
  setTimeout(relayArsaw, 2000);

  console.log('[MAD7 Bridge v1.1.0] Ready — GM_xmlhttpRequest + cross-origin relay active');
})();
