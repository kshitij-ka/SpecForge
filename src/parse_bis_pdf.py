"""
BIS PDF Parser - Preprocessing pipeline for RAG system
Parses SP 21 (Summaries of Indian Standards for Building Materials)
"""

import re
import json
import argparse
import logging
from pathlib import Path
from collections import Counter
from math import log as math_log

import fitz  # PyMuPDF

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Header pattern: "1.10\nSP  21 : 2005" that appears on every page
PAGE_HEADER_RE = re.compile(
    r"^\s*\d+\.\d+\s*\nSP\s+21\s*:?\s*200[0-9]\s*\n?", re.MULTILINE
)
# Trailing footer "For detailed information, refer to IS XXXX..."
FOOTER_RE = re.compile(
    r"For detailed information,\s+refer to\s+IS[\s\S]*?(?=\n\n|\Z)", re.MULTILINE
)
# "SUMMARY OF" header that precedes "IS XXXX : YYYY  TITLE"
SUMMARY_BLOCK_RE = re.compile(
    r"SUMMARY\s+OF\s*\n(IS[\s\S]*?)(?=SUMMARY\s+OF|\Z)", re.MULTILINE
)

# IS standard ID: "IS 269 : 1989", "IS 1489 (Part 1) : 1991", etc.
IS_ID_RE = re.compile(
    r"(IS\s+\d+(?:\s*\(\s*PART\s*\d+\s*\)\s*)?(?:\s*\(\s*Part\s*\d+\s*\)\s*)?\s*:\s*\d{4})",
    re.IGNORECASE,
)

# Section headers found inside summaries
SECTION_HEADER_RE = re.compile(
    r"^\s*(\d+(?:\.\d+)*)\s*[.)]?\s+([A-Z][A-Za-z /,()-]+?)\s*[—–-]",
    re.MULTILINE,
)

# Boilerplate to discard
BOILERPLATE_PHRASES = [
    "Disclosure to Promote the Right To Information",
    "Bureau of Indian Standards",
    "MANAK BHAVAN",
    "Satyanarayan Gangaram Pitroda",
    "Jawaharlal Nehru",
    "Mazdoor Kisan Shakti Sangathan",
    "internet manak",
]

# Section-level category headers inside the TOC / running headers
SECTION_CATEGORIES = {
    "SECTION 1": "Cement and Concrete",
    "SECTION 2": "Building Limes",
    "SECTION 3": "Stones",
    "SECTION 4": "Wood Products for Building",
    "SECTION 5": "Gypsum Building Materials",
    "SECTION 6": "Timber",
    "SECTION 7": "Bitumen and Tar Products",
    "SECTION 8": "Floor, Wall, Roof Coverings and Finishes",
    "SECTION 9": "Water Proofing and Damp Proofing Materials",
    "SECTION 10": "Sanitary Appliances and Water Fittings",
    "SECTION 11": "Builder's Hardware",
    "SECTION 12": "Wood Products",
    "SECTION 13": "Doors, Windows and Shutters",
    "SECTION 14": "Concrete Reinforcement",
    "SECTION 15": "Structural Steels",
    "SECTION 16": "Light Metal and Their Alloys",
    "SECTION 17": "Structural Shapes",
    "SECTION 18": "Welding Electrodes and Wires",
    "SECTION 19": "Threaded Fasteners and Rivets",
    "SECTION 20": "Wire Ropes and Wire Products",
    "SECTION 21": "Pipes and Fittings",
    "SECTION 22": "Electrical Installations",
    "SECTION 23": "Thermal Insulation Materials",
    "SECTION 24": "Paints, Varnishes and Allied Products",
    "SECTION 25": "Adhesives",
}

# Sub-category headings that appear inside sections (e.g. "CEMENT", "AGGREGATES")
# Block-parsing patterns used in split_into_standards Pass 3 / Pass 4
_SCOPE_START_RE = re.compile(r"1\s*[\.\)]\s*Scope", re.IGNORECASE)
_BODY_SECTION_RE = re.compile(r"[2-9]\s*[\.\)]\s+[A-Z]")
_SCOPE2_RE = re.compile(r"\n\s*1\s*[\.\)]\s*Scope", re.IGNORECASE)

# Minimum chars that must precede a second "1. Scope" marker before it is
# considered bleed from the next standard (not a duplicate heading).
_SCOPE_BLEED_MIN_OFFSET = 100
# How far back (chars) to search the previous block for a stolen scope.
_SCOPE_TAIL_WINDOW = 900

SUB_CATEGORY_RE = re.compile(
    r"^(?:AGGREGATES|CEMENT|LIME|STONE|TIMBER|BITUMEN|GYPSUM|PIPE|WIRE|STEEL|"
    r"ASBESTOS|CONCRETE|MASONRY|CERAMIC|GLASS|PLASTIC|RUBBER|METAL|WOOD|"
    r"SAND|PAINT|SEALANT|PLYWOOD|BOARD|BRICK|TILE|DOOR|WINDOW|HARDWARE|"
    r"REINFORCEMENT|ELECTRODE|FASTENER|ROPE|INSULATION|ADHESIVE|FLOORING|"
    r"ROOFING|WATERPROOFING|SANITARY|FITTING|TREATMENT|JOINT)[\s\w]*$",
    re.MULTILINE,
)

# Stopwords for TF-IDF keyword extraction
STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will", "would",
    "shall", "should", "may", "might", "must", "not", "no", "nor", "so",
    "yet", "both", "either", "neither", "each", "any", "all", "both",
    "few", "more", "most", "other", "some", "such", "than", "too", "very",
    "as", "if", "this", "that", "these", "those", "it", "its", "its",
    "part", "table", "note", "see", "refer", "following", "given", "conform",
    "accordance", "accordance", "method", "methods", "test", "tests",
    "standard", "standards", "specification", "specifications",
    "indian", "bis", "sp", "revision", "first", "second", "third", "fourth",
    "per", "cent", "percent", "mm", "m", "kg", "mpa", "kn", "cm", "max",
    "min", "less", "more", "than", "not", "least", "most",
}


# ---------------------------------------------------------------------------
# Step 1 – Extract raw text from PDF
# ---------------------------------------------------------------------------

def extract_pages(pdf_path: str) -> list[tuple[int, str]]:
    """Return list of (page_number, raw_text) for every page."""
    doc = fitz.open(pdf_path)
    pages = []
    for i, page in enumerate(doc):
        pages.append((i + 1, page.get_text()))
    log.info("Extracted %d pages from %s", len(pages), pdf_path)
    return pages


