import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import config from "../vite.config.mjs";

test("Vite owns development, production build, and preview commands", async () => {
  const [packageText, html] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../index.html", import.meta.url), "utf8"),
  ]);
  const packageJson = JSON.parse(packageText);

  assert.equal(packageJson.scripts.dev, "vite");
  assert.equal(packageJson.scripts.build, "npm run clean && vue-tsc --noEmit && vite build");
  assert.equal(packageJson.scripts.preview, "vite preview");
  assert.doesNotMatch(html, /(?:styles\.css|main\.ts)\?v=/);
  assert.match(html, /src="\/src\/main\.ts"/);
  await assert.rejects(access(new URL("../scripts/dev.mjs", import.meta.url)));
  await assert.rejects(access(new URL("../scripts/bundle.mjs", import.meta.url)));
  await assert.rejects(access(new URL("../scripts/serve.mjs", import.meta.url)));
});

test("Vue owns the interface shell and is compiled by the official Vite plugin", async () => {
  const [main, app, packageText] = await Promise.all([
    readFile(new URL("../src/main.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/App.vue", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  const packageJson = JSON.parse(packageText);

  assert.match(main, /createApp\(App\)\.mount\("#app"\)/);
  assert.match(app, /<AppSidebar\s*\/>/);
  assert.match(app, /<TaskBoard\s*\/>/);
  assert.match(app, /<TaskWorkspace\s*\/>/);
  assert.ok(packageJson.dependencies.vue);
  assert.ok(packageJson.devDependencies["@vitejs/plugin-vue"]);
  assert.equal(packageJson.scripts.typecheck, "vue-tsc --noEmit");
});

test("Vite uses fixed localhost origins for persistent workspace permissions", () => {
  assert.equal(config.server.host, "127.0.0.1");
  assert.equal(config.server.port, 5173);
  assert.equal(config.server.strictPort, true);
  assert.equal(config.preview.host, "127.0.0.1");
  assert.equal(config.preview.port, 4173);
  assert.equal(config.preview.strictPort, true);
  assert.equal(config.build.target, "es2022");
});
