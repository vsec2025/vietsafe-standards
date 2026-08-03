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
    # Tiêu chuẩn ngành, vd. "11 TCN_2006" (Quy phạm trang bị điện).
    # Không có nhánh này, tên file chứa "TCN_" trượt mọi điều kiện trên và rơi
    # vào mặc định LUAT -> chunk theo "Điều N" vốn không tồn tại -> 0 chunk.
    # (không dùng \bTCN\b: '_' là ký tự từ nên "TCN_2006" không có ranh giới từ)
    if "TCN" in fname and "TCVN" not in fname:
        return "TCN"
    if re.search(r'Luật\s+số|LUẬT\s+SỐ|/QH\d+|NĐ-CP|TT-B', content[:500]):
        return "LUAT"
    if re.search(r'QUY CHUẨN KỸ THUẬT', content[:500], re.IGNORECASE):
        return "QCVN"
    if re.search(r'TIÊU CHUẨN QUỐC GIA|TCVN', content[:500], re.IGNORECASE):
        return "TCVN"
    return "LUAT"

# Số hiệu văn bản. Lưu ý: các mẫu này phải khớp cả dạng có khoảng trắng quanh
# dấu hai chấm ("TCVN 7336 : 2021") lẫn dạng liền ("QCVN 06:2022/BXD").
# Số phần có gạch nối là chuyện thường với tiêu chuẩn nhiều phần
# (vd. "TCVN 7568-14:2025"). Nếu không bắt được dạng này, regex sẽ bỏ qua số
# hiệu THẬT ở đầu văn bản rồi vớ phải một TRÍCH DẪN tới tiêu chuẩn khác nằm
# phía sau — gán nhầm danh tính cho toàn bộ chunk của file.
QCVN_RE = re.compile(r'QCVN\s*(\d+(?:-\d+)?)\s*:\s*(\d{4})\s*/\s*([A-ZĐ]{2,})', re.IGNORECASE)
QCVN_LOOSE_RE = re.compile(r'QCVN\s*(\d+(?:-\d+)?)\s*:\s*(\d{4})', re.IGNORECASE)
TCVN_RE = re.compile(r'TCVN\s*(\d+(?:-\d+)?)\s*:\s*(\d{4})', re.IGNORECASE)
LUAT_RE = re.compile(r'Luật\s+số[:\s]+(\d+/\d+/\w+)', re.IGNORECASE)
# Nghị quyết / Nghị định / Thông tư: "Số: 66.18/2026/NQ-CP", "Số: 50/2024/NĐ-CP"
VBQPPL_RE = re.compile(r'Số[:\s]+([\d.]+/\d{4}/[A-ZĐ\-]+)', re.IGNORECASE)
VB_LABELS = {
    "NQ": "Nghị quyết", "NĐ": "Nghị định", "ND": "Nghị định",
    "TT": "Thông tư", "QĐ": "Quyết định", "QD": "Quyết định",
}


def pad_num(num: str) -> str:
    """'6' -> '06', nhưng giữ nguyên số phần có gạch nối ('7568-14')."""
    return f"{int(num):02d}" if num.isdigit() else num


def meta_from_filename(filename: str, doc_type: str):
    """Suy số hiệu từ tên file khi nội dung không cho biết.

    Ví dụ: 'QCVN_06_2022_...'    -> ('QCVN 06:2022', '2022')
           'TC_7336_2021_...'    -> ('TCVN 7336:2021', '2021')
           'TC_7568-14_2025_...' -> ('TCVN 7568-14:2025', '2025')
    """
    name = Path(filename).stem
    if doc_type == "QCVN":
        m = re.search(r'QCVN[_\s-]*(\d+(?:-\d+)?)[_\s:]+(\d{4})', name, re.IGNORECASE)
        if m:
            return f"QCVN {pad_num(m.group(1))}:{m.group(2)}", m.group(2)
    elif doc_type == "TCVN":
        m = re.search(r'TC(?:VN)?[_\s-]*(\d+(?:-\d+)?)[_\s:]+(\d{4})', name, re.IGNORECASE)
        if m:
            return f"TCVN {m.group(1)}:{m.group(2)}", m.group(2)
    return "", ""


