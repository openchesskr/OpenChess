// (v0.6.3, 앱 출시 준비) 큰 엔진(Stockfish 17.1·18)을 앱 번들에 넣지 않고 설정에서 고를 때 내려받는다.
//  · 웹: 아무 일도 안 한다(같은 출처에서 그대로 서빙 — 기존 동작).
//  · 앱 빌드(`npm run build:app`)는 dist/engine/17·18을 지우고(scripts/prune-app-engines.mjs) Lite만 번들한다(Google Play 기본 한도 200MB).
//  · 앱 실행 시 내려받은 기록이 있으면 그 엔진의 워커 주소를 기기 저장소의 파일로 바꾼다. 없으면 "내려받기 필요" 상태가 된다.
// 저장·내려받기는 Capacitor Filesystem 플러그인(window.Capacitor.Plugins.Filesystem)이 맡는다 — 0.9.0 래퍼에서 설치(src/lib/nativeApp.js 참고).
import { isNativeApp, nativePlugin } from "./nativeApp.js";
import { SITE_URL } from "./siteConfig.js";

export const HEAVY_ENGINE_IDS = ["full17", "full18"];
const REMOTE_BASE = (((typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_ENGINE_REMOTE_BASE) || SITE_URL).replace(/\/+$/, "")) + "/";
const STORE_DIR = "engine";
const DONE_KEY = "occ_engine_dl_v1";   // { full18: { total, at } } — 내려받기가 끝나 파일을 검증한 엔진

/* ---- 순수 함수(테스트 대상) ---- */
export function manifestTotalBytes(entry) { return ((entry && entry.files) || []).reduce((n, f) => n + (f.size || 0), 0); }
export function fmtMegabytes(bytes) { return Math.max(1, Math.round((bytes || 0) / 1048576)) + "MB"; }
/* 진행률(0~1): 파일별로 받은 바이트(없으면 0)를 합쳐 전체 크기로 나눈다. */
export function downloadProgress(entry, receivedByFile) {
  const total = manifestTotalBytes(entry); if (!total) return 0;
  const got = (entry.files || []).reduce((n, f) => n + Math.min(f.size || 0, (receivedByFile && receivedByFile[f.name]) || 0), 0);
  return Math.min(1, got / total);
}
/* 같은 출처 주소인지 — 같은 출처면 Worker를 주소 그대로 만들 수 있고(조각 파일을 상대 경로로 찾는 엔진 로더가 동작), 아니면 blob 래퍼를 쓴다. */
export function isSameOriginUrl(url, base) {
  try { const b = base || (typeof window !== "undefined" ? window.location.href : "http://localhost/"); return new URL(url, b).origin === new URL(b).origin; } catch { return false; }
}

