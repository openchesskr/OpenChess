// Vercel 서버리스 함수: 체스판 사진 → FEN 인식(보드 편집기의 "이미지 스캔" 기능).
// (v0.3.5 기능) 사용자 요청. 사진 속 체스판 배치를 비전 모델로 읽어 FEN의 보드 부분(랭크 8→1)만
// 돌려준다. 캐슬링 권리·차례·앙파상은 사진만으로는 알 수 없는 정보라 추측하지 않고 클라이언트가 이미
// 갖고 있던 값(사용자가 보드 편집기에서 직접 설정한 값)을 그대로 둔다.
// (v0.3.5 기능 → 무료 전환, 2차) 처음엔 Anthropic(유료 크레딧 필요), 그다음 Google Gemini API로
// 바꿨으나 Gemini는 aistudio.google.com API 키 발급 화면 자체가 지역 제한에 걸리는 사용자가 있었다.
// OpenRouter(openrouter.ai)는 여러 제공사의 모델을 한 계정·한 API로 중개하는 서비스로, 결제 없이
// "openrouter/free" 라우터 모델을 쓰면 그때그때 쓸 수 있는 무료 비전 모델 중 하나로 자동 배정해 준다
// (특정 무료 모델 하나를 하드코딩하면 그 모델이 나중에 내려갔을 때 통째로 깨지므로, 라우터에 맡기는
// 편이 더 안정적이다). API는 OpenAI 호환 chat completions 형식이라 SDK 없이 fetch로 호출한다.
// 구조화 출력(JSON 스키마)은 라우터가 매번 다른 모델로 배정하는 특성상 모든 후보 모델이 지원한다는
// 보장이 없어 쓰지 않고, 프롬프트로 순수 JSON만 요청한 뒤 서버에서 관대하게 파싱한다.
// API 키는 Vercel 환경변수(OPENROUTER_API_KEY, openrouter.ai/keys에서 카드 등록 없이 무료 발급)로만
// 존재 — 이 값이 없으면 이 기능은 비활성 상태로 500을 반환하고, 클라이언트는 "서버에 아직 설정되지
// 않았어요" 안내만 보여준다(다른 기능엔 영향 없음).
const OPENROUTER_MODEL = "openrouter/free";

// (v0.3.8 기능) 사용자 요청 — 인식률 개선. 예전엔 모델에게 곧장 압축된 FEN 문자열("rnbqkbnr/8/..."
// 처럼 빈 칸 개수를 숫자로 뭉친 표기)을 만들어 달라고 했는데, 이 압축 과정 자체가 LLM이 흔히 틀리는
// 종류의 작업이다 — 8칸을 정확히 세어 숫자 하나로 뭉치는 건 "보는" 문제가 아니라 "세는" 문제라,
// 기물 배치를 완벽히 맞게 읽어 놓고도 마지막에 칸 수를 잘못 세거나(7이나 9가 되는 등) 자릿수를 밀려
// 써서 실패하는 경우가 실제로 잦았다. 이제는 모델에게 64칸 각각을 한 칸씩 그대로(빈 칸은 ""로) 나열만
// 시키고, 그 배열을 압축해 FEN으로 조립하는 건 서버가 결정적으로(항상 정확하게) 계산한다 — 모델은
// 자신이 실제로 잘하는 일(각 칸에 뭐가 있는지 보는 것)만 맡는다.
const FEN_LETTERS = new Set(["P", "N", "B", "R", "Q", "K", "p", "n", "b", "r", "q", "k"]);

function extractJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch { }
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

