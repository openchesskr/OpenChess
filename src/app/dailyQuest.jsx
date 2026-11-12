// (v0.7.4, 사용자 요청) 일일 퀘스트 카드 — 학습 탭에서 플레이 탭으로 옮기면서 학습 탭 전용 파일(learn.jsx)에서 분리했다.
// KST 자정 갱신 카운트다운, 오프닝 퀘스트 개별 리롤, 완료 표기는 이 카드가 화면에 나타날 때 애니메이션으로 공개(seen 플래그). 로직·디자인은 v0.7.3 그대로.
import { useState, useEffect, useMemo } from "react";
import { Check, RotateCcw, Puzzle, CalendarCheck, BookMarked, Timer, Gem, Sparkles, ListChecks, Swords } from "../components/ocIcons.jsx";   // (v0.7.5) OpenChess 파셋 아이콘(예전 lucide 대체)
import { motion } from "framer-motion";
import { SITE_FONT } from "../components/engineLines.jsx";
import { CoinIcon, DEFAULT_QUEST_OPENINGS, questLabelNode, questOpeningMovesText } from "./common.jsx";
import { t, tx } from "../lib/i18n.js";
// 다음 KST 자정까지 남은 밀리초
function msUntilKstMidnight(now) {
  now = now || new Date();
  const kst = now.getTime() + 9 * 3600e3;
  const nextMid = (Math.floor(kst / 86400e3) + 1) * 86400e3;
  return nextMid - kst;
}
// (버그) 각 활동 퀘스트를 개별적으로 하루 1회씩 리롤 — 다른 오프닝 플레이 퀘스트로 교체.
// 이미 완료(claimed)한 퀘스트나 이미 리롤한 퀘스트는 교체할 수 없다. 바꿀 오프닝이 없으면 그대로 둔다.
function rerollQuestOpening(dq, idx, recentOpenings) {
  if (!dq || !dq.quests) return dq;
  const rerolled = dq.rerolled || {};
  if (rerolled[idx]) return dq;                        // 이 퀘스트는 이미 리롤함
  if (dq.claimed && dq.claimed["cc_" + idx]) return dq; // 이미 완료한 퀘스트는 리롤 불가
  const q = dq.quests[idx];
  if (!q) return dq;
  const usedOpenings = dq.quests.filter((x) => x.type === "opening").map((x) => x.opening);
  const exclude = new Set([...(dq.banned || []), ...usedOpenings]);
  const pool = [...new Set([...(recentOpenings || []), ...DEFAULT_QUEST_OPENINGS])].filter(Boolean).filter((n) => !exclude.has(n));
  if (!pool.length) return dq;
  const next = pool[Math.floor(Math.random() * pool.length)];
  const quests = dq.quests.map((x, i) => (i === idx ? { type: "opening", opening: next } : x));
  const banned = q.type === "opening" ? [...(dq.banned || []), q.opening] : (dq.banned || []);
  return { ...dq, quests, banned, rerolled: { ...rerolled, [idx]: true } };
}
// (17차→18차) 일일 퀘스트 카드 — 학습 탭으로 분리. KST 자정 갱신 카운트다운, 오프닝 퀘스트 1회 리셋,
// 완료 표기는 학습 탭에 최초 진입할 때 애니메이션으로 공개(seen 플래그).
function fmtRemainHMS(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return String(Math.floor(s / 3600)).padStart(2, "0") + ":" + String(Math.floor((s % 3600) / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
}
export function DailyQuestCard({ dailyQuest, setDailyQuest, recentOpenings, onOpenOpening, hasChesscom, highlight }) {
  const dq = dailyQuest;
  const [remain, setRemain] = useState(msUntilKstMidnight());
  useEffect(() => { const iv = setInterval(() => setRemain(msUntilKstMidnight()), 1000); return () => clearInterval(iv); }, []);
  // (버그 수정) questOpeningMovesText는 표에 없는 이름이면 오프닝 트리를 처음부터 훑는(BFS) 탐색을
  // 한다 — 이 카드는 갱신 카운트다운 때문에 1초마다 리렌더되므로, 매 렌더마다 다시 돌리지 않도록
  // 퀘스트 목록이 실제로 바뀔 때만(리롤·자정 갱신) 계산해 둔다.
  const openingMovesTexts = useMemo(() => (dq && dq.quests ? dq.quests.map((q) => q.type === "opening" ? questOpeningMovesText(q.opening) : null) : []), [dq && dq.quests]);
  // (UX1) 완료됐지만 아직 확인(seen)하지 않은 퀘스트 — 진입 직후엔 미완료처럼 보여주다가 잠시 후
  // 클리어 애니메이션과 함께 완료 상태로 전환하고, 애니메이션이 끝나면 seen으로 기록한다.
  const [revealed, setRevealed] = useState({});
  useEffect(() => {
    if (!dq) return;
    const keys = ["puzzle", "dailypuzzle", "cc_0", "cc_1", "cc_2"].filter((k) => dq.claimed[k] && !(dq.seen || {})[k]);
    if (!keys.length) return;
    const t1 = setTimeout(() => setRevealed((r) => ({ ...r, ...Object.fromEntries(keys.map((k) => [k, true])) })), 400);
    const t2 = setTimeout(() => setDailyQuest((d) => d ? { ...d, seen: { ...(d.seen || {}), ...Object.fromEntries(keys.map((k) => [k, true])) } } : d), 2100);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [dq && dq.date, dq && JSON.stringify(dq.claimed)]);
  if (!dq) return null;
  const seen = dq.seen || {};
  const shownDone = (k) => dq.claimed[k] && (seen[k] || revealed[k]);
  const clearing = (k) => revealed[k] && !seen[k];
  const allDone = dq.claimed.puzzle && dq.claimed.dailypuzzle && [0, 1, 2].every((i) => dq.claimed["cc_" + i]);
  const doneCount = (dq.claimed.puzzle ? 1 : 0) + (dq.claimed.dailypuzzle ? 1 : 0) + [0, 1, 2].filter((i) => dq.claimed["cc_" + i]).length;
  // (v0.7.3, 사용자 요청) 일일 퀘스트 보드 — 그라데이션 없이 단색 면과 얇은 테두리로만 구성하고, 아이콘은 가는 선(1.75) 하나로 통일, 색은 채도를 낮춘 4색(강청·호박·세이지·황동)만 쓴다.
  // 퀘스트마다 아이콘 칸은 "그 색 14% 면 + 40% 테두리 + 같은 색 선 아이콘"이고, 완료하면 세이지 초록 면과 체크로 바뀐다. 로직(공개 연출·하이라이트·리롤)은 그대로다.
  // (사용자 요청) 분석 탭 퀘스트 배지를 눌러 들어왔을 때, 해당 오프닝 퀘스트 줄에 눈에 띄는 하이라이트 애니메이션을 재생하고 화면에 보이도록 스크롤한다.
  const INK = "rgba(90,58,34,.10)", SURFACE = "rgba(255,255,255,.55)", LINE = "#D6C29A", BRASS = "#A8842F", SAGE = "#3F7A3A", MUTED = "#7A6648";
  const row = ({ k, Icon, title, sub, progress, extras, highlighted, hue }) => {
    const done = shownDone(k), flash = clearing(k);
    const tone = done ? SAGE : hue;
    return (
      <motion.div ref={highlighted ? (el) => el && el.scrollIntoView({ behavior: "smooth", block: "center" }) : undefined}
        layout={false} animate={flash ? { scale: [1, 1.03, 1] } : { scale: 1 }} transition={{ duration: 0.45 }}
        className={highlighted ? "dq-hi" : undefined}
        style={{ position: "relative", display: "flex", alignItems: "center", gap: 12, padding: "11px 12px", borderRadius: 12,
          background: done ? "#E4EFD8" : SURFACE, border: "1px solid " + (highlighted ? BRASS : done ? "#A9C589" : LINE) }}>
        <span style={{ position: "relative", width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: tone + "24", border: "1px solid " + tone + "66" }}>
          {done ? <Check size={20} strokeWidth={2.4} color={SAGE} /> : <Icon size={20} color={tone} strokeWidth={1.75} />}
          {flash && <Sparkles size={15} color={BRASS} className="dq-spark" style={{ position: "absolute", top: -7, right: -7 }} />}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: done ? "#3F7A3A" : "#3A2516", lineHeight: 1.3 }}>{title}</div>
          {sub && <div style={{ fontSize: 11.5, color: done ? "#5E8A52" : MUTED, marginTop: 2, lineHeight: 1.35 }}>{sub}</div>}
          {progress != null && !done && (
            <div style={{ height: 5, borderRadius: 3, background: INK, marginTop: 8, overflow: "hidden" }}>
              <motion.div initial={{ width: 0 }} animate={{ width: Math.round(progress * 100) + "%" }} transition={{ duration: 0.7, ease: [0.22, 0.9, 0.32, 1] }} style={{ height: "100%", background: hue, borderRadius: 3 }} />
            </div>
          )}
        </div>
        {extras}
        {/* (v0.1.2) 개별 퀘스트 클리어 보상을 XP에서 OC 나이트 코인으로 바꿈. */}
        <span className="flex items-center gap-1" style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: done ? "#5E8A52" : "#8A6C2F", background: INK, border: "1px solid " + LINE, borderRadius: 999, padding: "3px 9px 3px 10px" }}>+10 <CoinIcon size={14} /></span>
      </motion.div>
    );
  };
  return (
    <div style={{ marginBottom: 16, borderRadius: 16, overflow: "hidden", border: "1px solid " + LINE, background: "#F1E6D0", boxShadow: "0 3px 0 #B59A6E" }}>
      <style>{"@keyframes dqSpark{0%{transform:scale(.3) rotate(0);opacity:0}40%{opacity:1}100%{transform:scale(1.4) rotate(90deg);opacity:0}} .dq-spark{animation:dqSpark .9s ease-out 1} @keyframes dqHi{0%,100%{box-shadow:0 0 0 0 rgba(201,164,92,0)}50%{box-shadow:0 0 0 5px rgba(201,164,92,.4)}} .dq-hi{animation:dqHi 1.1s ease-in-out 3} @keyframes dqGlow{0%,100%{box-shadow:0 0 0 0 rgba(201,164,92,0)}50%{box-shadow:0 0 0 4px rgba(201,164,92,.32)}} .dq-glow{animation:dqGlow 2.2s ease-in-out infinite} html[data-perf=\"lite\"] .dq-glow{animation:none}"}</style>
      {/* 머리띠 */}
      <div className="flex items-center justify-between" style={{ gap: 8, padding: "13px 14px", background: "rgba(255,255,255,.35)", borderBottom: "1px solid " + LINE, flexWrap: "wrap" }}>
        <div className="flex items-center" style={{ gap: 10, minWidth: 0 }}>
          <span style={{ width: 36, height: 36, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", background: BRASS + "24", border: "1px solid " + BRASS + "66" }}><ListChecks size={19} color={BRASS} strokeWidth={1.75} /></span>
          <div>
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".24em", color: BRASS }}>DAILY QUEST</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#2A1B0E", lineHeight: 1.15 }}>{t("일일 퀘스트")}</div>
          </div>
        </div>
        <div className="flex items-center" style={{ gap: 7, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontWeight: 700, fontFamily: SITE_FONT, color: allDone ? SAGE : "#8A6C2F", background: INK, border: "1px solid " + LINE, borderRadius: 999, padding: "3px 10px" }}>{doneCount}/5{allDone ? " · " + t("모두 완료") : ""}</span>
          {/* (UX2) 갱신은 한국 시간(KST) 자정 기준 */}
          <span className="flex items-center gap-1" style={{ fontSize: 11.5, fontWeight: 600, fontFamily: SITE_FONT, color: MUTED, background: INK, border: "1px solid " + LINE, borderRadius: 999, padding: "3px 10px" }}><Timer size={12} strokeWidth={1.9} />{fmtRemainHMS(remain)}</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12 }}>
        {row({ k: "puzzle", Icon: Puzzle, hue: "#3E7CC4", title: t("새 퍼즐 {0}회 풀기", dq.puzzleTarget), sub: dq.puzzleCount + "/" + dq.puzzleTarget, progress: dq.puzzleTarget ? Math.min(1, dq.puzzleCount / dq.puzzleTarget) : 0 })}
        {/* (v0.2.2 UI#4) 두 번째 퀘스트는 항상 '오늘의 퍼즐 풀기'로 고정 — 퍼즐 탭 맨 위 오늘의 퍼즐을 풀면 완료된다. */}
        {row({ k: "dailypuzzle", Icon: CalendarCheck, hue: "#C47A1E", title: t("일일 퍼즐 풀기"), sub: t("퍼즐 탭 맨 위 ‘일일 퍼즐’ 풀기") })}
        {(dq.quests || []).map((q, i) => {
          const isOpening = q.type === "opening";
          // (버그) 각 퀘스트를 개별적으로 1회씩 리롤 — 이미 리롤했거나 이미 완료한 퀘스트는 불가.
          const canReroll = !((dq.rerolled || {})[i]) && !dq.claimed["cc_" + i];
          const highlighted = isOpening && !!highlight && highlight.opening === q.opening;
          return (
            // (사용자 요청) key에 highlight.nonce를 섞어, 같은 오프닝을 배지로 연달아 눌러도 매번 새로 마운트되어 하이라이트 애니메이션이 다시 재생되게 한다.
            <div key={i + (highlighted ? "-" + highlight.nonce : "")} onClick={() => isOpening && onOpenOpening && onOpenOpening(q.opening)} className={isOpening ? "press" : undefined} style={{ cursor: isOpening ? "pointer" : "default" }}>
              {row({ k: "cc_" + i, Icon: isOpening ? BookMarked : Swords, hue: "#3F8A57", title: questLabelNode(q), sub: !hasChesscom ? t("설정에서 chess.com 계정 연동 필요") : (isOpening ? openingMovesTexts[i] : null), highlighted,
                /* 이 퀘스트만 다른 오프닝 플레이 퀘스트로 교체(퀘스트당 1회) — 교체된 오프닝은 그날 다시 안 나옴 */
                extras: canReroll ? (
                  <button onClick={(e) => { e.stopPropagation(); setDailyQuest((d) => rerollQuestOpening(d, i, recentOpenings)); }} className="press" title={t("이 퀘스트만 교체 (퀘스트당 1회)")} aria-label={t("이 퀘스트만 교체 (퀘스트당 1회)")}
                    style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 9, border: "1px solid " + LINE, background: INK, color: MUTED, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><RotateCcw size={14} strokeWidth={1.9} /></button>
                ) : null })}
            </div>
          );
        })}
      </div>
      {/* (버그) 모든 퀘스트 완료 보상 — 일일 퀘스트 목록 아래 별도 블록으로 시각화(OC 나이트 코인 100) */}
      <div className={allDone ? "dq-glow" : undefined} style={{ margin: "0 12px 12px", padding: "12px 14px", borderRadius: 12, display: "flex", alignItems: "center", gap: 12,
        border: "1px solid " + (allDone ? BRASS : LINE), background: SURFACE }}>
        <span style={{ position: "relative", flexShrink: 0, width: 48, height: 48, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", background: BRASS + "24", border: "1px solid " + BRASS + "66" }}>
          <Gem size={24} color={BRASS} strokeWidth={1.6} />
          <span style={{ position: "absolute", right: -6, bottom: -6 }}><CoinIcon size={22} /></span>
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: allDone ? "#8A6C2F" : "#3A2516" }}>{t("모든 퀘스트 완료 보상")}</div>
          <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>{tx("OC 나이트 코인 {0}, {1}/5 완료", <b style={{ color: "#8A6C2F" }}>{t("100개")}</b>, doneCount)}</div>
          <div style={{ display: "flex", gap: 4, marginTop: 8 }} aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => <motion.span key={i} initial={false} animate={{ backgroundColor: i < doneCount ? BRASS : INK }} style={{ flex: 1, height: 6, borderRadius: 3 }} />)}
          </div>
        </div>
        <span style={{ fontSize: 12.5, fontWeight: 800, flexShrink: 0, color: allDone ? "#8A6C2F" : "#9A8A6E" }}>{allDone ? (dq.bonusClaimed ? t("획득 완료") : t("획득")) : t("잠김")}</span>
      </div>
    </div>
  );
}

