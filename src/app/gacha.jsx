// (v0.6.9) 스킨 뽑기 화면 — 도감 스킨 페이지 맨 위의 상자(흑백 체크 + 금장, 가운데 금빛 킹과 열쇠 구멍)와 1회·5회 뽑기 버튼, 결과 창.
//  뽑기 규칙·가격·확률은 lib/gacha.js(순수 모듈), 코인·보유 목록 반영은 App의 pullGacha가 맡는다. 여기는 보여주기만 한다.
import { useState, useEffect, useRef, useId } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { T, BOARD_SKINS, SKIN_SETS, boardSquareBg, BOARD_GLOSS } from "../lib/theme.js";
import { PieceGlyph } from "../components/pieces.jsx";
import { CoinIcon } from "./common.jsx";
import { GACHA_PRICE, GACHA_POOL, GACHA_RARITY, GACHA_TOTAL_WEIGHT, GACHA_DUP_REFUND } from "../lib/gacha.js";
import { SITE_FONT } from "../components/engineLines.jsx";
import { t, tx } from "../lib/i18n.js";

const GOLD = ["#FFE493", "#E8AE2A", "#B07410"];

/** 상자 그림. phase: "idle"(가만히) | "shake"(흔들림) | "open"(뚜껑이 열리며 빛이 새어 나옴). */
export function GachaChest({ phase = "idle" }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const gold = `url(#${uid}g)`, goldD = `url(#${uid}gd)`, blk = `url(#${uid}b)`;
  const open = phase === "open";
  return (
    <motion.svg viewBox="0 0 240 224" width="100%" style={{ maxWidth: 270, display: "block", margin: "0 auto", overflow: "visible" }}
      animate={phase === "shake" ? { x: [0, -4, 4, -5, 5, -3, 3, 0], rotate: [0, -1.2, 1.2, -1.6, 1.6, -1, 1, 0] } : { x: 0, rotate: 0 }} transition={{ duration: 0.7, ease: "easeInOut" }} aria-hidden="true">
      <defs>
        <linearGradient id={uid + "g"} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={GOLD[0]} /><stop offset=".45" stopColor={GOLD[1]} /><stop offset="1" stopColor={GOLD[2]} /></linearGradient>
        <linearGradient id={uid + "gd"} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#D79A1E" /><stop offset="1" stopColor="#8A560A" /></linearGradient>
        <linearGradient id={uid + "b"} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2C2C2F" /><stop offset="1" stopColor="#0E0E10" /></linearGradient>
        <radialGradient id={uid + "r"} cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#FFF6C8" stopOpacity="1" /><stop offset=".45" stopColor="#FFD35A" stopOpacity=".75" /><stop offset="1" stopColor="#FFB020" stopOpacity="0" /></radialGradient>
        <pattern id={uid + "p"} width="35" height="36" patternUnits="userSpaceOnUse" x="50" y="108"><rect width="35" height="36" fill="#F4F2EF" /><rect width="17.5" height="18" fill="#161617" /><rect x="17.5" y="18" width="17.5" height="18" fill="#161617" /></pattern>
      </defs>
      <ellipse cx="120" cy="210" rx="100" ry="9" fill="rgba(0,0,0,.4)" />
      {/* 열릴 때 새어 나오는 빛 */}
      <motion.g initial={false} animate={{ opacity: open ? 1 : 0, scale: open ? 1 : 0.6 }} transition={{ duration: 0.5 }} style={{ transformOrigin: "120px 96px" }}>
        <circle cx="120" cy="92" r="96" fill={`url(#${uid}r)`} />
        {[-62, -38, -16, 0, 16, 38, 62].map((a) => <polygon key={a} points="120,96 112,-70 128,-70" fill="#FFE8A0" opacity=".55" transform={`rotate(${a} 120 96)`} />)}
      </motion.g>
      {/* 몸통 */}
      <rect x="22" y="98" width="196" height="94" rx="6" fill={blk} />
      {[22, 192].map((x, i) => (
        <g key={x}>
          <rect x={x} y="98" width="26" height="94" fill="#19191B" />
          <rect x={x + 6} y="118" width="14" height="52" fill="#121214" stroke={gold} strokeWidth="2.2" />
          <polygon points={`${x + 13},128 ${x + 19},144 ${x + 13},160 ${x + 7},144`} fill={gold} stroke="#7A4C08" strokeWidth=".8" />
        </g>
      ))}
      <rect x="50" y="108" width="140" height="72" fill={`url(#${uid}p)`} />
      <rect x="48" y="106" width="144" height="76" fill="none" stroke="#0A0A0B" strokeWidth="3" />
      {/* 가운데 다이아몬드 판 + 금빛 킹 + 열쇠 구멍 */}
      <polygon points="120,98 170,140 120,184 70,140" fill="#161617" stroke={gold} strokeWidth="3.4" strokeLinejoin="round" />
      <polygon points="120,106 162,140 120,176 78,140" fill="none" stroke="#C48A18" strokeWidth="1.2" opacity=".8" />
      <g transform="translate(120 138)">
        <rect x="-3.2" y="-37" width="6.4" height="15" fill={gold} /><rect x="-8.5" y="-32.5" width="17" height="5.2" fill={gold} />
        <path d="M-21 11 L-25 -13 L-12 -4 L0 -20 L12 -4 L25 -13 L21 11 Z" fill={gold} stroke="#7A4C08" strokeWidth=".9" strokeLinejoin="round" />
        <rect x="-23" y="11" width="46" height="6" fill={goldD} /><rect x="-27" y="17" width="54" height="6.5" fill={gold} stroke="#7A4C08" strokeWidth=".8" />
        <circle cx="0" cy="-1.5" r="5.4" fill="#0C0C0D" /><polygon points="-3.8,0 3.8,0 5.8,12 -5.8,12" fill="#0C0C0D" />
      </g>
      {/* 금띠와 모서리 장식 */}
      <polygon points="10,92 230,92 232,100 226,108 14,108 8,100" fill={gold} stroke="#7A4C08" strokeWidth=".8" />
      <rect x="14" y="94" width="212" height="2.2" fill="#FFF0B0" opacity=".7" />
      <polygon points="12,162 30,162 30,200 8,200 8,176" fill={goldD} stroke="#7A4C08" strokeWidth=".8" /><polygon points="228,162 210,162 210,200 232,200 232,176" fill={goldD} stroke="#7A4C08" strokeWidth=".8" />
      <rect x="34" y="190" width="172" height="9" fill={gold} stroke="#7A4C08" strokeWidth=".8" />
      <polygon points="96,190 144,190 138,203 102,203" fill={gold} stroke="#7A4C08" strokeWidth=".8" />
      {/* 뚜껑 */}
      <motion.g initial={false} animate={open ? { y: -40, rotate: -2.5 } : { y: 0, rotate: 0 }} transition={{ type: "spring", stiffness: 140, damping: 13 }} style={{ transformOrigin: "120px 94px" }}>
        <polygon points="14,96 28,38 62,18 178,18 212,38 226,96" fill={blk} />
        <polygon points="20,92 30,46 54,40 54,92" fill="#F3F1EF" /><polygon points="220,92 210,46 186,40 186,92" fill="#F3F1EF" />
        {[0, 1].map((m) => (
          <g key={m} transform={m ? "translate(240 0) scale(-1 1)" : undefined}>
            <polygon points="56,22 68,20 64,94 52,94" fill={gold} stroke="#7A4C08" strokeWidth=".8" />
            <polygon points="70,20 76,20 72,94 66,94" fill={goldD} /><polygon points="14,40 30,36 24,94 12,94" fill={gold} stroke="#7A4C08" strokeWidth=".8" opacity=".95" />
          </g>
        ))}
        <polygon points="106,6 134,6 142,22 120,46 98,22" fill={gold} stroke="#7A4C08" strokeWidth=".9" strokeLinejoin="round" /><polygon points="120,10 130,22 120,38 110,22" fill="none" stroke="#FFF0B0" strokeWidth=".9" opacity=".7" />
        <line x1="120" y1="46" x2="120" y2="92" stroke="#050506" strokeWidth="1.6" />
        <polygon points="120,80 142,100 98,100" fill="none" stroke={gold} strokeWidth="3" strokeLinejoin="round" />
      </motion.g>
    </motion.svg>
  );
}

