// (v0.7.8, 사용자 요청) 소셜 탭 오른쪽 영역(모바일은 옆으로 넘기는 2페이지) — 퍼즐 티어 박스 아래에
//  ① 퍼즐 XP 리더보드(leaderboard_top — profiles.pub.xp 순) ② 퍼즐 레이팅 리더보드(puzzle_rating_leaderboard — pub.puzzleRating 순)
//  ③ 친구 퍼즐 현황(내 친구들 + 나를 XP 순으로: 티어·퍼즐 레이팅·푼 퍼즐 수, 친구 중 내 순위).
//  모두 서버 공개 프로필(profiles.pub, 누구나 읽기)만 쓴다. 이름을 누르면 그 사람의 /user 페이지.
import { useEffect, useMemo, useState } from "react";
import { T } from "../lib/theme.js";
import { t, tx } from "../lib/i18n.js";
import { SITE_FONT } from "../components/engineLines.jsx";
import { SB_ON, sbRpc, sbSelect } from "../lib/supabaseClient.js";
import { tierFromXp, tierDisplayLabelArabic } from "../lib/tierSystem.js";
import { TierLogoDisc } from "../components/pieces.jsx";
import { Trophy, Users, Puzzle as PuzzleIcon } from "../components/ocIcons.jsx";
import { LoadingRows } from "../components/motionKit.jsx";

const BOARD_N = 10;
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
const xpOf = (pub) => num(pub && pub.xp, 0);
const ratingOf = (pub) => num(pub && pub.puzzleRating, 800);
const fmt = (n) => Math.round(n).toLocaleString();
// 서버 응답(행 모양이 틀리면 버림)
const cleanRows = (r) => (Array.isArray(r) ? r.filter((x) => x && x.id && typeof x.username === "string").map((x) => ({ id: x.id, username: x.username, pub: x.pub && typeof x.pub === "object" ? x.pub : {} })) : []);

function useRpcRows(fn, args, enabled = true) {
  const [rows, setRows] = useState(null);
  const sig = JSON.stringify(args);
  useEffect(() => {
    if (!enabled || !SB_ON) { setRows([]); return undefined; }
    let off = false; setRows(null);
    sbRpc(fn, args).then((r) => { if (!off) setRows(cleanRows(r)); }).catch(() => { if (!off) setRows([]); });
    return () => { off = true; };
  }, [fn, sig, enabled]);   // eslint-disable-line react-hooks/exhaustive-deps
  return rows;
}

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

function Leaderboard({ Icon, title, sub, rows, valueOf, valueLabel, myUid, onOpenProfile }) {
  return (
    <section style={card} aria-label={title}>
      <CardHead Icon={Icon} title={title} sub={sub} />
      {rows === null ? <LoadingRows lines={5} height={18} gap={10} label={t("불러오는 중…")} />
        : !rows.length ? <p style={{ fontSize: 12, color: T.inkSoft, margin: "4px 2px 8px" }}>{t("표시할 기록 없음")}</p>
        : rows.map((r, i) => <Row key={r.id} rank={i + 1} row={r} value={valueOf(r)} valueLabel={valueLabel} me={r.id === myUid} onOpenProfile={onOpenProfile} />)}
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
  const xpRows = useRpcRows("leaderboard_top", { p_limit: BOARD_N });
  const ratingRows = useRpcRows("puzzle_rating_leaderboard", { p_limit: BOARD_N });
  return (
    <>
      <Leaderboard Icon={Trophy} title={t("퍼즐 XP 리더보드")} sub={t("퍼즐을 풀어 모은 XP 순")} rows={xpRows} valueOf={(r) => fmt(xpOf(r.pub))} valueLabel="XP" myUid={myUid} onOpenProfile={onOpenProfile} />
      <Leaderboard Icon={PuzzleIcon} title={t("퍼즐 레이팅 리더보드")} sub={t("퍼즐 레이팅 높은 순")} rows={ratingRows} valueOf={(r) => fmt(ratingOf(r.pub))} valueLabel={t("레이팅")} myUid={myUid} onOpenProfile={onOpenProfile} />
      <FriendsPuzzle friendUids={friendUids} me={me} onOpenProfile={onOpenProfile} />
    </>
  );
}
