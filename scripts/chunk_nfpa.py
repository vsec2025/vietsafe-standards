#!/usr/bin/env python3
"""
VIETSAFE E&C - Chunk cho tieu chuan nuoc ngoai (NFPA, IBC, ISO, EN...)
Cau truc: Chapter X -> Section X.Y -> Subsection X.Y.Z
"""
import re
import json
from pathlib import Path

MAX_TOKENS = 1500

CHAPTER_RE      = re.compile(r'^#{1,3}\s*Chapter\s+(\d+)\s*(.*)', re.IGNORECASE)
SECTION_RE      = re.compile(r'^#{1,4}\s*(\d+\.\d+(?:\.\d+(?:\.\d+)?)?)\*?\s+(.*)')
SECTION_BARE_RE = re.compile(r'^(\d+\.\d+(?:\.\d+(?:\.\d+)?)?)\*?\s+([A-Z(].+)')
ANNEX_RE        = re.compile(r'^#{1,3}\s*(Annex\s+[A-Z])\s*(.*)', re.IGNORECASE)


def estimate_tokens(text: str) -> int:
      return len(text) // 4


def detect_foreign_standard(content: str, filename: str) -> bool:
      """Phat hien tieu chuan nuoc ngoai (NFPA, IBC, ISO...)"""
      fname = filename.upper()
      if re.search(r'NFPA|IBC|IFC|ASHRAE|ASCE|ISO[-_]\d|EN[-_]\d', fname):
                return True
            header = content[:1500]
    has_viet = re.search(
              r'Dieu\s+\d+|Luat\s+so|Quy chuan|Tieu chuan quoc gia|Bo Xay dung|TCVN|QCVN'
              r'|Điều|Luật|Quy chuẩn|Tiêu chuẩn|Bộ Xây dựng',
              header
    )
    has_en_code = re.search(
              r'NFPA|Building.*Code|Safety.*Code|Section\s+\d+\.\d+|Chapter\s+1\s+Administration',
              header, re.IGNORECASE
    )
    return (not has_viet) and bool(has_en_code)


def extract_meta_foreign(content: str, filename: str) -> dict:
      """Trich metadata tu tieu chuan nuoc ngoai"""
    meta = {
              "loai": "FOREIGN",
              "van_ban": "",
              "so_hieu": "",
              "co_quan": "",
              "nam": "",
              "lang": "en"
    }
    header = "\n".join(content.splitlines()[:20])

    m = re.search(r'NFPA[®\s]+(\d+\w*)', header, re.IGNORECASE)
    if m:
              meta["so_hieu"] = f"NFPA {m.group(1)}"
              meta["co_quan"] = "NFPA"

    m_year = re.search(r'\b(20\d{2}|19\d{2})\b', header)
    if m_year:
              meta["nam"] = m_year.group(1)

    for line in content.splitlines()[:20]:
              if re.search(r'(Code|Standard|Specification|Guide)', line, re.IGNORECASE) and len(line.strip()) > 10:
                            meta["van_ban"] = line.strip().strip('\u00ae')
                            break

          if not meta["so_hieu"]:
                    meta["so_hieu"] = Path(filename).stem.upper()
                    meta["van_ban"] = meta["so_hieu"]

    return meta


def _make_id(so_hieu: str, section: str) -> str:
      base = re.sub(r'[^\w-]', '-', so_hieu.lower()).strip('-')
    sec  = section.replace('.', '-')
    return f"{base}-sec-{sec}"


def _split_large(chunk: dict, max_tokens: int) -> list:
      """Chia chunk qua lon theo subsection / doan van"""
    lines = chunk["content"].splitlines()
    subs, cur, cur_tok, idx = [], [], 0, 1

    def save():
              nonlocal idx
              if not cur:
                            return
                        text = "\n".join(cur).strip()
        if len(text) < 30:
                      return
                  subs.append({
                                **chunk,
                                "id": f"{chunk['id']}-p{idx}",
                                "don_vi": f"{chunk['don_vi']} (part {idx})",
                                "content": text,
                                "tokens": estimate_tokens(text)
                  })
        idx += 1

    for line in lines:
              lt = estimate_tokens(line)
        is_break = bool(SECTION_BARE_RE.match(line)) and cur_tok >= max_tokens // 2
        if is_break:
                      save()
                      cur, cur_tok = [line], lt
else:
            cur.append(line)
            cur_tok += lt

    save()
    return subs if subs else [chunk]


