/**
 * Simple HTTP server for the demo site
 * 
 * Usage:
 *   node server.js
 *   # Then visit http://localhost:3000
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');

const PORT = process.env.PORT || 3000;
// Anchored to this file, not the cwd, so the demo serves the same content
// regardless of where it is launched from.
const BASE_DIR = __dirname;

// MIME types
const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain'
};

// Create HTTP server
const server = http.createServer(async (req, res) => {
  try {
    // Parse URL
    const parsedUrl = url.parse(req.url);
    let pathname = parsedUrl.pathname;
    
    // Default to index.html
    if (pathname === '/') {
      pathname = '/index.html';
    }
    
    // Remove leading slash
    const filePath = decodeURIComponent(pathname.slice(1));
    const absPath = path.resolve(BASE_DIR, filePath);

    // Keep traversal (e.g. /../../etc/passwd) inside the demo directory
    if (absPath !== BASE_DIR && !absPath.startsWith(BASE_DIR + path.sep)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    // Check if file exists
    try {
      const stats = await fs.promises.stat(absPath);

      if (stats.isDirectory()) {
        // Try index.html in directory
        const indexPath = path.join(absPath, 'index.html');
        try {
          await fs.promises.access(indexPath);
          serveFile(indexPath, res);
          return;
        } catch {
          // Directory listing not allowed
          res.writeHead(403);
          res.end('Directory listing not allowed');
          return;
        }
      }
      
      // Serve the file
      serveFile(absPath, res);
      
    } catch (err) {
      // Extensionless routes (/about) map to their page, so the audit's
      // route list resolves without every link needing a .html suffix.
      if (!path.extname(absPath)) {
        try {
          const htmlPath = `${absPath}.html`;
          await fs.promises.access(htmlPath);
          serveFile(htmlPath, res);
          return;
        } catch {
          // Fall through to 404
        }
      }

      res.writeHead(404);
      res.end('Not Found');
    }
    
  } catch (err) {
    console.error('Error:', err);
    res.writeHead(500);
    res.end('Internal Server Error');
  }
});

/**
 * Serve a file
 */
function serveFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';
  
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500);
      res.end('Error reading file');
      return;
    }
    
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
}

// Start server
server.listen(PORT, () => {
  console.log(`Demo site running at http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop');
});

// Handle shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down...');
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('Shutting down...');
  server.close(() => {
    process.exit(0);
  });
});