/** 결과 카드에 쓰는 세트 미리보기(보드 4×4 + 흰 나이트·검은 퀸). */
function SetPreview({ id, size = 84 }) {
  const bsk = BOARD_SKINS[id], p = size * 0.5;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <div style={{ width: size, height: size, borderRadius: 4, overflow: "hidden", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gridTemplateRows: "repeat(4,1fr)", ...BOARD_GLOSS }}>
        {Array.from({ length: 16 }).map((_, i) => { const r = Math.floor(i / 4), c = i % 4; return <div key={i} style={boardSquareBg(bsk, (r + c) % 2 === 0, r, c)} />; })}
      </div>
      <div style={{ position: "absolute", left: 1, bottom: size * 0.26, width: p, display: "flex", justifyContent: "center" }}><PieceGlyph type="N" color="w" size={p * 0.9} pieceSkin={id} /></div>
      <div style={{ position: "absolute", right: 1, bottom: 1, width: p, display: "flex", justifyContent: "center" }}><PieceGlyph type="Q" color="b" size={p * 0.9} pieceSkin={id} /></div>
    </div>
  );
}

function ResultCard({ r, index, show }) {
  const rar = GACHA_RARITY[r.rarity], set = SKIN_SETS.find((s) => s.id === r.id);
  return (
    <motion.div initial={{ rotateY: 90, opacity: 0, scale: 0.8 }} animate={show ? { rotateY: 0, opacity: 1, scale: 1 } : { rotateY: 90, opacity: 0, scale: 0.8 }} transition={{ type: "spring", stiffness: 160, damping: 15 }}
      style={{ width: 138, padding: "12px 10px 10px", borderRadius: 14, background: "linear-gradient(180deg,#F4E8CE,#E6D3AA)", border: "2px solid " + rar.color, boxShadow: "0 0 0 2px rgba(0,0,0,.35), 0 0 " + (r.rarity === "legend" ? 26 : r.rarity === "epic" ? 18 : 10) + "px " + rar.color + "AA", textAlign: "center", position: "relative" }}>
      <span style={{ position: "absolute", top: -9, left: "50%", transform: "translateX(-50%)", fontSize: 10, fontWeight: 900, color: "#fff", background: rar.color, borderRadius: 999, padding: "2px 10px", boxShadow: "0 1px 3px rgba(0,0,0,.4)" }}>{t(rar.label)}</span>
      <div style={{ display: "flex", justifyContent: "center", marginTop: 6 }}><SetPreview id={r.id} /></div>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: T.ink, marginTop: 8, lineHeight: 1.25 }}>{set ? set.label : r.id}</div>
      <div style={{ marginTop: 6, fontSize: 11, fontWeight: 800, color: r.isNew ? "#2F7A3A" : "#8A5A0C", background: r.isNew ? "rgba(63,122,58,.14)" : "rgba(196,154,80,.2)", borderRadius: 8, padding: "3px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
        {r.isNew ? t("신규 획득") : <><span>{t("중복")}</span><CoinIcon size={14} /><span>+{r.refund}</span></>}
      </div>
    </motion.div>
  );
}

