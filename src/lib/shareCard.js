import { T, PIECE_IMG_SETS } from "./theme.js";
import { QCOLOR, ANALYSIS_KIND_ROWS, BADGE_ICON_SRC } from "./moveKinds.js";
import { SITE_FONT } from "../components/engineLines.jsx";

// 리뷰 요약 공유 이미지 카드(1080×1080) — 순수 Canvas 2D. OpenChess 로고·기물·수 등급 배지는 같은
// 출처(public/)라 그대로 그린다. chess.com 아바타는 다른 도메인이라 <img crossOrigin="anonymous">로
// 불러온다 — 서버가 CORS를 허용하지 않으면 오염된 이미지가 그려지는 게 아니라 로드 자체가
// 실패(onerror)하므로, 그때는 이니셜 원으로 대체해 canvas는 항상 toBlob 가능한 상태로 남는다.
// (v0.5.2, 사용자 선택 — "체스보드 모티브" 시안 + 밀도 강화) 대각선 체크무늬·보드 좌표 프레임,
// 대국 메타(시간 규정·날짜·수 수), 레이팅, 진영별 수 분포 막대, 전체 수 흐름(한 수 = 한 칸) 띠,
// 등급 표의 백/흑 막대까지 담는다.

const SERIF = "Georgia, 'Noto Serif KR', serif";
const CREAM = "#F4EEE2";
const CREAM_SOFT = "rgba(235,221,196,.62)";
const CREAM_FAINT = "rgba(235,221,196,.34)";

// 실패는 캐시하지 않고(일시적 네트워크 문제 뒤 재시도 가능), 성공만 캐시하되 오래된 것부터
// 정리한다(Map은 삽입 순서를 유지하므로 첫 키가 가장 오래된 항목).
const imageCache = new Map();
const IMAGE_CACHE_MAX = 200;
function loadImageSafe(src, crossOrigin) {
  if (!src) return Promise.resolve(null);
  const key = (crossOrigin || "") + "|" + src;
  if (imageCache.has(key)) return imageCache.get(key);
  const p = new Promise((resolve) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = crossOrigin;
    img.onload = () => resolve(img);
    img.onerror = () => { imageCache.delete(key); resolve(null); };
    img.src = src;
  });
  imageCache.set(key, p);
  if (imageCache.size > IMAGE_CACHE_MAX) imageCache.delete(imageCache.keys().next().value);
  return p;
}

// 폭을 넘으면 "…"으로 줄인다 — 닉네임·오프닝 이름처럼 길이를 예측할 수 없는 텍스트용.
function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(text.slice(0, mid) + "…").width <= maxWidth) lo = mid; else hi = mid - 1;
  }
  return text.slice(0, lo) + "…";
}

function drawAvatar(ctx, img, cx, cy, r, initial, ringColor) {
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
  if (img) {
    const s = Math.max((r * 2) / img.width, (r * 2) / img.height);
    ctx.drawImage(img, cx - (img.width * s) / 2, cy - (img.height * s) / 2, img.width * s, img.height * s);
  } else {
    ctx.fillStyle = "#4A3418"; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = T.brassHi; ctx.font = "800 " + Math.round(r * 0.85) + "px " + SITE_FONT;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(initial, cx, cy + 2);
    ctx.textBaseline = "alphabetic";
  }
  ctx.restore();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = ringColor ? 4 : 2.5; ctx.strokeStyle = ringColor || "rgba(255,255,255,.3)"; ctx.stroke();
}

function drawChecker(ctx, x, y, sq, n, deg, alpha) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate((deg * Math.PI) / 180); ctx.globalAlpha = alpha;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    ctx.fillStyle = (r + c) % 2 === 0 ? T.boardLight : T.boardDark;
    ctx.fillRect(c * sq, r * sq, sq, sq);
  }
  ctx.restore();
}

