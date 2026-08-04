#!/usr/bin/env python3
"""
VIETSAFE E&C - Buoc 2: Chunk thong minh theo cau truc van ban
- Luat/ND/TT: chunk theo Dieu, chia nho neu > MAX_TOKENS
- QCVN/TCVN: chunk theo muc so (x.x, x.x.x), chia nho neu > MAX_TOKENS
- Tieu chuan nuoc ngoai (NFPA, IBC...): dung chunk_nfpa.py
"""
import re
import json
import unicodedata
from pathlib import Path
from clean import detect_type, extract_meta, parse_front_matter
from clause import split_document
from chunk_nfpa import detect_foreign_standard, process_foreign_file


def slugify(s: str) -> str:
    """'QCVN 06:2022/BXD' -> 'qcvn-06-2022-bxd' — dùng làm tiền tố mã điều khoản."""
    s = unicodedata.normalize("NFKD", (s or "").lower())
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", s)).strip("-") or "vb"


def _to_chunk(c: dict, meta: dict) -> dict:
    """Chuyển một điều khoản thành chunk kèm mã định danh ổn định.

    clause_id là nền cho Giai đoạn 1 (bấm vào trích dẫn mở đúng điều khoản).
    """
    doc_slug = slugify(meta.get("so_hieu") or meta.get("van_ban"))
    clause_id = f"{doc_slug}/{c['don_vi'].replace(' ', '')}"
    return {
        "id": clause_id,
        "clause_id": clause_id,
        "doc_slug": doc_slug,
        "van_ban": meta.get("van_ban", ""),
        "so_hieu": meta.get("so_hieu", ""),
        "loai": meta.get("loai", ""),
        "co_quan": meta.get("co_quan", ""),
        "nam": meta.get("nam", ""),
        "source": meta.get("source", ""),
        "language": meta.get("language", "vi"),
        "phan": c.get("phan", ""),
        "chuong": c.get("chuong", ""),
        "so_dieu": c.get("so_dieu", ""),
        "don_vi": c.get("don_vi", ""),
        "tieu_de": c.get("tieu_de", ""),
        "content": c["content"],
        "tokens": c["tokens"],
    }

MAX_TOKENS = 1500  # Gioi han token/chunk de toi uu RAG

# Các mẫu phải khớp cả dạng CÓ DẤU (văn bản thật) lẫn KHÔNG DẤU.
# Trước đây chỉ có dạng không dấu ("Dieu") nên toàn bộ Luật không sinh chunk nào.
DIEU_RE = re.compile(r'^#{1,6}\s*\*{0,2}\s*((?:Điều|Dieu)\s+(\d+)[\.:]?\s*(.*))', re.IGNORECASE)

# Mục đánh số. Phải chấp nhận cả ba biến thể gặp trong tiêu chuẩn Việt Nam:
#   "3.2.8 Lối ra"        — không có dấu chấm cuối
#   "1.1. Phạm vi"        — CÓ dấu chấm cuối (rất phổ biến; trước đây trượt hết)
#   "I.1.16. Rò dầu"      — tiền tố số La Mã (11 TCN, quy phạm trang bị điện)
# Heading cũng hay bọc trong **đậm** và sâu tới 5-6 cấp '#'.
MUC_SO_RE = re.compile(r'^#{1,6}\s*\*{0,2}\s*((?:[IVXLC]+\.)?\d+(?:\.\d+)+)\.?\s*\*{0,2}\s*(.*)')

CHUONG_RE = re.compile(r'^#{1,4}\s*\*{0,2}\s*((?:Chương|Chuong)\s+[IVXLCDM\d.]+[\.:]?\s*(.*))', re.IGNORECASE)
PHAN_RE = re.compile(r'^#{1,4}\s*\*{0,2}\s*((?:Phần|Phan)\s+[IVXLCDM\d]+|(?:Phụ lục|Phu luc)\s+\w+)[\.:]?\s*(.*)', re.IGNORECASE)
KHOAN_RE = re.compile(r'^\d+\.\s')
DIEM_RE = re.compile(r'^[a-zđ]\)\s', re.IGNORECASE)


def estimate_tokens(text: str) -> int:
    return len(text) // 4


