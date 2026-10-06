/**
 * Habitual Local GunDB Relay Server
 * Provides a reliable local peer for P2P browser synchronization.
 */
const http = require('http');
const Gun = require('gun');

const PORT = process.env.PORT || 8765;

const server = http.createServer((req, res) => {
  // Handle CORS headers for local development browser access
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Gun serves its client lib and HTTP endpoint
  if (Gun.serve(req, res)) {
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Habitual Local GunDB Relay is running!\n');
});

const gun = Gun({ web: server.listen(PORT) });

console.log(`\n==================================================`);
console.log(`🚀 Habitual Local GunDB Relay Server running at:`);
console.log(`   http://localhost:${PORT}/gun`);
console.log(`   http://127.0.0.1:${PORT}/gun`);
console.log(`==================================================\n`);
