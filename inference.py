"""
BIS SP-21 Hybrid Retrieval System
----------------------------------
Combines dense (FAISS + sentence-transformers) and sparse (BM25) search,
then re-ranks and deduplicates to return the top-5 unique IS standards.

Usage
-----
   # Index build (one-time, caches to data/processed/):
   python inference.py --build

   # Single query:
   python inference.py --query "Which standard covers 33 grade OPC cement?"

   # Batch from JSON file:
   python inference.py --input data/processed/public_test_set.json

   # Batch + write results JSON:
   python inference.py --input data/processed/public_test_set.json \
                          --output data/processed/retrieval_results.json
"""

from __future__ import annotations

import argparse
import json
import math
import re
import time
from pathlib import Path
from typing import Any

import faiss
import numpy as np
from rank_bm25 import BM25Okapi
from sentence_transformers import SentenceTransformer

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
_ROOT = Path(__file__).resolve().parent
_CHUNKS_PATH = _ROOT / "data/processed/standards_chunks.json"
_STANDARDS_PATH = _ROOT / "data/processed/standards.json"
_EMBED_CACHE = _ROOT / "data/processed/embeddings.npy"
_INDEX_CACHE = _ROOT / "data/processed/faiss.index"

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
_MODEL_NAME = "all-MiniLM-L6-v2"
_TOP_K_DENSE = 10
_TOP_K_SPARSE = 10
_TOP_N_FINAL = 5
_SHORT_CHUNK_THRESHOLD = 40   # body words below this get a penalty
_SHORT_CHUNK_PENALTY = 0.15


# ---------------------------------------------------------------------------
# Text helpers
# ---------------------------------------------------------------------------
def _body_text(chunk_text: str) -> str:
    """Strip the leading 'IS XXXX: YYYY Title [Section]' prefix line."""
    parts = chunk_text.strip().split("\n", 1)
    return parts[1].strip() if len(parts) > 1 else parts[0]


def _tokenize(text: str) -> list[str]:
    """Lowercase word tokenizer for BM25."""
    return re.findall(r"[a-z0-9]+", text.lower())


def _bm25_doc(chunk: dict) -> list[str]:
    """
    Build the BM25 document for a chunk.

    Uses the full title from standards.json (stored in chunk["full_title"] by
    load_or_build) to avoid truncated-title misses.  Title is repeated ×4 so
    an exact title match dominates over body-text noise.
    """
    # full_title is injected by load_or_build; fall back to chunk title
    title = chunk.get("full_title") or chunk.get("title", "")
    title_tokens = _tokenize(title)
    kw_tokens = _tokenize(" ".join(chunk.get("keywords", [])))
    section_tokens = _tokenize(chunk.get("section", ""))
    text_tokens = _tokenize(_body_text(chunk.get("text", "")))
    return title_tokens * 4 + kw_tokens * 3 + section_tokens * 2 + text_tokens


def _norm_std_id(sid: str) -> str:
    return re.sub(r"\s+", " ", sid).strip().upper()


# ---------------------------------------------------------------------------
# Index builder
# ---------------------------------------------------------------------------
class RetrievalIndex:
    def __init__(
        self,
        chunks: list[dict],
        standards: list[dict],
        model: SentenceTransformer,
    ) -> None:
        self.chunks = chunks
        self.standards = standards
        self.model = model

        # Build lookup: standard_id → standard record
        self.std_lookup: dict[str, dict] = {
            _norm_std_id(s["standard_id"]): s for s in standards
        }

        # Build per-standard keyword set for boosting
        self.std_keywords: dict[str, set[str]] = {
            _norm_std_id(s["standard_id"]): set(_tokenize(" ".join(s.get("keywords", []))))
            for s in standards
        }

        # Dense index (FAISS)
        self.faiss_index: faiss.IndexFlatIP | None = None
        self.embeddings: np.ndarray | None = None

        # Sparse index (BM25)
        self.bm25: BM25Okapi | None = None
        self._bm25_docs: list[list[str]] = []

    # ------------------------------------------------------------------
    def build(self, use_cache: bool = True) -> None:
        self._build_dense(use_cache)
        self._build_sparse()

    def _build_dense(self, use_cache: bool) -> None:
        if use_cache and _EMBED_CACHE.exists() and _INDEX_CACHE.exists():
            print("Loading cached embeddings and FAISS index…")
            self.embeddings = np.load(str(_EMBED_CACHE))
            self.faiss_index = faiss.read_index(str(_INDEX_CACHE))
            return

        print(f"Encoding {len(self.chunks)} chunks with {_MODEL_NAME}…")
        texts = [c["text"] for c in self.chunks]
        emb = self.model.encode(
            texts,
            batch_size=64,
            show_progress_bar=True,
            normalize_embeddings=True,   # cosine via inner product
        )
        self.embeddings = emb.astype(np.float32)

        dim = self.embeddings.shape[1]
        self.faiss_index = faiss.IndexFlatIP(dim)
        self.faiss_index.add(self.embeddings)

        np.save(str(_EMBED_CACHE), self.embeddings)
        faiss.write_index(self.faiss_index, str(_INDEX_CACHE))
        print(f"FAISS index built: {self.faiss_index.ntotal} vectors, dim={dim}")

    def _build_sparse(self) -> None:
        print("Building BM25 index…")
        self._bm25_docs = [_bm25_doc(c) for c in self.chunks]
        self.bm25 = BM25Okapi(self._bm25_docs)
        print("BM25 index built.")