# ---------------------------------------------------------------------------
# Step 2 – Clean individual page text
# ---------------------------------------------------------------------------

def clean_page_text(text: str) -> str:
    """Remove headers, footers, and boilerplate from a single page's text."""
    # Remove running page header (e.g. "1.14\nSP  21 : 2005")
    text = PAGE_HEADER_RE.sub("", text)

    # Remove boilerplate phrases (case-insensitive line-level check)
    lines = text.splitlines()
    filtered = []
    for line in lines:
        if any(phrase.lower() in line.lower() for phrase in BOILERPLATE_PHRASES):
            continue
        filtered.append(line)
    text = "\n".join(filtered)

    # Normalise whitespace: collapse multiple blank lines
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def fix_broken_lines(text: str) -> str:
    """
    Join lines that are broken mid-sentence (no terminal punctuation).
    Lines ending with '-' are joined without a space (hyphenation).
    """
    lines = text.split("\n")
    result = []
    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        if not line:
            result.append("")
            i += 1
            continue

        # Detect if this line is a heading / table row (keep as-is)
        is_heading = bool(re.match(r"^\s*(\d+\.?\d*)\s+[A-Z]", line)) or \
                     line.isupper() or \
                     re.match(r"^\s*(TABLE|Sl\.|Note|SUMMARY|SECTION)", line)

        if not is_heading and i + 1 < len(lines):
            next_line = lines[i + 1].lstrip()
            # Join if current line doesn't end sentence and next line starts lower
            ends_sentence = line[-1] in ".;:?!)" or line.endswith("—") or line.endswith("–")
            next_starts_lower = next_line and next_line[0].islower()

            if not ends_sentence and next_starts_lower and next_line:
                if line.endswith("-"):
                    result.append(line[:-1] + next_line)
                else:
                    result.append(line + " " + next_line)
                i += 2
                continue

        result.append(line)
        i += 1

    return "\n".join(result)


# ---------------------------------------------------------------------------
# Step 3 – Detect active section/category from running context
# ---------------------------------------------------------------------------

def detect_category(page_text: str, current_category: str) -> str:
    """Update category when a 'SECTION N' header is encountered on the page."""
    # Look for "SECTION 1\nCEMENT AND CONCRETE" style heading
    section_match = re.search(r"SECTION\s+(\d+)", page_text)
    if section_match:
        key = "SECTION " + section_match.group(1)
        if key in SECTION_CATEGORIES:
            return SECTION_CATEGORIES[key]
    return current_category


# ---------------------------------------------------------------------------
# Step 4 – Split concatenated full text into individual standard blocks
# ---------------------------------------------------------------------------

# Matches a bare "IS <number> : <year>" line that signals a new standard even
# when "SUMMARY OF" is absent.  The line must start at the beginning of a line
# and be followed by at least one word of title text so we don't match IS IDs
# that appear inside body prose.
_IS_BOUNDARY_RE = re.compile(
    r"^[ \t]*(IS\s+\d+(?:\s*\(\s*(?:PART|Part)\s*\d+\s*\)\s*)?\s*:\s*\d{4})"
    r"[ \t]+\S",   # at least one non-ws title char on same line
    re.MULTILINE,
)


def _parse_block(block: str) -> dict | None:
    """
    Parse a raw text block into {raw_id, raw_title, raw_body}.
    Returns None if no IS ID is found on the first two lines.

    Title continuation: lines immediately after the IS-ID line that contain
    only title words (no numbered section marker, no revision note, no ALL-CAPS
    section keyword like SCOPE/REQUIREMENTS) are appended to the title.
    """
    lines = block.strip().split("\n")
    if not lines:
        return None
    id_line = lines[0].strip()
    id_match = IS_ID_RE.match(id_line)
    if not id_match:
        id_match = re.match(r"(IS\s+\S+\s*:\s*\d{4})", id_line)
    if not id_match:
        return None

    raw_id = id_match.group(1).strip()
    inline_title = id_line[id_match.end():].strip()

    # Patterns that signal the title has ended and body content has begun
    _BODY_START_RE = re.compile(
        r"^\s*(?:"
        r"\d+[\.\)]\s+[A-Z]"           # numbered section: "1. Scope"
        r"|(?:First|Second|Third|Fourth|Fifth|Sixth)\s+Revision"
        r"|\(.*Revision.*\)"
        r"|Note\b"
        r"|For\s+detailed"
        r"|SCOPE|REQUIREMENTS?|GENERAL|DELIVERY|MANUFACTURE"
        r")",
        re.IGNORECASE,
    )

    title_parts = [inline_title] if inline_title else []
    body_start = 1  # default: body begins at lines[1]

    for i, line in enumerate(lines[1:], start=1):
        stripped = line.strip()
        if not stripped:
            body_start = i + 1
            break
        if _BODY_START_RE.match(stripped):
            body_start = i
            break
        # A genuine title continuation: no digits-only tokens, not a sentence
        if re.match(r"^[A-Z][A-Za-z,\s/()-]{1,80}$", stripped) and not stripped.endswith("."):
            title_parts.append(stripped)
            body_start = i + 1
        else:
            body_start = i
            break

    raw_title = " ".join(title_parts)
    body_lines = lines[body_start:]
    return {
        "raw_id": raw_id,
        "raw_title": raw_title,
        "raw_body": "\n".join(body_lines).strip(),
    }


def _split_block_on_is_ids(block: str) -> list[str]:
    """
    If a block contains multiple IS ID boundary lines, split it at each one.

    A sub-block is only kept if its body contains at least _MIN_BODY_WORDS
    words beyond the header line — shorter results are test-method reference
    lines embedded in body text, not real standard headers.
    """
    _MIN_BODY_WORDS = 15

    boundaries = list(_IS_BOUNDARY_RE.finditer(block))
    if len(boundaries) <= 1:
        return [block]

    sub_blocks = []
    for i, m in enumerate(boundaries):
        start = m.start()
        end = boundaries[i + 1].start() if i + 1 < len(boundaries) else len(block)
        sub = block[start:end].strip()
        # Discard if the body is too thin to be a real standard
        body_words = len(sub.split()) - len(m.group(0).split())
        if body_words < _MIN_BODY_WORDS and i > 0:
            # Merge back into the previous sub-block
            if sub_blocks:
                sub_blocks[-1] = sub_blocks[-1] + "\n" + sub
            # If it's the first sub, keep it anyway (dedup will handle it later)
        else:
            sub_blocks.append(sub)

    return sub_blocks if sub_blocks else [block]