def split_by_chapter_section(content: str, meta: dict, max_tokens: int = MAX_TOKENS) -> list:
      """
          Chunk NFPA/IBC style:
                - Don vi chinh: Section X.Y  (level-1 = 1 dot)
                      - Gom subsection X.Y.Z vao cung cho den MAX_TOKENS
                            - Tach khi gap section chinh moi hoac vuot nguong
                                  - Annex xu ly rieng
                                      """
    lines = content.splitlines()
    chunks = []

    current_chapter = ""
    current_section = None
    current_title   = ""
    current_lines   = []
    current_tokens  = 0
    in_content      = False
    in_annex        = False

    # Tim vi tri bat dau content that (sau phan TOC / committee)
    # Heuristic: content bat dau khi gap "## Chapter X" va sau do co "### X.Y" hoac "X.Y.Z text"
    # De don gian: danh dau in_content khi Chapter >= 1 va da thay section heading
    content_chapter_count = 0

    def flush():
              nonlocal current_section, current_title, current_lines, current_tokens
        if current_section is None or not current_lines:
                      current_lines = []
                      current_tokens = 0
                      return
                  text = "\n".join(current_lines).strip()
        if len(text) < 40:
                      current_lines = []
                      current_tokens = 0
                      return
                  tok = estimate_tokens(text)
        chunk = {
                      "id":       _make_id(meta["so_hieu"], current_section),
                      "van_ban":  meta["van_ban"],
                      "so_hieu":  meta["so_hieu"],
                      "loai":     meta["loai"],
                      "co_quan":  meta["co_quan"],
                      "nam":      meta["nam"],
                      "lang":     meta.get("lang", "en"),
                      "phan":     current_chapter,
                      "don_vi":   current_section,
                      "tieu_de":  current_title,
                      "content":  text,
                      "tokens":   tok
        }
        if tok > max_tokens:
                      for sub in _split_large(chunk, max_tokens):
                                        chunks.append(sub)
        else:
            chunks.append(chunk)
        current_lines  = []
        current_tokens = 0

    for line in lines:
              m_chapter = CHAPTER_RE.match(line)
        m_section = SECTION_RE.match(line) or SECTION_BARE_RE.match(line)
        m_annex   = ANNEX_RE.match(line)

        if m_annex:
                      flush()
                      in_annex        = True
                      in_content      = True
                      current_chapter = (m_annex.group(1) + " " + m_annex.group(2)).strip()
                      current_section = None

elif m_chapter and not in_annex:
            flush()
            ch_num          = m_chapter.group(1)
            ch_title        = m_chapter.group(2).strip()
            current_chapter = f"Chapter {ch_num} {ch_title}".strip()
            current_section = None
            content_chapter_count += 1
            # Bo qua phan TOC (lan xuat hien dau tien cua Chapter 1)
            # Content that bat dau khi content_chapter_count > 1 hoac khi phan sau co section headings
            if content_chapter_count >= 2 or in_content:
                              in_content = True

elif m_section and in_content:
            sec_num = m_section.group(1)
            title   = m_section.group(2).strip() if m_section.lastindex and m_section.lastindex >= 2 else ""
            depth   = sec_num.count(".")  # 0=X, 1=X.Y, 2=X.Y.Z, 3=X.Y.Z.W

            # Tach chunk khi:
            #   - Level 1 (X.Y): section chinh, luon tach
            #   - Level >= 2 nhung da dat 70% max_tokens
            should_flush = current_section is not None and (
                              depth <= 1 or
                              current_tokens >= max_tokens * 0.7
            )
            if should_flush:
                              flush()
                              current_section = sec_num
                              current_title   = title
elif current_section is None:
                current_section = sec_num
                current_title   = title
            # neu depth >= 2 va chua du tokens: gom vao chunk hien tai, chi update title neu rong
elif not current_title:
                current_title = title

            current_lines.append(line)
            current_tokens += estimate_tokens(line)

else:
            if in_content and current_section is not None:
                              current_lines.append(line)
                              current_tokens += estimate_tokens(line)

    flush()
    return chunks


def process_foreign_file(md_file: Path, output_dir: Path = None) -> list:
      """Entry point: xu ly 1 file tieu chuan nuoc ngoai, tra ve list chunks"""
    content = md_file.read_text(encoding="utf-8")
    meta    = extract_meta_foreign(content, md_file.name)
    chunks  = split_by_chapter_section(content, meta)

    # Merge chunk qua nho vao chunk truoc
    merged = []
    for c in chunks:
              if merged and c["tokens"] < 80:
                            merged[-1]["content"] += "\n\n" + c["content"]
                            merged[-1]["tokens"]   = estimate_tokens(merged[-1]["content"])
else:
            merged.append(c)

    return merged


if __name__ == "__main__":
      import sys
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("raw/5000-2021.md")
    result = process_foreign_file(path)
    print(f"Tong: {len(result)} chunks")
    if result:
              toks = [c["tokens"] for c in result]
        print(f"avg={sum(toks)//len(toks)} | max={max(toks)} | min={min(toks)} tokens")
        print("\nSample (3 chunks dau):")
        for c in result[:3]:
                      print(f"  [{c['don_vi']}] {c['tieu_de'][:60]} — {c['tokens']} tok")
          
