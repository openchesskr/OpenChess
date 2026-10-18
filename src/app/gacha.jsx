// (v0.6.9) 스킨 뽑기 화면 — 도감 스킨 페이지 맨 위의 상자(흑백 체크 + 금장, 가운데 금빛 킹과 열쇠 구멍)와 1회·5회 뽑기 버튼, 결과 창.
//  뽑기 규칙·가격·확률은 lib/gacha.js(순수 모듈), 코인·보유 목록 반영은 App의 pullGacha가 맡는다. 여기는 보여주기만 한다.
import { useState, useEffect, useRef, useId } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { T, BOARD_SKINS, SKIN_SETS, boardSquareBg, BOARD_GLOSS } from "../lib/theme.js";
import { PieceGlyph } from "../components/pieces.jsx";
import { CoinIcon } from "./common.jsx";
import { GACHA_PRICE, GACHA_POOL, GACHA_RARITY, GACHA_TOTAL_WEIGHT } from "../lib/gacha.js";
import { SITE_FONT } from "../components/engineLines.jsx";
import { t } from "../lib/i18n.js";

const GOLD = ["#FFE493", "#E8AE2A", "#B07410"];
const PIECE_NAME = { P: () => t("폰"), N: () => t("나이트"), B: () => t("비숍"), R: () => t("룩"), Q: () => t("퀸"), K: () => t("킹") };
const setLabel = (id) => (id === "grandmaster" ? t("그랜드마스터") : (SKIN_SETS.find((x) => x.id === id) || {}).label || id);

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

/** 뽑기 연출의 빛 — 틈 없이 이어지는 방사형 빛줄기(밝은 줄과 덜 밝은 줄이 번갈아 가며 한 번도 투명해지지 않는다). */
function LightBurst({ level = 1 }) {
  const mask = "radial-gradient(circle at 50% 50%, #000 0%, #000 22%, rgba(0,0,0,.55) 48%, transparent 72%)";
  return (
    <motion.div aria-hidden initial={false} animate={{ opacity: level, scale: level ? 1 : 0.3 }} transition={{ duration: 0.7, ease: "easeOut" }}
      style={{ position: "absolute", left: "50%", top: "46%", width: "190vmax", height: "190vmax", marginLeft: "-95vmax", marginTop: "-95vmax", pointerEvents: "none" }}>
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 26, repeat: Infinity, ease: "linear" }}
        style={{ position: "absolute", inset: 0, background: "repeating-conic-gradient(from 0deg at 50% 50%, rgba(255,232,150,.85) 0deg 7.5deg, rgba(255,196,80,.34) 7.5deg 15deg)", WebkitMaskImage: mask, maskImage: mask }} />
      <div style={{ position: "absolute", inset: "38%", borderRadius: "50%", background: "radial-gradient(circle, rgba(255,250,220,.95), rgba(255,214,110,.5) 45%, transparent 72%)" }} />
    </motion.div>
  );
}

/** 뽑은 기물 카드 — 등급색 테두리 안에 기물 하나. */
function ResultCard({ r, show }) {
  const rar = GACHA_RARITY[r.rarity];
  return (
    <motion.div initial={{ rotateY: 90, opacity: 0, scale: 0.8 }} animate={show ? { rotateY: 0, opacity: 1, scale: 1 } : { rotateY: 90, opacity: 0, scale: 0.8 }} transition={{ type: "spring", stiffness: 160, damping: 15 }}
      style={{ width: 118, padding: "14px 8px 10px", borderRadius: 14, background: "linear-gradient(180deg,#F4E8CE,#E6D3AA)", border: "2px solid " + rar.color, boxShadow: "0 0 0 2px rgba(0,0,0,.35), 0 0 " + (r.rarity === "legend" ? 26 : r.rarity === "epic" ? 18 : 10) + "px " + rar.color + "AA", textAlign: "center", position: "relative" }}>
      <span style={{ position: "absolute", top: -9, left: "50%", transform: "translateX(-50%)", fontSize: 10, fontWeight: 900, color: "#fff", background: rar.color, borderRadius: 999, padding: "2px 10px", boxShadow: "0 1px 3px rgba(0,0,0,.4)" }}>{t(rar.label)}</span>
      <div style={{ width: 84, height: 84, margin: "6px auto 0", borderRadius: "50%", border: "3px solid " + rar.color, background: "radial-gradient(circle at 50% 35%, #5A4630, #2A1B10)", display: "flex", alignItems: "flex-end", justifyContent: "center", overflow: "hidden" }}>
        <PieceGlyph type={r.piece} color="w" size={76} pieceSkin={r.id} />
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 900, color: T.ink, marginTop: 8, lineHeight: 1.2 }}>{PIECE_NAME[r.piece]()}</div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: T.inkSoft, marginTop: 1 }}>{setLabel(r.id)}</div>
      <div style={{ marginTop: 6, fontSize: 11, fontWeight: 800, color: r.isNew ? "#2F7A3A" : "#8A5A0C", background: r.isNew ? "rgba(63,122,58,.14)" : "rgba(196,154,80,.2)", borderRadius: 8, padding: "3px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
        {r.isNew ? t("신규 획득") : <><span>{t("중복")}</span><CoinIcon size={14} /><span>+{r.refund}</span></>}
      </div>
    </motion.div>
  );
}