# ---------------------------------------------------------------------------
# Retrieval
# ---------------------------------------------------------------------------
class Retriever:
    def __init__(self, index: RetrievalIndex) -> None:
        self.idx = index

    def retrieve(self, query: str, top_n: int = _TOP_N_FINAL) -> list[dict]:
        t0 = time.perf_counter()

        query_tokens = _tokenize(query)

        # --- Dense retrieval ---
        q_emb = self.idx.model.encode(
            [query], normalize_embeddings=True
        ).astype(np.float32)
        dense_scores, dense_ids = self.idx.faiss_index.search(q_emb, _TOP_K_DENSE)
        dense_scores = dense_scores[0]
        dense_ids = dense_ids[0]

        # Normalise dense scores (already cosine, range ~[-1, 1] → shift to [0, 1])
        d_min, d_max = dense_scores.min(), dense_scores.max()
        d_range = d_max - d_min if d_max > d_min else 1.0
        dense_norm = {int(i): (s - d_min) / d_range for i, s in zip(dense_ids, dense_scores)}

        # --- Sparse retrieval ---
        bm25_raw = self.idx.bm25.get_scores(query_tokens)
        top_sparse_ids = np.argsort(bm25_raw)[::-1][:_TOP_K_SPARSE]
        top_sparse_scores = bm25_raw[top_sparse_ids]

        s_max = top_sparse_scores.max() if top_sparse_scores.max() > 0 else 1.0
        sparse_norm = {int(i): s / s_max for i, s in zip(top_sparse_ids, top_sparse_scores)}

        # --- Merge candidates ---
        candidate_ids = set(dense_norm) | set(sparse_norm)
        chunk_scores: dict[int, float] = {}
        for cid in candidate_ids:
            d = dense_norm.get(cid, 0.0)
            s = sparse_norm.get(cid, 0.0)
            chunk_scores[cid] = 0.6 * d + 0.4 * s   # weighted fusion

        # --- Re-ranking ---
        query_lower = query.lower()
        query_words = set(query_tokens)

        for cid, base in list(chunk_scores.items()):
            chunk = self.idx.chunks[cid]
            sid_norm = _norm_std_id(chunk["standard_id"])
            bonus = 0.0

            # Use the authoritative full title for all title-based signals
            full_title = chunk.get("full_title") or chunk.get("title", "")
            full_title_tokens = set(_tokenize(full_title))

            # Boost: keyword overlap with query
            kw_set = self.idx.std_keywords.get(sid_norm, set())
            kw_overlap = len(kw_set & query_words)
            if kw_overlap:
                bonus += 0.05 * min(kw_overlap, 4)

            # Boost: title word overlap with query (uses full, untruncated title)
            title_overlap = len(full_title_tokens & query_words)
            if title_overlap:
                bonus += 0.05 * min(title_overlap, 5)

            # Strong boost: majority of title words present in query — likely
            # the most on-point standard even if its chunk body is polluted.
            stop = {"and", "or", "for", "the", "of", "in", "a", "an", "to"}
            sig_title = full_title_tokens - stop
            sig_query = query_words - stop
            if sig_title and len(sig_title & sig_query) / len(sig_title) >= 0.6:
                bonus += 0.25

            # Boost: exact IS ID in query (user specifies a standard directly)
            if re.search(r'\bIS\s*\d+', query, re.IGNORECASE):
                for m in re.finditer(r'\bIS\s*\d+[\s:()A-Za-z\d]*:\s*\d{4}', query, re.IGNORECASE):
                    if _norm_std_id(m.group()) == sid_norm:
                        bonus += 0.20
                        break

            # Penalize very short chunks
            body_wc = len(_body_text(chunk.get("text", "")).split())
            if body_wc < _SHORT_CHUNK_THRESHOLD:
                bonus -= _SHORT_CHUNK_PENALTY

            chunk_scores[cid] = base + bonus

        # --- Group by standard_id, keep best chunk score ---
        std_best: dict[str, float] = {}
        std_chunk_repr: dict[str, dict] = {}
        for cid, score in chunk_scores.items():
            chunk = self.idx.chunks[cid]
            sid = chunk["standard_id"]
            if sid not in std_best or score > std_best[sid]:
                std_best[sid] = score
                std_chunk_repr[sid] = chunk

        # --- Sort and take top N ---
        ranked = sorted(std_best.items(), key=lambda x: x[1], reverse=True)[:top_n]

        results = []
        for sid, score in ranked:
            std_rec = self.idx.std_lookup.get(_norm_std_id(sid), {})
            results.append({
                "standard_id": sid,
                "title": std_rec.get("title", std_chunk_repr[sid].get("title", "")),
                "category": std_rec.get("category", std_chunk_repr[sid].get("category", "")),
                "score": round(float(score), 4),
                "matched_section": std_chunk_repr[sid].get("section", ""),
            })

        latency = time.perf_counter() - t0
        return results, latency