// ranks: 랭크8→1 순서의 8개 배열, 각 배열은 파일 a→h 순서의 8칸(기물 FEN 문자 1개 또는 빈 칸 "").
// 구조가 정확히 8x8이고 값이 전부 유효한 문자일 때만 FEN 보드 문자열을 조립해 돌려주고, 아니면 null.
function ranksToFenBoard(ranks) {
  if (!Array.isArray(ranks) || ranks.length !== 8) return null;
  const rows = [];
  for (const rank of ranks) {
    if (!Array.isArray(rank) || rank.length !== 8) return null;
    let row = "", empty = 0;
    for (const cell of rank) {
      const v = typeof cell === "string" ? cell.trim() : "";
      if (!v) { empty++; continue; }
      if (!FEN_LETTERS.has(v)) return null;
      if (empty) { row += empty; empty = 0; }
      row += v;
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return rows.join("/");
}
// 64칸 전부가 빈 칸으로만 읽혔으면(=명백한 오독) 실패로 취급 — 재시도를 유도한다.
function isPlausibleBoard(fenBoard) {
  return !!fenBoard && /[A-Za-z]/.test(fenBoard);
}

const SCAN_PROMPT = "이 이미지는 체스판 사진 또는 스크린샷이야. 이제부터 랭크 8(맨 위 가로줄)부터 랭크 1(맨 아래 가로줄)까지 한 줄씩, 각 줄은 파일 a부터 h까지 왼쪽에서 오른쪽 순서로, 정확히 64칸을 하나도 빠짐없이 훑어. 보드가 어느 방향으로 찍혔든(흑이 아래쪽이어도, 대각선이어도) 실제 체스 기물의 색과 종류를 기준으로 표준 방향(백 진영이 랭크 1)으로 좌표를 맞춰서 읽어. 각 칸에 대해: 기물이 있으면 그 종류와 색을 FEN 문자 하나로 적어(대문자 PNBRQK=백, 소문자 pnbrqk=흑 — 색이 밝은/흰 계열이면 백, 어둡고 진한 계열이면 흑), 기물이 없는 빈 칸이면 빈 문자열 \"\"로 적어. 절대로 빈 칸 개수를 세어 숫자로 뭉치지 마 — 반드시 64개 칸을 하나씩 전부 나열해. 결과는 다른 설명 없이 정확히 이 형태의 JSON 객체 하나로만 답해: {\"ranks\": [[랭크8의 8칸],[랭크7의 8칸],...,[랭크1의 8칸]], \"confidence\": \"high\"|\"medium\"|\"low\"}. 예를 들어 초기 배치의 첫 줄(랭크8)은 [\"r\",\"n\",\"b\",\"q\",\"k\",\"b\",\"n\",\"r\"]이고 그다음 줄(랭크7)은 [\"p\",\"p\",\"p\",\"p\",\"p\",\"p\",\"p\",\"p\"]이야.";

async function callOpenRouter(apiKey, safeMediaType, image) {
  const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + apiKey,
      "HTTP-Referer": "https://openchess.kr",
      "X-Title": "OpenChess",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      temperature: 0,
      max_tokens: 1200,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: SCAN_PROMPT },
            { type: "image_url", image_url: { url: "data:" + safeMediaType + ";base64," + image, detail: "high" } },
          ],
        },
      ],
    }),
  });
  const data = await orRes.json();
  if (!orRes.ok) {
    const err = new Error((data && data.error && data.error.message) || "OpenRouter 요청에 실패했어요.");
    err.upstream = true;
    throw err;
  }
  const choice = data.choices && data.choices[0];
  const content = choice && choice.message && choice.message.content;
  const parsed = extractJson(typeof content === "string" ? content : "");
  const fenBoard = parsed && ranksToFenBoard(parsed.ranks);
  return { fenBoard, confidence: parsed && parsed.confidence };
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST 요청만 지원합니다." }); return; }
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) { res.status(500).json({ error: "서버에 OPENROUTER_API_KEY가 설정되어 있지 않아요." }); return; }

  const { image, mediaType } = req.body || {};
  if (!image || typeof image !== "string") { res.status(400).json({ error: "image(base64) 값이 필요해요." }); return; }
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  const safeMediaType = allowedTypes.includes(mediaType) ? mediaType : "image/jpeg";

  try {
    // (v0.3.8 기능) 첫 응답이 구조적으로 이상하거나(64칸 아님·잘못된 문자) 64칸이 전부 빈 칸으로만
    // 읽혔으면(명백한 오독) 한 번 더 시도한다 — "openrouter/free"는 호출마다 다른 무료 모델로 배정될
    // 수 있어, 재시도가 실제로 다른(때로는 더 나은) 모델을 만나는 경우가 있다.
    let last = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      last = await callOpenRouter(apiKey, safeMediaType, image);
      if (isPlausibleBoard(last.fenBoard)) break;
    }
    if (!last || !isPlausibleBoard(last.fenBoard)) {
      res.status(502).json({ error: "이미지에서 체스판을 인식하지 못했어요." });
      return;
    }
    res.status(200).json({ fen_board: last.fenBoard, confidence: last.confidence });
  } catch (e) {
    res.status(502).json({ error: String(e && e.message ? e.message : e) });
  }
}
