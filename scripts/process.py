#!/usr/bin/env python3
"""VIETSAFE E&C - Pipeline xu ly tai lieu tieu chuan. PDF/DOCX -> Markdown -> index.json"""

import os, json, time, hashlib, argparse
from pathlib import Path
import anthropic

RAW_DIR = Path("raw")
MD_DIR = Path("data/md")
INDEX_FILE = Path("data/index.json")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

SYSTEM_PROMPT = """Ban la chuyen gia phan tich tieu chuan ky thuat PCCC Viet Nam.
Nhiem vu: Chuyen doi noi dung tai lieu sang Markdown co cau truc chuan.

Dinh dang output BAT BUOC:
---
id: [ma tieu chuan, vi du: TCVN-3890-2009]
title: [ten day du tieng Viet]
title_en: [ten tieng Anh neu co]
type: [TCVN | QCVN | TCXD | TCVS | ISO | Khac]
year: [nam ban hanh]
scope: [linh vuc ap dung ngan gon]
keywords: [tu khoa, phan cach bang dau phay]
---

# [Ten tieu chuan]

## 1. Pham vi ap dung
[noi dung]

## 2. Dinh nghia va thuat ngu
[noi dung]

## 3. Yeu cau ky thuat
[noi dung]

## 4. Quy dinh chung
[noi dung]

[Cac muc khac neu co]

---
*Nguon: [ten file goc]*
"""

def extract_text_from_pdf(filepath):
    try:
        import pdfplumber
        text = ""
        with pdfplumber.open(filepath) as pdf:
            for page in pdf.pages:
                text += page.extract_text() or ""
        return text
    except ImportError:
        try:
            import PyPDF2
            text = ""
            with open(filepath, "rb") as f:
                reader = PyPDF2.PdfReader(f)
                for page in reader.pages:
                    text += page.extract_text() or ""
            return text
        except:
            return ""

def extract_text_from_docx(filepath):
    try:
        from docx import Document
        doc = Document(filepath)
        return "\n".join([p.text for p in doc.paragraphs])
    except:
        return ""

def file_hash(filepath):
    return hashlib.md5(filepath.read_bytes()).hexdigest()[:8]

def parse_frontmatter(md_content, filename):
    meta = {"id": Path(filename).stem, "title": Path(filename).stem, "type": "Khac", "year": "", "keywords": []}
    if md_content.startswith("---"):
        try:
            end = md_content.index("---", 3)
            for line in md_content[3:end].strip().split("\n"):
                if ":" in line:
                    k, _, v = line.partition(":")
                    k, v = k.strip(), v.strip()
                    meta[k] = [x.strip() for x in v.split(",")] if k == "keywords" else v
        except ValueError:
            pass
    return meta

def process_file(filepath, client, force=False):
    md_path = MD_DIR / (filepath.stem + ".md")
    if md_path.exists() and not force:
        print(f"  [SKIP] {filepath.name}")
        return None
    print(f"  [XU LY] {filepath.name}...")
    suffix = filepath.suffix.lower()
    if suffix == ".pdf":
        raw_text = extract_text_from_pdf(filepath)
    elif suffix in [".docx", ".doc"]:
        raw_text = extract_text_from_docx(filepath)
    else:
        return None
    if not raw_text.strip():
        print(f"  [LOI] Khong doc duoc noi dung")
        return None
    try:
        msg = client.messages.create(
            model=os.environ.get("VSEC_DEFAULT_MODEL", "claude-sonnet-5"),
            # max_tokens la tran chung cho thinking + cau tra loi. Sonnet 5 bat
            # thinking mac dinh, 2000 khong du de vua nghi vua xuat markdown.
            max_tokens=8000,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": f"Chuan hoa tai lieu:\nFile: {filepath.name}\n\n{raw_text[:8000]}"}]
        )
        # content[0] co the la khoi thinking -> .text la None. Ghep cac khoi text.
        md_content = "".join(b.text for b in msg.content if b.type == "text").strip()
        if not md_content:
            print(f"  [LOI] Khong co noi dung tra ve (stop_reason={msg.stop_reason})")
            return None
        MD_DIR.mkdir(parents=True, exist_ok=True)
        md_path.write_text(md_content, encoding="utf-8")
        meta = parse_frontmatter(md_content, filepath.name)
        meta.update({"md_file": str(md_path), "source_file": filepath.name, "hash": file_hash(filepath)})
        print(f"  [OK] {md_path.name} ({msg.usage.input_tokens}in/{msg.usage.output_tokens}out)")
        time.sleep(0.5)
        return meta
    except Exception as e:
        print(f"  [LOI] {e}")
        return None

def build_index(standards):
    idx = {"standards": standards, "last_updated": time.strftime("%Y-%m-%dT%H:%M:%SZ"), "total": len(standards)}
    INDEX_FILE.write_text(json.dumps(idx, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n[INDEX] Cap nhat: {len(standards)} tieu chuan")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--file", type=str)
    args = parser.parse_args()
    if not ANTHROPIC_API_KEY:
        print("[LOI] Thieu ANTHROPIC_API_KEY"); return
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    MD_DIR.mkdir(parents=True, exist_ok=True)
    files = [Path(args.file)] if args.file else (
        list(RAW_DIR.glob("**/*.pdf")) + list(RAW_DIR.glob("**/*.docx")) + list(RAW_DIR.glob("**/*.doc"))
    )
    print(f"\n=== VIETSAFE Standards Pipeline ===\nTim thay {len(files)} file\n")
    existing = {}
    if INDEX_FILE.exists():
        try:
            existing = {s["source_file"]: s for s in json.loads(INDEX_FILE.read_text("utf-8")).get("standards", [])}
        except: pass
    updated = dict(existing)
    success = 0
    for fp in files:
        r = process_file(fp, client, force=args.force)
        if r:
            updated[r["source_file"]] = r
            success += 1
    build_index(list(updated.values()))
    print(f"\n=== Hoan thanh: {success}/{len(files)} file ===")

if __name__ == "__main__":
    main()