# ---------------------------------------------------------------------------
# Index load/build helper
# ---------------------------------------------------------------------------
def load_or_build(force_rebuild: bool = False) -> tuple[RetrievalIndex, Retriever]:
    with open(_CHUNKS_PATH, encoding="utf-8") as f:
        chunks = json.load(f)
    with open(_STANDARDS_PATH, encoding="utf-8") as f:
        standards = json.load(f)

    # Attach full title + keywords from standards.json to each chunk.
    # full_title ensures the BM25 document uses the authoritative (untruncated)
    # title from the structured record, not whatever ended up in the chunk prefix.
    std_map = {s["standard_id"]: s for s in standards}
    for c in chunks:
        rec = std_map.get(c["standard_id"], {})
        c["full_title"] = rec.get("title", c.get("title", ""))
        c["keywords"] = rec.get("keywords", [])

    print(f"Loaded {len(chunks)} chunks, {len(standards)} standards.")
    model = SentenceTransformer(_MODEL_NAME)
    index = RetrievalIndex(chunks, standards, model)
    index.build(use_cache=not force_rebuild)
    return index, Retriever(index)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def _format_result(
    query_id: str,
    query: str,
    results: list[dict],
    latency: float,
    expected_standards: list[str] | None = None,
) -> dict:
    out: dict[str, Any] = {
        "id": query_id,
        "query": query,
        "retrieved_standards": [r["standard_id"] for r in results],
        "details": results,
        "latency_seconds": round(latency, 4),
    }
    if expected_standards is not None:
        out["expected_standards"] = expected_standards
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="BIS SP-21 Hybrid Retrieval")
    parser.add_argument("--build", action="store_true", help="Force rebuild of FAISS index")
    parser.add_argument("--query", type=str, help="Single query string")
    parser.add_argument("--input", type=str, help="JSON file with list of {id, query} objects")
    parser.add_argument("--output", type=str, help="Write JSON results to this file")
    args = parser.parse_args()

    index, retriever = load_or_build(force_rebuild=args.build)

    if args.query:
        results, latency = retriever.retrieve(args.query)
        out = _format_result("Q0", args.query, results, latency)
        print("\n" + "=" * 60)
        print(f"Query : {args.query}")
        print(f"Latency: {latency:.3f}s")
        print("\nTop results:")
        for i, r in enumerate(results, 1):
            print(f"  {i}. {r['standard_id']} — {r['title']}")
            print(f"     Category: {r['category']}  |  Section: {r['matched_section']}  |  Score: {r['score']}")
        if args.output:
            Path(args.output).write_text(json.dumps([out], indent=2, ensure_ascii=False), encoding="utf-8")
        return

    if args.input:
        with open(args.input, encoding="utf-8") as f:
            queries = json.load(f)

        all_results = []
        latencies = []
        for q in queries:
            qid = q.get("id", "?")
            qtext = q.get("query", "")
            results, latency = retriever.retrieve(qtext)
            latencies.append(latency)
            expected = q.get("expected_standards", [])
            out = _format_result(qid, qtext, results, latency, expected_standards=expected or None)
            all_results.append(out)
            hit = any(r["standard_id"] in expected for r in results)
            print(f"[{qid}] latency={latency:.3f}s  hit={hit}  retrieved={[r['standard_id'] for r in results]}")

        print(f"\nAvg latency: {sum(latencies)/len(latencies):.3f}s  |  Max: {max(latencies):.3f}s")

        # Simple Hit@5 eval
        hits = 0
        for q, out in zip(queries, all_results):
            expected = set(q.get("expected_standards", []))
            if expected & set(out["retrieved_standards"]):
                hits += 1
        print(f"Hit@5: {hits}/{len(queries)} = {hits/len(queries):.1%}")

        if args.output:
            Path(args.output).write_text(
                json.dumps(all_results, indent=2, ensure_ascii=False), encoding="utf-8"
            )
            print(f"Results written to {args.output}")
        return

    # Default: demo with one example query
    demo_query = (
        "Which standard specifies chemical and physical requirements "
        "for 33 grade Ordinary Portland Cement?"
    )
    results, latency = retriever.retrieve(demo_query)
    out = _format_result("DEMO", demo_query, results, latency)

    print("\n" + "=" * 60)
    print(f"Demo query : {demo_query}")
    print(f"Latency    : {latency:.3f}s")
    print("\nTop-5 retrieved standards:")
    for i, r in enumerate(results, 1):
        print(f"  {i}. {r['standard_id']} — {r['title']}")
        print(f"     Category : {r['category']}")
        print(f"     Section  : {r['matched_section']}")
        print(f"     Score    : {r['score']}")
    print("=" * 60)


if __name__ == "__main__":
    main()
