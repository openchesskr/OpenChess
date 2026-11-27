// (v0.7.8, 사용자 요청) 소셜 탭 오른쪽 영역(모바일은 옆으로 넘기는 2페이지) — 퍼즐 티어 박스 아래에
//  ① 리더보드(v0.8.0: 한 블록에 종목별로 옆으로 넘김 + 전체/친구 — 아래 Leaderboards)
//  ③ 친구 퍼즐 현황(내 친구들 + 나를 XP 순으로: 티어·퍼즐 레이팅·푼 퍼즐 수, 친구 중 내 순위).
//  모두 서버 공개 프로필(profiles.pub, 누구나 읽기)만 쓴다. 이름을 누르면 그 사람의 /user 페이지.
import { useEffect, useMemo, useRef, useState } from "react";
import { T } from "../lib/theme.js";
import { t, tx } from "../lib/i18n.js";
import { SITE_FONT } from "../components/engineLines.jsx";
import { SB_ON, sbRpc, sbSelect } from "../lib/supabaseClient.js";
import { tierFromXp, tierDisplayLabelArabic } from "../lib/tierSystem.js";
import { TierLogoDisc } from "../components/pieces.jsx";
import { Trophy, Users, Puzzle as PuzzleIcon, Swords, Crosshair, Route, Target, Castle, Medal } from "../components/ocIcons.jsx";
import { CHESS_RATING_CATS, TC_KEY_CAT } from "../lib/chessRating.js";
import { tcCatLabel } from "./common.jsx";
import { LoadingRows } from "../components/motionKit.jsx";

const BOARD_N = 10;
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
const xpOf = (pub) => num(pub && pub.xp, 0);
const ratingOf = (pub) => num(pub && pub.puzzleRating, 800);
const fmt = (n) => Math.round(n).toLocaleString();
// 서버 응답(행 모양이 틀리면 버림)
const cleanRows = (r) => (Array.isArray(r) ? r.filter((x) => x && x.id && typeof x.username === "string").map((x) => ({ id: x.id, username: x.username, pub: x.pub && typeof x.pub === "object" ? x.pub : {} })) : []);


const card = { background: T.paper, border: "1px solid #DCCBA8", borderRadius: 14, padding: "12px 12px 8px", marginBottom: 12, boxShadow: "0 3px 0 #B59A6E" };
function CardHead({ Icon, title, sub }) {
  return (
    <div className="flex items-center" style={{ gap: 8, marginBottom: 8 }}>
      <span style={{ width: 28, height: 28, borderRadius: 9, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "rgba(168,132,47,.16)", border: "1px solid rgba(168,132,47,.4)", color: "#8A6C2F" }}><Icon size={15} /></span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 900, color: T.ink, lineHeight: 1.2 }}>{title}</div>
        {sub && <div style={{ fontSize: 10.5, color: T.inkSoft }}>{sub}</div>}
      </div>
    </div>
  );
}
const MEDAL = ["#E2B84A", "#B9C0C8", "#C98A5A"];
function Row({ rank, row, value, valueLabel, me, onOpenProfile, extra }) {
  const info = tierFromXp(xpOf(row.pub));
  return (
    <button type="button" onClick={() => onOpenProfile && onOpenProfile(row.username)} className="press"
      style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "6px 6px", borderRadius: 9, border: "none", background: me ? "rgba(196,154,80,.18)" : "transparent", cursor: "pointer", textAlign: "left" }}>
      <span style={{ width: 22, flexShrink: 0, textAlign: "center", fontFamily: SITE_FONT, fontSize: 12.5, fontWeight: 900, color: rank <= 3 ? MEDAL[rank - 1] : T.inkSoft, textShadow: rank <= 3 ? "0 1px 0 rgba(0,0,0,.25)" : "none" }}>{rank}</span>
      <TierLogoDisc tierKey={info.tier.key} division={info.division} size={24} discSize={27} />
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "block", fontSize: 12.5, fontWeight: 800, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.username}{me ? " · " + t("나") : ""}</span>
        <span style={{ display: "block", fontSize: 10, color: T.inkSoft, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tierDisplayLabelArabic(info)}{extra ? " · " + extra : ""}</span>
      </span>
      <span style={{ flexShrink: 0, textAlign: "right" }}>
        <span style={{ display: "block", fontFamily: SITE_FONT, fontSize: 13, fontWeight: 900, color: T.ink, fontVariantNumeric: "tabular-nums" }}>{value}</span>
        <span style={{ display: "block", fontSize: 9.5, fontWeight: 700, color: T.inkSoft }}>{valueLabel}</span>
      </span>
    </button>
  );
}