def split_large_chunk(chunk: dict, max_tokens: int = MAX_TOKENS) -> list:
    if chunk["tokens"] <= max_tokens:
        return [chunk]
    content = chunk["content"]
    lines = content.splitlines()
    sub_chunks = []
    current_lines = []
    current_tokens = 0
    sub_idx = 1

    def save_sub():
        nonlocal sub_idx
        if current_lines:
            text = "\n".join(current_lines).strip()
            if len(text) < 30:
                return
            sub_chunks.append({
                **chunk,
                "id": f"{chunk['id']}-p{sub_idx}",
                "don_vi": f"{chunk['don_vi']} (phan {sub_idx})",
                "content": text,
                "tokens": estimate_tokens(text)
            })
            sub_idx += 1

    for line in lines:
        line_tokens = estimate_tokens(line)
        # Ưu tiên cắt tại dấu khoản/điểm khi đã đủ dài
        at_marker = (KHOAN_RE.match(line) or DIEM_RE.match(line)) and current_tokens >= max_tokens // 2
        # Chặn cứng: đoạn không có dấu khoản/điểm (vd. bảng dài) vẫn phải cắt,
        # nếu không sẽ sinh chunk khổng lồ chiếm trọn ngữ cảnh gửi cho AI.
        over_cap = current_lines and (current_tokens + line_tokens) > max_tokens
        if at_marker or over_cap:
            save_sub()
            current_lines = [line]
            current_tokens = line_tokens
        else:
            current_lines.append(line)
            current_tokens += line_tokens
    save_sub()
    return sub_chunks if sub_chunks else [chunk]


def split_by_dieu(content: str, meta: dict) -> list:
    chunks = []
    lines = content.splitlines()
    current_chuong = ""
    current_dieu = None
    current_tieu_de = ""
    current_lines = []

    def save_chunk():
        if current_dieu and current_lines:
            text = "\n".join(current_lines).strip()
            if len(text) < 50:
                return
            so_hieu_id = meta['so_hieu'].lower().replace('/', '-').replace(' ', '').replace(':', '')
            chunk = {
                "id": f"{so_hieu_id}-dieu-{current_dieu}",
                "van_ban": meta["van_ban"],
                "so_hieu": meta["so_hieu"],
                "loai": meta["loai"],
                "co_quan": meta["co_quan"],
                "nam": meta["nam"],
                "source": meta.get("source", ""),
                "language": meta.get("language", "vi"),
                "phan": current_chuong,
                "don_vi": f"Điều {current_dieu}",
                "tieu_de": current_tieu_de,
                "content": text,
                "tokens": estimate_tokens(text)
            }
            for sub in split_large_chunk(chunk):
                chunks.append(sub)

    for line in lines:
        if CHUONG_RE.match(line):
            current_chuong = CHUONG_RE.match(line).group(1).strip()
        elif DIEU_RE.match(line):
            save_chunk()
            m = DIEU_RE.match(line)
            current_dieu = m.group(2)
            current_tieu_de = m.group(3).strip()
            current_lines = [line]
        elif current_dieu is not None:
            current_lines.append(line)

    save_chunk()
    return chunks


def split_by_muc(content: str, meta: dict) -> list:
    chunks = []
    lines = content.splitlines()
    current_phan = ""
    current_muc = None
    current_tieu_de = ""
    current_lines = []

    def save_chunk():
        if current_muc and current_lines:
            text = "\n".join(current_lines).strip()
            if len(text) < 50:
                return
            so_hieu_id = meta['so_hieu'].lower().replace('/', '-').replace(' ', '').replace(':', '')
            chunk = {
                "id": f"{so_hieu_id}-{current_muc.replace('.', '-')}",
                "van_ban": meta["van_ban"],
                "so_hieu": meta["so_hieu"],
                "loai": meta["loai"],
                "co_quan": meta["co_quan"],
                "nam": meta["nam"],
                "source": meta.get("source", ""),
                "language": meta.get("language", "vi"),
                "phan": current_phan,
                "don_vi": current_muc,
                "tieu_de": current_tieu_de,
                "content": text,
                "tokens": estimate_tokens(text)
            }
            for sub in split_large_chunk(chunk):
                chunks.append(sub)

    for line in lines:
        m_phan = PHAN_RE.match(line)
        m_muc = MUC_SO_RE.match(line)
        if m_phan:
            current_phan = (m_phan.group(1) + " " + m_phan.group(2)).strip()
        elif m_muc:
            level = m_muc.group(1).count(".")
            if level >= 1:
                save_chunk()
                current_muc = m_muc.group(1)
                current_tieu_de = m_muc.group(2).strip()
                current_lines = [line]
            else:
                current_phan = (m_muc.group(1) + " " + m_muc.group(2)).strip()
                if current_muc:
                    current_lines.append(line)
        elif current_muc is not None:
            current_lines.append(line)

    save_chunk()
    return chunks