// 로딩(비동기)과 그리기(동기)를 분리해 둔다 — 호출부가 로딩이 끝난 시점에 "이 요청이 아직
// 최신인지" 확인한 뒤에만 그리게 해, 늦게 끝난 오래된 요청이 최신 카드를 덮어쓰지 못하게 한다.
export async function loadReviewShareCardAssets(data) {
  const moves = data.moves || [];
  const kinds = ANALYSIS_KIND_ROWS.map(([k]) => k).filter((k) => moves.some((m) => m.kind === k));
  const [logoImg, whiteKingImg, blackKingImg, whiteAvatarImg, blackAvatarImg, ...badgeImgs] = await Promise.all([
    loadImageSafe("/OpenChessLogo.png"),
    loadImageSafe(PIECE_IMG_SETS.classic.images.K.w.src),
    loadImageSafe(PIECE_IMG_SETS.classic.images.K.b.src),
    loadImageSafe(data.whiteAvatarUrl, "anonymous"),
    loadImageSafe(data.blackAvatarUrl, "anonymous"),
    ...kinds.map((k) => loadImageSafe(BADGE_ICON_SRC[k])),
  ]);
  const badgeImgByKind = {};
  kinds.forEach((k, i) => { badgeImgByKind[k] = badgeImgs[i]; });
  return { logoImg, whiteKingImg, blackKingImg, whiteAvatarImg, blackAvatarImg, badgeImgByKind };
}

