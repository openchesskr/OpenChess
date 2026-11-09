// (v0.7.4, 사용자 요청) 승률이 왜 떨어졌는지 구체적인 원인을 찾는 설명기 — 리뷰 코치(MEC, common.jsx의 mecFacts)와는 별개다. 코치는 "이 수가 무엇을 했는가"를 설명하지만,
// 이 모듈은 "이 수 때문에 무엇을 잃었는가"를 포지션에서 직접 계산해 구체적인 이유로 보여 준다(엔진 없이 chess.js로, 즉시 계산; 전술 탐색만 약 수백 ms).
//
// 원인 후보(우선순위 순): 한 수 만에 체크메이트 허용 → 움직인 기물이 잡힘 → 이미 걸려 있던 위협을 막지 못함 → 지키던 기물을 두고 떠남 → 그 밖의 기물이 잡히게 됨 → 상대 전술(포크·스큐어 등) 허용
//   → 최선 수의 체크메이트·기물 이득·전술을 놓침 → 킹 주변이 약해짐 → 캐슬링 권리 상실 → 폰 구조 약화(겹폰·고립폰) → 템포 낭비 → (아무것도 못 찾으면) 포지션 판단.
// 기물 손익은 한 번의 교환(잡고 되잡기)만 보는 단순 계산이다 — 긴 교환 수순은 보지 않는다. 문장은 리뷰 코치와 같은 합니다체·무기호로 쓴다.
import { Chess } from "chess.js";
import { t } from "./i18n.js";
import { replyTactics, bestMoveTactic } from "./mecTactics.js";
import { pieceLabel } from "./growthAnalysis.js";

