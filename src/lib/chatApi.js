// (v0.5.7 기능, 사용자 요청 "채팅을 실제 SNS 수준으로") 채팅 강화 기능의 서버 호출 — 답장·이모지 반응·이전 메시지·검색·
// 수 투표·차단·신고·대화방 목록 요약. 스키마는 supabase-setup.sql의 5) chat_messages 절(reply_to·poll·cobo·user_blocks)과
// "채팅 강화 (v0.5.7)" 절(chat_reactions·chat_poll_votes·user_reports·chat_rooms)에 있다.
// 모든 함수는 실패해도 던지지 않는다 — SQL을 아직 다시 실행하지 않은 프로젝트(새 표·RPC가 없음)에서도 채팅의 기존 기능은
// 그대로 동작해야 하므로, 새 기능 쪽만 조용히 빈 값으로 떨어진다.
import { SB_ON, SB_URL, sbHeaders, sbSelect, sbInsert, sbUpsert, sbRpc } from "./supabaseClient.js";

export const CHAT_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];
export const CHAT_PAGE = 300;          // 한 번에 받는 메시지 수(최신 페이지·이전 페이지 공통)
export const REPORT_REASONS = [
  { key: "spam", label: "스팸·광고" },
  { key: "abuse", label: "욕설·괴롭힘" },
  { key: "sexual", label: "음란·불쾌한 내용" },
  { key: "cheating", label: "부정행위(대국 조작 등)" },
  { key: "other", label: "기타" },
];

const pairFilter = (a, b) => "or=(and(from_uid.eq." + a + ",to_uid.eq." + b + "),and(from_uid.eq." + b + ",to_uid.eq." + a + "))";

// 최신 CHAT_PAGE개(before가 있으면 그 시각보다 이전 것) — 화면 순서(오래된 → 최신)로 돌려준다. BUG-018: 반드시 desc로 받아 뒤집는다.
export async function chatFetchPage(myUid, otherUid, before) {
  if (!SB_ON || !myUid || !otherUid) return [];
  try {
    const q = "chat_messages?" + pairFilter(myUid, otherUid) + (before ? "&created_at=lt." + encodeURIComponent(before) : "") + "&order=created_at.desc,id.desc&limit=" + CHAT_PAGE;
    return ((await sbSelect(q)) || []).slice().reverse();
  } catch { return []; }
}

// 보내기 — extra: { reply_to, poll, cobo }. 새 컬럼이 아직 없는 프로젝트에서 답장이 실패하면 답장 없이 한 번 더 보낸다.
export async function chatSendMessage(myUid, toUid, body, emoji, extra) {
  if (!SB_ON || !myUid || !toUid) return false;
  const row = { from_uid: myUid, to_uid: toUid, body: body || null, emoji: emoji || null };
  const ex = extra || {};
  if (ex.reply_to != null) row.reply_to = ex.reply_to;
  if (ex.poll) row.poll = ex.poll;
  if (ex.cobo) row.cobo = ex.cobo;
  try { await sbInsert("chat_messages", row); return true; }
  catch {
    if (row.reply_to == null) return false;
    try { delete row.reply_to; await sbInsert("chat_messages", row); return true; } catch { return false; }
  }
}

// 답장 인용용 — 아직 안 불러온 옛 원문 메시지만 id로 따로 받는다.
export async function chatFetchByIds(ids) {
  const list = [...new Set((ids || []).filter((x) => x != null))];
  if (!SB_ON || !list.length) return [];
  try { return (await sbSelect("chat_messages?id=in.(" + list.slice(0, 100).join(",") + ")")) || []; } catch { return []; }
}

// 대화 안 검색 — 본문에 q가 들어간 메시지(최신 순 50개).
export async function chatSearch(myUid, otherUid, q) {
  const term = (q || "").trim().replace(/[*,()]/g, " ").trim();
  if (!SB_ON || !myUid || !otherUid || term.length < 1) return [];
  try {
    return (await sbSelect("chat_messages?" + pairFilter(myUid, otherUid) + "&body=ilike." + encodeURIComponent("*" + term + "*") + "&order=created_at.desc&limit=50&select=id,from_uid,body,created_at")) || [];
  } catch { return []; }
}

