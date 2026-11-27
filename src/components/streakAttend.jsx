// (v0.8.0, 사용자 요청) 소셜 탭 연속 출석 애니메이션 — 하루(KST) 한 번, 소셜 탭에 처음 들어올 때 화면 가운데에 뜬다.
//  · 불꽃이 커지며 타오르고, 일수 숫자가 어제 값에서 오늘 값으로 굴러 올라간다(오늘 이미 출석했으면).
//  · 아래 7칸(오늘로 끝나는 최근 7일)은 연속 기록에 든 날이 왼쪽부터 차례로 불이 붙고, 오늘 칸은 마지막에 튀어 오른다.
//  · 연속 기록 = 일일 퍼즐 연속 해결(App.jsx dailyPuzzleStreak, 머리줄 StreakCount와 같은 값). 끊겼으면(마지막 날이 어제 이전) 0일로 보여 준다.
//  · 누르면 닫히고, 3.6초 뒤 저절로 닫힌다. 본 날짜는 localStorage(STREAK_ANIM_KEY)에 — 실패해도(사생활 보호 모드) 이번 마운트에서만 한 번.
//  칸 장식은 파셋 규칙(FacetDiamond, 빛은 왼쪽 위) — check-facet-icons ZONES에 등록.
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { FacetDiamond, facetRamp } from "./facetIcons.jsx";
import { Flame as FlameIcon } from "./ocIcons.jsx";
import { SITE_FONT } from "./engineLines.jsx";
import { T } from "../lib/theme.js";
import { t } from "../lib/i18n.js";
import { isLite } from "../lib/perfMode.js";

export const STREAK_ANIM_KEY = "oc_streak_anim_date";
const EMBER = facetRamp("#E8874A");
const ASH = facetRamp("#6A5A48");
const kstDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
const dayMs = 86400e3;

/** 지금(KST 오늘) 보여 줄 값 — streak: { count, lastDate } */
export function streakView(streak, now = Date.now()) {
  const today = kstDay(now), yesterday = kstDay(now - dayMs);
  const last = streak && streak.lastDate;
  const alive = last === today || last === yesterday;
  const n = alive ? Math.max(0, (streak.count | 0)) : 0;
  const doneToday = last === today;
  // 최근 7일(오늘로 끝남)마다 연속 기록에 들었는지 — 기록 구간: last-n+1 ~ last
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = kstDay(now - (6 - i) * dayMs);
    const back = alive ? Math.round((Date.parse(last) - Date.parse(d)) / dayMs) : -1;
    return { d, lit: alive && back >= 0 && back < n, today: i === 6 };
  });
  return { n, doneToday, days, from: doneToday ? Math.max(0, n - 1) : n };
}