def split_into_standards(full_text: str) -> list[dict]:
    """
    Split full_text into individual standard blocks using two passes:

    Pass 1 — primary split on "SUMMARY OF" headers (original logic).
    Pass 2 — for any block that still contains multiple IS IDs, re-split on
              bare "IS <num> : <year>" boundary lines.

    Each final block is validated to contain exactly one IS ID; blocks with
    zero or multiple IDs after splitting are logged as warnings.
    """
    # --- Pass 1: split on "SUMMARY OF" ---
    summary_pattern = re.compile(
        r"SUMMARY\s+OF\s*\n(IS[\s\S]*?)(?=SUMMARY\s+OF|\Z)",
        re.MULTILINE,
    )
    primary_blocks: list[str] = [m.group(1) for m in summary_pattern.finditer(full_text)]

    # --- Pass 2: re-split merged blocks on bare IS ID boundaries ---
    all_blocks: list[str] = []
    split_count = 0
    for block in primary_blocks:
        sub = _split_block_on_is_ids(block)
        if len(sub) > 1:
            ids_found = [IS_ID_RE.search(b) for b in sub]
            id_strs = [m.group(1) if m else "?" for m in ids_found]
            log.warning(
                "Block required splitting → %d sub-blocks: %s",
                len(sub),
                ", ".join(id_strs),
            )
            split_count += 1
        all_blocks.extend(sub)

    log.info(
        "After splitting: %d primary blocks → %d blocks (%d blocks were split)",
        len(primary_blocks),
        len(all_blocks),
        split_count,
    )

    # --- Pass 3: recover scope text stolen by previous block ---
    # The SP-21 PDF sometimes prints a standard's scope content on the same page
    # as the preceding "SUMMARY OF IS N+1" header — so after PDF text extraction
    # the scope ends up at the tail of block N instead of the head of block N+1.
    # Detect: block N+1 body opens at section 2+ with no preceding 1. Scope.
    # Remedy: find the last "1. Scope" occurrence in block N's tail and move
    # everything from that point to the start of block N+1's body.
    recovered = 0
    for i in range(1, len(all_blocks)):
        cur = all_blocks[i]
        cur_lines = cur.strip().split("\n")
        # Gather the full body text (everything after the first line, which is the IS ID).
        full_body = "\n".join(cur_lines[1:])

        scope_m = _SCOPE_START_RE.search(full_body)
        sec2_m = _BODY_SECTION_RE.search(full_body)

        # A real scope precedes section 2; if so, no repair needed.
        if scope_m and (sec2_m is None or scope_m.start() < sec2_m.start()):
            continue
        if sec2_m is None:
            continue

        prev = all_blocks[i - 1]
        search_tail = prev[-_SCOPE_TAIL_WINDOW:]
        scope_m = _SCOPE_START_RE.search(search_tail)
        if not scope_m:
            continue

        abs_scope_pos = len(prev) - _SCOPE_TAIL_WINDOW + scope_m.start()
        # rfind to start of line so we grab the full scope heading
        newline_pos = prev.rfind("\n", 0, abs_scope_pos)
        cut_pos = newline_pos + 1 if newline_pos != -1 else abs_scope_pos

        stolen = prev[cut_pos:].strip()
        trimmed_prev = prev[:cut_pos].rstrip()

        header_line = cur_lines[0]
        all_blocks[i] = f"{header_line}\n{stolen}\n{full_body}".strip()
        all_blocks[i - 1] = trimmed_prev
        recovered += 1
        log.info(
            "Pass 3: recovered stolen scope for block %d (%s…) from block %d",
            i, header_line[:50], i - 1,
        )

    if recovered:
        log.info("Pass 3: recovered scope for %d block(s)", recovered)

    # --- Pass 4: truncate next-standard bleed ---
    # Some blocks have the scope/sections of the FOLLOWING standard appended at
    # the end (the mirror of the Pass 3 problem).  If a body contains a second
    # "1. Scope" marker after _SCOPE_BLEED_MIN_OFFSET characters, everything
    # from that point belongs to the next standard and is removed.
    trimmed_bleed = 0
    for i, block in enumerate(all_blocks):
        lines = block.strip().split("\n", 1)
        if len(lines) < 2:
            continue
        header_line, body_text = lines[0], lines[1]
        first_scope = _SCOPE_START_RE.search(body_text)
        if first_scope is None:
            continue
        search_from = first_scope.end()
        second_scope = _SCOPE2_RE.search(body_text, search_from)
        if second_scope and second_scope.start() > _SCOPE_BLEED_MIN_OFFSET:
            trimmed = body_text[: second_scope.start()].rstrip()
            all_blocks[i] = f"{header_line}\n{trimmed}"
            trimmed_bleed += 1
            log.info(
                "Pass 4: trimmed next-standard bleed from block %d (%s…) at pos %d",
                i, header_line[:50], second_scope.start(),
            )
    if trimmed_bleed:
        log.info("Pass 4: trimmed bleed from %d block(s)", trimmed_bleed)

    # --- Parse each block + validate ---
    standards: list[dict] = []
    for block in all_blocks:
        parsed = _parse_block(block)
        if parsed is None:
            log.warning("Skipped block — no IS ID found on first line: %.80s", block[:80])
            continue

        # Validation: check whether the first line itself carries multiple IS IDs
        # (body cross-references are expected and not a parsing problem)
        first_line = block.strip().split("\n")[0]
        header_ids = IS_ID_RE.findall(first_line)
        if len(header_ids) > 1:
            log.warning(
                "Header line still has %d IS IDs (kept first): %s",
                len(header_ids),
                ", ".join(header_ids),
            )

        standards.append(parsed)

    log.info(
        "Parsed %d standards (before: %d primary blocks, after split: %d blocks)",
        len(standards),
        len(primary_blocks),
        len(all_blocks),
    )
    return standards


# ---------------------------------------------------------------------------
# Step 5 – Parse each standard block into structured fields
# ---------------------------------------------------------------------------

def normalise_id(raw_id: str) -> str:
    """
    Normalise IS ID to canonical form: 'IS 2185 (Part 2): 1983'.
    Handles PART1/PART 1/Part 1/PART  1 variants and extra spaces.
    """
    s = re.sub(r"\s+", " ", raw_id).strip()
    # Normalise PART/Part casing and spacing inside parens: (PART1) → (Part 1)
    s = re.sub(
        r"\(\s*[Pp][Aa][Rr][Tt]\s*(\d+)\s*\)",
        lambda m: f"(Part {m.group(1)})",
        s,
    )
    # Ensure exactly one space before colon, and one after
    s = re.sub(r"\s*:\s*", ": ", s)
    # Remove any double spaces remaining
    s = re.sub(r"  +", " ", s)
    return s