/** 세트의 기물 6종을 모두 모아 보드가 해금될 때의 연출 — 칸이 하나씩 차오르고 금빛이 한 번 훑고 지나간다. */
export function BoardUnlockScene({ id, onDone }) {
  const bsk = BOARD_SKINS[id], rar = GACHA_RARITY[(GACHA_POOL.find((p) => p.id === id) || {}).rarity] || GACHA_RARITY.legend;
  const [done, setDone] = useState(false);
  useEffect(() => { const k = setTimeout(() => setDone(true), 1700); return () => clearTimeout(k); }, []);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22 }}>
      <LightBurst level={0.5} />
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} style={{ position: "relative", fontSize: 20, fontWeight: 900, color: T.brassHi, fontFamily: SITE_FONT, textShadow: "0 0 18px rgba(255,200,80,.7)" }}>{t("보드 해금")}</motion.div>
      <div style={{ position: "relative", width: "min(76vw, 320px)", aspectRatio: "1", borderRadius: 6, overflow: "hidden", boxShadow: "0 0 0 3px " + rar.color + ", 0 0 40px " + rar.color + "AA", display: "grid", gridTemplateColumns: "repeat(8,1fr)", gridTemplateRows: "repeat(8,1fr)", ...BOARD_GLOSS }}>
        {Array.from({ length: 64 }).map((_, i) => {
          const r = Math.floor(i / 8), c = i % 8;
          return <motion.div key={i} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.35 + (r + c) * 0.055, type: "spring", stiffness: 260, damping: 18 }} style={boardSquareBg(bsk, (r + c) % 2 === 0, r, c)} />;
        })}
        <motion.div initial={{ x: "-120%" }} animate={{ x: "120%" }} transition={{ delay: 1.0, duration: 0.9, ease: "easeInOut" }}
          style={{ position: "absolute", inset: 0, background: "linear-gradient(105deg, transparent 35%, rgba(255,246,200,.85) 50%, transparent 65%)", pointerEvents: "none" }} />
      </div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }} style={{ position: "relative", fontSize: 15, fontWeight: 900, color: T.ivoryHi, fontFamily: SITE_FONT }}>{setLabel(id)}</motion.div>
      <button onClick={onDone} disabled={!done} className="press" style={{ position: "relative", padding: "10px 34px", borderRadius: 10, border: "none", background: "linear-gradient(180deg," + T.brassHi + "," + T.brass + ")", color: "#241509", fontWeight: 900, fontSize: 14, cursor: done ? "pointer" : "default", opacity: done ? 1 : 0, transition: "opacity .3s" }}>{t("확인")}</button>
    </motion.div>
  );
}

