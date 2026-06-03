#!/usr/bin/env python3
"""
VIETSAFE E&C - Bước 2: Chunk thông minh theo cấu trúc văn bản
- Luật/NĐ/TT: chunk theo Điều, chia nhỏ nếu > MAX_TOKENS
- QCVN/TCVN: chunk theo mục số (x.x, x.x.x), chia nhỏ nếu > MAX_TOKENS
"""
import re
import json
from pathlib import Path
from clean import detect_type, extract_meta

MAX_TOKENS = 1500  # Giới hạn token/chunk để tối ưu RAG

DIEU_RE = re.compile(r'^#{1,4}\s*(Điều\s+(\d+)[\.:]?\s*(.*))', re.IGNORECASE)
MUC_SO_RE = re.compile(r'^#{1,4}\s*(\d+\.\d+(?:\.\d+)?)\s+(.*)')
CHUONG_RE = re.compile(r'^#{1,3}\s*(Chương\s+[IVXLCDM\d]+[\.:]?\s*(.*))', re.IGNORECASE)
PHAN_RE = re.compile(r'^#{1,3}\s*(Phần\s+\d+|Phụ lục\s+\w+)[\.:]?\s*(.*)', re.IGNORECASE)
KHOAN_RE = re.compile(r'^\d+\.\s')  # Khoản: "1. ...", "2. ..."
DIEM_RE = re.compile(r'^[a-zđ]\)\s')  # Điểm: "a) ...", "b) ..."

def estimate_tokens(text: str) -> int:
    return len(text) // 4

def split_large_chunk(chunk: dict, max_tokens: int = MAX_TOKENS) -> list:
    """Chia chunk quá lớn theo khoản/đoạn văn"""
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
                "don_vi": f"{chunk['don_vi']} (phần {sub_idx})",
                "content": text,
                "tokens": estimate_tokens(text)
            })
            sub_idx += 1

    for line in lines:
        line_tokens = estimate_tokens(line)
        # Ngắt tại khoản hoặc điểm nếu đã đủ lớn
        is_break = (KHOAN_RE.match(line) or DIEM_RE.match(line)) and current_tokens >= max_tokens // 2
        if is_break:
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
        content = md_file.read_text(encoding="utf-8")
        doc_type = detect_type(content, md_file.name)
        meta = extract_meta(content, doc_type)

        if meta["loai"] == "LUAT":
            chunks = split_by_dieu(content, meta)
        else:
            chunks = split_by_muc(content, meta)

        # Merge chunk quá nhỏ
        merged = []
        for c in chunks:
            if merged and c["tokens"] < 80:
                merged[-1]["content"] += "\n\n" + c["content"]
                merged[-1]["tokens"] = estimate_tokens(merged[-1]["content"])
            else:
                merged.append(c)

        all_chunks.extend(merged)
        tokens_all = [c["tokens"] for c in merged]
        print(f"  [CHUNK] {md_file.name[:40]}: {len(merged)} chunks | avg={sum(tokens_all)//len(tokens_all)} | max={max(tokens_all)} token")

    out_file = output_dir / "chunks.jsonl"
    with open(out_file, "w", encoding="utf-8") as f:
        for c in all_chunks:
            f.write(json.dumps(c, ensure_ascii=False) + "\n")

    print(f"\nXong! {len(all_chunks)} chunks -> {out_file}")
    return all_chunks

if __name__ == "__main__":
    clean_dir = Path("data/clean")
    output_dir = Path("data")
    print(f"\n=== BƯỚC 2: CHUNK ===\n")
    process_all(clean_dir, output_dir)
