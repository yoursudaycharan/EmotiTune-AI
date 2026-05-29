// EmotiTune AI — Local Proxy Server
// This proxies requests to Groq API so the browser doesn't hit CORS issues.
// Run: node server.js
// Then open: http://localhost:3000

const http  = require("http");
const https = require("https");
const fs    = require("fs");
const path  = require("path");

const PORT = 3000;

// ── MIME types ────────────────────────────────────────────────────
const MIME = {
  ".html": "text/html",
  ".js":   "application/javascript",
  ".css":  "text/css",
  ".json": "application/json",
  ".png":  "image/png",
  ".ico":  "image/x-icon",
};

// ── Groq proxy ────────────────────────────────────────────────────
function proxyGroq(req, res) {
  let body = "";
  req.on("data", chunk => body += chunk);
  req.on("end", () => {
    let parsed;
    try { parsed = JSON.parse(body); } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON body" }));
      return;
    }

    const apiKey = parsed._apiKey;
    delete parsed._apiKey;          // remove before forwarding

    if (!apiKey) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "No API key provided" }));
      return;
    }

    const payload = JSON.stringify(parsed);
    const options = {
      hostname: "api.groq.com",
      path:     "/openai/v1/chat/completions",
      method:   "POST",
      headers:  {
        "Content-Type":   "application/json",
        "Authorization":  "Bearer " + apiKey,
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    const proxyReq = https.request(options, proxyRes => {
      let data = "";
      proxyRes.on("data", c => data += c);
      proxyRes.on("end", () => {
        res.writeHead(proxyRes.statusCode, {
          "Content-Type":                "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(data);
      });
    });

    proxyReq.on("error", err => {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Proxy error: " + err.message }));
    });

    proxyReq.write(payload);
    proxyReq.end();
  });
}

// ── Static file server ────────────────────────────────────────────
function serveFile(req, res) {
  let filePath = path.join(__dirname, req.url === "/" ? "index.html" : req.url);
  const ext    = path.extname(filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found: " + req.url);
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[ext] || "text/plain" });
    res.end(data);
  });
}

// ── Main server ───────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin":  "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  // API proxy endpoint
  if (req.method === "POST" && req.url === "/api/groq") {
    proxyGroq(req, res);
    return;
  }

  // Serve static files
  serveFile(req, res);
});

server.listen(PORT, () => {
  console.log("╔════════════════════════════════════════╗");
  console.log("║     EmotiTune AI — Server Running      ║");
  console.log("╠════════════════════════════════════════╣");
  console.log(`║  Open: http://localhost:${PORT}           ║`);
  console.log("║  Press Ctrl+C to stop                  ║");
  console.log("╚════════════════════════════════════════╝");
});