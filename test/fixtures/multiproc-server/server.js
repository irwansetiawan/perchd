// A dev server that spawns a long-lived child process — mimics how real dev
// servers fan out (e.g. vite → esbuild, next → turbopack). Used to prove perchd
// tears down the WHOLE process group, not just the listener.
const { spawn } = require("node:child_process");
const { writeFileSync } = require("node:fs");

const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1e9)"], { stdio: "ignore" });
if (process.env.CHILD_PIDFILE) writeFileSync(process.env.CHILD_PIDFILE, String(child.pid));

const port = process.env.PORT || 3000;
require("node:http").createServer((_, res) => res.end("ok")).listen(port);
