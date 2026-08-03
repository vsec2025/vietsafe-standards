#!/usr/bin/env python3
"""
VIETSAFE E&C - Pipeline tổng: chạy 3 bước liên tiếp
Dùng: python scripts/pipeline.py
"""
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from clean import clean_file, detect_type, extract_meta
from chunk import process_all as chunk_all
from index import build_index

RAW_DIR = Path("raw")
CLEAN_DIR = Path("data/clean")
DATA_DIR = Path("data")


def _key(name: str) -> str:
    # macOS lưu tên file tiếng Việt dạng NFD, git/Linux dùng NFC —
    # phải chuẩn hoá trước khi so sánh, nếu không sẽ xoá nhầm file hợp lệ.
    return unicodedata.normalize("NFC", name)


def sync_clean_dir(md_files) -> list:
    """Xoá các file trong data/clean/ không còn nguồn tương ứng trong raw/.

    raw/ là nguồn sự thật duy nhất. Trước đây bước chunk quét data/clean/ mà
    không ai dọn thư mục này, nên văn bản đã xoá khỏi raw/ vẫn tiếp tục sinh
    chunk vĩnh viễn — AI vẫn trích dẫn văn bản người dùng đã gỡ bỏ.
    """
    if not CLEAN_DIR.exists():
        return []
    keep = {_key(f.name) for f in md_files}
    removed = []
    for f in sorted(CLEAN_DIR.glob("*.md")):
        if _key(f.name) not in keep:
            f.unlink()
            removed.append(f.name)
    return removed


def run():
    md_files = list(RAW_DIR.glob("**/*.md"))

    print(f"\n{'='*50}")
    print(f"VIETSAFE Standards Pipeline")
    print(f"{'='*50}")
    print(f"Tìm thấy: {len(md_files)} file trong raw/\n")

    # Bước 0: Đồng bộ — chạy cả khi raw/ rỗng, để xoá hết văn bản
    # nghĩa là corpus cũng phải rỗng theo.
    print(">>> BƯỚC 0: ĐỒNG BỘ data/clean/ THEO raw/")
    removed = sync_clean_dir(md_files)
    if removed:
        for name in removed:
            print(f"  [GỠ] {name[:60]} — không còn trong raw/, đã xoá khỏi corpus")
    else:
        print("  (không có file mồ côi)")

    if not md_files:
        print("\n[!] raw/ rỗng — corpus sẽ trống.")

    # Bước 1: Clean
    print("\n>>> BƯỚC 1: LÀM SẠCH")
    for f in md_files:
        clean_file(f, CLEAN_DIR)

    # Bước 2: Chunk
    print("\n>>> BƯỚC 2: CHUNK")
    chunk_all(CLEAN_DIR, DATA_DIR)

    # Bước 3: Index
    print("\n>>> BƯỚC 3: BUILD INDEX")
    chunks_file = DATA_DIR / "chunks.jsonl"
    if chunks_file.exists():
        build_index(chunks_file, DATA_DIR)

    print(f"\n{'='*50}")
    print("HOÀN THÀNH! Webapp sẵn sàng.")
    print(f"{'='*50}\n")

if __name__ == "__main__":
    run()
