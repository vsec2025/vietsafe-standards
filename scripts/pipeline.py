#!/usr/bin/env python3
"""
VIETSAFE E&C - Pipeline tổng: chạy 3 bước liên tiếp
Dùng: python scripts/pipeline.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from clean import clean_file, detect_type, extract_meta
from chunk import process_all as chunk_all
from index import build_index

RAW_DIR = Path("raw")
CLEAN_DIR = Path("data/clean")
DATA_DIR = Path("data")

def run():
    md_files = list(RAW_DIR.glob("**/*.md"))
    if not md_files:
        print("[!] Không tìm thấy file .md trong thư mục raw/")
        return

    print(f"\n{'='*50}")
    print(f"VIETSAFE Standards Pipeline")
    print(f"{'='*50}")
    print(f"Tìm thấy: {len(md_files)} file\n")

    # Bước 1: Clean
    print(">>> BƯỚC 1: LÀM SẠCH")
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