/* (v0.8.0, 사용자 요청) 리더보드 — 블록 하나에 종목별 순위를 옆으로 넘겨 본다(스크롤 스냅). 위쪽 이름표를 눌러도 그 종목으로 간다.
   종목: 일반 대국(시간 분류 불릿·블리츠·래피드·스탠다드) · 미니게임 4종 · 퍼즐 XP · 퍼즐 레이팅 · 칭호 수. 이름은 "퍼즐 XP"처럼 종목명만.
   오른쪽 위 전체/친구 토글 — 전체는 서버 순위, 친구는 나 + 수락된 친구 안에서의 순위.
   · 일반 대국·미니게임: minigame_leaderboard(p_scope 'all' | 'friends') — 레이팅 대전 3판 이상만(서버 규칙)
   · 퍼즐 XP·퍼즐 레이팅: 전체는 leaderboard_top·puzzle_rating_leaderboard, 친구는 친구 공개 프로필을 받아 화면에서 줄세움
   · 칭호 수: 공개 프로필 pub.achv.earned 순(jsonb 숫자 정렬), 친구도 같은 값 */
const LB_PAGES = [
  { key: "chess", label: () => t("일반 대국"), Icon: Swords, kind: "mg" },
  { key: "coord", label: () => t("좌표 인지 게임"), Icon: Crosshair, kind: "mg" },
  { key: "knight", label: () => t("나이트 레이스"), Icon: Route, kind: "mg" },
  { key: "attack", label: () => t("무한 체크메이트 게임"), Icon: Target, kind: "mg" },
  { key: "rush", label: () => t("백랭크 러시아워"), Icon: Castle, kind: "mg" },
  { key: "xp", label: () => t("퍼즐 XP"), Icon: Trophy, kind: "pz" },
  { key: "rating", label: () => t("퍼즐 레이팅"), Icon: PuzzleIcon, kind: "pz" },
  { key: "titles", label: () => t("칭호"), Icon: Medal, kind: "pz" },
];
const TC_CATS = CHESS_RATING_CATS;   // bullet·blitz·rapid·standard
const earnedOf = (pub) => num(pub && pub.achv && pub.achv.earned, 0);
const mgRows = (r) => (Array.isArray(r) ? r.filter((x) => x && x.uid && typeof x.username === "string").map((x) => ({ id: x.uid, username: x.username, pub: x.pub && typeof x.pub === "object" ? x.pub : {}, rating: num(x.rating, 0), games: num(x.rated_games, 0), rank: num(x.rank, 0), isMe: !!x.is_me })) : []);

