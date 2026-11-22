"use strict";

const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { randomUUID } = require("node:crypto");
const { spawn } = require("node:child_process");

const PORT = Number(process.env.PORT) || 3847;
const HOST = process.env.HOST || "127.0.0.1";
const PUBLIC_DIR = path.join(__dirname, "public");
const MAX_CODE_BYTES = 64 * 1024;
const MAX_STDIN_BYTES = 16 * 1024;
const MAX_OUTPUT_BYTES = 256 * 1024;
const COMPILE_TIMEOUT_MS = 8000;
const RUN_TIMEOUT_MS = 4000;
const ALLOWED_STANDARDS = new Set(["c++17", "c++20", "c++23"]);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
};

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error("Payload too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function runProcess(command, args, options = {}) {
  const {
    cwd,
    timeoutMs,
    stdin = "",
    env = process.env,
  } = options;

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    });

    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let timedOut = false;
    let killed = false;

    const timer = setTimeout(() => {
      timedOut = true;
      killed = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      if (stdout.length < MAX_OUTPUT_BYTES) {
        stdout = Buffer.concat([stdout, chunk]).subarray(0, MAX_OUTPUT_BYTES);
      }
    });
    child.stderr.on("data", (chunk) => {
      if (stderr.length < MAX_OUTPUT_BYTES) {
        stderr = Buffer.concat([stderr, chunk]).subarray(0, MAX_OUTPUT_BYTES);
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        code: null,
        signal: null,
        timedOut,
        stdout: stdout.toString("utf8"),
        stderr: err.message,
        error: err.message,
      });
    });

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({
        code,
        signal,
        timedOut,
        killed,
        stdout: stdout.toString("utf8"),
        stderr: stderr.toString("utf8"),
      });
    });

    if (stdin) {
      child.stdin.write(stdin);
    }
    child.stdin.end();
  });
}

async function compileAndRun(code, stdin, standard) {
  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), "forge-cxx-"));
  const sourcePath = path.join(workDir, "main.cpp");
  const binaryPath = path.join(workDir, "program");

  try {
    await fsp.writeFile(sourcePath, code, "utf8");

    const compile = await runProcess(
      "g++",
      [
        `-std=${standard}`,
        "-O0",
        "-Wall",
        "-Wextra",
        "-fno-diagnostics-color",
        "-o",
        binaryPath,
        sourcePath,
      ],
      { cwd: workDir, timeoutMs: COMPILE_TIMEOUT_MS }
    );

    if (compile.timedOut) {
      return {
        ok: false,
        stage: "compile",
        message: "Compilation timed out.",
        stderr: compile.stderr,
        stdout: compile.stdout,
      };
    }

    if (compile.code !== 0) {
      return {
        ok: false,
        stage: "compile",
        message: "Compilation failed.",
        exitCode: compile.code,
        stderr: compile.stderr,
        stdout: compile.stdout,
      };
    }

    const run = await runProcess(binaryPath, [], {
      cwd: workDir,
      timeoutMs: RUN_TIMEOUT_MS,
      stdin,
      env: {
        PATH: "/usr/bin:/bin",
        HOME: workDir,
        LANG: "C.UTF-8",
      },
    });

    if (run.timedOut) {
      return {
        ok: false,
        stage: "run",
        message: "Program timed out (limit 4s).",
        stderr: run.stderr,
        stdout: run.stdout,
      };
    }

    return {
      ok: run.code === 0,
      stage: "run",
      message: run.code === 0 ? "Finished." : `Exited with code ${run.code}.`,
      exitCode: run.code,
      signal: run.signal,
      stdout: run.stdout,
      stderr: run.stderr,
    };
  } finally {
    await fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function handleRun(req, res) {
  let raw;
  try {
    raw = await readBody(req, MAX_CODE_BYTES + MAX_STDIN_BYTES + 4096);
  } catch (err) {
    return sendJson(res, err.status || 400, { ok: false, message: err.message });
  }

  let payload;
  try {
    payload = JSON.parse(raw.toString("utf8"));
  } catch {
    return sendJson(res, 400, { ok: false, message: "Invalid JSON body." });
  }

  const code = typeof payload.code === "string" ? payload.code : "";
  const stdin = typeof payload.stdin === "string" ? payload.stdin : "";
  const standard =
    typeof payload.standard === "string" && ALLOWED_STANDARDS.has(payload.standard)
      ? payload.standard
      : "c++17";

  if (!code.trim()) {
    return sendJson(res, 400, { ok: false, message: "Empty program." });
  }
  if (Buffer.byteLength(code, "utf8") > MAX_CODE_BYTES) {
    return sendJson(res, 413, { ok: false, message: "Source too large (max 64 KB)." });
  }
  if (Buffer.byteLength(stdin, "utf8") > MAX_STDIN_BYTES) {
    return sendJson(res, 413, { ok: false, message: "stdin too large (max 16 KB)." });
  }

  try {
    const result = await compileAndRun(code, stdin, standard);
    return sendJson(res, 200, {
      ...result,
      requestId: randomUUID(),
      standard,
    });
  } catch (err) {
    return sendJson(res, 500, {
      ok: false,
      message: "Internal compiler error.",
      stderr: String(err && err.message ? err.message : err),
    });
  }
}

function safePublicPath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const relative = decoded === "/" ? "/index.html" : decoded;
  const resolved = path.normalize(path.join(PUBLIC_DIR, relative));
  if (!resolved.startsWith(PUBLIC_DIR)) return null;
  return resolved;
}

async function serveStatic(req, res) {
  const filePath = safePublicPath(req.url || "/");
  if (!filePath) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const data = await fsp.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=3600",
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  const method = req.method || "GET";
  const url = req.url || "/";

  if (method === "POST" && url.split("?")[0] === "/api/run") {
    return handleRun(req, res);
  }

  if (method === "GET" && url.split("?")[0] === "/api/health") {
    return sendJson(res, 200, { ok: true, compiler: "g++", standards: [...ALLOWED_STANDARDS] });
  }

  if (method === "GET" || method === "HEAD") {
    return serveStatic(req, res);
  }

  res.writeHead(405, { Allow: "GET, HEAD, POST" }).end("Method Not Allowed");
});

server.listen(PORT, HOST, () => {
  console.log(`FORGE listening on http://${HOST}:${PORT}`);
});