def extract_scope(body: str) -> str:
    """Pull the Scope section text from the body."""
    scope_match = re.search(
        r"(?:1\.|1\s)\s*Scope\s*[—–-]\s*([\s\S]*?)(?=\n\s*\d+[.]\s+[A-Z]|\Z)",
        body,
        re.IGNORECASE,
    )
    if scope_match:
        return clean_inline(scope_match.group(1))
    # Fallback: first paragraph
    paras = [p.strip() for p in body.split("\n\n") if p.strip()]
    return clean_inline(paras[0]) if paras else ""


def clean_inline(text: str) -> str:
    """Collapse whitespace within a text snippet."""
    return re.sub(r"\s+", " ", text).strip()


def extract_key_sections(body: str) -> dict[str, str]:
    """Extract named sections (Scope, Requirements, etc.) from body."""
    # Match "N.  Section Name — text" patterns
    header_positions = list(re.finditer(
        r"(?m)^\s*(\d+(?:\.\d+)?)\s*[.)]\s+([A-Z][A-Za-z ,/()-]+?)\s*[—–-]",
        body,
    ))
    sections = {}
    for idx, m in enumerate(header_positions):
        name = normalise_section_name(m.group(2).strip().title())
        start = m.end()
        end = header_positions[idx + 1].start() if idx + 1 < len(header_positions) else len(body)
        content = clean_inline(body[start:end])
        # Only keep meaningful sections (skip TABLE headers etc.)
        if name and len(content) > 20:
            sections[name] = content[:800]  # cap per-section length
    return sections


# ---------------------------------------------------------------------------
# Step 6b – Section name normalisation
# ---------------------------------------------------------------------------

# Exact-match overrides: maps any raw Title-Cased name → canonical label.
# Keys must be Title Case (they are applied after .title() is called on the
# raw header text).  Values are the canonical canonical forms used in every
# chunk's "section" field.
_SECTION_NORM_MAP: dict[str, str] = {
    # ── Typos / misspellings ──────────────────────────────────────────────
    "Chemical Requirment":                     "Chemical Requirements",
    "Chemical Resistance  Requirement":        "Chemical Resistance Requirements",
    "General Requiremnts":                     "General Requirements",
    "General Requirement":                     "General Requirements",
    "General  Requirements":                   "General Requirements",
    "Performance Requirement":                 "Performance Requirements",
    "Quality Requirements":                    "General Requirements",
    "General Characteristic":                  "General Characteristics",
    "Manafacture":                             "Manufacture",
    "Preservativetreatment":                   "Preservative Treatment",
    "Hydrostatictest":                         "Hydrostatic Test",
    "Worksmanship And Finish":                 "Workmanship And Finish",
    "Workmanship  And Finish":                 "Workmanship And Finish",
    "Weigth":                                  "Weight",
    "Permealibility":                          "Permeability",
    "Man":                                     "General",        # truncated header
    "Half":                                    "General",        # truncated header
    "Non":                                     "General",        # truncated header
    "Right":                                   "General",        # truncated header
    "Anti":                                    "General",        # truncated header
    "Self":                                    "General",        # truncated header
    "Note":                                    "General",

    # ── Singular → plural (canonical = plural) ───────────────────────────
    "Chemical Requirement":                    "Chemical Requirements",
    "Physical Requirement":                    "Physical Requirements",
    "Application":                             "Applications",
    "Specification":                           "Specifications",
    "General Requiremnt":                      "General Requirements",

    # ── Singular section nouns → plural canonical form ───────────────────
    "Material":                                "Materials",
    "Grade":                                   "Grades",
    "Type":                                    "Types",
    "Size":                                    "Sizes",
    "Length":                                  "Lengths",
    "Test":                                    "Tests",
    "Tolerance":                               "Tolerances",
    "Dimension":                               "Dimensions",
    "Colour":                                  "Colour",        # keep as-is (both fine)
    "Use":                                     "Uses",

    # ── Whitespace normalisation ─────────────────────────────────────────
    "Freedom  From  Defects":                  "Freedom From Defects",
    "Freedom From  Defects":                   "Freedom From Defects",
    "Dimensions  And Tolerances":              "Dimensions And Tolerances",
    "Dimensions And  Tolerances":              "Dimensions And Tolerances",
    "Dimensions  (In Mm)":                     "Dimensions",
    "Sizes (In Mm)":                           "Sizes",
    "General  Quality":                        "General Quality",

    # ── Near-synonyms → single canonical label ───────────────────────────
    "Testing":                                 "Tests",
    "Tensile Test":                            "Tests",
    "Bend Test":                               "Tests",
    "Brinell Hardness Test":                   "Tests",
    "Visual Inspection":                       "Visual Appearance",
    "General Appearance And Finish":           "Workmanship And Finish",
    "Work Manship And Finish":                 "Workmanship And Finish",
    "Surface Finish":                          "Finish",
    "Physical And Mechanical Properties":      "Mechanical Properties",
    "Physical, Mechanical Properties":         "Mechanical Properties",
    "Physical And Chemical Requirements":      "Chemical Requirements",
    "Chemical Analysis":                       "Chemical Composition",
    "Nominal Size":                            "Nominal Sizes",
    "Nominal Diameter":                        "Nominal Sizes",
    "Size Designation":                        "Designation",
    "Symbolic Designation":                    "Designation",
    "Grades And Types":                        "Grades",
    "Types And Grades":                        "Grades",
    "Types And Sizes":                         "Types",
    "Type And Size":                           "Types",
    "Shape And Dimension":                     "Dimensions",
    "Shape And Dimensions":                    "Dimensions",
    "Sizes And Dimensions":                    "Dimensions",
    "Dimension And Tolerances":               "Dimensions And Tolerances",
    "Dimension And Their Measurements":        "Dimensions",
    "Sizes And Tolerance":                     "Dimensions And Tolerances",
    "End Coatings":                            "End Coating",
    "Specie Of Timber":                        "Species Of Timber",
    "Species":                                 "Species Of Timber",
    "Timber Species":                          "Species Of Timber",
    "Keeping Quality":                         "Keeping Properties",
    "Storage Life":                            "Shelf Life",
    "Storage Properties":                      "Keeping Properties",
}

# Regex for collapsing internal runs of whitespace in a section name.
_WS_RE = re.compile(r"\s{2,}")


