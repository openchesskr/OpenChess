// (v0.6.4) 대국 하이라이트 이미지 카드(1080×1080) — 가장 극적인 수 최대 3개를 미니 보드(수 두기 전 포지션 + 둔 수 화살표)로 보여 준다.
// 순수 Canvas 2D. 기물·로고는 같은 출처(public/)라 오염 없이 toBlob 가능하다. 데이터는 lib/highlights.js의 pickHighlights 결과.
import { T, PIECE_IMG_SETS } from "./theme.js";
import { QCOLOR, BADGE_ICON_SRC } from "./moveKinds.js";
import { SITE_FONT } from "../components/engineLines.jsx";
import { loadImageSafe } from "./shareCard.js";
import { t } from "./i18n.js";

const SERIF = "Georgia, 'Noto Serif KR', serif";
const CREAM = "#F4EEE2", CREAM_SOFT = "rgba(235,221,196,.62)";

export function fenGrid(fen) {
  const rows = String(fen || "").split(" ")[0].split("/"); if (rows.length !== 8) return null;
  return rows.map((r) => { const out = []; for (const ch of r) { if (/\d/.test(ch)) for (let i = 0; i < +ch; i++) out.push(null); else out.push({ t: ch.toUpperCase(), c: ch === ch.toUpperCase() ? "w" : "b" }); } return out; });
}
const sqXY = (sq, flip) => { const f = "abcdefgh".indexOf(sq[0]), r = 8 - parseInt(sq[1], 10); return flip ? [7 - f, 7 - r] : [f, r]; };

export async function loadHighlightCardAssets(data) {
  const names = ["K", "Q", "R", "B", "N", "P"], jobs = [];
  for (const c of ["w", "b"]) for (const n of names) jobs.push(loadImageSafe(PIECE_IMG_SETS.classic.images[n][c].src));
  const kinds = [...new Set((data.moments || []).map((m) => m.kind))];
  const [logo, ...rest] = await Promise.all([loadImageSafe("/OpenChessLogo.png"), ...jobs, ...kinds.map((k) => loadImageSafe(BADGE_ICON_SRC[k]))]);
  const pieces = {}; let i = 0;
  for (const c of ["w", "b"]) for (const n of names) pieces[n + c] = rest[i++];
  const badges = {}; kinds.forEach((k, j) => { badges[k] = rest[12 + j]; });
  return { logo, pieces, badges };
}

function fit(ctx, text, maxW) { if (ctx.measureText(text).width <= maxW) return text; let s = text; while (s.length > 1 && ctx.measureText(s + "…").width > maxW) s = s.slice(0, -1); return s + "…"; }

