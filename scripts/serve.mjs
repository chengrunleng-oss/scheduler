import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const portIndex = args.indexOf("--port");
const port = Number(portIndex >= 0 ? args[portIndex + 1] : process.env.PORT ?? 5173);
const host = "127.0.0.1";

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error(`Invalid port: ${String(port)}`);
}

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
]);

export function createStaticServer(rootDirectory = process.cwd()) {
  const root = resolve(rootDirectory);
  return createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? "/", `http://${host}`).pathname);
      const relativePath = pathname.replace(/^\/+/, "") || "index.html";
      let filePath = resolve(root, relativePath);

      if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
        response.writeHead(403).end("Forbidden");
        return;
      }

      const fileStat = await stat(filePath);
      if (fileStat.isDirectory()) filePath = resolve(filePath, "index.html");

      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": contentTypes.get(extname(filePath).toLowerCase()) ?? "application/octet-stream",
      });
      createReadStream(filePath).pipe(response);
    } catch (error) {
      const status = error && typeof error === "object" && "code" in error && error.code === "ENOENT" ? 404 : 500;
      response.writeHead(status).end(status === 404 ? "Not found" : "Server error");
    }
  });
}

export async function startStaticServer({ port: serverPort = 5173, rootDirectory = process.cwd(), log = true } = {}) {
  const server = createStaticServer(rootDirectory);
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(serverPort, host, () => {
      server.off("error", rejectListen);
      if (log) console.log(`Task Workbench available at http://${host}:${serverPort}/`);
      resolveListen();
    });
  });
  return server;
}

const isMainModule = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMainModule) {
  const server = await startStaticServer({ port });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => server.close(() => process.exit(0)));
  }
}