def normalise_section_name(name: str) -> str:
    """
    Return the canonical section label for *name*.

    Steps:
    1. Collapse internal whitespace runs to a single space.
    2. Look up the result in _SECTION_NORM_MAP (exact match, case-sensitive
       after Title-Casing — callers must pass a Title-Cased string).
    3. Return the mapped value, or the whitespace-collapsed original if no
       mapping exists.
    """
    name = _WS_RE.sub(" ", name).strip()
    return _SECTION_NORM_MAP.get(name, name)


# ---------------------------------------------------------------------------
# Step 6 – Keyword extraction via TF-IDF (corpus-level)
# ---------------------------------------------------------------------------

MIN_KEYWORDS = 3
MAX_KEYWORDS = 7


def tokenise(text: str) -> list[str]:
    tokens = re.findall(r"[a-zA-Z]{3,}", text.lower())
    return [t for t in tokens if t not in STOPWORDS]


def build_tfidf(documents: list[str], top_n: int = MAX_KEYWORDS) -> list[list[str]]:
    """Return up to top_n TF-IDF keywords per document."""
    N = len(documents)
    tokenised = [tokenise(d) for d in documents]

    df: Counter = Counter()
    for tokens in tokenised:
        df.update(set(tokens))

    results = []
    for tokens in tokenised:
        if not tokens:
            results.append([])
            continue
        tf = Counter(tokens)
        total = len(tokens)
        scores = {
            word: (count / total) * math_log((N + 1) / (df[word] + 1))
            for word, count in tf.items()
        }
        top = sorted(scores, key=scores.__getitem__, reverse=True)[:top_n]
        results.append(top)

    return results


def _fallback_keywords(body: str, title: str, needed: int) -> list[str]:
    """
    Return up to *needed* keywords using frequency ranking of body tokens,
    supplemented by title tokens when the body yields too few.
    """
    body_tokens = tokenise(body)
    candidates: list[str] = [w for w, _ in Counter(body_tokens).most_common(needed)]

    if len(candidates) < needed:
        title_tokens = [t for t in tokenise(title) if t not in candidates]
        candidates.extend(title_tokens[: needed - len(candidates)])

    return candidates[:needed]


def enforce_keyword_bounds(
    keywords_list: list[list[str]],
    bodies: list[str],
    titles: list[str],
    std_ids: list[str],
) -> list[list[str]]:
    """
    Ensure every standard has between MIN_KEYWORDS and MAX_KEYWORDS keywords.

    - Too few (including empty): top up via _fallback_keywords and log a warning.
    - Too many: truncate to MAX_KEYWORDS.
    """
    result = []
    for kws, body, title, std_id in zip(keywords_list, bodies, titles, std_ids):
        # Cap at maximum
        kws = kws[:MAX_KEYWORDS]

        if len(kws) < MIN_KEYWORDS:
            needed = MIN_KEYWORDS - len(kws)
            extra = _fallback_keywords(body, title, needed + MAX_KEYWORDS)
            # Avoid duplicates while preserving order
            seen = set(kws)
            for w in extra:
                if w not in seen and len(kws) < MAX_KEYWORDS:
                    kws.append(w)
                    seen.add(w)

            if len(kws) < MIN_KEYWORDS:
                log.warning(
                    "Keyword fallback used for %s — only %d keyword(s) found "
                    "(body too short or fully filtered). Used: %s",
                    std_id, len(kws), kws,
                )
            else:
                log.warning(
                    "Keyword fallback used for %s — TF-IDF returned %d; "
                    "supplemented to %d via frequency/title. Keywords: %s",
                    std_id, len(kws) - needed, len(kws), kws,
                )

        result.append(kws)
    return result


# ---------------------------------------------------------------------------
# Step 7 – Chunking
# ---------------------------------------------------------------------------

# Sections shorter than this word count become a single chunk without splitting.
_SECTION_MAX_WORDS = 250
# Target window and overlap for sub-splitting an oversized section.
_CHUNK_WORDS = 200
_OVERLAP_WORDS = 50


def _split_words_with_overlap(
    text: str,
    max_words: int = _CHUNK_WORDS,
    overlap: int = _OVERLAP_WORDS,
) -> list[str]:
    """
    Split *text* into overlapping windows of up to *max_words* words.
    Each window steps forward by (max_words - overlap) words so consecutive
    chunks share *overlap* words of context.  Breaks are nudged to the last
    sentence boundary in the second half of the window when possible.

    Overlap guarantee: the next window always begins overlap words before the
    true end of the current window, regardless of any sentence-boundary nudge.
    """
    words = text.split()
    if not words:
        return []

    step = max(max_words - overlap, 1)
    chunks: list[str] = []
    start = 0

    while start < len(words):
        raw_end = min(start + max_words, len(words))
        chunk = " ".join(words[start:raw_end])

        # Nudge break to last sentence boundary in the second half of the window
        actual_end = raw_end
        if raw_end < len(words):
            mid = len(chunk) // 2
            last_period = max(chunk.rfind(". ", mid), chunk.rfind(".\n", mid))
            if last_period != -1:
                chunk = chunk[: last_period + 1]
                actual_end = start + len(chunk.split())

        chunks.append(chunk.strip())

        # Next window starts overlap words before actual_end so the overlap
        # is always ~_OVERLAP_WORDS words, regardless of sentence-nudge.
        next_start = max(actual_end - overlap, start + 1)
        if actual_end >= len(words):
            break
        start = next_start

    return [c for c in chunks if c]


# Minimum body-word count (excluding the prefix line) for a chunk to be
# considered semantically meaningful.
_MIN_CHUNK_WORDS = 30

# Patterns whose entire body is a cross-reference with no standalone value.
_REF_ONLY_RE = re.compile(
    r"^\s*(?:See|Refer(?:\s+to)?|As\s+(?:per|in)|Refer\s+Table|See\s+Table"
    r"|Refer\s+Fig|See\s+Fig|As\s+given\s+in|Conform\s+to)"
    r"[\s\w.,()/-]{0,60}$",
    re.IGNORECASE,
)


def _body_words(chunk_text: str) -> int:
    """Word count of a chunk excluding its header prefix line."""
    lines = chunk_text.strip().split("\n", 1)
    body = lines[1] if len(lines) > 1 else lines[0]
    return len(body.split())


def _is_weak(chunk_text: str) -> bool:
    """
    Return True if a chunk carries too little information to be useful alone.

    Criteria (either is enough):
    - Body has fewer than _MIN_CHUNK_WORDS words.
    - Body is purely a cross-reference (See Table N / Refer to IS XXXX …).
    """
    lines = chunk_text.strip().split("\n", 1)
    body = lines[1].strip() if len(lines) > 1 else ""
    if len(body.split()) < _MIN_CHUNK_WORDS:
        return True
    if _REF_ONLY_RE.match(body):
        return True
    return False


