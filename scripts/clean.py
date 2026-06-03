#!/usr/bin/env python3
"""
VIETSAFE E&C - Bước 1: Làm sạch file .md
Xử lý: Luật/NĐ/TT, QCVN, TCVN
"""
import re
import sys
from pathlib import Path

# --- Patterns cần xóa ---
NOISE_PATTERNS = [
    r'^CÔNG BÁO/.*',
    r'^QCVN\s+\d+.*BXD.*$',
    r'^QCVN\s+\d+.*BCA.*$',
    r'^QCVN\s+\d+.*–.*$',
    r'^TCVN\s+\d+\s*:\s*\d+\s*$',
    r'^!\[.*?\]\(.*?\)\s*$',          # ảnh markdown
    r'^\d{1,3}\s*$',                  # số trang đứng một mình
    r'^Số\s+\d+.*trang\s+\d+.*$',
    r'^\-\-\-+\s*$',                  # đường kẻ ngang thừa (giữ 1 nếu cần)
]

NOISE_RE = [re.compile(p, re.IGNORECASE) for p in NOISE_PATTERNS]

def detect_type(content: str, filename: str) -> str:
    fname = filename.upper()
    if "QCVN" in fname:
        return "QCVN"
    if "TCVN" in fname or "TC_" in fname:
        return "TCVN"
    if re.search(r'Luật\s+số|LUẬT\s+SỐ|/QH\d+|NĐ-CP|TT-B', content[:500]):
        return "LUAT"
    if re.search(r'QUY CHUẨN KỸ THUẬT', content[:500], re.IGNORECASE):
        return "QCVN"
    if re.search(r'TIÊU CHUẨN QUỐC GIA|TCVN', content[:500], re.IGNORECASE):
        return "TCVN"
    return "LUAT"

def extract_meta(content: str, doc_type: str) -> dict:
    meta = {
        "loai": doc_type,
        "van_ban": "",
        "co_quan": "",
        "nam": "",
        "hieu_luc": "",
        "so_hieu": ""
    }

    if doc_type == "LUAT":
        m = re.search(r'Luật\s+số[:\s]+(\d+/\d+/\w+)', content[:2000], re.IGNORECASE)
        if m:
            meta["so_hieu"] = m.group(1)
            meta["van_ban"] = f"Luật {m.group(1)}"
            year = re.search(r'/(\d{4})/', m.group(1))
            if year:
                meta["nam"] = year.group(1)
        m2 = re.search(r'(Quốc hội|Chính phủ|Bộ\s+\w+)', content[:500])
        if m2:
            meta["co_quan"] = m2.group(1)

    elif doc_type == "QCVN":
        m = re.search(r'QCVN\s+([\d:./\w]+)', content[:1000], re.IGNORECASE)
        if m:
            meta["so_hieu"] = "QCVN " + m.group(1).strip()
            meta["van_ban"] = meta["so_hieu"]
            year = re.search(r'(\d{4})', m.group(1))
            if year:
                meta["nam"] = year.group(1)
        meta["co_quan"] = "Bộ Xây dựng / Bộ Công an"

    elif doc_type == "TCVN":
        m = re.search(r'TCVN\s+([\d\s:]+)', content[:1000], re.IGNORECASE)
        if m:
            meta["so_hieu"] = "TCVN " + m.group(1).strip()
            meta["van_ban"] = meta["so_hieu"]
            year = re.search(r'(\d{4})', m.group(1))
            if year:
                meta["nam"] = year.group(1)
        meta["co_quan"] = "Bộ Khoa học và Công nghệ"

    return meta

def clean_lines(lines: list) -> list:
    cleaned = []
    prev_blank = False

    for line in lines:
        stripped = line.rstrip()

        # Xóa dòng rác
        if any(p.match(stripped.strip()) for p in NOISE_RE):
            continue

        # Gộp nhiều dòng trắng liên tiếp thành 1
        if stripped == "":
            if prev_blank:
                continue
            prev_blank = True
        else:
            prev_blank = False

        cleaned.append(stripped)

    return cleaned

def clean_file(input_path: Path, output_dir: Path) -> dict:
    content = input_path.read_text(encoding="utf-8")
    doc_type = detect_type(content, input_path.name)
    meta = extract_meta(content, doc_type)

    lines = content.splitlines()
    cleaned = clean_lines(lines)
    clean_content = "\n".join(cleaned).strip()

    # Lưu file sạch
    output_dir.mkdir(parents=True, exist_ok=True)
    out_path = output_dir / input_path.name
    out_path.write_text(clean_content, encoding="utf-8")

    reduction = (1 - len(clean_content) / len(content)) * 100
    print(f"  [CLEAN] {input_path.name} -> {doc_type} | giảm {reduction:.0f}% | {len(cleaned)} dòng")

    return {"path": out_path, "meta": meta, "type": doc_type}

if __name__ == "__main__":
    raw_dir = Path("raw")
    clean_dir = Path("data/clean")

    files = list(raw_dir.glob("**/*.md"))
    print(f"\n=== BƯỚC 1: LÀM SẠCH === ({len(files)} file)\n")

    for f in files:
        clean_file(f, clean_dir)

    print(f"\nXong! File sạch lưu tại: {clean_dir}/")
