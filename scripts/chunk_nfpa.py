#!/usr/bin/env python3
"""
VIETSAFE E&C - Chunk cho tieu chuan nuoc ngoai (NFPA, IBC, ISO, EN...)
Cau truc: Chapter X -> Section X.Y -> Subsection X.Y.Z
"""
import re
import json
from pathlib import Path

MAX_TOKENS = 1500

CHAPTER_RE     = re.compile(r'^#{1,3}\s*Chapter\s+(\d+)\s*(.*)', re.IGNORECASE)
SECTION_RE     = re.compile(r'^#{1,4}\s*(\d+\.\d+(?:\.\d+(?:\.\d+)?)?)\s*(.*)')
SECTION_BARE_RE = re.compile(r'^(\d+\.\d+(?:\.\d+(?:\.\d+)?)?)\s+([A-Z(].+)')
ANNEX_RE       = re.compile(r'^#{1,3}\s*(Annex\s+[A-Z])\s*(.*)', re.IGNORECASE)


def estimate_tokens(text: str) -> int:
    return len(text) // 4


def detect_foreign_standard(content: str, filename: str) -> bool:
    """Phat hien tieu chuan nuoc ngoai (NFPA, IBC, ISO...)"""
    fname = filename.upper()
    if re.search(r'NFPA|IBC|IFC|ASHRAE|ASCE|ISO[-_]\d|EN[-_]\d', fname):
        return True
    header = content[:1500]
    has_viet = re.search(r'[\u00C0-\u1EF9]', header) is not None
    has_en_code = re.search(r'\bChapter\s+\d', header, re.IGNORECASE) is not None
    if has_en_code and not has_viet:
        return True
    return False


def extract_meta_foreign(content: str, filename: str) -> dict:
    """Trich xuat metadata tu tieu chuan nuoc ngoai"""
    meta = {
        'so_hieu': '',
        'ten': '',
        'nam': '',
        'loai': 'FOREIGN',
        'ngon_ngu': 'en',
    }
    header = content[:2000]
    m = re.search(r'(NFPA|IBC|IFC|ISO|EN|ASHRAE|ASCE)\s*[-_]?\s*(\d+)', header, re.IGNORECASE)
    if m:
        meta['so_hieu'] = (m.group(1) + ' ' + m.group(2)).strip()
    m_year = re.search(r'(19|20)\d{2}', header)
    if m_year:
        meta['nam'] = m_year.group(0)
    for line in header.splitlines():
        s = line.strip().lstrip('#').strip()
        if len(s) > 10:
            meta['ten'] = s
            break
    if not meta['so_hieu']:
        meta['so_hieu'] = Path(filename).stem
    return meta


def _make_id(prefix: str, idx: int) -> str:
    return f'{prefix}_{idx:04d}'


def _split_large(text: str, max_tokens: int) -> list:
    """Chia nho doan van qua dai theo paragraph"""
    if estimate_tokens(text) <= max_tokens:
        return [text]
    paras = re.split(r'\n\s*\n', text)
    chunks = []
    buf = ''
    for p in paras:
        if not p.strip():
            continue
        candidate = (buf + '\n\n' + p).strip() if buf else p
        if estimate_tokens(candidate) > max_tokens and buf:
            chunks.append(buf.strip())
            buf = p
        else:
            buf = candidate
    if buf.strip():
        chunks.append(buf.strip())
    return chunks if chunks else [text]


def split_by_chapter_section(content: str) -> list:
    """Chunk theo cau truc Chapter / Section cua tieu chuan nuoc ngoai."""
    lines = content.splitlines()
    blocks = []
    cur_chapter = ''
    cur_title = ''
    cur_lines = []

    def flush():
        if cur_lines:
            text = '\n'.join(cur_lines).strip()
            if text:
                blocks.append({
                    'chapter': cur_chapter,
                    'title': cur_title,
                    'text': text,
                })

    for line in lines:
        mc = CHAPTER_RE.match(line)
        ma = ANNEX_RE.match(line)
        ms = SECTION_RE.match(line)
        mb = SECTION_BARE_RE.match(line)
        if mc:
            flush()
            cur_chapter = 'Chapter ' + mc.group(1)
            cur_title = mc.group(2).strip()
            cur_lines = [line]
        elif ma:
            flush()
            cur_chapter = ma.group(1)
            cur_title = ma.group(2).strip()
            cur_lines = [line]
        elif ms:
            flush()
            cur_chapter = ms.group(1)
            cur_title = ms.group(2).strip()
            cur_lines = [line]
        elif mb:
            flush()
            cur_chapter = mb.group(1)
            cur_title = mb.group(2).strip()
            cur_lines = [line]
        else:
            cur_lines.append(line)
    flush()
    return blocks


def process_foreign_file(path, content: str) -> list:
    """Xu ly 1 file tieu chuan nuoc ngoai -> list chunk dicts."""
    filename = str(path)
    meta = extract_meta_foreign(content, filename)
    blocks = split_by_chapter_section(content)
    chunks = []
    idx = 0
    prefix = re.sub(r'[^A-Za-z0-9]+', '_', meta['so_hieu']).strip('_') or 'FOREIGN'
    for b in blocks:
        parts = _split_large(b['text'], MAX_TOKENS)
        for part in parts:
            idx += 1
            chunks.append({
                'id': _make_id(prefix, idx),
                'so_hieu': meta['so_hieu'],
                'ten_tieu_chuan': meta['ten'],
                'nam': meta['nam'],
                'loai': meta['loai'],
                'ngon_ngu': meta['ngon_ngu'],
                'chuong_muc': b['chapter'],
                'tieu_de': b['title'],
                'noi_dung': part,
                'so_token': estimate_tokens(part),
                'nguon': filename,
            })
    return chunks


if __name__ == '__main__':
    import sys
    if len(sys.argv) > 1:
        p = Path(sys.argv[1])
        txt = p.read_text(encoding='utf-8')
        is_foreign = detect_foreign_standard(txt, str(p))
        print('FOREIGN' if is_foreign else 'LOCAL', '->', p)
        if is_foreign:
            cks = process_foreign_file(p, txt)
            print('chunks:', len(cks))
            for c in cks[:3]:
                print(' -', c['id'], c['chuong_muc'], c['so_token'], 'tok')
