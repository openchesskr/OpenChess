// CSP 실측 도구(수동 실행) — 빌드한 사이트(dist)를 vercel.json과 같은 CSP로 서빙하고 실제 Chromium으로 여러 경로를 열어 위반(violation)과 엔진(WASM 워커) 부팅을 확인한다.
//  사용: 1) npm run build  2) 엔진 파일을 dist/engine/lite/에 복사(node_modules/stockfish18/bin/stockfish-18-lite-single.{js,wasm})
//        3) PW_MODULE=<playwright 모듈 폴더> SITE=dist node scripts/attack/csp/probe.mjs   (vercel.json의 CSP를 자동으로 읽는다)
//  v0.7.0에서 이 도구로 '현재 문구 그대로 강제하면 엔진이 전부 깨진다'는 것을 확인하고 'wasm-unsafe-eval'을 넣은 정책으로 12개 경로·엔진 부팅을 검증했다.
import http from "node:http"; import { readFileSync, existsSync, statSync } from "node:fs"; import { join, extname } from "node:path";
const root = process.argv[2], csp = process.env.CSP || "", port = Number(process.env.PORT || 4173);
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".png": "image/png", ".webp": "image/webp", ".wasm": "application/wasm", ".json": "application/json", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]); let f = join(root, p);
  if (!existsSync(f) || statSync(f).isDirectory()) f = join(root, "index.html");
  const h = { "Content-Type": types[extname(f)] || "application/octet-stream", "X-Content-Type-Options": "nosniff", "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "credentialless" };
  if (csp) h[process.env.CSP_HEADER || "Content-Security-Policy"] = csp;
  res.writeHead(200, h); res.end(readFileSync(f));
}).listen(port, () => console.log("up " + port));
