#!/usr/bin/env python3
"""(v0.6.3) 수 등급 이펙트 가운데 큰 기호 이미지(public/move-fx/*.png) 생성.
수 체계 아이콘 PNG(public/Move Classifications_*.png)에서 흰 기호만 떼어(그림자·배경 제외) 기호에 딱 맞게 잘라
정사각형 가운데에 둔 384px 이미지로 만든다. 출력의 'glyph' 비율(아이콘 속 기호 크기 × 0.95)은 src/app/common.jsx MOVE_FX에 옮겨 적는다.
실행: python3 scripts/build-move-fx-glyphs.py  (Pillow 필요)"""
from PIL import Image
import json
KINDS = {"excellent": "Excellent", "good": "Good", "book": "Book", "inaccuracy": "Inaccuarcy", "mistake": "Mistake", "miss": "Miss", "blunder": "Blunder"}
OUT = 384
res = {}
for kind, name in KINDS.items():
    im = Image.open(f"public/Move Classifications_{name}.png").convert("RGBA")
    px = im.load(); w, h = im.size
    mask = Image.new("L", (w, h), 0); mp = mask.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0: continue
            v = (min(r, g, b) - 170) / 70.0   # 흰색에 가까울수록 불투명(안티앨리어싱 가장자리 유지)
            mp[x, y] = max(0, min(255, int(v * 255)))
    # 아이콘 바깥 모서리의 투명 배경은 위에서 제외됐고, 원형 배경·그림자는 흰색이 아니라 제외된다.
    bbox = mask.point(lambda v: 255 if v > 128 else 0).getbbox()
    sym = Image.new("RGBA", (w, h), (255, 255, 255, 0)); sym.putalpha(mask)
    sym = sym.crop(bbox); bw, bh = sym.size; side = max(bw, bh)
    sq = Image.new("RGBA", (side, side), (255, 255, 255, 0)); sq.paste(sym, ((side - bw) // 2, (side - bh) // 2), sym)
    sq = sq.resize((OUT, OUT), Image.LANCZOS)
    sq.save(f"public/move-fx/{kind}.png", optimize=True)
    res[kind] = round(side / w * 0.95, 2)
print(json.dumps(res))
