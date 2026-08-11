import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const workspace = fileURLToPath(new URL("..", import.meta.url));

export async function createSourceLoader() {
  const server = await createServer({
    root: workspace,
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });
  return {
    load: (modulePath) => server.ssrLoadModule(`/src/${modulePath}`),
    close: () => server.close(),
  };
}