function useBoardRows(page, scope, tc, friendIds, me, active) {
  const [rows, setRows] = useState(undefined);   // undefined: 아직 안 봄, null: 불러오는 중
  const sig = page.key + "|" + scope + "|" + (page.key === "chess" ? tc : "") + "|" + (scope === "friends" ? friendIds.join(",") + "|" + ((me && me.uid) || "") : "");
  useEffect(() => {
    if (!active) return undefined;
    if (!SB_ON) { setRows([]); return undefined; }
    let off = false; setRows(null);
    const done = (r) => { if (!off) setRows(r); };
    const fail = () => { if (!off) setRows([]); };
    if (page.kind === "mg") {
      sbRpc("minigame_leaderboard", { p_game: page.key === "chess" ? "chess_" + tc : page.key, p_kind: "rating", p_scope: scope, p_limit: BOARD_N }).then((r) => done(mgRows(r))).catch(fail);
    } else if (scope === "friends") {
      const ids = [...new Set([...friendIds, me && me.uid].filter(Boolean))];   // 나도 함께 받아 내 칭호 수(pub.achv)까지 서버 값으로
      if (!ids.length) { done([]); return () => { off = true; }; }
      sbSelect("profiles?select=id,username,pub&id=in.(" + ids.join(",") + ")").then((r) => done(cleanRows(r))).catch(fail);
    } else if (page.key === "xp") sbRpc("leaderboard_top", { p_limit: BOARD_N }).then((r) => done(cleanRows(r))).catch(fail);
    else if (page.key === "rating") sbRpc("puzzle_rating_leaderboard", { p_limit: BOARD_N }).then((r) => done(cleanRows(r))).catch(fail);
    else sbSelect("profiles?select=id,username,pub&deletion_scheduled_at=is.null&order=pub->achv->earned.desc.nullslast,username.asc&limit=" + BOARD_N).then((r) => done(cleanRows(r))).catch(fail);
    return () => { off = true; };
  }, [sig, active]);   // eslint-disable-line react-hooks/exhaustive-deps
  // 퍼즐 종목: 값 계산 + (친구 범위면) 나를 넣어 화면에서 줄세움
  return useMemo(() => {
    if (rows == null) return rows;
    if (page.kind === "mg") return rows;
    const valueOf = page.key === "xp" ? (r) => xpOf(r.pub) : page.key === "rating" ? (r) => ratingOf(r.pub) : (r) => earnedOf(r.pub);
    let list = rows.map((r) => ({ ...r, isMe: !!me && r.id === me.uid }));
    // 내 퍼즐 XP·레이팅은 서버 공개값보다 이 기기 값이 최신일 수 있어 덮어쓴다(칭호 수는 서버 값)
    list = list.map((r) => (r.isMe && me ? { ...r, pub: { ...r.pub, xp: me.xp, puzzleRating: me.rating } } : r));
    if (scope === "friends" && me && me.uid && !list.some((r) => r.isMe)) list.push({ id: me.uid, username: me.username || t("나"), pub: { xp: me.xp, puzzleRating: me.rating }, isMe: true });
    if (scope === "friends") list = list.sort((a, b) => valueOf(b) - valueOf(a) || String(a.username).localeCompare(String(b.username)));
    return list.map((r, i) => ({ ...r, rank: i + 1, value: valueOf(r) }));
  }, [rows, page.key, scope, me && me.uid, me && me.xp, me && me.rating]);   // eslint-disable-line react-hooks/exhaustive-deps
}

function BoardPage({ page, scope, friendIds, me, active, onOpenProfile }) {
  const [tc, setTc] = useState("blitz");
  const rows = useBoardRows(page, scope, tc, friendIds, me, active);
  const valueLabel = page.key === "xp" ? "XP" : page.key === "titles" ? t("칭호") : t("레이팅");
  const loginNeeded = scope === "friends" && !(me && me.uid);
  return (
    <div style={{ flex: "0 0 100%", minWidth: 0, scrollSnapAlign: "start", padding: "0 2px" }} role="tabpanel" aria-label={page.label()}>
      {page.key === "chess" && (
        <div className="flex" style={{ gap: 5, margin: "0 0 6px", flexWrap: "wrap" }}>
          {TC_CATS.map((c) => (
            <button key={c} type="button" onClick={() => setTc(c)} className="press" aria-pressed={tc === c}
              style={{ height: 24, padding: "0 9px", borderRadius: 999, border: "1px solid " + (tc === c ? "#A8842F" : "#DCCBA8"), background: tc === c ? "rgba(196,154,80,.2)" : "transparent", color: tc === c ? "#5A3A22" : T.inkSoft, fontSize: 11, fontWeight: 800, cursor: "pointer" }}>{tcCatLabel(TC_KEY_CAT[c])}</button>
          ))}
        </div>
      )}
      {loginNeeded ? <p style={{ fontSize: 12, color: T.inkSoft, margin: "6px 2px 10px" }}>{t("로그인하면 친구 순위를 볼 수 있음")}</p>
        : rows == null ? <LoadingRows lines={5} height={18} gap={10} label={t("불러오는 중…")} />
        : !rows.length ? <p style={{ fontSize: 12, color: T.inkSoft, margin: "6px 2px 10px" }}>{page.kind === "mg" ? t("표시할 기록 없음. 레이팅 대전을 3판 이상 두면 순위에 오름") : t("표시할 기록 없음")}</p>
        : rows.map((r) => (
          <Row key={r.id} rank={r.rank} row={r} me={r.isMe} onOpenProfile={onOpenProfile}
            value={fmt(page.kind === "mg" ? r.rating : r.value)} valueLabel={valueLabel}
            extra={page.kind === "mg" ? tx("{0}판", fmt(r.games)) : null} />
        ))}
    </div>
  );
}

