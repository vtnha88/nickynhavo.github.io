import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

async function findFile(pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const relativePath = decodedPath.replace(/^\/+/, "");
  const requestedPath = path.resolve(root, relativePath);
  const relativeToRoot = path.relative(root, requestedPath);
  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) return null;

  const candidates = [requestedPath];
  if (!path.extname(requestedPath)) {
    candidates.push(
      path.join(requestedPath, "index.html"),
      `${requestedPath}.html`,
    );
  }
  if (decodedPath.endsWith("/")) {
    candidates.unshift(path.join(requestedPath, "index.html"));
  }

  for (const candidate of candidates) {
    try {
      const details = await stat(candidate);
      if (details.isFile()) return { path: candidate, size: details.size };
      if (details.isDirectory()) {
        const indexPath = path.join(candidate, "index.html");
        const indexDetails = await stat(indexPath);
        if (indexDetails.isFile()) return { path: indexPath, size: indexDetails.size };
      }
    } catch (error) {
      if (error?.code !== "ENOENT" && error?.code !== "ENOTDIR") throw error;
    }
  }

  return null;
}

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end("Method not allowed");
    return;
  }

  let pathname;
  try {
    pathname = new URL(request.url || "/", "http://localhost").pathname;
  } catch {
    response.writeHead(400);
    response.end("Bad request");
    return;
  }

  try {
    let file = await findFile(pathname);
    let status = 200;
    if (!file) {
      file = await findFile("/404.html");
      status = 404;
    }
    if (!file) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    response.writeHead(status, {
      "Content-Length": file.size,
      "Content-Type": mimeTypes[path.extname(file.path).toLowerCase()] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }

    createReadStream(file.path).pipe(response);
  } catch (error) {
    console.error("Could not serve static export:", error);
    if (!response.headersSent) response.writeHead(500);
    response.end("Internal server error");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Static export available at http://127.0.0.1:${port}`);
});
