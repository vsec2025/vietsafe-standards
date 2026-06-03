#!/usr/bin/env python3
"""
VIETSAFE E&C - Bước 3: Build BM25 index từ chunks.jsonl
Output: search_index.json (dùng trong webapp để tìm kiếm không cần AI)
"""
import json
import math
import re
from pathlib import Path
from collections import defaultdict

# Stopwords tiếng Việt phổ biến (không có giá trị tìm kiếm)
STOPWORDS = {
    "và", "của", "trong", "để", "các", "có", "được", "là", "tại", "theo",
    "về", "đến", "với", "không", "hoặc", "khi", "cho", "từ", "này", "đó",
    "một", "những", "như", "trên", "dưới", "sau", "trước", "giữa", "nếu",
    "thì", "mà", "bởi", "vì", "nên", "cũng", "đã", "sẽ", "đang", "bị",
    "phải", "cần", "có thể", "theo", "do", "tuy", "vậy", "tức", "tuy nhiên",
    "tại", "ở", "vào", "ra", "lên", "xuống", "đi", "lại", "thêm", "đây"
}

def tokenize(text: str) -> list:
    """Tokenize tiếng Việt đơn giản: lowercase + tách từ + bỏ stopwords"""
    text = text.lower()
    # Giữ chữ cái, số, dấu tiếng Việt
    text = re.sub(r'[^\w\sàáâãèéêìíòóôõùúýăđơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]', ' ', text)
    tokens = text.split()
    # Bỏ stopwords và token quá ngắn
    return [t for t in tokens if t not in STOPWORDS and len(t) >= 2]

def build_bm25_index(chunks: list, k1: float = 1.5, b: float = 0.75) -> dict:
    """
    Build BM25 index
    k1: điều chỉnh tần suất term (1.2-2.0)
    b: điều chỉnh theo độ dài doc (0.75 chuẩn)
    """
    N = len(chunks)
    if N == 0:
        return {}

    # Tokenize tất cả chunks
    tokenized = []
    for chunk in chunks:
        # Index cả title và content, title có trọng số cao hơn (nhân 3)
        combined = (chunk.get("tieu_de", "") + " ") * 3 + \
                   (chunk.get("don_vi", "") + " ") * 2 + \
                   chunk.get("content", "")
        tokens = tokenize(combined)
        tokenized.append(tokens)

    # Tính avgdl
    avgdl = sum(len(t) for t in tokenized) / N

    # Tính document frequency
    df = defaultdict(int)
    for tokens in tokenized:
        for term in set(tokens):
            df[term] += 1

    # Tính IDF
    idf = {}
    for term, freq in df.items():
        idf[term] = math.log((N - freq + 0.5) / (freq + 0.5) + 1)

    # Build inverted index: term -> [(chunk_idx, bm25_score)]
    inverted = defaultdict(list)
    for idx, tokens in enumerate(tokenized):
        dl = len(tokens)
        tf_counter = defaultdict(int)
        for t in tokens:
            tf_counter[t] += 1

        for term, tf in tf_counter.items():
            score = idf.get(term, 0) * (
                tf * (k1 + 1) /
                (tf + k1 * (1 - b + b * dl / avgdl))
            )
            if score > 0.1:
                inverted[term].append([idx, round(score, 3)])

    # Sắp xếp theo score giảm dần
    for term in inverted:
        inverted[term].sort(key=lambda x: -x[1])
        # Giới hạn 50 kết quả/term để tiết kiệm dung lượng
        inverted[term] = inverted[term][:50]

    return dict(inverted), idf

def build_index(chunks_file: Path, output_dir: Path):
    # Đọc chunks
    chunks = []
    with open(chunks_file, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                chunks.append(json.loads(line))

    print(f"  Đang index {len(chunks)} chunks...")

    inverted, idf = build_bm25_index(chunks)

    # Tạo metadata tóm tắt (không lưu full content trong index để nhẹ)
    chunk_meta = []
    for c in chunks:
        chunk_meta.append({
            "id": c["id"],
            "van_ban": c["van_ban"],
            "so_hieu": c["so_hieu"],
            "loai": c["loai"],
            "nam": c["nam"],
            "phan": c.get("phan", ""),
            "don_vi": c.get("don_vi", ""),
            "tieu_de": c.get("tieu_de", ""),
            "tokens": c.get("tokens", 0),
        })

    # Thống kê theo văn bản
    stats = defaultdict(lambda: {"chunks": 0, "tokens": 0})
    for c in chunks:
        stats[c["so_hieu"]]["chunks"] += 1
        stats[c["so_hieu"]]["tokens"] += c.get("tokens", 0)

    index_data = {
        "version": "1.0",
        "total_chunks": len(chunks),
        "total_terms": len(inverted),
        "van_ban": [
            {"so_hieu": k, "chunks": v["chunks"], "tokens": v["tokens"]}
            for k, v in stats.items()
        ],
        "chunks": chunk_meta,
        "inverted": inverted,
    }

    out_file = output_dir / "search_index.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(index_data, f, ensure_ascii=False, separators=(",", ":"))

    size_kb = out_file.stat().st_size / 1024
    print(f"  [INDEX] {len(inverted)} terms | {len(chunks)} chunks | {size_kb:.0f} KB -> {out_file}")

    # Cập nhật index.json tóm tắt (cho webapp)
    summary = {
        "last_updated": __import__("time").strftime("%Y-%m-%dT%H:%M:%SZ"),
        "total_chunks": len(chunks),
        "van_ban": index_data["van_ban"]
    }
    summary_file = output_dir / "index.json"
    with open(summary_file, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    print(f"  [SUMMARY] index.json cập nhật: {len(stats)} văn bản")

if __name__ == "__main__":
    chunks_file = Path("data/chunks.jsonl")
    output_dir = Path("data")
    print(f"\n=== BƯỚC 3: BUILD INDEX ===\n")
    build_index(chunks_file, output_dir)
    print(f"\nXong! Sẵn sàng cho webapp.")