/* ---- 상태 ---- */
const state = {};            // id → { status: "none"|"downloading"|"ready"|"error", progress: 0~1, error?: string }
const listeners = new Set();
let profilesRef = null;      // ENGINE_PROFILES (initDownloadedEngines가 받는다 — common.jsx와의 순환 import 방지)
let abortFlags = {};
function emit() { listeners.forEach((fn) => { try { fn(); } catch { } }); }
function setState(id, patch) { state[id] = { ...(state[id] || { status: "none", progress: 0 }), ...patch }; emit(); }
export function subscribeEngineDownloads(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function engineDownloadState(id) { return state[id] || { status: isNativeApp() && HEAVY_ENGINE_IDS.includes(id) ? "none" : "ready", progress: 0 }; }
/* 이 프로필을 지금 바로 쓸 수 있는가 — 웹은 항상 true, 앱은 큰 엔진이 내려받아진 뒤에만 true. */
export function engineUsable(id) { return !(isNativeApp() && HEAVY_ENGINE_IDS.includes(id)) || engineDownloadState(id).status === "ready"; }
export function engineNeedsDownload(id) { return isNativeApp() && HEAVY_ENGINE_IDS.includes(id) && !engineUsable(id); }

function doneMap() { try { return JSON.parse(window.localStorage.getItem(DONE_KEY) || "{}") || {}; } catch { return {}; } }
function saveDone(m) { try { window.localStorage.setItem(DONE_KEY, JSON.stringify(m)); } catch { } }
function fs() { return nativePlugin("Filesystem"); }
async function localUri(path) { const r = await fs().getUri({ path, directory: "DATA" }); return r && r.uri; }
function toWebUrl(uri) { const c = window.Capacitor; return c && typeof c.convertFileSrc === "function" ? c.convertFileSrc(uri) : uri; }
async function fetchManifestEntry(id) {
  const r = await fetch(REMOTE_BASE + "engine/manifest.json", { cache: "no-store" });
  if (!r.ok) throw new Error("manifest " + r.status);
  const m = await r.json(); const e = m && m[id];
  if (!e || !Array.isArray(e.files) || !e.files.length) throw new Error("manifest entry missing");
  return e;
}
/* 프로필의 진입 파일 주소(원래 상대 주소 `…/engine/<dir>/boot-single.js#…`)를 내려받은 폴더의 주소로 바꾼다. */
async function applyLocal(id, entry) {
  const p = profilesRef && profilesRef[id]; if (!p) return;
  const orig = (p.urls && p.urls[0]) || "";
  const tail = orig.slice(orig.indexOf("engine/" + entry.dir + "/") + ("engine/" + entry.dir + "/").length);   // "boot-single.js#…"
  if (!tail || tail === orig) return;
  const base = await localUri(STORE_DIR + "/" + entry.dir);
  p.urls = [toWebUrl(base + "/" + tail)];
  delete p.mtUrl;                                   // 앱 웹뷰는 멀티스레드를 못 쓴다
}

/* 앱 시작 시 한 번: 이미 내려받은 엔진을 연결한다(웹은 즉시 반환). profiles = ENGINE_PROFILES */
export async function initDownloadedEngines(profiles) {
  profilesRef = profiles;
  if (!isNativeApp() || !fs()) return;
  const done = doneMap();
  for (const id of HEAVY_ENGINE_IDS) {
    const rec = done[id];
    if (!rec) { setState(id, { status: "none", progress: 0 }); continue; }
    try {
      const dir = (profiles[id].urls[0].match(/engine\/(\d+)\//) || [])[1];
      await fs().stat({ path: STORE_DIR + "/" + dir + "/.complete", directory: "DATA" });   // 표지 파일이 없으면 지워진 것
      await applyLocal(id, { dir });
      setState(id, { status: "ready", progress: 1 });
    } catch { const m = doneMap(); delete m[id]; saveDone(m); setState(id, { status: "none", progress: 0 }); }
  }
}

/* 큰 엔진 내려받기. 진행률은 subscribeEngineDownloads + engineDownloadState로 읽는다. 끝나면 true. */
export async function downloadEngine(id) {
  if (!isNativeApp() || !fs() || !HEAVY_ENGINE_IDS.includes(id)) return false;
  if (engineDownloadState(id).status === "downloading") return false;
  abortFlags[id] = false;
  setState(id, { status: "downloading", progress: 0, error: undefined });
  const received = {};
  let handle = null;
  try {
    const entry = await fetchManifestEntry(id);
    const dirPath = STORE_DIR + "/" + entry.dir;
    try { await fs().rmdir({ path: dirPath, directory: "DATA", recursive: true }); } catch { }
    try { handle = await fs().addListener("progress", (ev) => { if (!ev || !ev.url) return; const f = entry.files.find((x) => ev.url.endsWith("/" + x.name)); if (f) { received[f.name] = ev.bytes || 0; setState(id, { progress: downloadProgress(entry, received) }); } }); } catch { }
    for (const f of entry.files) {
      if (abortFlags[id]) throw new Error("aborted");
      await fs().downloadFile({ url: REMOTE_BASE + "engine/" + entry.dir + "/" + f.name, path: dirPath + "/" + f.name, directory: "DATA", recursive: true, progress: true });
      const st = await fs().stat({ path: dirPath + "/" + f.name, directory: "DATA" });
      if (!st || Number(st.size) !== f.size) throw new Error("size mismatch: " + f.name);   // 끊긴·깨진 파일을 완료로 치지 않는다
      received[f.name] = f.size; setState(id, { progress: downloadProgress(entry, received) });
    }
    await fs().writeFile({ path: dirPath + "/.complete", directory: "DATA", data: String(Date.now()), encoding: "utf8" });
    await applyLocal(id, entry);
    const m = doneMap(); m[id] = { total: manifestTotalBytes(entry), at: Date.now() }; saveDone(m);
    setState(id, { status: "ready", progress: 1 });
    return true;
  } catch (e) {
    setState(id, { status: "error", progress: 0, error: String((e && e.message) || e) });
    return false;
  } finally { try { handle && handle.remove && handle.remove(); } catch { } }
}
export function cancelEngineDownload(id) { abortFlags[id] = true; }

/* 내려받은 엔진 지우기(저장 공간 확보). 지우면 다시 "내려받기 필요" 상태가 된다. */
export async function deleteDownloadedEngine(id) {
  if (!isNativeApp() || !fs() || !HEAVY_ENGINE_IDS.includes(id)) return false;
  const dir = id === "full17" ? "17" : "18";
  try { await fs().rmdir({ path: STORE_DIR + "/" + dir, directory: "DATA", recursive: true }); } catch { }
  const m = doneMap(); delete m[id]; saveDone(m);
  setState(id, { status: "none", progress: 0 });
  return true;
}
export function engineDownloadSizeLabel(id) { return id === "full17" ? "75MB" : id === "full18" ? "108MB" : ""; }
