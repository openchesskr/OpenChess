// (v0.7.0, 다국어) 체스 용어집 — 번역 파일의 용어가 일관되고 정확한지 scripts/check-i18n.mjs가 이 표로 검사한다(앱 번들에는 들어가지 않는다).
//  · ko: 한국어 원문에서 이 용어를 찾는 정규식. 원문이 이 용어를 담고 있으면, 각 언어 번역도 아래 표기 중 하나(accept)를 담아야 한다.
//  · 언어별 첫 번째 값이 표준 표기(primary). 새 문구를 번역할 때는 반드시 이 표기를 쓴다. 용어를 바꾸려면 이 파일을 고친다.
//  · accept에 영어 표기를 함께 둔 곳은 그 언어권에서도 영어 용어를 그대로 쓰는 것이 관례인 경우(블리츠·래피드 등)다.
//  · 번역은 AI가 초안을 쓴 것이다. 원어민 검수 전에는 note의 "검수 필요" 표시를 지우지 않는다.
export const GLOSSARY = [
  // ── 기물 ──
  { id: "king", ko: "킹(?!덤|스)", en: ["King"], hi: ["राजा"], ja: ["キング"], zh: ["王"], es: ["Rey"] },
  { id: "queen", ko: "퀸(?!스)", en: ["Queen"], hi: ["रानी", "वज़ीर", "वजीर"], ja: ["クイーン"], zh: ["后"], es: ["Dama", "Reina"] },
  { id: "rook", ko: "룩(?!스)", en: ["Rook"], hi: ["हाथी", "रूक"], ja: ["ルーク"], zh: ["车"], es: ["Torre"] },
  { id: "bishop", ko: "비숍", en: ["Bishop"], hi: ["ऊँट", "ऊंट", "बिशप"], ja: ["ビショップ"], zh: ["象"], es: ["Alfil"] },
  { id: "knight", ko: "나이트(?!메어)", en: ["Knight"], hi: ["घोड़ा", "घोड़े", "नाइट"], ja: ["ナイト"], zh: ["马"], es: ["Caballo"] },
  { id: "pawn", ko: "(?<![가-힣])폰(?!트|지아니)", en: ["Pawn"], hi: ["प्यादा", "प्यादे", "प्यादों", "पॉन"], ja: ["ポーン"], zh: ["兵"], es: ["Peón", "Peon", "Peones"] },
  { id: "piece", ko: "기물", en: ["Piece", "material"], hi: ["मोहरा", "मोहरे", "मोहरों"], ja: ["駒"], zh: ["棋子", "子"], es: ["Pieza", "material"] },
  // ── 수 등급 ──
  { id: "brilliant", ko: "탁월한 수|탁월한 유산|^탁월$", en: ["Brilliant"], hi: ["शानदार"], ja: ["ブリリアント"], zh: ["精彩"], es: ["Brillante"] },
  { id: "only", ko: "유일한 수", en: ["Only move"], hi: ["एकमात्र चाल"], ja: ["唯一の手", "唯一手"], zh: ["唯一着法", "唯一走法", "唯一的着法"], es: ["Única jugada", "Jugada única", "única"] },
  { id: "best", ko: "최선의 수", en: ["Best"], hi: ["सर्वश्रेष्ठ चाल", "सर्वोत्तम चाल"], ja: ["最善手"], zh: ["最佳"], es: ["Mejor"] },
  { id: "excellent", ko: "우수한 수", en: ["Excellent"], hi: ["उत्कृष्ट"], ja: ["好手"], zh: ["优秀"], es: ["Excelente"] },
  { id: "good", ko: "^좋은 수$", en: ["Good"], hi: ["अच्छी चाल"], ja: ["良手"], zh: ["好着法", "好棋", "良好"], es: ["Buena"] },
  { id: "book", ko: "이론적인 수|이론 수", en: ["Book"], hi: ["थ्योरी", "बुक"], ja: ["定跡"], zh: ["开局库", "定式", "理论"], es: ["Teoría", "Libro", "teórica"] },
  { id: "inaccuracy", ko: "부정확", en: ["Inaccura"], hi: ["अशुद्धि", "अशुद्ध"], ja: ["疑問手", "不正確"], zh: ["不精确", "不准确"], es: ["Imprecis"] },
  { id: "mistake", ko: "^실수$", en: ["Mistake"], hi: ["गलती"], ja: ["悪手"], zh: ["失误", "错着", "错误"], es: ["Error"] },
  { id: "miss", ko: "놓친 수", en: ["Miss"], hi: ["चूक"], ja: ["見逃し"], zh: ["漏着", "错失"], es: ["Oportunidad perdida", "perdida", "Fallo"] },
  { id: "blunder", ko: "블런더", en: ["Blunder"], hi: ["भारी भूल", "ब्लंडर"], ja: ["大悪手", "ブランダー"], zh: ["大漏着", "严重失误", "漏着"], es: ["Error grave", "Blunder", "Pifia"] },
  // ── 규칙·결과 ──
  { id: "checkmate", ko: "체크메이트", en: ["Checkmate"], hi: ["शहमात"], ja: ["チェックメイト"], zh: ["将杀"], es: ["Jaque mate"] },
  { id: "check", ko: "체크(?!메이트|박스|리스트|인|아웃)", en: ["Check"], hi: ["शह"], ja: ["チェック"], zh: ["将军"], es: ["Jaque"] },
  { id: "stalemate", ko: "스테일메이트", en: ["Stalemate"], hi: ["स्टेलमेट", "गतिरोध"], ja: ["ステイルメイト", "ステールメイト"], zh: ["逼和"], es: ["Ahogado", "Rey ahogado"] },
  { id: "draw", ko: "무승부", en: ["Draw"], hi: ["ड्रॉ"], ja: ["引き分け", "ドロー"], zh: ["和棋"], es: ["Tablas"] },
  { id: "resign", ko: "기권", en: ["Resign"], hi: ["हार मान", "रिज़ाइन", "इस्तीफ"], ja: ["投了"], zh: ["认输"], es: ["Abandon", "Rendi", "Rendición"] },
  { id: "castling", ko: "캐슬링", en: ["Castling", "Castle"], hi: ["कैसलिंग", "किलेबंदी", "कैसल"], ja: ["キャスリング"], zh: ["王车易位"], es: ["Enroque"] },
  { id: "enpassant", ko: "앙파상", en: ["En passant"], hi: ["एन पासां", "एन पासैंट", "एन पासेंट"], ja: ["アンパッサン"], zh: ["吃过路兵"], es: ["Captura al paso", "al paso"] },
  { id: "promotion", ko: "프로모션", en: ["Promotion", "Promote"], hi: ["प्रमोशन", "पदोन्नति"], ja: ["プロモーション"], zh: ["升变"], es: ["Coronación", "Promoción", "Coronar", "Promocion"] },
  // ── 전술 ──
  { id: "fork", ko: "포크", en: ["Fork"], hi: ["फ़ोर्क", "फोर्क"], ja: ["フォーク"], zh: ["捉双", "双重攻击"], es: ["Horquilla"] },
  { id: "pin", ko: "(?<![가-힣])핀(?![가-힣]*[란트])", en: ["Pin"], hi: ["पिन"], ja: ["ピン"], zh: ["牵制"], es: ["Clavada"] },
  { id: "skewer", ko: "스큐어", en: ["Skewer"], hi: ["स्क्यूअर", "स्क्यूर"], ja: ["スキュアー", "スキューア"], zh: ["串击", "穿击"], es: ["Ensartada", "Enfilada"] },
  { id: "discovered", ko: "디스커버드", en: ["Discovered"], hi: ["डिस्कवर्ड"], ja: ["ディスカバード"], zh: ["闪击"], es: ["Descubiert"] },
  { id: "sacrifice", ko: "희생", en: ["Sacrifice"], hi: ["बलिदान", "कुर्बान", "क़ुर्बान"], ja: ["サクリファイス", "犠牲", "駒を捨て"], zh: ["弃子"], es: ["Sacrific"] },
  { id: "gambit", ko: "갬빗", en: ["Gambit"], hi: ["गैम्बिट", "गैंबिट"], ja: ["ギャンビット"], zh: ["弃兵"], es: ["Gambito"] },
  { id: "tactics", ko: "전술", en: ["Tactic"], hi: ["टैक्टिक", "युक्ति"], ja: ["戦術"], zh: ["战术"], es: ["Táctic"] },
  { id: "strategy", ko: "전략", en: ["Strateg"], hi: ["रणनीति"], ja: ["戦略"], zh: ["战略", "策略"], es: ["Estrategia", "estratég"] },
  // ── 단계·개념 ──
  { id: "opening", ko: "오프닝", en: ["Opening"], hi: ["ओपनिंग"], ja: ["オープニング"], zh: ["开局"], es: ["Apertura"] },
  { id: "middlegame", ko: "미들게임", en: ["Middlegame"], hi: ["मिडिलगेम", "मिडलगेम"], ja: ["ミドルゲーム"], zh: ["中局"], es: ["Medio juego", "Mediojuego"] },
  { id: "endgame", ko: "엔드게임", en: ["Endgame"], hi: ["एंडगेम"], ja: ["エンドゲーム"], zh: ["残局"], es: ["Final", "Finales"] },
  { id: "position", ko: "포지션", en: ["Position"], hi: ["पोज़ीशन", "पोजीशन", "स्थिति"], ja: ["ポジション"], zh: ["局面"], es: ["Posición", "Posicion"] },
  { id: "rating", ko: "레이팅", en: ["Rating"], hi: ["रेटिंग"], ja: ["レーティング"], zh: ["等级分"], es: ["Rating", "Elo", "Puntuación"] },
  { id: "accuracy", ko: "정확도", en: ["Accuracy"], hi: ["सटीकता"], ja: ["精度", "正確度"], zh: ["准确率", "准确度"], es: ["Precisión"] },
  { id: "engine", ko: "엔진", en: ["Engine"], hi: ["इंजन"], ja: ["エンジン"], zh: ["引擎"], es: ["Motor"] },
  { id: "review", ko: "리뷰", en: ["Review"], hi: ["रिव्यू", "समीक्षा"], ja: ["レビュー"], zh: ["复盘"], es: ["Revisión", "Revision"] },
  { id: "puzzle", ko: "퍼즐", en: ["Puzzle"], hi: ["पहेली", "पहेलियाँ", "पहेलियों", "पज़ल", "पजल"], ja: ["パズル"], zh: ["谜题", "棋题", "解谜", "解题"], es: ["Puzle", "Problema", "Puzzle", "Ejercicio"] },
  { id: "rematch", ko: "재대국", en: ["Rematch"], hi: ["रीमैच", "दोबारा"], ja: ["再戦"], zh: ["再战", "再来一局"], es: ["Revancha"] },
  // ── 시간 제어(영어 표기를 그대로 쓰는 것이 관례) ──
  { id: "bullet", ko: "불릿", en: ["Bullet"], hi: ["बुलेट", "Bullet"], ja: ["ブレット", "Bullet"], zh: ["超快棋", "子弹", "Bullet"], es: ["Bullet", "Bala"] },
  { id: "blitz", ko: "블리츠", en: ["Blitz"], hi: ["ब्लिट्ज़", "ब्लिट्ज", "Blitz"], ja: ["ブリッツ", "Blitz"], zh: ["闪电战", "Blitz"], es: ["Blitz"] },
  { id: "rapid", ko: "래피드", en: ["Rapid"], hi: ["रैपिड", "Rapid"], ja: ["ラピッド", "Rapid"], zh: ["快棋", "Rapid"], es: ["Rápid", "Rapid"] },
];
export const LANG_CODES = ["en", "hi", "ja", "zh", "es"];
// 용어집이 오탐하는 경우만 적는다: { "원문 키": ["용어 id", …] } — 반드시 이유를 주석으로 남길 것.
export const GLOSSARY_EXEMPT = {
  "{0} OC 나이트 코인": ["knight"], "OC 나이트 코인": ["knight"], // 재화 이름(OC Knight Coin)의 "나이트"는 기물이 아니라 브랜드 이름 — 번역에서 기물 표기를 쓰지 않는다
};
