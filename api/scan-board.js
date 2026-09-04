// Vercel 서버리스 함수: 체스판 사진 → FEN 인식(보드 편집기의 "이미지 스캔" 기능).
// (v0.3.5 기능) 사용자 요청. 사진 속 체스판 배치를 비전 모델로 읽어 FEN의 보드 부분(랭크 8→1)만
// 돌려준다. 캐슬링 권리·차례·앙파상은 사진만으로는 알 수 없는 정보라 추측하지 않고 클라이언트가 이미
// 갖고 있던 값(사용자가 보드 편집기에서 직접 설정한 값)을 그대로 둔다.
// (v0.3.5 기능 → 무료 전환 → v0.3.9 재전환) 처음엔 Anthropic(유료 크레딧 필요), 그다음 Google
// Gemini API로 바꿨으나 그때는 aistudio.google.com API 키 발급 화면 자체가 지역 제한에 걸려 OpenRouter
// (여러 제공사 모델을 중개하는 무료 라우터)로 다시 바꿨었다. 이제 Gemini API 키를 정상 발급받을 수
// 있게 되어 사용자 요청으로 다시 Gemini로 돌아온다 — OpenRouter의 "openrouter/free"는 호출마다 다른
// (품질을 보장할 수 없는) 무료 모델로 배정돼 구조화 출력(JSON 스키마)도 못 썼는데, 고정된 단일 모델을
// 직접 쓰면 Gemini의 `responseSchema` 구조화 출력을 그대로 활용해 형식 오류 자체를 줄일 수 있다.
// API 키는 Vercel 환경변수(GEMINI_API_KEY, aistudio.google.com/apikey에서 무료 발급)로만 존재 — 이
// 값이 없으면 이 기능은 비활성 상태로 500을 반환하고, 클라이언트는 "서버에 아직 설정되지 않았어요"
// 안내만 보여준다(다른 기능엔 영향 없음).
// (버그 수정, 사용자 제보) 이 모델 ID를 상수 하나로 고정해 뒀던 게 문제의 근원이었다 — 한 번은
// "gemini-3.6-flash"가 실재하지 않는 ID라 모든 호출이 404로 실패했고, gemini-2.5-flash로 되돌리자
// 이번엔 반대로 Gemini가 "2.5는 곧 사라지니 3.6을 쓰라"는 응답을 돌려주기 시작했다 — 이 앱이 배포된
// 채로 있는 동안 실제로 어떤 모델 ID가 유효한지는 Google 쪽 사정으로 계속 바뀔 수 있어, 클라이언트나
// 코드가 미리 알 방법이 없다. 하나를 고정해 두는 대신, 아래 두 후보를 순서대로 시도해 실제로 API가
// 받아주는(모델 자체가 없다는 오류가 아닌) 첫 번째 모델을 쓴다 — 3.6이 이 시점에 아직 없거나 지역
// 제한에 걸려도 2.5로, 반대로 2.5가 나중에 완전히 폐기돼도 3.6으로 자동으로 넘어간다.
const GEMINI_MODEL_CANDIDATES = ["gemini-3.6-flash", "gemini-2.5-flash"];
// 서버리스 함수 인스턴스가 요청 사이에 재사용되는 동안(Vercel 웜 스타트)은 한 번 통한 모델을 기억해
// 매 요청마다 후보를 처음부터 다시 순회하지 않는다 — 콜드 스타트되면 다시 null로 시작.
let cachedWorkingModel = null;
// Gemini가 "이 모델은 없다/더 이상 못 쓴다"는 뜻으로 돌려주는 오류 메시지의 공통 패턴 — 이런 오류일
// 때만 다음 후보 모델로 넘어간다. 그 외 오류(요청 형식·과금·일시 장애 등)는 모델을 바꿔도 어차피
// 똑같이 실패하므로 곧장 그대로 던진다.
function isModelUnavailableError(err) {
  const msg = ((err && err.message) || "").toLowerCase();
  return /not found|not supported|is not available|deprecated|invalid model|unknown model|no longer|unrecognized model/.test(msg);
}

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

// (버그 수정, 사용자 제보) 실제 빈 칸인데 기물이 있다고 잘못 읽는 "과다 인식"(false positive) 문제 —
// 좌표 라벨(a-h/1-8)·격자선·나무결 무늬·그림자·반사를 기물로 착각하는 경우가 많았다. 체스는 물리적으로
// 불가능한 배치가 있다 — 한쪽 색이 킹 2개 이상이거나, 기물 총 16개 초과이거나, 폰이 8개 초과이면
// 명백한 오독이다(킹 0개는 부분 배치/퍼즐일 수 있어 정상 취급). ranksToFenBoard가 만든 FEN 보드
// 문자열을 검사해 이 제약을 어기면 역시 실패로 취급해 재시도를 유도한다.
function isSanePieceCounts(fenBoard) {
  if (!fenBoard) return false;
  const counts = { white: { total: 0, king: 0, pawn: 0 }, black: { total: 0, king: 0, pawn: 0 } };
  for (const ch of fenBoard) {
    if (ch === "/" || (ch >= "1" && ch <= "8")) continue;
    if (!FEN_LETTERS.has(ch)) return false;
    const side = ch === ch.toUpperCase() ? counts.white : counts.black;
    side.total++;
    const lower = ch.toLowerCase();
    if (lower === "k") side.king++;
    if (lower === "p") side.pawn++;
  }
  for (const side of [counts.white, counts.black]) {
    if (side.total > 16) return false;
    if (side.king > 1) return false;
    if (side.pawn > 8) return false;
  }
  return true;
}

