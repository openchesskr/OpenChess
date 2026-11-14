// (v0.7.4) 모바일 가로 스와이프 페이지 — 학습 탭(성장 분석·최근 대국)과 플레이 탭(게임·퀘스트)이 이 하나를 같이 쓴다(완전히 같은 디자인).
// 다음 페이지가 오른쪽에 살짝 보이게(peek) 페이지 폭을 줄이고, 처음 한 번 넘기면 사라지는 "옆으로 밀어서 이동" 안내를 보여 준다. 위쪽 탭 줄·점·n/N 표시는 두지 않는다.
// pages: [{ key, node }]. 바깥 여백(18px)에 맞춰 좌우로 -18px 넓혀 그린다.
import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { ChevronsRight } from "./ocIcons.jsx";   // (v0.7.5) OpenChess 파셋 아이콘(예전 lucide 대체)
import { T } from "../lib/theme.js";
import { t } from "../lib/i18n.js";
import { LOOP } from "../lib/perfMode.js";
import { OffscreenPause } from "./offscreenPause.jsx";

const PAGER_SEEN_KEY = "oc_learn_pager_seen";
export function SwipePager({ pages, onIndexChange }) {   // (v0.7.6) onIndexChange(i): 지금 보이는 페이지가 바뀔 때(분석 탭 성장 분석이 보일 때만 자동 리뷰를 돌리려고)
  const scRef = useRef(null), pageRefs = useRef([]);
  const [idx, setIdx] = useState(0);
  const [hint, setHint] = useState(() => { try { return window.localStorage.getItem(PAGER_SEEN_KEY) !== "1"; } catch { return true; } });
  const raf = useRef(0);
  const onScroll = () => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const sc = scRef.current; if (!sc) return;
      const mid = sc.scrollLeft + sc.clientWidth / 2;
      let best = 0, bd = Infinity;
      pageRefs.current.forEach((el, i) => { if (!el) return; const d = Math.abs(el.offsetLeft + el.offsetWidth / 2 - mid); if (d < bd) { bd = d; best = i; } });
      setIdx(best);
      if (onIndexChange) onIndexChange(best);
      if (best > 0 || sc.scrollLeft > 24) { setHint(false); try { window.localStorage.setItem(PAGER_SEEN_KEY, "1"); } catch { } }
    });
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  return (
    <div>
      <div style={{ position: "relative" }}>
        <div ref={scRef} onScroll={onScroll} style={{ display: "flex", gap: 10, overflowX: "auto", scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch", margin: "0 -18px", padding: "2px 18px 6px", scrollPaddingLeft: 18, alignItems: "flex-start" }}>
          {pages.map((pg, i) => (
            <div key={pg.key} ref={(el) => { pageRefs.current[i] = el; }} role="tabpanel" style={{ flex: "0 0 calc(100% - 14px)", minWidth: 0, scrollSnapAlign: "center", opacity: i === idx ? 1 : 0.55, transform: i === idx ? "none" : "scale(.985)", transition: "opacity .25s, transform .25s", transformOrigin: "center top" }}>
              {/* (v0.7.7 렉 수정) 지금 보이지 않는 옆 페이지는 장식 애니메이션·반복 타이머를 멈춘다 */}
              <OffscreenPause visible={i === idx}>{pg.node}</OffscreenPause>
            </div>
          ))}
        </div>
        {hint && pages.length > 1 && (
          <motion.div aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
            style={{ position: "absolute", right: 0, top: 10, zIndex: 5, pointerEvents: "none", display: "flex", alignItems: "center", gap: 2, padding: "9px 10px 9px 14px", borderRadius: "999px 0 0 999px", background: "linear-gradient(90deg,rgba(21,12,6,.0),rgba(21,12,6,.92) 35%)", color: T.brassHi, fontSize: 11.5, fontWeight: 900 }}>
            {t("옆으로 밀어서 이동")}
            <motion.span animate={{ x: [0, 6, 0] }} transition={{ duration: 1.1, repeat: LOOP(), ease: "easeInOut" }} style={{ display: "flex" }}><ChevronsRight size={18} /></motion.span>
          </motion.div>
        )}
      </div>
    </div>
  );
}