def _merge_chunk_texts(a: str, b: str) -> str:
    """
    Combine two chunk texts into one.  The second chunk's prefix line is
    dropped (the first chunk's prefix already identifies the standard/section),
    and the two bodies are joined with a newline.
    """
    a_lines = a.strip().split("\n", 1)
    b_lines = b.strip().split("\n", 1)
    a_body = a_lines[1] if len(a_lines) > 1 else a_lines[0]
    b_body = b_lines[1] if len(b_lines) > 1 else b_lines[0]
    # Keep a's prefix; add b's section label only if different
    a_prefix = a_lines[0]
    b_prefix = b_lines[0] if len(b_lines) > 1 else ""
    a_section = a_prefix.split("[")[-1].rstrip("]") if "[" in a_prefix else ""
    b_section = b_prefix.split("[")[-1].rstrip("]") if "[" in b_prefix else ""
    if b_section and b_section != a_section:
        merged_body = f"{a_body}\n[{b_section}] {b_body}"
    else:
        merged_body = f"{a_body} {b_body}"
    return f"{a_prefix}\n{merged_body.strip()}"


def _strengthen_single(chunk: dict, record: dict) -> dict:
    """
    When a standard has only one chunk and it is weak, prepend the standard's
    summary (from the structured record) to give it retrieval context.
    """
    summary = record.get("summary", "").strip()
    if not summary:
        return chunk
    lines = chunk["text"].strip().split("\n", 1)
    prefix = lines[0]
    body = lines[1] if len(lines) > 1 else ""
    # Avoid duplicating if the summary is already in the body.
    if summary[:40] in body:
        return chunk
    new_text = f"{prefix}\n{summary} {body}".strip()
    return {**chunk, "text": new_text}


def chunk_sections(record: dict) -> list[dict]:
    """
    Produce semantically meaningful chunks for one structured standard record.

    Strategy
    --------
    1. Emit one chunk per key section extracted by extract_key_sections().
       If a section exceeds _SECTION_MAX_WORDS, sub-split it with overlap.
    2. If no key sections exist, fall back to sub-splitting the full content.
    3. Post-process: merge consecutive weak chunks (< _MIN_CHUNK_WORDS body
       words, or pure cross-references) into their neighbours.
    4. If a standard ends up with only one chunk and it is still weak,
       augment it with the record's summary field.

    Every chunk carries standard_id, title, category, section, chunk_id, text.
    """
    std_id   = record["standard_id"]
    title    = record["title"]
    category = record["category"]
    sections = record.get("key_sections", {})
    content  = record.get("content", "")

    safe_id = re.sub(r"[^A-Za-z0-9]", "", std_id)
    raw_chunks: list[dict] = []
    counter = 1

    def _emit(text: str, section_name: str) -> None:
        nonlocal counter
        prefix = f"{std_id} {title} [{section_name}]"
        full_text = f"{prefix}\n{text}" if text else prefix
        raw_chunks.append({
            "standard_id": std_id,
            "title":       title,
            "category":    category,
            "section":     section_name,
            "chunk_id":    f"{safe_id}_{counter}",
            "text":        full_text.strip(),
        })
        counter += 1

    if sections:
        for section_name, section_text in sections.items():
            words = section_text.split()
            if len(words) <= _SECTION_MAX_WORDS:
                _emit(section_text, section_name)
            else:
                for sub in _split_words_with_overlap(section_text):
                    _emit(sub, section_name)
    else:
        for sub in _split_words_with_overlap(content, max_words=_CHUNK_WORDS):
            _emit(sub, "General")

    if not raw_chunks:
        _emit(content, "General")

    # ── Post-process: merge weak chunks into their neighbours ─────────────
    merged: list[dict] = []
    n_merged = 0
    i = 0
    while i < len(raw_chunks):
        chunk = raw_chunks[i]
        if _is_weak(chunk["text"]):
            if merged:
                # Merge backward into the previous chunk
                prev = merged[-1]
                merged[-1] = {
                    **prev,
                    "text": _merge_chunk_texts(prev["text"], chunk["text"]),
                    "section": prev["section"],  # keep primary section label
                }
                n_merged += 1
            elif i + 1 < len(raw_chunks):
                # No previous — merge forward into next
                next_chunk = raw_chunks[i + 1]
                raw_chunks[i + 1] = {
                    **next_chunk,
                    "text": _merge_chunk_texts(chunk["text"], next_chunk["text"]),
                    "section": chunk["section"],
                }
                n_merged += 1
            else:
                # Only chunk for this standard — keep as-is; strengthen below
                merged.append(chunk)
        else:
            merged.append(chunk)
        i += 1

    # ── Strengthen a lone weak chunk with the record summary ──────────────
    if len(merged) == 1 and _is_weak(merged[0]["text"]):
        merged[0] = _strengthen_single(merged[0], record)

    if n_merged:
        log.debug("%s: merged %d weak chunk(s), %d remain", std_id, n_merged, len(merged))

    # Re-number chunk_ids sequentially after merges
    for idx, c in enumerate(merged, 1):
        c["chunk_id"] = f"{safe_id}_{idx}"

    return merged


# ---------------------------------------------------------------------------
# Step 7b – Contamination detection and removal
# ---------------------------------------------------------------------------

# IS ID pattern used for contamination scanning (same as IS_ID_RE but
# anchored to full token so "IS 4032" inside "IS 40320" doesn't match).
_CONTAM_ID_RE = re.compile(
    r"\bIS\s+\d+(?:\s*\(\s*(?:PART|Part)\s*\d+\s*\))?\s*:\s*\d{4}\b",
    re.IGNORECASE,
)

# Phrases that legitimately introduce a foreign IS citation in body prose.
# If a foreign ID appears only in such contexts, it is a cross-reference,
# not contamination.
_CROSSREF_CTX_RE = re.compile(
    r"(?:refer|see|per|as\s+per|in\s+accordance|conform|method|tested|test|"
    r"part\s+of|in\s+IS|of\s+IS|for\s+IS|to\s+IS|from\s+IS|as\s+given|"
    r"relevant|given\s+in|specified\s+in|covered\s+in|described\s+in)",
    re.IGNORECASE,
)