function Leaderboards({ me, friendUids, onOpenProfile }) {
  const [scope, setScope] = useState("all");
  const [idx, setIdx] = useState(0);
  const [seen, setSeen] = useState(() => new Set([0]));   // 한 번 본 종목만 불러온다(넘기기 전까지 8번 요청하지 않게)
  const scRef = useRef(null), raf = useRef(0);
  const friendIds = useMemo(() => [...new Set((friendUids || []).filter(Boolean))].slice(0, 100).sort(), [friendUids]);
  const go = (i) => { const sc = scRef.current; if (sc) sc.scrollTo({ left: i * sc.clientWidth, behavior: "smooth" }); };
  const onScroll = () => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => { const sc = scRef.current; if (!sc || !sc.clientWidth) return; const i = Math.round(sc.scrollLeft / sc.clientWidth); setIdx(i); setSeen((s) => (s.has(i) ? s : new Set([...s, i]))); });
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const tabsRef = useRef(null);
  useEffect(() => { const el = tabsRef.current && tabsRef.current.children[idx]; if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest", inline: "nearest" }); }, [idx]);
  const page = LB_PAGES[idx] || LB_PAGES[0];
  return (
    <section style={card} aria-label={t("리더보드")}>
      <div className="flex items-center" style={{ gap: 8, marginBottom: 8 }}>
        <span style={{ width: 28, height: 28, borderRadius: 9, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "rgba(168,132,47,.16)", border: "1px solid rgba(168,132,47,.4)", color: "#8A6C2F" }}><page.Icon size={15} /></span>
        <div style={{ minWidth: 0, flex: 1, fontSize: 13.5, fontWeight: 900, color: T.ink, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{page.label()}</div>
        {/* 전체/친구 토글 */}
        <div role="group" aria-label={t("순위 범위")} style={{ display: "inline-flex", flexShrink: 0, padding: 2, borderRadius: 999, background: "rgba(90,58,34,.1)", border: "1px solid #DCCBA8" }}>
          {[["all", t("전체")], ["friends", t("친구")]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setScope(k)} aria-pressed={scope === k} className="press"
              style={{ height: 24, padding: "0 11px", borderRadius: 999, border: "none", background: scope === k ? "#5A3A22" : "transparent", color: scope === k ? T.ivoryHi : T.inkSoft, fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}>{l}</button>
          ))}
        </div>
      </div>
      {/* 종목 이름표 — 누르면 그 종목으로 넘어간다 */}
      <div ref={tabsRef} role="tablist" className="no-scrollbar" style={{ display: "flex", gap: 5, overflowX: "auto", margin: "0 -2px 8px", padding: "0 2px 2px", scrollbarWidth: "none" }}>
        {LB_PAGES.map((p, i) => (
          <button key={p.key} type="button" role="tab" aria-selected={i === idx} onClick={() => go(i)} className="press"
            style={{ flexShrink: 0, height: 24, padding: "0 9px", borderRadius: 7, border: "1px solid " + (i === idx ? "#A8842F" : "transparent"), background: i === idx ? "rgba(196,154,80,.18)" : "rgba(90,58,34,.06)", color: i === idx ? "#5A3A22" : T.inkSoft, fontSize: 11, fontWeight: 800, whiteSpace: "nowrap", cursor: "pointer" }}>{p.label()}</button>
        ))}
      </div>
      <div ref={scRef} onScroll={onScroll} className="no-scrollbar" style={{ display: "flex", overflowX: "auto", scrollSnapType: "x mandatory", overscrollBehaviorX: "contain", scrollbarWidth: "none" }}>
        {LB_PAGES.map((p, i) => <BoardPage key={p.key} page={p} scope={scope} friendIds={friendIds} me={me} active={seen.has(i)} onOpenProfile={onOpenProfile} />)}
      </div>
      {/* 넘김 점 */}
      <div className="flex justify-center" style={{ gap: 4, marginTop: 6 }} aria-hidden="true">
        {LB_PAGES.map((p, i) => <span key={p.key} style={{ width: i === idx ? 14 : 5, height: 5, borderRadius: 999, background: i === idx ? "#A8842F" : "rgba(90,58,34,.22)", transition: "width .2s" }} />)}
      </div>
    </section>
  );
}

/* 친구 퍼즐 현황 — 친구들 + 나를 퍼즐 XP 순으로, 티어·레이팅·푼 퍼즐 수. me: { uid, username, xp, rating, solved } */
function FriendsPuzzle({ friendUids, me, onOpenProfile }) {
  const ids = useMemo(() => [...new Set((friendUids || []).filter(Boolean))].slice(0, 100), [friendUids]);
  const [rows, setRows] = useState(null);
  useEffect(() => {
    if (!SB_ON || !ids.length) { setRows([]); return undefined; }
    let off = false; setRows(null);
    sbSelect("profiles?select=id,username,pub&id=in.(" + ids.join(",") + ")").then((r) => { if (!off) setRows(cleanRows(r)); }).catch(() => { if (!off) setRows([]); });
    return () => { off = true; };
  }, [ids.join(",")]);   // eslint-disable-line react-hooks/exhaustive-deps
  const list = useMemo(() => {
    const out = (rows || []).map((r) => ({ ...r, me: false }));
    if (me && me.uid) out.push({ id: me.uid, username: me.username || t("나"), pub: { xp: me.xp, puzzleRating: me.rating, solvedCount: me.solved }, me: true });
    return out.sort((a, b) => xpOf(b.pub) - xpOf(a.pub) || ratingOf(b.pub) - ratingOf(a.pub));
  }, [rows, me && me.uid, me && me.xp, me && me.rating, me && me.solved]);   // eslint-disable-line react-hooks/exhaustive-deps
  const myRank = list.findIndex((r) => r.me) + 1;
  return (
    <section style={card} aria-label={t("친구 퍼즐 현황")}>
      <CardHead Icon={Users} title={t("친구 퍼즐 현황")} sub={ids.length ? tx("친구 {0}명 중 내 순위 {1}위", ids.length, myRank || "–") : null} />
      {!me || !me.uid ? <p style={{ fontSize: 12, color: T.inkSoft, margin: "4px 2px 8px" }}>{t("로그인하면 친구들의 퍼즐 티어와 레이팅을 볼 수 있음")}</p>
        : !ids.length ? <p style={{ fontSize: 12, color: T.inkSoft, margin: "4px 2px 8px" }}>{t("아직 친구 없음. 친구를 추가하면 퍼즐 티어·레이팅을 함께 비교")}</p>
        : rows === null ? <LoadingRows lines={3} height={18} gap={10} label={t("불러오는 중…")} />
        : list.map((r, i) => (
          <Row key={r.id} rank={i + 1} row={r} me={r.me} onOpenProfile={onOpenProfile}
            value={fmt(xpOf(r.pub))} valueLabel="XP" extra={tx("레이팅 {0} · {1}개 풀이", fmt(ratingOf(r.pub)), fmt(num(r.pub.solvedCount, 0)))} />
        ))}
    </section>
  );
}

export function PuzzleSidePanels({ myUid, me, friendUids, onOpenProfile }) {
  return (
    <>
      <Leaderboards me={me} friendUids={friendUids} onOpenProfile={onOpenProfile} />
      <FriendsPuzzle friendUids={friendUids} me={me} onOpenProfile={onOpenProfile} />
    </>
  );
}
