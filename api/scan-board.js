// Vercel 서버리스 함수: 체스판 사진 → FEN 인식(보드 편집기의 "이미지 스캔" 기능).
// (v0.3.5 기능) 사용자 요청. Google Gemini(무료 티어)의 비전 기능으로 사진 속 체스판 배치를 읽어
// FEN의 보드 부분(랭크 8→1)만 돌려준다. 캐슬링 권리·차례·앙파상은 사진만으로는 알 수 없는 정보라
// 추측하지 않고 클라이언트가 이미 갖고 있던 값(사용자가 보드 편집기에서 직접 설정한 값)을 그대로 둔다.
// (v0.3.5 기능 → 무료 전환) 원래 Anthropic(Claude, 유료 크레딧 필요)을 썼으나, 체스판처럼 구조가
// 단순한 이미지 인식엔 정확도 차이가 크게 중요하지 않다고 보고 무료 크레딧 없이 쓸 수 있는 Gemini API로
// 바꿨다(SDK 없이 REST 엔드포인트를 fetch로 직접 호출 — api/lichess.js와 같은 방식).
// API 키는 Vercel 환경변수(GEMINI_API_KEY, aistudio.google.com/apikey에서 무료 발급)로만 존재 — 이
// 값이 없으면 이 기능은 비활성 상태로 500을 반환하고, 클라이언트는 "서버에 아직 설정되지 않았어요"
// 안내만 보여준다(다른 기능엔 영향 없음).
const GEMINI_MODEL = "gemini-2.5-flash";

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST 요청만 지원합니다." }); return; }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) { res.status(500).json({ error: "서버에 GEMINI_API_KEY가 설정되어 있지 않아요." }); return; }

  const { image, mediaType } = req.body || {};
  if (!image || typeof image !== "string") { res.status(400).json({ error: "image(base64) 값이 필요해요." }); return; }
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  const safeMediaType = allowedTypes.includes(mediaType) ? mediaType : "image/jpeg";

  try {
    const geminiRes = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL + ":generateContent?key=" + apiKey,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { inlineData: { mimeType: safeMediaType, data: image } },
                {
                  text: "이 이미지는 체스판 사진 또는 스크린샷이야. 각 칸의 기물 배치를 정확히 읽어서 FEN 표기법의 보드 부분(랭크 8부터 1까지, 파일 a부터 h까지, '/'로 구분, 빈 칸은 연속 개수를 숫자로)만 만들어줘. 캐슬링 권리·차례·앙파상·이동 횟수는 사진만으로 알 수 없으니 절대 추측하지 말고 fen_board 필드에는 보드 배치만 담아. 보드가 어느 방향으로 찍혔든(흑이 아래쪽이어도) 실제 체스 기물 색과 위치를 기준으로 표준 FEN 방향(백이 1랭크)으로 변환해줘.",
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                fen_board: {
                  type: "STRING",
                  description: "체스판 FEN의 보드 배치 부분(첫 번째 필드)만. 8랭크부터 1랭크까지 '/'로 구분, 빈 칸은 숫자로. 예: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR",
                },
                confidence: { type: "STRING", enum: ["high", "medium", "low"] },
              },
              required: ["fen_board", "confidence"],
            },
          },
        }),
      }
    );

    const data = await geminiRes.json();
    if (!geminiRes.ok) {
      res.status(502).json({ error: (data && data.error && data.error.message) || "Gemini 요청에 실패했어요." });
      return;
    }
    const candidate = data.candidates && data.candidates[0];
    if (!candidate || candidate.finishReason === "SAFETY" || candidate.finishReason === "PROHIBITED_CONTENT") {
      res.status(502).json({ error: "이 이미지는 처리할 수 없어요." });
      return;
    }
    const textPart = candidate.content && candidate.content.parts && candidate.content.parts.find((p) => typeof p.text === "string");
    const parsed = textPart ? JSON.parse(textPart.text) : null;
    if (!parsed || !parsed.fen_board) {
      res.status(502).json({ error: "이미지에서 체스판을 인식하지 못했어요." });
      return;
    }
    res.status(200).json({ fen_board: parsed.fen_board, confidence: parsed.confidence });
  } catch (e) {
    res.status(502).json({ error: String(e && e.message ? e.message : e) });
  }
}
