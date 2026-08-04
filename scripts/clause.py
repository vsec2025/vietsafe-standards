#!/usr/bin/env python3
"""
Nhận diện và cắt văn bản theo ĐIỀU KHOẢN THẬT.

Vì sao cần: bản cũ chỉ coi dòng bắt đầu bằng '#' là mốc chia. Nhưng phần lớn
điều khoản trong văn bản Việt Nam là ĐOẠN VĂN THƯỜNG mở đầu bằng số điều, ví dụ
"I.1.92. Kết cấu, công dụng..." trong 11 TCN. Hệ quả: 11 TCN có 1.483 điều
khoản nhưng chỉ 14 mốc được nhận ra, và 302 chunk chỉ là lát cắt cơ học của 14
khối khổng lồ — trích dẫn trả về "(phan 25)" thay vì số điều.

Nguyên tắc:
  - Mỗi chunk = một điều khoản, có mã định danh duy nhất.
  - KHÔNG BAO GIỜ cắt ngang một điều khoản; điều quá dài mới chia phần.
  - Điều quá ngắn gộp với điều liền kề, giữ lại dải số điều đã gộp.
  - Giữ ngữ cảnh cha (Phần / Chương) cho mỗi điều.
"""
import re
import unicodedata

# Mốc cấu trúc cấp trên
PHAN_RE = re.compile(
    r'^\s{0,3}(?:#{1,6}\s*)?\*{0,3}\s*'
    r'((?:Phần|Phan|PHẦN|PHAN)\s+[IVXLCDM\d]+|(?:Phụ lục|Phu luc|PHỤ LỤC)\s+[A-ZĐ\w]+)'
    r'[\.:]?\s*(.*)$',
    re.IGNORECASE,
)
CHUONG_RE = re.compile(
    r'^\s{0,3}(?:#{1,6}\s*)?\*{0,3}\s*'
    r'((?:Chương|Chuong|CHƯƠNG)\s+[IVXLCDM\d.]+)[\.:]?\s*(.*)$',
    re.IGNORECASE,
)

# "Điều 5." / "Điều 5:" — dùng cho Luật, Nghị định, Nghị quyết, Thông tư
DIEU_RE = re.compile(
    r'^\s{0,3}(?:#{1,6}\s*)?\*{0,3}\s*((?:Điều|Dieu)\s+(\d+[a-z]?))[\.:]?\s*\*{0,3}\s*(.*)$',
    re.IGNORECASE,
)

# Số điều dạng phân cấp, có thể kèm tiền tố La Mã (I.1.92) hoặc phụ lục (C.3.2.5).
# Dạng HEADING: dấu chấm cuối tuỳ chọn — "## 3.2 Lối ra" hoặc "### 1.1. Phạm vi"
CLAUSE_HEADING_RE = re.compile(
    r'^\s{0,3}#{1,6}\s*\*{0,3}\s*'
    r'((?:[IVXLC]{1,5}|[A-H])\.)?(\d+(?:\.\d+){0,4})'
    r'\.?\s*\*{0,3}\s*(.*)$'
)
# Dạng ĐOẠN VĂN (không có '#'). Ba biến thể thật gặp trong corpus:
#   "I.1.92. Kết cấu..."        -> dấu chấm cuối
#   "**I.1.1.** Quy phạm..."    -> bọc đậm, '**' nằm SAU dấu chấm  (11 TCN)
#   "**1.1.3** Đối với..."      -> bọc đậm, KHÔNG có dấu chấm      (QCVN 06)
#
# Với dạng không dấu chấm, BẮT BUỘC dòng phải mở đầu bằng '**'. Nếu bỏ ràng
# buộc này, các số đo như "1.5 m" hay "2.3 kg" sẽ bị nhận nhầm là số điều.
_NUM = r'((?:[IVXLC]{1,5}|[A-H])\.)?(\d+(?:\.\d+){1,4})'
CLAUSE_INLINE_RES = [
    re.compile(r'^\*{0,3}\s*' + _NUM + r'\.\*{0,3}\s+(\S.*)$'),   # có dấu chấm cuối
    re.compile(r'^\*{2,3}\s*' + _NUM + r'\*{0,3}\s+(\S.*)$'),     # bọc đậm, không dấu chấm
]


def _norm(s: str) -> str:
    return unicodedata.normalize("NFC", s)


def estimate_tokens(text: str) -> int:
    return len(text) // 4


