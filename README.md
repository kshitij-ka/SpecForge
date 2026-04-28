# SpecForge

A web application for querying BIS SP-21 building material standards with semantic search and AI-powered explanations.

---

## Features

- **PDF Parser**: Extracts 573 unique standards from the BIS SP-21 document (929 pages, 25 material categories)
- **Hybrid Retrieval**: FAISS dense vectors + BM25 sparse index for accurate matching
- **AI Explanations**: Groq LLM generates natural language explanations for recommendations
- **Gallery UI**: Photography-first interface with alternating light/dark sections

## Tech Stack

| Layer | Technology |
|-------|------------|
| PDF Processing | Python, PyMuPDF |
| Retrieval | FAISS, BM25 |
| LLM | Groq (llama-3.1-8b-instant) |
| Backend | Node.js, Express |
| Frontend | React 19, Vite 8, React Router |

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.10+

### Installation

```bash
# Install Python dependencies
pip install -r requirements.txt

# Install web dependencies
cd web/server && npm install
cd web/client && npm install
```

### Running the Application

**All platforms:**
```bash
cd web && npm run dev
```

**Windows:**
```bash
npm run dev
```

**Manual start:**
```bash
# Terminal 1: Python retrieval index
cd web/server && node bridge/retrieve.py --build-index

# Terminal 2: Backend
cd web/server && npm start

# Terminal 3: Frontend
cd web/client && npm run dev
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/recommend` | Get recommended standards with AI explanations |
| POST | `/api/ask` | Ask questions about a specific standard |
| GET | `/api/standards` | List all standards |
| GET | `/api/search?q=query` | Search standards by keyword |

## Project Structure

```
SpecForge/
├── data/
│   ├── raw/dataset.pdf           # Source BIS SP-21 PDF
│   └── processed/                 # Generated outputs
│       ├── standards.json       # 573 parsed standards
│       └── standards_chunks.json # 1,261 RAG chunks
├── src/
│   └── parse_bis_pdf.py         # PDF parser pipeline
├── scripts/
│   └── eval_script.py          # Evaluation metrics
├── web/
│   ├── client/                 # React + Vite frontend
│   └── server/                 # Express backend
│       ├── services/            # LLM & retrieval services
│       └── bridge/             # Node→Python bridge
└── requirements.txt           # Python dependencies
```

## Configuration

- **GROQ_API_KEY**: Set in `web/server/.env` (gitignored)
- **Server port**: 5000
- **Client dev port**: 5173

---