// (v0.4.2 기능) 사용자 요청 — 체스판 배치 사진뿐 아니라, PGN 기보나 FEN 코드가 텍스트로 인쇄·필기된
// 사진(책 지면, 스크린샷, 메모 등)도 인식하게 확장한다. 먼저 이미지가 어느 쪽인지(kind: "board"=
// 체스판 실물/다이어그램 사진, "text"=PGN·FEN이 문자로 적힌 이미지, "none"=둘 다 아님) 모델이 스스로
// 판단하게 하고, 서버는 그 판단에 따라 완전히 다른 필드(ranks vs recognized_text)만 채우도록 한다.
const SCAN_PROMPT = "이 이미지를 보고 다음 중 무엇인지 먼저 판단해: (A) 체스판 실물 사진 또는 체스판 다이어그램/스크린샷(기물이 배치된 8x8 격자가 보임), (B) PGN 기보(예: '1. e4 e5 2. Nf3 Nc6 ...')나 FEN 코드(예: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')가 인쇄되거나 손으로 적힌 텍스트가 담긴 이미지(책 지면, 스크린샷, 메모, 노트 등), (C) 둘 다 아님. kind 필드에 각각 \"board\"/\"text\"/\"none\"을 적어.\n\n(A)라면: 이제부터 랭크 8(맨 위 가로줄)부터 랭크 1(맨 아래 가로줄)까지 한 줄씩, 각 줄은 파일 a부터 h까지 왼쪽에서 오른쪽 순서로, 정확히 64칸을 하나도 빠짐없이 훑어 ranks 필드에 담아. 보드가 어느 방향으로 찍혔든(흑이 아래쪽이어도, 대각선이어도) 실제 체스 기물의 색과 종류를 기준으로 표준 방향(백 진영이 랭크 1)으로 좌표를 맞춰서 읽어. 각 칸에 대해: 실제로 입체적인(3D) 체스 기물이 그 칸 위에 놓여 있다고 확신할 때만 기물의 종류와 색을 FEN 문자 하나로 적어(대문자 PNBRQK=백, 소문자 pnbrqk=흑 — 색이 밝은/흰 계열이면 백, 어둡고 진한 계열이면 흑). 그 외의 모든 경우, 즉 기물이 없는 빈 칸이면 빈 문자열 \"\"로 적어. 특히 다음은 기물이 아니니 절대 기물로 착각하지 마: 보드 가장자리에 인쇄된 좌표 라벨(a-h, 1-8 글자), 칸을 나누는 격자선, 나무결·대리석 같은 재질 무늬나 칸의 명암 패턴, 그림자, 유리·화면 반사, 옆 칸 기물이 이 칸까지 걸쳐 보이는 착시. 빈 칸인지 기물이 있는 칸인지 확신이 서지 않으면 반드시 기물이 있다고 추측하지 말고 빈 칸(\"\")으로 적어. 실제 체스 게임에서 보드 위 기물은 보통 32개 이하이고, 한쪽 색은 킹 최대 1개·폰 최대 8개·전체 최대 16개를 넘을 수 없어 — 넘는다면 다시 확인해. 절대로 빈 칸 개수를 세어 숫자로 뭉치지 마 — 반드시 64개 칸을 하나씩 전부 나열해. 예를 들어 초기 배치의 첫 줄(랭크8)은 [\"r\",\"n\",\"b\",\"q\",\"k\",\"b\",\"n\",\"r\"]이고 그다음 줄(랭크7)은 [\"p\",\"p\",\"p\",\"p\",\"p\",\"p\",\"p\",\"p\"]이야.\n\n(B)라면: 이미지에 보이는 PGN 또는 FEN 텍스트를 한 글자도 빠뜨리거나 지어내지 말고 정확히 그대로 옮겨 적어 recognized_text 필드에 담아(줄바꿈은 공백으로 이어 붙여도 돼). 수 번호·기물 기호·좌표 표기까지 원문 그대로.\n\n(C)라면 ranks·recognized_text 모두 비워 둬.";

// (v0.3.9 기능) Gemini의 `responseSchema` 구조화 출력 — 프롬프트만으로 형식을 지시하던 OpenRouter
// 시절과 달리, 고정된 단일 모델이라 스키마를 신뢰하고 강제할 수 있다. 그래도 8x8 구조 자체는
// ranksToFenBoard가 다시 한번 결정적으로 검증한다(모델이 스키마를 어겨도 서버가 절대 잘못된 FEN을
// 그대로 내보내지 않도록).
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    kind: { type: "STRING", enum: ["board", "text", "none"] },
    ranks: { type: "ARRAY", items: { type: "ARRAY", items: { type: "STRING" } } },
    recognized_text: { type: "STRING" },
    confidence: { type: "STRING", enum: ["high", "medium", "low"] },
  },
  required: ["kind", "confidence"],
};

