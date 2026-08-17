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

function extractJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch { }
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
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
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "이 이미지는 체스판 사진 또는 스크린샷이야. 각 칸의 기물 배치를 정확히 읽어서 FEN 표기법의 보드 부분(랭크 8부터 1까지, 파일 a부터 h까지, '/'로 구분, 빈 칸은 연속 개수를 숫자로)만 만들어줘. 캐슬링 권리·차례·앙파상·이동 횟수는 사진만으로 알 수 없으니 절대 추측하지 말고 fen_board 필드에는 보드 배치만 담아. 보드가 어느 방향으로 찍혔든(흑이 아래쪽이어도) 실제 체스 기물 색과 위치를 기준으로 표준 FEN 방향(백이 1랭크)으로 변환해줘. 반드시 다른 설명 없이 정확히 이 형태의 JSON 객체 하나만 답해: {\"fen_board\": \"...\", \"confidence\": \"high\"|\"medium\"|\"low\"}",
              },
              { type: "image_url", image_url: { url: "data:" + safeMediaType + ";base64," + image } },
            ],
          },
        ],
      }),
    });

    const data = await orRes.json();
    if (!orRes.ok) {
      res.status(502).json({ error: (data && data.error && data.error.message) || "OpenRouter 요청에 실패했어요." });
      return;
    }
    const choice = data.choices && data.choices[0];
    const content = choice && choice.message && choice.message.content;
    const parsed = extractJson(typeof content === "string" ? content : "");
    if (!parsed || !parsed.fen_board) {
      res.status(502).json({ error: "이미지에서 체스판을 인식하지 못했어요." });
      return;
    }
    res.status(200).json({ fen_board: parsed.fen_board, confidence: parsed.confidence });
  } catch (e) {
    res.status(502).json({ error: String(e && e.message ? e.message : e) });
  }
}
