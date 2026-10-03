#!/usr/bin/env node
/** (v0.6.3, 앱 출시 준비) 앱 번들(dist)에서 큰 엔진(17.1·18)을 뺀다 — Google Play 기본 업로드 한도 200MB 때문에 앱에는 Lite만 넣고
 *  나머지는 설정에서 고를 때 내려받는다(src/lib/engineDownload.js). 내려받기 목록(engine/manifest.json)은 남겨 둔다
 *  (앱은 웹 배포본의 같은 파일을 받는다). 실행: npm run build:app (= vite build 뒤 이 스크립트). */
import { rmSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const dist = process.argv[2] || "dist";
for (const d of ["17", "18"]) { const p = join(dist, "engine", d); if (existsSync(p)) { rmSync(p, { recursive: true, force: true }); console.log("removed", p); } }
const size = (dir) => readdirSync(dir).reduce((n, f) => { const p = join(dir, f); return n + (statSync(p).isDirectory() ? size(p) : statSync(p).size); }, 0);
if (existsSync(dist)) console.log("dist size:", Math.round(size(dist) / 1048576) + "MB (Google Play 기본 한도 200MB)");
