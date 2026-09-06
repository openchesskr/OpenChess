// Vercel 서버리스 함수: pvp 대국이 체크메이트/스테일메이트/3회 동형 반복으로 끝났다는 클라이언트의
// 신고를, chess.js로 sans를 직접 재생해 검증한 뒤에만 서버(Supabase)에 확정한다.
//
// (v0.4.8, v0.5.0 예정인 보드 위 오리지널 미니게임 PvP 대비 선행 정리) 검증 로직을 game_type별
// 함수로 뽑아 VERIFIERS에 등록해 두었다 — 체스가 아닌 게임 타입이 추가되면 그 타입 전용 검증 함수를
// 만들어 여기 등록하기만 하면 되고, 아래 handler 본문은 손댈 필요가 없다. 지금은 'chess'뿐이다.
//
// (배경, v0.4.5) pvp_finish RPC는 "자기 자신을 승자로 선언하는" 호출을 막는다 — pvp_move가 SAN
// 합법성 자체를 검증하지 않으므로(클라이언트가 이미 검증했다고 신뢰), 이 가드가 없으면 클라이언트가
// 조작된 수순을 넣고 스스로 승리를 우겨 넣을 수 있다(supabase-setup.sql의 pvp_finish 주석 참고). 그
// 결과 체크메이트를 당한 쪽의 클라이언트가 결과를 보고하지 못하고 사라지면(탭을 닫는 등) 그 대국은
// 서버에 계속 active로 남아, 승자가 다시 매칭을 시도할 때마다 새 상대 대신 이미 끝난 그 대국으로
// 되돌아가는 문제가 있었다(README v0.4.5 "시도했다가 되돌림" 항목 참고 — p_objective 플래그로 같은
// 문제를 클라이언트 자기 신고만으로 풀려다 정확히 같은 종류의 권한 우회가 되어 되돌렸다).
//
// 이 함수는 클라이언트의 "이 결과는 객관적이다"라는 주장을 그대로 믿는 대신, sans를 처음부터 직접
// chess.js로 재생해 실제로 체크메이트/스테일메이트/3회 동형 반복이 맞는지, 맞다면 정확히 누가
// 이겼는지를 서버가 독립적으로 계산한다 — 그 계산 결과와 요청받은 status가 일치할 때만(승자·패자
// 어느 쪽 클라이언트가 호출했는지는 상관없다) service_role 전용 RPC(pvp_finish_verified — authenticated
// role에는 권한을 주지 않아 브라우저가 직접 호출할 수 없다. 이 함수만 SUPABASE_SERVICE_ROLE_KEY로
// 호출할 수 있다)로 확정한다.
import { Chess } from "chess.js";

// game_type "chess" 전용 검증 — sans를 처음부터 직접 재생해, 하나라도 chess.js 기준 불법이면
// 검증 실패(null)로 거부하고, 실제로 종료된 위치라면 그 결과("white_won"|"black_won"|"draw")를
// 독립적으로 계산해 돌려준다. 아직 끝나지 않은 위치도 null.
function verifyChessResult(sans) {
  const chess = new Chess();
  for (const san of sans || []) {
    try { chess.move(san); } catch { return null; }
  }
  if (chess.isCheckmate()) return chess.turn() === "w" ? "black_won" : "white_won";
  if (chess.isStalemate() || chess.isThreefoldRepetition() || chess.isDraw()) return "draw";
  return null;
}

// game_type -> (sans) => 계산된 result | null. 새 게임 타입을 추가할 때 여기 등록한다.
const VERIFIERS = { chess: verifyChessResult };

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST 요청만 지원합니다." }); return; }

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) { res.status(500).json({ error: "서버에 아직 설정되지 않았어요." }); return; }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) { res.status(401).json({ error: "로그인이 필요해요." }); return; }

  const { game_id, status } = req.body || {};
  const gameId = Number(game_id);
  if (!gameId || !["white_won", "black_won", "draw"].includes(status)) { res.status(400).json({ error: "잘못된 요청이에요." }); return; }

  try {
    // 1) 호출자 신원 확인 — 서명 검증을 직접 하지 않고 Supabase Auth(/auth/v1/user)에 그대로 위임한다.
    const userRes = await fetch(SUPABASE_URL + "/auth/v1/user", { headers: { apikey: ANON_KEY, Authorization: "Bearer " + token } });
    if (!userRes.ok) { res.status(401).json({ error: "로그인이 만료됐어요." }); return; }
    const user = await userRes.json();
    const myUid = user && user.id;
    if (!myUid) { res.status(401).json({ error: "로그인이 필요해요." }); return; }

    // 2) 대국 조회 — service role로(RLS와 무관하게 sans까지 전부 읽는다).
    const gameRes = await fetch(SUPABASE_URL + "/rest/v1/pvp_games?id=eq." + gameId + "&select=id,white_uid,black_uid,sans,status,game_type", {
      headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY },
    });
    if (!gameRes.ok) { res.status(502).json({ error: "대국을 불러오지 못했어요." }); return; }
    const rows = await gameRes.json();
    const game = rows && rows[0];
    if (!game) { res.status(404).json({ error: "대국을 찾을 수 없어요." }); return; }
    if (myUid !== game.white_uid && myUid !== game.black_uid) { res.status(403).json({ error: "이 대국의 참가자가 아니에요." }); return; }
    if (game.status !== "active") { res.status(200).json({ ok: true, alreadyFinished: true }); return; }

    // 3) game_type에 맞는 검증기로 실제로 종료된 위치인지, 종료됐다면 무엇으로 끝났는지 독립적으로
    // 계산한다(sans 재생이 불법이면 검증기가 null을 돌려준다 — "아직 끝나지 않음"과 구분하지 않고
    // 둘 다 거부한다).
    const verify = VERIFIERS[game.game_type || "chess"];
    if (!verify) { res.status(400).json({ error: "지원하지 않는 게임 타입이에요." }); return; }
    const computed = verify(game.sans || []);
    if (!computed) { res.status(400).json({ error: "아직 끝나지 않은 대국이에요." }); return; }
    if (computed !== status) { res.status(400).json({ error: "요청한 결과가 실제 계산 결과와 달라요." }); return; }

    // 5) 검증된 결과만 service_role 전용 RPC로 확정한다.
    const rpcRes = await fetch(SUPABASE_URL + "/rest/v1/rpc/pvp_finish_verified", {
      method: "POST",
      headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ p_game_id: gameId, p_status: computed }),
    });
    if (!rpcRes.ok) { res.status(502).json({ error: "결과를 확정하지 못했어요." }); return; }
    const finished = await rpcRes.json();
    res.status(200).json({ ok: true, game: finished });
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
}