# A TOC/index line: an IS ID followed immediately by a multi-word title.
# Two forms:
#   "IS XXXX : YYYY  Title of standard"           (starts at column 0)
#   "8.11 IS XXXX : YYYY  Title of standard"      (numbered list entry)
#   "SECTION 3 STONES CONTENTS … IS XXXX : YYYY …" (section header with ID)
_TOC_LINE_RE = re.compile(
    r"^[ \t]*(?:[\d.]+\s+)?IS\s+\d+[^:\n]*:\s*\d{4}[ \t]+[A-Za-z][A-Za-z\s,/()-]{8,}$",
    re.MULTILINE,
)
# A reference-list note: "refer to IS XXXX : YYYY, IS YYYY : ZZZZ, …"
# These appear as a run of IS IDs on a single line with no separating prose.
_REFLIST_LINE_RE = re.compile(
    r"^[ \t]*(?:Note\s*[—–-]\s*)?(?:For\s+(?:methods|detailed)|Refer(?:ence)?|See)"
    r"[^.\n]{0,80}IS\s+\d+[^.\n]*\.\s*$",
    re.MULTILINE | re.IGNORECASE,
)


def _norm_id(s: str) -> str:
    """Return a normalised upper-case IS ID for comparison."""
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"\(\s*[Pp][Aa][Rr][Tt]\s*(\d+)\s*\)", lambda m: f"(Part {m.group(1)})", s)
    s = re.sub(r"\s*:\s*", ": ", s)
    return re.sub(r"  +", " ", s).upper()


def _foreign_ids_in_body(body: str, own_norm: str) -> list[re.Match]:
    """Return matches of IS IDs in *body* that belong to a different standard."""
    return [
        m for m in _CONTAM_ID_RE.finditer(body)
        if _norm_id(m.group()) != own_norm
    ]


def _is_crossref_only(body: str, foreign_matches: list[re.Match]) -> bool:
    """
    Return True if every foreign IS ID appears exclusively inside a
    cross-reference phrase (tested per IS …, refer to IS …, etc.).
    """
    for m in foreign_matches:
        window = body[max(0, m.start() - 80): m.end() + 40]
        if not _CROSSREF_CTX_RE.search(window):
            return False
    return True


def _remove_toc_lines(body: str, own_norm: str) -> tuple[str, int]:
    """
    Strip lines that look like TOC/index entries or reference-list notes for
    other standards.  Returns (cleaned_body, number_of_lines_removed).
    """
    removed = 0
    lines = body.split("\n")
    kept = []
    for line in lines:
        # TOC / numbered-list entry for a foreign standard
        if _TOC_LINE_RE.match(line):
            foreign_ids = [mm for mm in _CONTAM_ID_RE.finditer(line)
                           if _norm_id(mm.group()) != own_norm]
            if foreign_ids:
                removed += 1
                continue
        # "Refer to IS XXXX", "For methods see IS XXXX", "Note — IS XXXX" etc.
        elif _REFLIST_LINE_RE.match(line):
            foreign_ids = [mm for mm in _CONTAM_ID_RE.finditer(line)
                           if _norm_id(mm.group()) != own_norm]
            if foreign_ids:
                removed += 1
                continue
        kept.append(line)
    return "\n".join(kept), removed


def _truncate_at_foreign_block(body: str, own_norm: str) -> tuple[str, bool]:
    """
    If a run of foreign IS IDs starts near the end of the body and there is
    no cross-reference context, truncate at the first such run.
    Returns (possibly_truncated_body, was_truncated).
    """
    foreign = _foreign_ids_in_body(body, own_norm)
    if not foreign:
        return body, False

    # Find the first foreign ID that is NOT in a cross-reference context
    for m in foreign:
        window = body[max(0, m.start() - 80): m.end() + 40]
        if _CROSSREF_CTX_RE.search(window):
            continue
        # Only truncate if it's in the second half of the body
        if m.start() > len(body) // 3:
            return body[: m.start()].rstrip(), True
    return body, False


def detect_and_fix_contamination(chunks: list[dict]) -> list[dict]:
    """
    Scan every chunk for content that belongs to a different IS standard and
    remove or flag it.  Returns the cleaned chunk list.

    Rules applied in order:
    1. Cross-references (foreign ID only inside "refer to IS …" prose) →
       leave unchanged; these are legitimate citations.
    2. TOC/index lines (bare "IS XXXX : YYYY  Title" lines from PDF section
       headers bleeding in) → strip those lines from the body.
    3. Foreign block at structural start of body (the body literally opens
       with a different standard's ID) → remove the contaminating block by
       truncating or stripping leading foreign-ID lines.
    4. High-density foreign IDs not in cross-reference context →
       truncate body at the first non-cross-reference foreign ID.

    Every correction is logged at WARNING level with chunk_id, own standard,
    foreign IDs found, and action taken.
    """
    fixed_chunks: list[dict] = []
    n_untouched = n_xref = n_toc = n_struct = n_highdens = 0

    for chunk in chunks:
        own_norm = _norm_id(chunk["standard_id"])
        prefix_line, _, body = chunk["text"].partition("\n")
        foreign = _foreign_ids_in_body(body, own_norm)

        if not foreign:
            fixed_chunks.append(chunk)
            n_untouched += 1
            continue

        # Rule 1 – all foreign IDs are cross-references → no change
        if _is_crossref_only(body, foreign):
            fixed_chunks.append(chunk)
            n_xref += 1
            continue

        action = "none"
        original_body = body

        # Rule 2 – strip TOC/index lines
        body, n_toc_removed = _remove_toc_lines(body, own_norm)
        if n_toc_removed:
            action = f"removed {n_toc_removed} TOC line(s)"
            n_toc += 1

        # Re-evaluate after TOC removal
        foreign = _foreign_ids_in_body(body, own_norm)
        if foreign and not _is_crossref_only(body, foreign):

            # Rule 3 – foreign block at structural start of body
            body_stripped = body.lstrip()
            first_match = _CONTAM_ID_RE.match(body_stripped)
            if first_match and _norm_id(first_match.group()) != own_norm:
                # Drop lines until we hit a line that starts with the own ID
                # or doesn't start with any IS ID
                lines = body.split("\n")
                kept = []
                skipping = True
                for line in lines:
                    if skipping:
                        m = _CONTAM_ID_RE.match(line.lstrip())
                        if m and _norm_id(m.group()) != own_norm:
                            continue  # drop this contaminating line
                        else:
                            skipping = False
                    kept.append(line)
                body = "\n".join(kept).strip()
                action = (action + "; " if action != "none" else "") + "removed leading foreign-ID block"
                n_struct += 1

            else:
                # Rule 4 – truncate at first non-cross-ref foreign ID block
                body, truncated = _truncate_at_foreign_block(body, own_norm)
                if truncated:
                    action = (action + "; " if action != "none" else "") + "truncated at foreign content block"
                    n_highdens += 1

        if action != "none":
            foreign_ids_str = ", ".join(
                dict.fromkeys(_norm_id(m.group()) for m in foreign)
            )
            log.warning(
                "CONTAMINATION [%s] own=%s | foreign=%s | action=%s",
                chunk["chunk_id"], chunk["standard_id"], foreign_ids_str, action,
            )
            new_text = f"{prefix_line}\n{body}".strip() if body.strip() else prefix_line
            fixed_chunks.append({**chunk, "text": new_text})
        else:
            fixed_chunks.append(chunk)

    log.info(
        "Contamination scan: %d untouched, %d cross-ref only, "
        "%d TOC-cleaned, %d struct-fixed, %d truncated",
        n_untouched, n_xref, n_toc, n_struct, n_highdens,
    )
    return fixed_chunks


