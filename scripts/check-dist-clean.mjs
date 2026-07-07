import { spawnSync } from "node:child_process";

const result = spawnSync("git", ["diff", "--exit-code", "--", "dist"], {
  encoding: "utf8",
  shell: false,
});

if (result.status !== 0) {
  process.stderr.write("dist is out of sync with src. Run `npm run build` and commit the generated dist changes.\n");
  if (result.stdout) process.stderr.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}