export function StreakAttendAnim({ streak, enabled = true }) {
  const [open, setOpen] = useState(false);
  const view = useMemo(() => streakView(streak), [streak && streak.count, streak && streak.lastDate]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!enabled) return undefined;
    const today = kstDay(Date.now());
    let seen = null;
    try { seen = window.localStorage.getItem(STREAK_ANIM_KEY); } catch { }
    if (seen === today) return undefined;
    // 저장된 진행(연속 기록)이 서버에서 불러와질 틈을 조금 준다
    const id = setTimeout(() => { setOpen(true); try { window.localStorage.setItem(STREAK_ANIM_KEY, today); } catch { } }, 650);
    return () => clearTimeout(id);
  }, [enabled]);
  const [shown, setShown] = useState(view.from);
  useEffect(() => {
    if (!open) return undefined;
    setShown(view.from);
    const a = setTimeout(() => setShown(view.n), 1350);
    const b = setTimeout(() => setOpen(false), 3600);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (typeof document === "undefined") return null;
  const lite = isLite();
  const lit = view.n > 0;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div key="streak" role="dialog" aria-label={t("{0}일 연속", view.n)} onClick={() => setOpen(false)}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
          style={{ position: "fixed", inset: 0, zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(14,8,4,.62)", cursor: "pointer", padding: 16 }}>
          <motion.div initial={{ scale: 0.82, y: 14 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, opacity: 0 }} transition={{ type: "spring", stiffness: 320, damping: 22 }}
            style={{ position: "relative", width: "100%", maxWidth: 320, borderRadius: 20, overflow: "hidden", padding: "26px 20px 20px", textAlign: "center", fontFamily: SITE_FONT,
              background: "radial-gradient(120% 90% at 50% 0%, #4A2A14 0%, #24150A 62%, #170D06 100%)", border: "1px solid rgba(232,135,74,.45)", boxShadow: "0 24px 60px -14px rgba(0,0,0,.75)" }}>
            {/* 불꽃 뒤 빛 번짐 */}
            <motion.div aria-hidden="true" initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: lit ? [0, 0.9, 0.6] : 0.25, scale: lit ? [0.4, 1.15, 1] : 0.8 }} transition={{ duration: 1.1, delay: 0.15 }}
              style={{ position: "absolute", left: "50%", top: 18, width: 170, height: 170, marginLeft: -85, borderRadius: "50%", background: "radial-gradient(circle, rgba(232,135,74,.55), rgba(232,135,74,0) 68%)", pointerEvents: "none" }} />
            <motion.div initial={{ scale: 0.2, rotate: -12, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 13, delay: 0.12 }}
              style={{ position: "relative", display: "inline-flex", color: lit ? "#E8874A" : "rgba(235,221,196,.4)" }}>
              <motion.span style={{ display: "inline-flex", transformOrigin: "50% 90%" }} animate={lit && !lite ? { scaleY: [1, 1.08, 0.97, 1.05, 1], scaleX: [1, 0.96, 1.03, 0.98, 1] } : undefined} transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}>
                <FlameIcon size={74} />
              </motion.span>
            </motion.div>
            {/* 일수 — 어제 값에서 오늘 값으로 굴러 올라간다 */}
            <div style={{ position: "relative", height: 54, overflow: "hidden", marginTop: 4 }}>
              <AnimatePresence initial={false} mode="popLayout">
                <motion.div key={shown} initial={{ y: 46, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -46, opacity: 0 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  style={{ fontSize: 44, fontWeight: 900, lineHeight: "54px", color: lit ? T.ivoryHi : "rgba(235,221,196,.6)", letterSpacing: "-.02em" }}>{t("{0}일", shown)}</motion.div>
              </AnimatePresence>
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#F0B27A", letterSpacing: ".04em", marginTop: 2 }}>{t("연속 출석")}</div>
            {/* 최근 7일 */}
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
              {view.days.map((d, i) => {
                const on = d.lit && !(d.today && shown !== view.n && view.doneToday);
                return (
                  <motion.span key={d.d} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: d.today && on ? [0.4, 1.35, 1] : 1, opacity: 1 }} transition={{ delay: 0.45 + i * 0.09, duration: 0.4 }}
                    style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <svg viewBox="0 0 20 20" width={24} height={24} aria-hidden="true"><FacetDiamond cx={10} cy={10} r={8.4} R={on ? EMBER : ASH} gem={on && d.today} /></svg>
                    <span style={{ fontSize: 9.5, fontWeight: 800, color: d.today ? "#F0B27A" : "rgba(235,221,196,.5)" }}>{d.today ? t("오늘") : d.d.slice(8).replace(/^0/, "")}</span>
                  </motion.span>
                );
              })}
            </div>
            <div style={{ fontSize: 12, color: "rgba(235,221,196,.72)", marginTop: 14, lineHeight: 1.5, wordBreak: "keep-all" }}>
              {view.doneToday ? t("오늘도 출석 완료. 내일도 일일 퍼즐로 이어 가세요") : view.n > 0 ? t("오늘의 일일 퍼즐을 풀면 연속 출석이 이어집니다") : t("오늘의 일일 퍼즐을 풀어 연속 출석을 시작하세요")}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