function GachaResultModal({ result, onClose }) {
  const n = result.results.length;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (shown >= n) return undefined;
    const id = setTimeout(() => setShown((x) => x + 1), shown === 0 ? 350 : 520);
    return () => clearTimeout(id);
  }, [shown, n]);
  const done = shown >= n;
  const newN = result.results.filter((x) => x.isNew).length;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(8,5,2,.9)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, overflowY: "auto" }}>
      <div style={{ maxWidth: 560, width: "100%", textAlign: "center", padding: "20px 0" }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: T.brassHi, fontFamily: SITE_FONT, marginBottom: 18, textShadow: "0 0 18px rgba(255,200,80,.5)" }}>{t("뽑기 결과")}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "center", perspective: 900 }}>
          {result.results.map((r, i) => <ResultCard key={i} r={r} index={i} show={i < shown} />)}
        </div>
        <div style={{ marginTop: 22, minHeight: 22, fontSize: 12.5, fontWeight: 700, color: T.ivory }}>
          {done && <>{tx("신규 {0}종", newN)}{result.refund > 0 && <> · {tx("중복 환급 +{0}코인", result.refund)}</>}</>}
        </div>
        <div style={{ marginTop: 14, display: "flex", gap: 10, justifyContent: "center" }}>
          {!done && <button onClick={() => setShown(n)} className="press" style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid " + T.brass, background: "transparent", color: T.brassHi, fontWeight: 800, fontSize: 13, cursor: "pointer" }}>{t("건너뛰기")}</button>}
          {done && <button onClick={onClose} className="press" style={{ padding: "10px 34px", borderRadius: 10, border: "none", background: "linear-gradient(180deg," + T.brassHi + "," + T.brass + ")", color: "#241509", fontWeight: 900, fontSize: 14, cursor: "pointer" }}>{t("확인")}</button>}
        </div>
      </div>
    </div>
  );
}