// (v0.7.4, 사용자 요청) 플레이 퀘스트 — 일일 퀘스트 바로 아래의 같은 크림색 블록. 일반 대국·미니게임에서 조건을 달성하면 클리어된다(하루 단위, KST 자정에 처음부터).
// 진행은 lib/playQuest.js(대국·미니게임이 끝날 때 play.jsx가 알림). 보상은 없고 클리어 표시만 한다.
import { PLAY_QUESTS, normalizePlayQuest, questDone, clearedCount } from "../lib/playQuest.js";
export function PlayQuestCard({ playQuest }) {
  const INK = "rgba(90,58,34,.10)", LINE = "#D6C29A", BRASS = "#A8842F", SAGE = "#3F7A3A", MUTED = "#7A6648";
  const s = normalizePlayQuest(playQuest);
  const done = clearedCount(s), all = done === PLAY_QUESTS.length;
  return (
    <div style={{ marginBottom: 16, borderRadius: 16, overflow: "hidden", border: "1px solid " + LINE, background: "#F1E6D0", boxShadow: "0 3px 0 #B59A6E" }}>
      <div className="flex items-center justify-between" style={{ gap: 8, padding: "13px 14px", background: "rgba(255,255,255,.35)", borderBottom: "1px solid " + LINE }}>
        <div className="flex items-center" style={{ gap: 10, minWidth: 0 }}>
          <span style={{ width: 36, height: 36, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", background: BRASS + "24", border: "1px solid " + BRASS + "66" }}><Swords size={19} color={BRASS} strokeWidth={1.75} /></span>
          <div>
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".24em", color: BRASS }}>PLAY QUEST</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#2A1B0E", lineHeight: 1.15 }}>{t("플레이 퀘스트")}</div>
          </div>
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, fontFamily: SITE_FONT, color: all ? SAGE : "#8A6C2F", background: INK, border: "1px solid " + LINE, borderRadius: 999, padding: "3px 10px", whiteSpace: "nowrap" }}>{done}/{PLAY_QUESTS.length}{all ? " · " + t("모두 완료") : ""}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12 }}>
        {PLAY_QUESTS.map((q) => {
          const cur = Math.min(q.target, q.count(s)), ok = questDone(q, s), tone = ok ? SAGE : "#3E7CC4";
          return (
            <div key={q.key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 12px", borderRadius: 12, background: ok ? "#E4EFD8" : "rgba(255,255,255,.55)", border: "1px solid " + (ok ? "#A9C589" : LINE) }}>
              <span style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: tone + "24", border: "1px solid " + tone + "66" }}>
                {ok ? <Check size={20} strokeWidth={2.4} color={SAGE} /> : <Swords size={20} color={tone} strokeWidth={1.75} />}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: ok ? "#3F7A3A" : "#3A2516", lineHeight: 1.3 }}>{q.title()}</div>
                {!ok && (
                  <div style={{ height: 5, borderRadius: 3, background: INK, marginTop: 8, overflow: "hidden" }}>
                    <motion.div initial={false} animate={{ width: Math.round((cur / q.target) * 100) + "%" }} transition={{ duration: 0.6, ease: [0.22, 0.9, 0.32, 1] }} style={{ height: "100%", background: tone, borderRadius: 3 }} />
                  </div>
                )}
              </div>
              <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, fontFamily: SITE_FONT, color: ok ? "#5E8A52" : MUTED, background: INK, border: "1px solid " + LINE, borderRadius: 999, padding: "3px 10px" }}>{ok ? t("클리어") : cur + "/" + q.target}</span>
            </div>
          );
        })}
      </div>
      <p style={{ margin: 0, padding: "0 14px 12px", fontSize: 11, lineHeight: 1.5, color: MUTED }}>{t("일반 대국은 10수(양쪽 합 20수) 이상 두고 끝내야 인정됨, 한국 시간 자정에 새로 시작")}</p>
    </div>
  );
}