def chunk_text(text: str, max_words: int = 400) -> list[str]:
    """Legacy fixed-window splitter kept for external callers."""
    words = text.split()
    chunks = []
    start = 0
    while start < len(words):
        end = min(start + max_words, len(words))
        chunk_words = words[start:end]
        chunk = " ".join(chunk_words)
        if end < len(words):
            last_period = max(chunk.rfind(". "), chunk.rfind(".\n"))
            if last_period > len(chunk) // 2:
                chunk = chunk[: last_period + 1]
                end = start + len(chunk.split())
        chunks.append(chunk.strip())
        start = end
    return [c for c in chunks if c]


# ---------------------------------------------------------------------------
# Step 8 – Category assignment via page context map
# ---------------------------------------------------------------------------

def build_category_map(pages: list[tuple[int, str]]) -> dict[int, str]:
    """
    Walk pages in order and track which SECTION we're currently in.
    Returns a dict mapping page_number → category string.
    """
    current = "General"
    mapping = {}
    for page_num, text in pages:
        section_match = re.search(r"SECTION\s+(\d+)", text)
        if section_match:
            key = "SECTION " + section_match.group(1)
            if key in SECTION_CATEGORIES:
                current = SECTION_CATEGORIES[key]
        mapping[page_num] = current
    return mapping


def find_standard_page(standard_id: str, pages: list[tuple[int, str]]) -> int:
    """Return the page number where this standard's SUMMARY OF block appears."""
    # Build a flexible pattern: allow variable whitespace around spaces/colons
    escaped = re.escape(standard_id)
    # Replace escaped-space with \s+ so "IS 269 : 1989" also matches "IS 269: 1989"
    flexible = escaped.replace(r"\ ", r"\s*").replace(r"\:", r"\s*:\s*")
    try:
        pattern = re.compile(flexible)
    except re.error:
        pattern = re.compile(re.escape(standard_id))

    first_match = -1
    for page_num, text in pages:
        if pattern.search(text):
            if first_match == -1:
                first_match = page_num
            if "SUMMARY OF" in text:
                return page_num
    return first_match


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

def run(input_pdf: str, output_json: str, chunks_json: str) -> None:
    # 1. Extract pages
    pages = extract_pages(input_pdf)

    # 2. Build category map (page → section)
    cat_map = build_category_map(pages)

    # 3. Clean and concatenate all page texts
    cleaned_pages: list[tuple[int, str]] = []
    for page_num, raw in pages:
        cleaned = clean_page_text(raw)
        cleaned = fix_broken_lines(cleaned)
        cleaned_pages.append((page_num, cleaned))

    full_text = "\n\n".join(text for _, text in cleaned_pages)

    # 4. Split into standard blocks
    raw_standards = split_into_standards(full_text)

    if not raw_standards:
        log.error("No standards found — check PDF structure and patterns.")
        return

    # 5. Build corpus for TF-IDF (body texts)
    corpus = [s["raw_body"] for s in raw_standards]
    raw_titles = [s["raw_title"] for s in raw_standards]
    raw_ids = [s["raw_id"] for s in raw_standards]
    keywords_list = build_tfidf(corpus, top_n=MAX_KEYWORDS)
    keywords_list = enforce_keyword_bounds(keywords_list, corpus, raw_titles, raw_ids)

    # 6. Build structured records (deduplicate by normalised ID — keep first)
    structured: list[dict] = []
    chunks_output: list[dict] = []
    seen_ids: set[str] = set()

    for idx, s in enumerate(raw_standards):
        std_id = normalise_id(s["raw_id"])

        if std_id in seen_ids:
            log.warning("Duplicate standard skipped: %s", std_id)
            continue
        seen_ids.add(std_id)

        title_raw = re.sub(r"\s+", " ", s["raw_title"]).strip()
        # Remove revision annotations like "(Fourth Revision)" from title
        title = re.sub(r"\s*\((?:First|Second|Third|Fourth|Fifth)?\s*Revision\)", "", title_raw, flags=re.IGNORECASE).strip()
        title = title.title()

        body = s["raw_body"]
        scope = extract_scope(body)
        key_sections = extract_key_sections(body)
        keywords = keywords_list[idx]

        # Infer category from the page where this standard appears
        page_num = find_standard_page(s["raw_id"], cleaned_pages)
        category = cat_map.get(page_num, "General")

        # Full content = title + body, cleaned
        content = f"{std_id} {title}\n{body}"
        content = re.sub(r"\s{2,}", " ", content)

        record = {
            "standard_id": std_id,
            "title": title,
            "category": category,
            "summary": scope[:500] if scope else title,
            "keywords": keywords,
            "key_sections": key_sections,
            "content": content,
        }
        structured.append(record)

        # 7. Chunk by section with overlap
        chunks_output.extend(chunk_sections(record))

    # 7b. Detect and fix cross-standard contamination
    chunks_output = detect_and_fix_contamination(chunks_output)

    # 8. Write outputs
    Path(output_json).write_text(
        json.dumps(structured, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    log.info(
        "Wrote %d unique standards to %s (%d duplicates dropped)",
        len(structured), output_json, len(raw_standards) - len(structured),
    )

    Path(chunks_json).write_text(
        json.dumps(chunks_output, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    log.info("Wrote %d chunks to %s", len(chunks_output), chunks_json)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Parse BIS SP-21 PDF into structured JSON for RAG ingestion."
    )
    parser.add_argument("--input", required=True, help="Path to the BIS PDF file")
    parser.add_argument(
        "--output", default="standards.json", help="Output JSON for structured standards"
    )
    parser.add_argument(
        "--chunks", default="standards_chunks.json", help="Output JSON for text chunks"
    )
    args = parser.parse_args()

    run(args.input, args.output, args.chunks)


if __name__ == "__main__":
    main()