async function callGeminiWithModel(model, apiKey, safeMediaType, image) {
  const geminiRes = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + apiKey,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: safeMediaType, data: image } },
              { text: SCAN_PROMPT },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    }
  );
  const data = await geminiRes.json();
  if (!geminiRes.ok) {
    const err = new Error((data && data.error && data.error.message) || "Gemini 요청에 실패했어요.");
    err.upstream = true;
    throw err;
  }
  const candidate = data.candidates && data.candidates[0];
  if (!candidate || candidate.finishReason === "SAFETY" || candidate.finishReason === "PROHIBITED_CONTENT") {
    return { kind: null, fenBoard: null, text: null, confidence: null };
  }
  const textPart = candidate.content && candidate.content.parts && candidate.content.parts.find((p) => typeof p.text === "string");
  const parsed = extractJson(textPart && textPart.text);
  const kind = parsed && parsed.kind;
  const fenBoard = kind === "board" ? (parsed && ranksToFenBoard(parsed.ranks)) : null;
  const text = kind === "text" ? (parsed && typeof parsed.recognized_text === "string" ? parsed.recognized_text.trim() : null) : null;
  return { kind, fenBoard, text, confidence: parsed && parsed.confidence };
}
// GEMINI_MODEL_CANDIDATES를 순서대로 시도해, "모델을 찾을 수 없다"는 오류가 아닌 첫 응답(성공이든
// 다른 종류의 실패든)을 그대로 쓴다. 한 번 통한 모델은 cachedWorkingModel에 남겨 다음 호출부터는
// 그 모델을 먼저 시도한다.
async function callGemini(apiKey, safeMediaType, image) {
  const order = cachedWorkingModel
    ? [cachedWorkingModel, ...GEMINI_MODEL_CANDIDATES.filter((m) => m !== cachedWorkingModel)]
    : GEMINI_MODEL_CANDIDATES;
  let lastErr = null;
  for (const model of order) {
    try {
      const result = await callGeminiWithModel(model, apiKey, safeMediaType, image);
      cachedWorkingModel = model;
      return result;
    } catch (e) {
      lastErr = e;
      if (!isModelUnavailableError(e)) throw e; // 모델 문제가 아니면 다른 모델로 바꿔도 소용없다
      if (cachedWorkingModel === model) cachedWorkingModel = null; // 캐시해 둔 모델이 방금 실패했다면 캐시를 비운다
    }
  }
  throw lastErr || new Error("사용 가능한 Gemini 모델을 찾지 못했어요.");
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST 요청만 지원합니다." }); return; }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) { res.status(500).json({ error: "서버에 GEMINI_API_KEY가 설정되어 있지 않아요." }); return; }

  const { image, mediaType } = req.body || {};
  if (!image || typeof image !== "string") { res.status(400).json({ error: "image(base64) 값이 필요해요." }); return; }
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  const safeMediaType = allowedTypes.includes(mediaType) ? mediaType : "image/jpeg";

  try {
    // (v0.3.8 기능) 첫 응답이 구조적으로 이상하거나(64칸 아님·잘못된 문자) 64칸이 전부 빈 칸으로만
    // 읽혔으면(명백한 오독) 다시 시도한다 — 같은 모델이라도 비전 인식은 호출마다 편차가 있어 재시도로
    // 종종 복구된다. (버그 수정) 과다 인식(실제로 빈 칸인데 기물이 있다고 읽음)도 같은 재시도 경로로
    // 잡는다 — isSanePieceCounts가 물리적으로 불가능한 기물 수(한쪽 킹 2개 이상, 폰 8개 초과, 총
    // 16개 초과)를 감지하면 명백한 오독으로 보고 다시 시도한다. (v0.4.2) kind가 "text"면 ranks
    // 검증은 건너뛰고 recognized_text가 비어 있지 않은지만 확인한다.
    let last = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      last = await callGemini(apiKey, safeMediaType, image);
      if (last.kind === "text" && last.text) break;
      if (last.kind === "board" && isPlausibleBoard(last.fenBoard) && isSanePieceCounts(last.fenBoard)) break;
    }
    if (last && last.kind === "text" && last.text) {
      res.status(200).json({ type: "text", recognized_text: last.text, confidence: last.confidence });
      return;
    }
    if (!last || last.kind !== "board" || !isPlausibleBoard(last.fenBoard) || !isSanePieceCounts(last.fenBoard)) {
      res.status(502).json({ error: "이미지에서 체스판이나 PGN·FEN 텍스트를 인식하지 못했어요." });
      return;
    }
    res.status(200).json({ type: "board", fen_board: last.fenBoard, confidence: last.confidence });
  } catch (e) {
    res.status(502).json({ error: String(e && e.message ? e.message : e) });
  }
}