def process_all(clean_dir: Path, output_dir: Path):
    output_dir.mkdir(parents=True, exist_ok=True)
    all_chunks = []

    for md_file in sorted(clean_dir.glob("**/*.md")):
        # NFC: macOS lưu dấu tiếng Việt dạng tách rời (NFD) -> "Điều" không khớp regex
        raw = unicodedata.normalize("NFC", md_file.read_text(encoding="utf-8"))
        # Metadata do bước clean ghi sẵn — không trích lại từ nội dung đã làm sạch
        fm, content = parse_front_matter(raw)

        if detect_foreign_standard(content, md_file.name):
            merged = process_foreign_file(md_file, output_dir)
            label = "FOREIGN"
        else:
            doc_type = fm.get("loai") or detect_type(content, md_file.name)
            if fm.get("so_hieu"):
                meta = {
                    "loai": doc_type,
                    "van_ban": fm.get("van_ban", ""),
                    "so_hieu": fm.get("so_hieu", ""),
                    "co_quan": fm.get("co_quan", ""),
                    "nam": fm.get("nam", ""),
                    "hieu_luc": fm.get("hieu_luc", ""),
                }
            else:
                # File cũ chưa có front-matter: trích như trước, kèm gợi ý tên file
                meta = extract_meta(content, doc_type, md_file.name)

            meta["source"] = fm.get("source") or md_file.name

            if not meta["so_hieu"]:
                print(f" [WARN] {md_file.name[:40]}: KHÔNG xác định được số hiệu -> "
                      f"trích dẫn sẽ thiếu danh tính văn bản")

            # Cắt theo ĐIỀU KHOẢN THẬT (xem scripts/clause.py). Bản cũ chỉ coi
            # dòng '#' là mốc chia nên phần lớn điều khoản — vốn là đoạn văn mở
            # đầu bằng số điều — bị bỏ sót, sinh ra chunk "(phan 25)" không trỏ
            # tới điều khoản nào cả.
            merged = [_to_chunk(c, meta) for c in split_document(content, MAX_TOKENS)]
            # Cùng một số điều có thể xuất hiện hai lần trong văn bản ghép
            # (phần chính và phần sửa đổi/phụ lục). Mã phải duy nhất để
            # trích dẫn trỏ được về đúng một chỗ.
            seen = {}
            for ch in merged:
                n = seen.get(ch["id"], 0) + 1
                seen[ch["id"]] = n
                if n > 1:
                    ch["id"] = f"{ch['id']}~{n}"
                    ch["clause_id"] = ch["id"]
            label = meta["loai"]

        if not merged:
            print(f" [SKIP] {md_file.name[:40]}: 0 chunks -- khong nhan dang duoc cau truc!")
            continue

        all_chunks.extend(merged)
        tokens_all = [c["tokens"] for c in merged]
        print(f" [CHUNK] {md_file.name[:40]} ({label}): {len(merged)} chunks | avg={sum(tokens_all)//len(tokens_all)} | max={max(tokens_all)} token")

    out_file = output_dir / "chunks.jsonl"
    with open(out_file, "w", encoding="utf-8") as f:
        for c in all_chunks:
            f.write(json.dumps(c, ensure_ascii=False) + "\n")

    print(f"\nXong! {len(all_chunks)} chunks -> {out_file}")
    return all_chunks


if __name__ == "__main__":
    clean_dir = Path("data/clean")
    output_dir = Path("data")
    print(f"\n=== BUOC 2: CHUNK ===\n")
    process_all(clean_dir, output_dir)