def extract_meta(content: str, doc_type: str, filename: str = "") -> dict:
    """Trích metadata. LUÔN gọi trên nội dung GỐC (raw) — bước làm sạch xoá
    mất các dòng tiêu đề chứa số hiệu."""
    meta = {
        "loai": doc_type,
        "van_ban": "",
        "co_quan": "",
        "nam": "",
        "hieu_luc": "",
        "so_hieu": ""
    }

    head = content[:4000]

    if doc_type == "LUAT":
        m = LUAT_RE.search(content[:2000])
        if m:
            meta["so_hieu"] = m.group(1)
            meta["van_ban"] = f"Luật {m.group(1)}"
        else:
            # Nghị quyết / Nghị định / Thông tư / Quyết định
            m = VBQPPL_RE.search(head)
            if m:
                so = m.group(1).upper()
                meta["so_hieu"] = so
                loai_vb = so.rsplit("/", 1)[-1].split("-")[0]
                meta["van_ban"] = f"{VB_LABELS.get(loai_vb, 'Văn bản')} {so}"
        if meta["so_hieu"]:
            year = re.search(r'/(\d{4})/', meta["so_hieu"])
            if year:
                meta["nam"] = year.group(1)
        m2 = re.search(r'(Quốc hội|Chính phủ|Bộ\s+\w+)', content[:500])
        if m2:
            meta["co_quan"] = m2.group(1)

    elif doc_type == "QCVN":
        m = QCVN_RE.search(head) or QCVN_LOOSE_RE.search(head)
        if m:
            so = f"QCVN {pad_num(m.group(1))}:{m.group(2)}"
            if m.re is QCVN_RE:
                so += "/" + m.group(3).upper()
            meta["so_hieu"] = so
            meta["nam"] = m.group(2)
        meta["co_quan"] = "Bộ Xây dựng / Bộ Công an"

    elif doc_type == "TCVN":
        m = TCVN_RE.search(head)
        if m:
            meta["so_hieu"] = f"TCVN {m.group(1)}:{m.group(2)}"
            meta["nam"] = m.group(2)
        meta["co_quan"] = "Bộ Khoa học và Công nghệ"

    elif doc_type == "TCN":
        # Tiêu chuẩn ngành: "11 TCN-18:2006", "11 TCN_2006"
        m = re.search(r'(\d+)\s*TCN[\s_-]*(\d{2,3})?[\s_-]*(\d{4})', head + " " + filename,
                      re.IGNORECASE)
        if m:
            phan = f"-{m.group(2)}" if m.group(2) else ""
            meta["so_hieu"] = f"{m.group(1)} TCN{phan}:{m.group(3)}"
            meta["nam"] = m.group(3)
        meta["co_quan"] = "Bộ Công nghiệp"

    # Dự phòng: suy từ tên file nếu nội dung không cho biết số hiệu
    if not meta["so_hieu"] and filename:
        so, nam = meta_from_filename(filename, doc_type)
        if so:
            meta["so_hieu"] = so
            meta["nam"] = meta["nam"] or nam

    if not meta["van_ban"]:
        meta["van_ban"] = meta["so_hieu"]

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

FM_DELIM = "---"


def render_front_matter(meta: dict, source: str) -> str:
    """Ghi metadata thành front-matter để bước chunk đọc lại được.

    Cần thiết vì clean_lines() xoá các dòng tiêu đề chứa số hiệu, nên không
    thể trích metadata từ file đã làm sạch."""
    fields = {**meta, "source": source}
    body = "\n".join(f"{k}: {v}" for k, v in fields.items() if v != "")
    return f"{FM_DELIM}\n{body}\n{FM_DELIM}\n\n"


def parse_front_matter(content: str):
    """Trả về (meta, phần nội dung còn lại). meta rỗng nếu không có front-matter."""
    if not content.startswith(FM_DELIM):
        return {}, content
    end = content.find(f"\n{FM_DELIM}", len(FM_DELIM))
    if end == -1:
        return {}, content
    block = content[len(FM_DELIM):end]
    rest = content[end + len(FM_DELIM) + 1:].lstrip("\n")
    meta = {}
    for line in block.splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            meta[k.strip()] = v.strip()
    return meta, rest


def clean_file(input_path: Path, output_dir: Path) -> dict:
    content = input_path.read_text(encoding="utf-8")
    doc_type = detect_type(content, input_path.name)
    # Trích metadata TRƯỚC khi làm sạch (bước làm sạch xoá dòng chứa số hiệu)
    meta = extract_meta(content, doc_type, input_path.name)

    lines = content.splitlines()
    cleaned = clean_lines(lines)
    clean_content = "\n".join(cleaned).strip()

    # Lưu file sạch kèm front-matter
    output_dir.mkdir(parents=True, exist_ok=True)
    out_path = output_dir / input_path.name
    out_path.write_text(
        render_front_matter(meta, input_path.name) + clean_content, encoding="utf-8"
    )

    reduction = (1 - len(clean_content) / len(content)) * 100
    so = meta["so_hieu"] or "⚠️ KHÔNG XÁC ĐỊNH"
    print(f"  [CLEAN] {input_path.name[:40]} -> {doc_type} [{so}] | giảm {reduction:.0f}% | {len(cleaned)} dòng")

    return {"path": out_path, "meta": meta, "type": doc_type}

if __name__ == "__main__":
    raw_dir = Path("raw")
    clean_dir = Path("data/clean")

    files = list(raw_dir.glob("**/*.md"))
    print(f"\n=== BƯỚC 1: LÀM SẠCH === ({len(files)} file)\n")

    for f in files:
        clean_file(f, clean_dir)

    print(f"\nXong! File sạch lưu tại: {clean_dir}/")