export function drawReviewShareCardSync(ctx, W, H, data, assets) {
  const { whiteName, blackName, whiteRating, blackRating, whiteAcc, blackAcc, myColor, resultText, opening, metaText } = data;
  const moves = data.moves || [];
  const { logoImg, whiteKingImg, blackKingImg, whiteAvatarImg, blackAvatarImg, badgeImgByKind } = assets;
  const cx = W / 2, pad = 64;

  // 배경 — 짙은 에보니 + 중앙 상단의 은은한 브라스 빛 + 대각선 체크무늬 두 무리.
  ctx.fillStyle = "#130A05"; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(cx, H * 0.3, 0, cx, H * 0.3, W * 0.75);
  glow.addColorStop(0, "rgba(92,58,24,.55)"); glow.addColorStop(1, "rgba(19,10,5,0)");
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  drawChecker(ctx, W - 270, -150, 54, 8, -14, 0.15);
  drawChecker(ctx, -110, H - 150, 40, 5, -14, 0.07);

  // 보드 프레임 — 이중 테두리 + 모서리 미니 체크 + 가장자리 좌표(a~h, 8~1).
  const inset = 26;
  ctx.strokeStyle = "rgba(196,154,80,.38)"; ctx.lineWidth = 1.5; ctx.strokeRect(inset, inset, W - inset * 2, H - inset * 2);
  ctx.strokeStyle = "rgba(196,154,80,.12)"; ctx.lineWidth = 1; ctx.strokeRect(inset + 6, inset + 6, W - (inset + 6) * 2, H - (inset + 6) * 2);
  for (const [x, y] of [[inset, inset], [W - inset, inset], [inset, H - inset], [W - inset, H - inset]]) {
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = (i === 0 || i === 3) ? T.boardLight : T.boardDark;
      ctx.fillRect(x - 8 + (i % 2) * 8, y - 8 + Math.floor(i / 2) * 8, 8, 8);
    }
  }
  ctx.font = "700 11px " + SITE_FONT; ctx.fillStyle = "rgba(196,154,80,.45)"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const span = W - inset * 2;
  "abcdefgh".split("").forEach((f, i) => ctx.fillText(f, inset + span * (i + 0.5) / 8, H - inset / 2));
  for (let i = 0; i < 8; i++) ctx.fillText(String(8 - i), inset / 2, inset + span * (i + 0.5) / 8);
  ctx.textBaseline = "alphabetic";

  // 헤더 — 로고(좌) + 대국 메타(우) + 구분선.
  if (logoImg) {
    const lh = 40;
    ctx.drawImage(logoImg, pad, 58, lh * (logoImg.width / logoImg.height), lh);
  } else {
    ctx.fillStyle = T.brassHi; ctx.font = "700 30px " + SERIF; ctx.textAlign = "left";
    ctx.fillText("♞ OpenChess", pad, 90);
  }
  if (metaText) {
    ctx.font = "600 17px " + SITE_FONT; ctx.fillStyle = CREAM_SOFT; ctx.textAlign = "right";
    ctx.fillText(fitText(ctx, metaText, 520), W - pad, 86);
  }
  ctx.strokeStyle = "rgba(196,154,80,.2)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pad, 120); ctx.lineTo(W - pad, 120); ctx.stroke();

  // 결과 — 양옆에 브라스 선과 작은 마름모.
  ctx.textAlign = "center";
  if (resultText) {
    ctx.font = "900 34px " + SITE_FONT;
    const rw = ctx.measureText(resultText).width;
    ctx.fillStyle = resultText === "승리" ? "#8FB55E" : resultText === "패배" ? "#C8453B" : "#E0B53A";
    ctx.fillText(resultText, cx, 178);
    ctx.strokeStyle = "rgba(196,154,80,.5)"; ctx.fillStyle = T.brass;
    for (const dir of [-1, 1]) {
      const x0 = cx + dir * (rw / 2 + 22), x1 = x0 + dir * 150;
      ctx.beginPath(); ctx.moveTo(x0, 166); ctx.lineTo(x1, 166); ctx.stroke();
      ctx.save(); ctx.translate(x1 + dir * 7, 166); ctx.rotate(Math.PI / 4); ctx.fillRect(-4, -4, 8, 8); ctx.restore();
    }
  }

  // 플레이어 카드 두 장 + 가운데 VS 원.
  const boxY = 208, boxH = 250, gap = 64, boxW = (W - pad * 2 - gap) / 2;
  const accHi = whiteAcc != null && blackAcc != null && whiteAcc !== blackAcc ? (whiteAcc > blackAcc ? "w" : "b") : null;
  const drawPlayer = (side, x) => {
    const isWhite = side === "w";
    const name = (isWhite ? whiteName : blackName) || "?";
    const rating = isWhite ? whiteRating : blackRating;
    const acc = isWhite ? whiteAcc : blackAcc;
    const kingImg = isWhite ? whiteKingImg : blackKingImg;
    const isMe = myColor === side;
    const bcx = x + boxW / 2;
    ctx.fillStyle = "rgba(255,255,255,.045)";
    ctx.strokeStyle = isMe ? T.brassHi : "rgba(255,255,255,.14)"; ctx.lineWidth = isMe ? 2.5 : 1.5;
    ctx.beginPath(); ctx.roundRect(x, boxY, boxW, boxH, 12); ctx.fill(); ctx.stroke();
    // 진영 색 3칸 리본(백: 밝-어-밝, 흑: 어-밝-어).
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = ((i % 2 === 0) === isWhite) ? T.boardLight : T.boardDark;
      ctx.fillRect(x + 18 + i * 13, boxY - 6, 13, 12);
    }
    if (accHi === side) {
      ctx.font = "800 12px " + SITE_FONT;
      const tw = ctx.measureText("정확도 우위").width + 18;
      ctx.fillStyle = "rgba(143,181,94,.2)"; ctx.strokeStyle = "rgba(143,181,94,.7)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(x + boxW - tw - 14, boxY + 14, tw, 22, 11); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#A9CC7C"; ctx.textAlign = "center"; ctx.fillText("정확도 우위", x + boxW - 14 - tw / 2, boxY + 29);
    }
    drawAvatar(ctx, isWhite ? whiteAvatarImg : blackAvatarImg, bcx, boxY + 52, 36, name[0].toUpperCase(), isMe ? T.brassHi : null);
    if (isMe) {
      ctx.fillStyle = T.brassHi; ctx.beginPath(); ctx.arc(bcx + 28, boxY + 80, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#241509"; ctx.font = "800 12px " + SITE_FONT; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("나", bcx + 28, boxY + 81); ctx.textBaseline = "alphabetic";
    }
    ctx.font = "700 22px " + SITE_FONT;
    const kingW = kingImg ? 19 * (kingImg.width / kingImg.height) : 0;
    const kGap = 11;
    const fitName = fitText(ctx, name, Math.max(40, boxW - 36 - (kingImg ? kingW + kGap : 0)));
    let gx = bcx - (ctx.measureText(fitName).width + (kingImg ? kingW + kGap : 0)) / 2;
    if (kingImg) {
      // 흑 킹은 어두운 카드 위에서 묻히므로 뒤에 옅은 원판을 깔아 윤곽을 살린다.
      if (!isWhite) { ctx.fillStyle = "rgba(235,221,196,.28)"; ctx.beginPath(); ctx.arc(gx + kingW / 2, boxY + 113.5, 13, 0, Math.PI * 2); ctx.fill(); }
      ctx.drawImage(kingImg, gx, boxY + 104, kingW, 19); gx += kingW + kGap;
    }
    ctx.fillStyle = CREAM; ctx.textAlign = "left"; ctx.fillText(fitName, gx, boxY + 121);
    ctx.textAlign = "center";
    if (rating != null) { ctx.font = "600 14px " + SITE_FONT; ctx.fillStyle = CREAM_SOFT; ctx.fillText("레이팅 " + rating, bcx, boxY + 144); }
    ctx.fillStyle = T.brassHi; ctx.font = "800 44px " + SITE_FONT;
    ctx.fillText(acc != null ? acc.toFixed(1) + "%" : "—", bcx, boxY + 192);
    // 그 진영의 수 등급 분포 막대(표와 같은 순서·색).
    const barW = boxW - 72, barX = bcx - barW / 2, barY = boxY + 206, barH = 8;
    const mine = moves.filter((m) => m.white === isWhite && m.kind && QCOLOR[m.kind]);
    ctx.save();
    ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, 4); ctx.clip();
    ctx.fillStyle = "rgba(255,255,255,.08)"; ctx.fillRect(barX, barY, barW, barH);
    let bx = barX;
    for (const [kind] of ANALYSIS_KIND_ROWS) {
      const n = mine.filter((m) => m.kind === kind).length;
      if (!n) continue;
      const w = (n / mine.length) * barW;
      ctx.fillStyle = QCOLOR[kind]; ctx.fillRect(bx, barY, w + 0.5, barH);
      bx += w;
    }
    ctx.restore();
    ctx.font = "600 12px " + SITE_FONT; ctx.fillStyle = CREAM_FAINT;
    ctx.fillText("정확도 · 수 분포", bcx, boxY + 236);
  };
  drawPlayer("w", pad);
  drawPlayer("b", pad + boxW + gap);
  ctx.fillStyle = "#1E120A"; ctx.strokeStyle = "rgba(196,154,80,.55)"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, boxY + boxH / 2, 24, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = T.brass; ctx.font = "800 15px " + SITE_FONT; ctx.textBaseline = "middle";
  ctx.fillText("VS", cx, boxY + boxH / 2 + 1); ctx.textBaseline = "alphabetic";

  // 오프닝 이름.
  let y = boxY + boxH + 42;
  if (opening) {
    ctx.font = "italic 700 21px " + SERIF; ctx.fillStyle = T.brass;
    ctx.fillText(fitText(ctx, "✦ " + opening + " ✦", W - pad * 2), cx, y);
    y += 30;
  } else y += 4;

  // 수 흐름 — 한 수 = 한 칸(그 수의 등급 색), 윗줄 백·아랫줄 흑. 대국 전체의 흐름을 한눈에.
  const perSide = Math.max(1, ...moves.map((m) => Math.floor(m.ply / 2) + 1));
  const stripX = pad + 34, stripW = W - pad - stripX;
  const cell = Math.min(22, stripW / perSide);
  const sq = Math.max(3, cell - Math.max(1, cell * 0.16));
  const rowGap = 5;
  ctx.font = "700 12px " + SITE_FONT; ctx.fillStyle = CREAM_SOFT; ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText("백", pad, y + sq / 2);
  ctx.fillText("흑", pad, y + sq + rowGap + sq / 2);
  ctx.textBaseline = "alphabetic";
  for (let i = 0; i < perSide; i++) {
    for (const row of [0, 1]) {
      ctx.fillStyle = "rgba(255,255,255,.06)";
      ctx.fillRect(stripX + i * cell, y + row * (sq + rowGap), sq, sq);
    }
  }
  for (const m of moves) {
    const color = QCOLOR[m.kind];
    if (!color) continue;
    ctx.fillStyle = color;
    ctx.fillRect(stripX + Math.floor(m.ply / 2) * cell, y + (m.white ? 0 : sq + rowGap), sq, sq);
  }
  y += sq * 2 + rowGap + 30;

  // 수 등급 표 — '분석' 탭 ReviewKindTable과 같은 기준. 숫자 옆에 백/흑 개수 비례 막대를 붙여 밀도를 높인다.
  const countBy = (white, kind) => moves.filter((m) => m.white === white && m.kind === kind).length;
  const rows = ANALYSIS_KIND_ROWS.map(([kind, label]) => ({ kind, label, w: countBy(true, kind), b: countBy(false, kind) })).filter((r) => r.w || r.b);
  if (rows.length) {
    const tx = pad, tw = W - pad * 2, headH = 22, bottom = H - 86;
    const rowH = Math.max(24, Math.min(38, Math.floor((bottom - y - headH) / rows.length)));
    // 머리글과 행을 한 덩어리로 세로 가운데 정렬한다(행이 적을 때 머리글만 위에 떠 있지 않게).
    const top = y + Math.max(0, (bottom - y - headH - rowH * rows.length) / 2);
    ctx.font = "700 12px " + SITE_FONT; ctx.fillStyle = CREAM_FAINT; ctx.textAlign = "center";
    ctx.fillText("백", tx + 34, top + 10); ctx.fillText("수 등급", cx, top + 10); ctx.fillText("흑", tx + tw - 34, top + 10);
    let ry = top + headH;
    const maxN = Math.max(1, ...rows.map((r) => Math.max(r.w, r.b)));
    const barMax = 190, barH = 6;
    rows.forEach((r, i) => {
      const midY = ry + rowH / 2;
      if (i % 2 === 0) { ctx.fillStyle = "rgba(232,210,166,.04)"; ctx.fillRect(tx, ry, tw, rowH); }
      ctx.fillStyle = QCOLOR[r.kind] || T.brassHi; ctx.textBaseline = "middle"; ctx.textAlign = "center";
      ctx.font = "800 " + Math.min(19, rowH * 0.52) + "px " + SITE_FONT;
      ctx.fillText(String(r.w), tx + 34, midY);
      ctx.fillText(String(r.b), tx + tw - 34, midY);
      ctx.globalAlpha = 0.6;
      if (r.w) { ctx.beginPath(); ctx.roundRect(tx + 66, midY - barH / 2, Math.max(barH, (r.w / maxN) * barMax), barH, 3); ctx.fill(); }
      if (r.b) { const bw = Math.max(barH, (r.b / maxN) * barMax); ctx.beginPath(); ctx.roundRect(tx + tw - 66 - bw, midY - barH / 2, bw, barH, 3); ctx.fill(); }
      ctx.globalAlpha = 1;
      const badge = badgeImgByKind[r.kind];
      const bs = Math.min(21, rowH * 0.6);
      ctx.font = "700 " + Math.min(16, rowH * 0.44) + "px " + SITE_FONT;
      let lx = cx - (ctx.measureText(r.label).width + (badge ? bs + 7 : 0)) / 2;
      if (badge) { ctx.drawImage(badge, lx, midY - bs / 2, bs, bs); lx += bs + 7; }
      ctx.fillStyle = "rgba(235,221,196,.88)"; ctx.textAlign = "left"; ctx.fillText(r.label, lx, midY);
      ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      ry += rowH;
    });
  }

  // 푸터 — 워터마크 양옆 짧은 브라스 선.
  ctx.font = "600 14px " + SITE_FONT; ctx.fillStyle = CREAM_FAINT; ctx.textAlign = "center";
  const fy = H - 50, fw = ctx.measureText("openchess.kr").width;
  ctx.fillText("openchess.kr", cx, fy);
  ctx.strokeStyle = "rgba(196,154,80,.3)"; ctx.lineWidth = 1;
  for (const dir of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + dir * (fw / 2 + 14), fy - 5); ctx.lineTo(cx + dir * (fw / 2 + 64), fy - 5); ctx.stroke(); }
}
