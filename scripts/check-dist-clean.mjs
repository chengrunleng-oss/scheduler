import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

const expectedDir = await mkdtemp(join(tmpdir(), "task-workbench-vite-dist-"));

try {
  const vite = join("node_modules", "vite", "bin", "vite.js");
  const result = spawnSync(process.execPath, [vite, "build", "--outDir", expectedDir, "--logLevel", "silent"], {
    encoding: "utf8",
    shell: false,
  });

  if (result.status !== 0) {
    if (result.stdout) process.stderr.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exitCode = result.status ?? 1;
  } else {
    const actualFiles = await listFiles("dist");
    const expectedFiles = await listFiles(expectedDir);
    const allFiles = [...new Set([...actualFiles, ...expectedFiles])].sort();
    const mismatches = [];

    for (const file of allFiles) {
      if (!actualFiles.includes(file) || !expectedFiles.includes(file)) {
        mismatches.push(file);
        continue;
      }
      const [actual, expected] = await Promise.all([readFile(join("dist", file)), readFile(join(expectedDir, file))]);
      if (!actual.equals(expected)) mismatches.push(file);
    }

    if (mismatches.length > 0) {
      process.stderr.write(`dist is out of sync with the Vite build: ${mismatches.join(", ")}\nRun \`npm run build\` and retry.\n`);
      process.exitCode = 1;
    }
  }
} finally {
  await rm(expectedDir, { recursive: true, force: true });
}

async function listFiles(root) {
  const files = [];
  await walk(root);
  return files.sort();

  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) files.push(relative(root, path));
    }
  }
}