def match_clause(line: str):
    """Trả về (so_dieu, tieu_de) nếu dòng là mốc điều khoản, ngược lại None."""
    line = _norm(line.rstrip())
    if not line.strip():
        return None

    m = DIEU_RE.match(line)
    if m:
        return m.group(1).strip(), m.group(3).strip()

    is_heading = line.lstrip().startswith('#')
    if is_heading:
        m = CLAUSE_HEADING_RE.match(line)
    else:
        m = next((mm for r in CLAUSE_INLINE_RES if (mm := r.match(line))), None)
    if not m:
        return None

    prefix, num, title = m.group(1) or '', m.group(2), (m.group(3) or '')
    # Bỏ dấu đậm còn sót: "**1.1.5 Quy chuẩn này** không áp dụng" -> tiêu đề
    # kéo theo '**' ở giữa, hiển thị rất xấu trong chip trích dẫn.
    title = title.replace('**', '').strip(' .:–-')

    # Heading chỉ có một cấp ("## 1 QUY ĐỊNH CHUNG") là tiêu đề chương, không
    # phải điều khoản — để CHUONG/PHAN xử lý, tránh gom cả chương thành 1 chunk.
    if is_heading and not prefix and '.' not in num:
        return None

    # Số điều bịa: cấp đầu quá lớn thường là năm hoặc số đo
    try:
        if int(num.split('.')[0]) > 999:
            return None
    except ValueError:
        return None

    return f"{prefix}{num}".rstrip('.'), title


def split_document(content: str, max_tokens: int = 1500, min_tokens: int = 120):
    """Cắt toàn văn thành danh sách điều khoản.

    Trả về list dict: {so_dieu, tieu_de, phan, chuong, content, tokens}
    """
    lines = _norm(content).splitlines()
    clauses = []
    phan = chuong = ""
    cur = None

    def flush():
        nonlocal cur
        if cur is None:
            return
        text = "\n".join(cur["lines"]).strip()
        if text:
            cur["content"] = text
            cur["tokens"] = estimate_tokens(text)
            del cur["lines"]
            clauses.append(cur)
        cur = None

    for line in lines:
        m_phan = PHAN_RE.match(line)
        if m_phan:
            flush()
            phan = " ".join(x for x in (m_phan.group(1), m_phan.group(2)) if x).strip()
            chuong = ""
            continue

        m_chuong = CHUONG_RE.match(line)
        if m_chuong:
            flush()
            chuong = " ".join(x for x in (m_chuong.group(1), m_chuong.group(2)) if x).strip()
            continue

        hit = match_clause(line)
        if hit:
            flush()
            so_dieu, tieu_de = hit
            cur = {
                "so_dieu": so_dieu,
                "tieu_de": tieu_de,
                "phan": phan,
                "chuong": chuong,
                "lines": [line],
            }
        elif cur is not None:
            cur["lines"].append(line)
        # nội dung trước điều khoản đầu tiên (bìa, lời nói đầu) được bỏ qua

    flush()
    return _post_process(clauses, max_tokens, min_tokens)


def _post_process(clauses, max_tokens, min_tokens):
    """Gộp điều quá ngắn, chia điều quá dài. Không bao giờ cắt ngang một điều."""
    out = []
    buf = None

    for c in clauses:
        if c["tokens"] > max_tokens:
            if buf:
                out.append(buf)
                buf = None
            out.extend(_split_long(c, max_tokens))
            continue

        if buf is None:
            buf = dict(c, dieu_tu=c["so_dieu"], dieu_den=c["so_dieu"])
            continue

        # Chỉ gộp khi điều trước còn ngắn VÀ cùng ngữ cảnh cha
        same_parent = (buf["phan"], buf["chuong"]) == (c["phan"], c["chuong"])
        if buf["tokens"] < min_tokens and same_parent and buf["tokens"] + c["tokens"] <= max_tokens:
            buf["content"] += "\n\n" + c["content"]
            buf["tokens"] = estimate_tokens(buf["content"])
            buf["dieu_den"] = c["so_dieu"]
        else:
            out.append(buf)
            buf = dict(c, dieu_tu=c["so_dieu"], dieu_den=c["so_dieu"])

    if buf:
        out.append(buf)

    # Nhãn hiển thị: một điều, hay một dải điều đã gộp
    for c in out:
        tu, den = c.get("dieu_tu", c["so_dieu"]), c.get("dieu_den", c["so_dieu"])
        c["don_vi"] = tu if tu == den else f"{tu}–{den}"
    return out


def _split_long(c, max_tokens):
    """Chia một điều khoản quá dài thành nhiều phần, cắt tại ranh giới dòng."""
    lines = c["content"].splitlines()
    parts, cur, cur_tok, idx = [], [], 0, 1

    def save():
        nonlocal cur, cur_tok, idx
        text = "\n".join(cur).strip()
        if text:
            parts.append(dict(
                c, content=text, tokens=estimate_tokens(text),
                don_vi=f"{c['so_dieu']} (phần {idx})",
                dieu_tu=c["so_dieu"], dieu_den=c["so_dieu"],
            ))
            idx += 1
        cur, cur_tok = [], 0

    for line in lines:
        lt = estimate_tokens(line)
        if cur and cur_tok + lt > max_tokens:
            save()
        cur.append(line)
        cur_tok += lt
    save()
    return parts or [dict(c, don_vi=c["so_dieu"])]