/** 도감 스킨 페이지 맨 위의 뽑기 구역. onPull(1|5) → { ok, results, refund, … }(App의 pullGacha). */
export function GachaSection({ coins, onPull }) {
  const [phase, setPhase] = useState("idle");
  const [result, setResult] = useState(null);
  const [rates, setRates] = useState(false);
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const busy = phase !== "idle";
  const pull = (count) => {
    if (busy || !onPull || (coins || 0) < GACHA_PRICE[count]) return;
    const r = onPull(count);
    if (!r || !r.ok) return;
    setPhase("shake");
    timers.current.push(setTimeout(() => setPhase("open"), 750), setTimeout(() => { setResult(r); }, 1650), setTimeout(() => setPhase("idle"), 1900));
  };
  const btn = (count, label, sub) => {
    const cost = GACHA_PRICE[count], can = !busy && (coins || 0) >= cost;
    return (
      <button onClick={() => pull(count)} disabled={!can} className="press" aria-label={label + " " + cost}
        style={{ flex: 1, minWidth: 0, padding: "10px 8px", borderRadius: 12, border: can ? "none" : "1px solid #5A4630", background: can ? "linear-gradient(180deg,#FFE493,#E0A020 55%,#B07410)" : "rgba(0,0,0,.28)", color: can ? "#241509" : "#8A7458", cursor: can ? "pointer" : "not-allowed", fontFamily: SITE_FONT, boxShadow: can ? "0 3px 0 #7A4C08, 0 6px 14px -4px rgba(0,0,0,.55)" : "none" }}>
        <div style={{ fontSize: 14, fontWeight: 900 }}>{label}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, fontSize: 13, fontWeight: 800, marginTop: 2 }}><CoinIcon size={18} />{cost.toLocaleString()}</div>
        {sub && <div style={{ fontSize: 10, fontWeight: 700, marginTop: 1, opacity: 0.85 }}>{sub}</div>}
      </button>
    );
  };
  return (
    <section aria-label={t("스킨 뽑기")} style={{ marginBottom: 20, padding: "16px 14px 14px", borderRadius: 16, border: "1px solid rgba(196,154,80,.45)", background: "radial-gradient(120% 90% at 50% 0%, rgba(196,154,80,.22), rgba(0,0,0,.2) 62%), linear-gradient(180deg,#2A1A0E,#170D06)", boxShadow: "inset 0 1px 0 rgba(255,230,160,.18)" }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 4, gap: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 900, color: T.brassHi, fontFamily: SITE_FONT }}>{t("스킨 뽑기")}</span>
        <span className="flex items-center gap-1" title={t("보유 중인 OC 나이트 코인")} style={{ background: "rgba(0,0,0,.35)", border: "1px solid " + T.brass, borderRadius: 999, padding: "3px 10px 3px 5px" }}>
          <CoinIcon size={20} /><span style={{ fontSize: 12.5, fontWeight: 800, color: T.brassHi, fontFamily: SITE_FONT }}>{(coins || 0).toLocaleString()}</span>
        </span>
      </div>
      <p style={{ fontSize: 11.5, color: T.ivory, opacity: 0.85, margin: "0 0 6px", lineHeight: 1.5 }}>{t("상자를 열어 스킨 세트 획득. 보드와 기물이 한 벌로 나옴")}</p>
      <div style={{ padding: "6px 8px 4px" }}><GachaChest phase={phase} /></div>
      <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
        {btn(1, t("1회 뽑기"), null)}
        {btn(5, t("5회 뽑기"), tx("{0}코인 절약", GACHA_PRICE[1] * 5 - GACHA_PRICE[5]))}
      </div>
      <button onClick={() => setRates((v) => !v)} className="press" aria-expanded={rates} style={{ marginTop: 10, background: "none", border: "none", color: T.brassHi, fontSize: 11.5, fontWeight: 800, cursor: "pointer", padding: 0, textDecoration: "underline" }}>{t("뽑기 확률")}</button>
      <AnimatePresence initial={false}>
        {rates && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: "hidden" }}>
            <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 10, background: "rgba(0,0,0,.3)" }}>
              {GACHA_POOL.map((p) => { const set = SKIN_SETS.find((s) => s.id === p.id), rar = GACHA_RARITY[p.rarity]; return (
                <div key={p.id} className="flex items-center" style={{ gap: 8, padding: "4px 0", fontSize: 12, color: T.ivory }}>
                  <span style={{ fontSize: 10, fontWeight: 900, color: "#fff", background: rar.color, borderRadius: 999, padding: "1px 8px", flexShrink: 0 }}>{t(rar.label)}</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{set ? set.label : p.id}</span>
                  <span style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{((p.weight / GACHA_TOTAL_WEIGHT) * 100).toFixed(0)}%</span>
                </div>
              ); })}
              <div style={{ fontSize: 11, color: T.ivory, opacity: 0.75, marginTop: 6, lineHeight: 1.5 }}>{tx("이미 가진 세트가 나오면 {0}코인 환급", GACHA_DUP_REFUND)}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {result && <GachaResultModal result={result} onClose={() => setResult(null)} />}
    </section>
  );
}