/* data: { whiteName, blackName, metaText, resultText, myColor, moments: pickHighlights 결과 } */
export function drawHighlightCard(ctx, W, H, data, assets) {
  const cx = W / 2, pad = 64, moments = data.moments || [], flip = data.myColor === "b";
  ctx.fillStyle = "#130A05"; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(cx, H * 0.28, 0, cx, H * 0.28, W * 0.8);
  glow.addColorStop(0, "rgba(92,58,24,.55)"); glow.addColorStop(1, "rgba(19,10,5,0)"); ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(196,154,80,.38)"; ctx.lineWidth = 1.5; ctx.strokeRect(26, 26, W - 52, H - 52);
  ctx.strokeStyle = "rgba(196,154,80,.12)"; ctx.lineWidth = 1; ctx.strokeRect(32, 32, W - 64, H - 64);
  // 헤더
  if (assets.logo) { const lh = 40; ctx.drawImage(assets.logo, pad, 58, lh * (assets.logo.width / assets.logo.height), lh); }
  else { ctx.fillStyle = T.brassHi; ctx.font = "700 30px " + SERIF; ctx.textAlign = "left"; ctx.fillText("♞ OpenChess", pad, 90); }
  if (data.metaText) { ctx.font = "600 17px " + SITE_FONT; ctx.fillStyle = CREAM_SOFT; ctx.textAlign = "right"; ctx.fillText(data.metaText, W - pad, 86); }
  ctx.strokeStyle = "rgba(196,154,80,.3)"; ctx.beginPath(); ctx.moveTo(pad, 116); ctx.lineTo(W - pad, 116); ctx.stroke();
  // 제목·대국
  ctx.textAlign = "center"; ctx.fillStyle = T.brassHi; ctx.font = "800 54px " + SERIF; ctx.fillText(t("하이라이트"), cx, 202);
  ctx.fillStyle = CREAM; ctx.font = "700 27px " + SITE_FONT;
  ctx.fillText(fit(ctx, (data.whiteName || "") + "  vs  " + (data.blackName || ""), W - pad * 2), cx, 254);
  if (data.resultText) { ctx.fillStyle = CREAM_SOFT; ctx.font = "600 20px " + SITE_FONT; ctx.fillText(data.resultText, cx, 288); }
  // 장면 패널
  const n = Math.max(1, moments.length), gap = 28, pw = Math.min(296, (W - pad * 2 - gap * (n - 1)) / n), total = pw * n + gap * (n - 1), x0 = (W - total) / 2, top = 330;
  moments.forEach((m, i) => {
    const x = x0 + i * (pw + gap), sq = pw / 8, grid = fenGrid(m.fen), col = QCOLOR[m.kind] || T.brass;
    // 번호·라벨
    ctx.textAlign = "left"; ctx.fillStyle = col; ctx.font = "800 22px " + SITE_FONT; ctx.fillText(fit(ctx, (i + 1) + ". " + m.label, pw), x, top - 12);
    // 보드
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) { ctx.fillStyle = (r + f) % 2 === 0 ? T.boardLight : T.boardDark; ctx.fillRect(x + f * sq, top + r * sq, sq, sq); }
    ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.strokeRect(x - 1.5, top - 1.5, pw + 3, pw + 3);
    if (grid) for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      const p = grid[r][f]; if (!p) continue; const img = assets.pieces[p.t + p.c]; if (!img) continue;
      const [dx, dy] = flip ? [7 - f, 7 - r] : [f, r]; ctx.drawImage(img, x + dx * sq + 1, top + dy * sq + 1, sq - 2, sq - 2);
    }
    // 둔 수 화살표
    if (m.from && m.to) {
      const [fx, fy] = sqXY(m.from, flip), [tx, ty] = sqXY(m.to, flip), ax = x + (fx + .5) * sq, ay = top + (fy + .5) * sq, bx = x + (tx + .5) * sq, by = top + (ty + .5) * sq;
      const ang = Math.atan2(by - ay, bx - ax), hl = sq * .42, ex = bx - Math.cos(ang) * hl * .6, ey = by - Math.sin(ang) * hl * .6;
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.globalAlpha = .88; ctx.lineWidth = sq * .17; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - Math.cos(ang - .5) * hl, by - Math.sin(ang - .5) * hl); ctx.lineTo(bx - Math.cos(ang + .5) * hl, by - Math.sin(ang + .5) * hl); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }
    // 수·설명
    const by = top + pw + 44, num = m.moveNo + (m.white ? "." : "...");
    ctx.fillStyle = CREAM; ctx.font = "800 30px " + SERIF; ctx.fillText(fit(ctx, num + " " + m.san, pw - 40), x, by);
    const badge = assets.badges[m.kind]; if (badge) ctx.drawImage(badge, x + pw - 34, by - 28, 34, 34);
    ctx.fillStyle = CREAM_SOFT; ctx.font = "600 19px " + SITE_FONT;
    if (m.best && ["blunder", "mistake", "miss"].includes(m.kind)) ctx.fillText(fit(ctx, t("최선: {0}", m.best), pw), x, by + 32);
    const sw = Math.round(m.swing); if (sw >= 1) { ctx.fillStyle = col; ctx.fillText(fit(ctx, t("승률 {0}%p 변동", sw), pw), x, by + (m.best && ["blunder", "mistake", "miss"].includes(m.kind) ? 62 : 32)); }
  });
  // 승률 흐름 띠 — 백 승률(위=백 우세)을 한 줄로 그리고 고른 장면을 번호 점으로 표시한다.
  const ew = data.evalWin;
  if (ew && ew.length > 2) {
    const bx = pad, bw = W - pad * 2, by0 = 800, bh = 150, mid = by0 + bh / 2, xAt = (i) => bx + bw * i / (ew.length - 1), yAt = (v) => by0 + bh * (1 - Math.max(0, Math.min(100, v)) / 100);
    ctx.fillStyle = "rgba(255,255,255,.04)"; ctx.fillRect(bx, by0, bw, bh);
    ctx.strokeStyle = "rgba(196,154,80,.28)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(bx, mid); ctx.lineTo(bx + bw, mid); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(xAt(0), mid); ew.forEach((v, i) => ctx.lineTo(xAt(i), yAt(v))); ctx.lineTo(xAt(ew.length - 1), mid); ctx.closePath(); ctx.fillStyle = "rgba(236,203,134,.22)"; ctx.fill();
    ctx.beginPath(); ew.forEach((v, i) => (i ? ctx.lineTo(xAt(i), yAt(v)) : ctx.moveTo(xAt(i), yAt(v)))); ctx.strokeStyle = T.brassHi; ctx.lineWidth = 3; ctx.lineJoin = "round"; ctx.stroke();
    ctx.font = "700 13px " + SITE_FONT; ctx.fillStyle = CREAM_SOFT; ctx.textAlign = "left"; ctx.fillText(t("승률 흐름"), bx + 8, by0 + 18);
    moments.forEach((m, i) => {
      const px = xAt(m.ply + 1), py = yAt(ew[m.ply + 1] ?? 50), col = QCOLOR[m.kind] || T.brass;
      ctx.beginPath(); ctx.arc(px, py, 13, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = "#130A05"; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = "#130A05"; ctx.font = "800 15px " + SITE_FONT; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(i + 1), px, py + 1); ctx.textBaseline = "alphabetic";
    });
  }
  // 푸터
  ctx.textAlign = "center"; ctx.fillStyle = "rgba(196,154,80,.7)"; ctx.font = "700 20px " + SITE_FONT; ctx.fillText("openchess.kr", cx, H - 64);
}