// 반응 — { messageId: [{uid, emoji}] }
export async function chatReactionsFetch(ids) {
  const list = [...new Set((ids || []).filter((x) => x != null))];
  if (!SB_ON || !list.length) return {};
  const out = {};
  try {
    for (let i = 0; i < list.length; i += 150) {
      const rows = await sbSelect("chat_reactions?message_id=in.(" + list.slice(i, i + 150).join(",") + ")&select=message_id,uid,emoji");
      (rows || []).forEach((r) => { (out[r.message_id] = out[r.message_id] || []).push({ uid: r.uid, emoji: r.emoji }); });
    }
  } catch { }
  return out;
}
export async function chatReactToggle(messageId, uid, emoji, on) {
  if (!SB_ON || messageId == null || !uid || !CHAT_REACTIONS.includes(emoji)) return false;
  try {
    if (on) { await sbInsert("chat_reactions", { message_id: messageId, uid, emoji }); return true; }
    const r = await fetch(SB_URL + "/rest/v1/chat_reactions?message_id=eq." + messageId + "&uid=eq." + uid + "&emoji=eq." + encodeURIComponent(emoji), { method: "DELETE", headers: { ...sbHeaders(), Prefer: "return=minimal" } });
    return r.ok;
  } catch { return false; }
}

// 수 투표 — { messageId: [{uid, san}] }
export async function chatPollVotesFetch(ids) {
  const list = [...new Set((ids || []).filter((x) => x != null))];
  if (!SB_ON || !list.length) return {};
  const out = {};
  try {
    const rows = await sbSelect("chat_poll_votes?message_id=in.(" + list.join(",") + ")&select=message_id,uid,san");
    (rows || []).forEach((r) => { (out[r.message_id] = out[r.message_id] || []).push({ uid: r.uid, san: r.san }); });
  } catch { }
  return out;
}
export async function chatPollVote(messageId, uid, san) {
  if (!SB_ON || messageId == null || !uid || !san) return false;
  try { await sbUpsert("chat_poll_votes", { message_id: messageId, uid, san, created_at: new Date().toISOString() }); return true; } catch { return false; }
}

// 차단 — 내가 차단한 사람 uid 목록 / 차단·해제.
export async function chatBlocksFetch(myUid) {
  if (!SB_ON || !myUid) return [];
  try { return ((await sbSelect("user_blocks?blocker=eq." + myUid + "&select=blocked")) || []).map((r) => r.blocked); } catch { return []; }
}
export async function chatBlockSet(myUid, otherUid, on) {
  if (!SB_ON || !myUid || !otherUid || myUid === otherUid) return false;
  try {
    if (on) {
      try { await sbInsert("user_blocks", { blocker: myUid, blocked: otherUid }); return true; }
      catch { return (await chatBlocksFetch(myUid)).includes(otherUid); } // 이미 차단돼 있으면(중복 키) 성공으로 친다
    }
    const r = await fetch(SB_URL + "/rest/v1/user_blocks?blocker=eq." + myUid + "&blocked=eq." + otherUid, { method: "DELETE", headers: { ...sbHeaders(), Prefer: "return=minimal" } });
    return r.ok;
  } catch { return false; }
}

// 신고 — 서버가 그 메시지 본문을 복사해 둔다(user_report RPC). 실패 이유(하루 한도 등)를 구분해 돌려준다.
export async function userReport(targetUid, messageId, reason, detail) {
  if (!SB_ON || !targetUid) return { ok: false, error: "unavailable" };
  try { await sbRpc("user_report", { p_target: targetUid, p_message_id: messageId == null ? null : messageId, p_reason: reason, p_detail: detail || null }); return { ok: true }; }
  catch (e) { return { ok: false, error: /too many/.test(String(e && e.message)) ? "limit" : "failed" }; }
}

// 대화방 목록 요약(BUG-019) — [{ uid, m, unread }] 최근 순. RPC가 없으면(SQL 미반영) null을 돌려 호출부가 예전 방식으로 대신한다.
export async function chatRoomsFetch() {
  if (!SB_ON) return [];
  try {
    const rows = await sbRpc("chat_rooms", {});
    if (!Array.isArray(rows)) return null;
    return rows.map((r) => ({ uid: r.other_uid, m: r.last_message, unread: r.unread || 0 }));
  } catch { return null; }
}

// 텍스트 속 체스 코드 찾기 — FEN(여덟 줄 배치 + 선택 필드) 또는 수순("1.e4 e5 2.Nf3 …", 수 번호로 시작하는 두 수 이상).
export const FEN_IN_TEXT = /([pnbrqkPNBRQK1-8]{1,8}(?:\/[pnbrqkPNBRQK1-8]{1,8}){7})(?:\s+([wb])(?:\s+([KQkq]{1,4}|-)(?:\s+([a-h][36]|-)(?:\s+(\d+)\s+(\d+))?)?)?)?/;
export const MOVETEXT_IN_TEXT = /(?:^|\s)(1\.\s*(?:[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?|O-O(?:-O)?)[+#]?(?:\s+(?:\d+\.(?:\.\.)?\s*)?(?:[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?|O-O(?:-O)?)[+#]?)+)/;
