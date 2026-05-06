// ==UserScript==
// @name         MAD7 OB Shift Manager — Unified Bridge v1.0
// @namespace    https://mad7.internal/bridge
// @version      1.0.0
// @description  Single CORS bridge for MAD7 OBShiftManager. Replaces all 6 individual userscripts by forwarding GM_xmlhttpRequest calls to the tool via window.__mad7Bridge.
// @author       MAD7 Team
// @match        file:///*
// @grant        GM_xmlhttpRequest
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
    version: '1.0.0',
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

  console.log('[MAD7 Bridge v1.0.0] Ready — GM_xmlhttpRequest bridge active');
})();
