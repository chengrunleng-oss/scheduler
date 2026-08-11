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
  assert.equal(packageJson.scripts.build, "npm run clean && tsc --noEmit && vite build");
  assert.equal(packageJson.scripts.preview, "vite preview");
  assert.doesNotMatch(html, /(?:styles\.css|main\.ts)\?v=/);
  assert.match(html, /src="\/src\/main\.ts"/);
  await assert.rejects(access(new URL("../scripts/dev.mjs", import.meta.url)));
  await assert.rejects(access(new URL("../scripts/bundle.mjs", import.meta.url)));
  await assert.rejects(access(new URL("../scripts/serve.mjs", import.meta.url)));
});

test("Vite defaults to localhost ports with automatic fallback", () => {
  assert.equal(config.server.host, "127.0.0.1");
  assert.equal(config.server.port, 5173);
  assert.equal(config.server.strictPort, false);
  assert.equal(config.preview.host, "127.0.0.1");
  assert.equal(config.preview.port, 4173);
  assert.equal(config.preview.strictPort, false);
  assert.equal(config.build.target, "es2022");
});