/** 뽑기 연출 무대 — 주변이 어두워지며 상자가 화면 한가운데로 오고, 흔들린 뒤 열리며 빛이 터지고, 뽑은 기물 카드(그리고 보드 해금)가 이어진다. */
function GachaStage({ stage, onClose }) {
  const { r, phase } = stage;
  const n = r.results.length;
  const [shown, setShown] = useState(0);
  const [bi, setBi] = useState(-1);          // 보드 해금 연출 순번(-1 = 아직 카드 단계)
  const showCards = phase === "cards";
  useEffect(() => {
    if (!showCards || bi >= 0 || shown >= n) return undefined;
    const id = setTimeout(() => setShown((x) => x + 1), shown === 0 ? 300 : 480);
    return () => clearTimeout(id);
  }, [showCards, shown, n, bi]);
  const cardsDone = shown >= n;
  const next = () => { if (r.boardUnlocked.length && bi + 1 < r.boardUnlocked.length) setBi(bi + 1); else onClose(); };
  const chestPhase = phase === "shake" ? "shake" : phase === "open" ? "open" : phase === "cards" ? "open" : "idle";
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}
      style={{ position: "fixed", inset: 0, zIndex: 400, background: "radial-gradient(120% 90% at 50% 45%, rgba(30,18,8,.96), rgba(4,2,1,.99))", overflow: "hidden" }}>
      {bi < 0 && <LightBurst level={phase === "open" ? 1 : phase === "cards" ? 0.3 : 0} />}
      <AnimatePresence>
        {bi < 0 && !showCards && (
          <motion.div key="chest" exit={{ opacity: 0, scale: 1.15 }} transition={{ duration: 0.4 }} style={{ position: "absolute", left: "50%", top: "46%", width: "min(78vw, 330px)", transform: "translate(-50%,-50%)" }}>
            <motion.div layoutId="gacha-chest" transition={{ type: "spring", stiffness: 110, damping: 20 }}><GachaChest phase={chestPhase} /></motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {showCards && bi < 0 && (
        <div style={{ position: "absolute", inset: 0, overflowY: "auto", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ maxWidth: 560, width: "100%", textAlign: "center", padding: "20px 0" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "center", perspective: 900 }}>
              {r.results.map((x, i) => <ResultCard key={i} r={x} show={i < shown} />)}
            </div>
            <div style={{ marginTop: 26, display: "flex", gap: 10, justifyContent: "center" }}>
              {!cardsDone && <button onClick={() => setShown(n)} className="press" style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid " + T.brass, background: "transparent", color: T.brassHi, fontWeight: 800, fontSize: 13, cursor: "pointer" }}>{t("건너뛰기")}</button>}
              {cardsDone && <button onClick={next} className="press" style={{ padding: "10px 34px", borderRadius: 10, border: "none", background: "linear-gradient(180deg," + T.brassHi + "," + T.brass + ")", color: "#241509", fontWeight: 900, fontSize: 14, cursor: "pointer" }}>{t("확인")}</button>}
            </div>
          </div>
        </div>
      )}
      {bi >= 0 && <BoardUnlockScene key={r.boardUnlocked[bi]} id={r.boardUnlocked[bi]} onDone={next} />}
    </motion.div>
  );
}

/** 도감 스킨 페이지 맨 위의 뽑기 구역. onPull(1|5) → { ok, results, boardUnlocked, … }(App의 pullGacha). */
export function GachaSection({ coins, onPull }) {
  const [stage, setStage] = useState(null);
  const [rates, setRates] = useState(false);
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const busy = !!stage;
  const pull = (count) => {
    if (busy || !onPull || (coins || 0) < GACHA_PRICE[count]) return;
    const r = onPull(count);
    if (!r || !r.ok) return;
    setStage({ r, phase: "enter" });
    const go = (ms, phase) => timers.current.push(setTimeout(() => setStage((s) => (s ? { ...s, phase } : s)), ms));
    go(900, "shake"); go(1700, "open"); go(2700, "cards");
  };
  const btn = (count, label) => {
    const cost = GACHA_PRICE[count], can = !busy && (coins || 0) >= cost;
    return (
      <button onClick={() => pull(count)} disabled={!can} className="press" aria-label={label + " " + cost}
        style={{ flex: 1, minWidth: 0, padding: "10px 8px", borderRadius: 12, border: can ? "none" : "1px solid #5A4630", background: can ? "linear-gradient(180deg,#FFE493,#E0A020 55%,#B07410)" : "rgba(0,0,0,.28)", color: can ? "#241509" : "#8A7458", cursor: can ? "pointer" : "not-allowed", fontFamily: SITE_FONT, boxShadow: can ? "0 3px 0 #7A4C08, 0 6px 14px -4px rgba(0,0,0,.55)" : "none" }}>
        <div style={{ fontSize: 14, fontWeight: 900 }}>{label}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, fontSize: 13, fontWeight: 800, marginTop: 2 }}><CoinIcon size={18} />{cost.toLocaleString()}</div>
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
      <div style={{ padding: "6px 8px 4px", maxWidth: 290, margin: "0 auto", aspectRatio: "240 / 224" }}>
        {!stage && <motion.div layoutId="gacha-chest" transition={{ type: "spring", stiffness: 110, damping: 20 }}><GachaChest phase="idle" /></motion.div>}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
        {btn(1, t("1회 뽑기"))}
        {btn(5, t("5회 뽑기"))}
      </div>
      <button onClick={() => setRates((v) => !v)} className="press" aria-expanded={rates} style={{ marginTop: 10, background: "none", border: "none", color: T.brassHi, fontSize: 11.5, fontWeight: 800, cursor: "pointer", padding: 0, textDecoration: "underline" }}>{t("뽑기 확률")}</button>
      <AnimatePresence initial={false}>
        {rates && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: "hidden" }}>
            <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 10, background: "rgba(0,0,0,.3)" }}>
              {GACHA_POOL.map((p) => { const rar = GACHA_RARITY[p.rarity]; return (
                <div key={p.id} className="flex items-center" style={{ gap: 8, padding: "4px 0", fontSize: 12, color: T.ivory }}>
                  <span style={{ fontSize: 10, fontWeight: 900, color: "#fff", background: rar.color, borderRadius: 999, padding: "1px 8px", flexShrink: 0 }}>{t(rar.label)}</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{setLabel(p.id)}</span>
                  <span style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{((p.weight / GACHA_TOTAL_WEIGHT) * 100).toFixed(0)}%</span>
                </div>
              ); })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>{stage && <GachaStage key="stage" stage={stage} onClose={() => { timers.current.forEach(clearTimeout); timers.current = []; setStage(null); }} />}</AnimatePresence>
    </section>
  );
}