const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const strip = (s) => String(s || "").replace(/[+#!?]+$/g, "");
const opp = (c) => (c === "w" ? "b" : "w");
const tacName = (k) => ({ fork: t("포크"), skewer: t("스큐어"), discoveredAttack: t("디스커버드 어택"), discoveredCheck: t("디스커버드 체크"), doubleCheck: t("더블 체크"), promotion: t("승격") }[k] || k);
export const MAX_REASONS = 2;

function replay(sans) {
  const g = new Chess();
  for (const s of sans) { try { g.move(strip(s)); } catch { return null; } }
  return g;
}
/* 이 캡처 수로 얻는 기물 가치(상대가 그 칸에서 되잡을 수 있으면 잡은 기물을 잃는 것으로 친다). g의 차례가 캡처하는 쪽이어야 한다. */
function netOfCapture(g, mv) {
  const gain = VAL[mv.captured] || 0, mine = VAL[mv.piece] || 0;
  g.move(mv.san);
  let recapture = false;
  for (const r of g.moves({ verbose: true })) if (r.to === mv.to && r.captured) { recapture = true; break; }
  g.undo();
  return gain - (recapture ? mine : 0);
}
function flipTurn(fen) {
  const p = fen.split(" "); p[1] = p[1] === "w" ? "b" : "w"; p[3] = "-";
  try { return new Chess(p.join(" ")); } catch { return null; }
}
function kingSquare(g, color) {
  const b = g.board();
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) { const p = b[r][f]; if (p && p.type === "k" && p.color === color) return "abcdefgh"[f] + (8 - r); }
  return null;
}
function kingZoneAttacks(g, color) {
  const ks = kingSquare(g, color); if (!ks) return 0;
  const f0 = ks.charCodeAt(0) - 97, r0 = +ks[1]; let n = 0;
  for (let df = -1; df <= 1; df++) for (let dr = -1; dr <= 1; dr++) {
    const f = f0 + df, r = r0 + dr; if ((df === 0 && dr === 0) || f < 0 || f > 7 || r < 1 || r > 8) continue;
    n += g.attackers("abcdefgh"[f] + r, opp(color)).length;
  }
  return n;
}
function pawnShape(g, color) {
  const files = new Array(8).fill(0);
  for (const row of g.board()) row.forEach((p, f) => { if (p && p.type === "p" && p.color === color) files[f]++; });
  let doubled = 0, isolated = 0;
  files.forEach((n, f) => { if (n > 1) doubled += n - 1; if (n > 0 && !(f > 0 && files[f - 1]) && !(f < 7 && files[f + 1])) isolated += n; });
  return { doubled, isolated };
}

/* m: { sansBefore: 이 수를 두기 전까지의 SAN 목록(표준 시작 위치), san: 둔 수, best: 엔진 최선수(SAN)|null, winBefore, winAfter: 둔 사람 관점 승률(%), phase }
   반환: { reasons: [{ id, text }] 최대 MAX_REASONS개(우선순위 순), motive: 최선 수가 무엇을 하는지 한 문장|null } — 수를 해석할 수 없으면 null. */
export function explainMistake(m) {
  const sansBefore = (m.sansBefore || []).map(strip);
  const before = replay(sansBefore), after = replay([...sansBefore, strip(m.san)]);
  if (!before || !after) return null;
  const color = before.turn(), hist = before.history({ verbose: true });
  let mv; try { const tmp = replay(sansBefore); mv = tmp.move(strip(m.san)); } catch { return null; }
  if (!mv) return null;
  const myGain = mv.captured ? VAL[mv.captured] : 0;
  const out = [];   // { w: 우선순위, id, text }
  const add = (w, id, text) => out.push({ w, id, text });

  // 1) 한 수 만에 체크메이트를 허용했는가
  let mateSan = null;
  for (const r of after.moves({ verbose: true })) { after.move(r.san); const mate = after.isCheckmate(); after.undo(); if (mate) { mateSan = r.san; break; } }
  if (mateSan) add(100, "allowMate", t("이 수를 두면 상대가 {0}로 한 수 만에 체크메이트할 수 있습니다.", mateSan));

  // 2) 이 수 뒤에 상대가 얻는 기물 — 움직인 기물이 잡힘 / 이미 걸려 있던 위협 / 지키던 기물을 떠남 / 그 밖
  if (!mateSan) {
    const caps = after.moves({ verbose: true }).filter((c) => c.captured).map((c) => {
      const net = netOfCapture(after, c);
      return { c, lost: net - myGain };   // 이번 수로 내가 얻은 기물 가치를 뺀 순손실(잡으면서 두는 수가 더 이득이면 손실로 말하지 않는다)
    }).filter((x) => x.lost >= 1).sort((a, b) => b.lost - a.lost);
    const top = caps[0];
    if (top) {
      const c = top.c;
      if (c.to === mv.to) add(90, "movedIntoCapture", t("{0:을/를} {1}로 옮겼지만 상대 {2:이/가} 바로 잡을 수 있고 지켜 주는 기물이 부족해 기물 가치 {3}점을 잃습니다.", pieceLabel(mv.piece), mv.to, pieceLabel(c.piece), top.lost));
      else {
        const fl = flipTurn(before.fen());
        const existed = !!fl && fl.moves({ verbose: true }).some((x) => x.from === c.from && x.to === c.to && x.captured && netOfCapture(fl, x) >= 1);
        if (existed) add(88, "ignoredThreat", t("상대 {0:이/가} 이미 {1}의 {2:을/를} 노리고 있었는데 이 수는 그 위협을 막지 못해 기물 가치 {3}점을 잃습니다.", pieceLabel(c.piece), c.to, pieceLabel(c.captured), top.lost));
        else if (before.attackers(c.to, color).includes(mv.from)) add(86, "abandonedDefender", t("{0:이/가} {1}의 {2:을/를} 지키고 있었는데 이 수로 떠나 상대가 기물 가치 {3}점을 얻을 수 있게 됩니다.", pieceLabel(mv.piece), c.to, pieceLabel(c.captured), top.lost));
        else add(84, "hangs", t("이 수로 상대 {0:이/가} {1}의 {2:을/를} 잡을 수 있게 되어 기물 가치 {3}점을 잃습니다.", pieceLabel(c.piece), c.to, pieceLabel(c.captured), top.lost));
      }
      out.top = top;
    }
    // 3) 기물을 바로 잃지는 않지만 상대가 전술을 걸 수 있게 됨(탐색이 느려 위 이유가 없을 때만)
    if (!top) {
      let rt = null; try { rt = replyTactics(after.fen()); } catch { rt = null; }
      if (rt && rt.kind !== "mate") add(80, "allowTactic", t("이 수 뒤 상대가 {0}로 {1:을/를} 걸 수 있습니다.", rt.san, tacName(rt.kind)));
    }
  }

  // 4) 최선 수에서 놓친 것 — 체크메이트·기물 이득·전술
  let bmv = null, bestNet = 0, bestGame = null;
  if (m.best) {
    bestGame = replay(sansBefore);
    if (bestGame) {
      bmv = bestGame.moves({ verbose: true }).find((x) => strip(x.san) === strip(m.best)) || null;
      if (bmv) {
        if (bmv.captured) bestNet = netOfCapture(bestGame, bmv);
        const probe = replay(sansBefore); probe.move(bmv.san);
        if (probe.isCheckmate()) add(78, "missedMate", t("최선 수 {0}로 체크메이트할 수 있었지만 놓쳤습니다.", m.best));
        else if (bmv.captured && bestNet >= 2 && !(mv.captured && VAL[mv.captured] >= VAL[bmv.captured])) add(76, "missedWin", t("최선 수 {0}로 상대의 {1:을/를} 기물 가치 {2}점 이득으로 잡을 수 있었지만 놓쳤습니다.", m.best, pieceLabel(bmv.captured), bestNet));
        else {
          let bt = null; try { bt = bestMoveTactic(before.fen(), strip(m.best)); } catch { bt = null; }
          if (bt && bt.kind !== "mate") add(74, "missedTactic", t("최선 수 {0}로 {1:을/를} 걸 수 있었지만 놓쳤습니다.", m.best, tacName(bt.kind)));
        }
      }
    }
  }

  // 5) 구조·킹 안전 — 위에서 큰 이유가 없을 때도 곁들이는 약한 이유
  const dz = kingZoneAttacks(after, color) - kingZoneAttacks(before, color);
  if (dz >= 2) add(60, "kingExposed", t("이 수로 내 킹 주변이 약해져 상대 기물이 킹 근처 칸을 겨누는 횟수가 {0}번 늘어납니다.", dz));
  const rb = before.getCastlingRights(color), ra = after.getCastlingRights(color);
  if ((rb.k || rb.q) && !/[kq]/.test(mv.flags) && ((rb.k && !ra.k) || (rb.q && !ra.q))) add(50, "castleLost", t("이 수로 캐슬링 권리를 잃어 킹을 안전하게 옮기기 어려워집니다."));
  const ps0 = pawnShape(before, color), ps1 = pawnShape(after, color);
  if (ps1.doubled > ps0.doubled) add(45, "pawnWeakness", t("이 수로 {0:이/가} 생겨 폰 구조가 약해집니다.", t("겹폰")));
  else if (ps1.isolated > ps0.isolated) add(45, "pawnWeakness", t("이 수로 {0:이/가} 생겨 폰 구조가 약해집니다.", t("고립폰")));
  const lastOwn = hist.length >= 2 ? hist[hist.length - 2] : null;
  if (before.history().length < 20 && lastOwn && lastOwn.color === color && lastOwn.to === mv.from && !lastOwn.captured && !mv.captured && mv.piece !== "p" && mv.piece !== "k") add(40, "tempoLoss", t("이미 움직인 {0:을/를} 다시 움직여 전개가 한 박자 늦어집니다.", pieceLabel(mv.piece)));

  // 6) 아무 이유도 못 찾음 — 포지션 판단
  if (!out.length) {
    const a = m.winBefore != null ? Math.round(m.winBefore) : null, b = m.winAfter != null ? Math.round(m.winAfter) : null;
    if (m.best && a != null && b != null) add(10, "positional", t("눈에 띄는 기물 손실은 없지만 엔진은 {0}가 더 낫다고 평가해 승률이 {1}%에서 {2}%로 내려갑니다.", m.best, a, b));
    else if (a != null && b != null) add(10, "positional", t("눈에 띄는 기물 손실은 없지만 승률이 {0}%에서 {1}%로 내려갑니다.", a, b));
  }
  out.sort((x, y) => y.w - x.w);
  const reasons = out.slice(0, MAX_REASONS).map(({ id, text }) => ({ id, text }));

  // 7) 대신 최선 수는 무엇을 하는가(이미 "놓친 이득"으로 설명했으면 생략)
  let motive = null;
  if (bmv && !out.some((o) => o.id === "missedMate" || o.id === "missedWin" || o.id === "missedTactic")) {
    const probe = replay(sansBefore); probe.move(bmv.san);
    const defends = out.top && (out.some((o) => o.id === "ignoredThreat" || o.id === "hangs") && !probe.moves({ verbose: true }).some((c) => c.captured && netOfCapture(probe, c) >= 1));
    if (defends) motive = t("대신 {0}로 공격받는 {1:을/를} 지킬 수 있었습니다.", m.best, pieceLabel(out.top.c.captured));
    else if (bmv.captured && bestNet >= 1) motive = t("대신 {0}로 상대의 {1:을/를} 잡을 수 있었습니다.", m.best, pieceLabel(bmv.captured));
    else if (/\+$/.test(bmv.san)) motive = t("대신 {0}로 체크를 걸어 주도권을 잡을 수 있었습니다.", m.best);
    else if (/[kq]/.test(bmv.flags) && bmv.piece === "k") motive = t("대신 {0}로 캐슬링해 킹을 안전하게 할 수 있었습니다.", m.best);
    else if ((bmv.piece === "n" || bmv.piece === "b") && (bmv.from[1] === "1" || bmv.from[1] === "8")) motive = t("대신 {0}로 {1:을/를} 전개할 수 있었습니다.", m.best, pieceLabel(bmv.piece));
    else if (bmv.piece === "p" && /^[cdef][45]$/.test(bmv.to) && before.history().length < 20) motive = t("대신 {0}로 중앙을 차지할 수 있었습니다.", m.best);
  }
  return { reasons, motive };
}
