const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DEFAULT_PORT = 3001;
const DEFAULT_TARGET = 'https://insights.prod-eu.pack.aft.a2z.com/packman';
const LOCAL_API_PREFIX = '/api/packman';

function loadEnvConfig() {
  const envPath = path.resolve(__dirname, '.env');
  if (!fs.existsSync(envPath)) return {};

  const raw = fs.readFileSync(envPath, 'utf8');
  return raw.split(/\r?\n/).reduce((acc, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return acc;
    const [key, ...valueParts] = trimmed.split('=');
    if (!key) return acc;
    acc[key.trim()] = valueParts.join('=').trim();
    return acc;
  }, {});
}

const env = loadEnvConfig();
const targetBaseUrl = env.PACKMAN_BASE_URL || env.PACKMAN_API_BASE_URL || DEFAULT_TARGET;
const url = new URL(targetBaseUrl);
const port = parseInt(env.PACKMAN_PROXY_PORT || process.env.PACKMAN_PROXY_PORT || DEFAULT_PORT, 10);
const MIDWAY_USE_COOKIE = (env.MIDWAY_USE_COOKIE || process.env.MIDWAY_USE_COOKIE || 'true').toLowerCase() === 'true';
const MWINIT_PATH = env.MIDWAY_MWINIT_PATH || process.env.MIDWAY_MWINIT_PATH || 'C:\\Program Files\\ITACsvc\\mwinit.exe';
const MIDWAY_COOKIE_JAR = env.MIDWAY_COOKIE_JAR || process.env.MIDWAY_COOKIE_JAR || path.join(process.env.APPDATA || process.env.USERPROFILE || '', 'cf');

function resolveMidwayCookieJar() {
  const variableExpand = str => str.replace(/%([^%]+)%/g, (_, key) => process.env[key] || '');
  if (MIDWAY_COOKIE_JAR) {
    const expanded = variableExpand(MIDWAY_COOKIE_JAR.replace(/^~(?=$|\b)/, process.env.USERPROFILE || ''));
    return path.resolve(expanded);
  }
  if (process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'cf');
  }
  if (process.env.USERPROFILE) {
    return path.join(process.env.USERPROFILE, 'AppData', 'Roaming', 'cf');
  }
  return path.join(__dirname, 'midway-cf');
}

function parseMidwayCookieJar(content) {
  const cookies = {};
  content.split(/\r?\n/).forEach(line => {
    const parts = line.split('\t');
    if (parts.length >= 2) {
      const name = parts[0].trim();
      const value = parts[1].trim();
      if (name && value) cookies[name] = value;
    }
  });
  return cookies;
}

function ensureMidwayCookieJar() {
  const cookieJar = resolveMidwayCookieJar();
  try {
    console.log('🔐 Running mwinit to refresh Midway cookies...');
    execFileSync(MWINIT_PATH, ['--aea', '--cookie-jar', cookieJar], { stdio: 'inherit' });
  } catch (error) {
    console.error('❌ Midway auth helper failed:', error.message);
    throw error;
  }

  if (!fs.existsSync(cookieJar)) {
    throw new Error('Midway cookie jar was not created');
  }

  return cookieJar;
}

function buildMidwayCookieHeader() {
  const cookieJar = resolveMidwayCookieJar();
  if (!fs.existsSync(cookieJar)) {
    ensureMidwayCookieJar();
  }

  const content = fs.readFileSync(cookieJar, 'utf8');
  const cookies = parseMidwayCookieJar(content);
  if (!cookies.session) {
    throw new Error('Midway session cookie not found');
  }

  const headerParts = [];
  headerParts.push(`session=${cookies.session}`);
  if (cookies.amazon_enterprise_access) {
    headerParts.push(`amazon_enterprise_access=${cookies.amazon_enterprise_access}`);
  }
  return headerParts.join('; ');
}

function attachMidwayCookies(headers) {
  if (!MIDWAY_USE_COOKIE) return;
  try {
    const cookieHeader = buildMidwayCookieHeader();
    if (cookieHeader) {
      headers.Cookie = cookieHeader;
      console.log('✅ Attached Midway session cookie to outgoing Packman request');
    }
  } catch (error) {
    console.warn('⚠️ Could not attach Midway cookie:', error.message);
  }
}

function getCorsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Expose-Headers': 'Content-Type, Authorization',
  };
}

function sendResponse(res, statusCode, headers, body) {
  res.writeHead(statusCode, headers);
  if (body) res.end(body);
  else res.end();
}

function proxyRequest(req, res) {
  const origin = req.headers.origin || '*';
  if (req.method === 'OPTIONS') {
    return sendResponse(res, 204, getCorsHeaders(origin));
  }

  if (!req.url.startsWith(LOCAL_API_PREFIX)) {
    const html = `<!doctype html><html><body><h1>Packman Proxy</h1><p>Use ${LOCAL_API_PREFIX}/&hellip; to proxy Packman requests.</p></body></html>`;
    return sendResponse(res, 200, {
      'Content-Type': 'text/html; charset=utf-8',
      ...getCorsHeaders(origin)
    }, html);
  }

  const pathWithoutPrefix = req.url.slice(LOCAL_API_PREFIX.length) || '/';
  const targetUrl = new URL(pathWithoutPrefix, targetBaseUrl);
  const isHttps = targetUrl.protocol === 'https:';
  const transport = isHttps ? https : http;

  const headers = { ...req.headers };
  delete headers.host;
  delete headers['content-length'];
  delete headers.connection;
  delete headers.cookie;

  if (req.url.startsWith(LOCAL_API_PREFIX)) {
    attachMidwayCookies(headers);
  }

  const requestOptions = {
    protocol: targetUrl.protocol,
    hostname: targetUrl.hostname,
    port: targetUrl.port || (isHttps ? 443 : 80),
    path: targetUrl.pathname + targetUrl.search,
    method: req.method,
    headers,
  };

  const proxyReq = transport.request(requestOptions, proxyRes => {
    const responseHeaders = {
      ...proxyRes.headers,
      ...getCorsHeaders(origin),
    };
    delete responseHeaders['content-length'];

    res.writeHead(proxyRes.statusCode || 502, responseHeaders);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', error => {
    console.error('Proxy request error:', error.message);
    sendResponse(res, 502, getCorsHeaders(origin), JSON.stringify({ error: error.message }));
  });

  req.pipe(proxyReq, { end: true });
}

const server = http.createServer(proxyRequest);
server.listen(port, () => {
  console.log(`✅ Packman proxy server started on http://localhost:${port}`);
  console.log(`➡️ Forwarding requests to: ${targetBaseUrl}`);
  console.log(`➡️ Proxy path: ${LOCAL_API_PREFIX}/...`);
});

server.on('error', err => {
  console.error('Proxy server error:', err.message);
  process.exit(1);
});
