"""
Project Gutenberg Analyzer – v3
-------------------------------
*  Async Groq calls with function-calling & JSON-mode
*  Token-aware chunking (tiktoken)
*  Concurrent fan-out / fan-in merge
*  Optional file-system cache (flat JSON)
*  Flask 2.x backend (sync wrapper around asyncio)

v3 adds:
1. `names_only` flag – keep only characters that have real names.
2. `sentiment` on every interaction; final graph now has `count` + `strength`.
"""
from __future__ import annotations

import asyncio
import json
import os
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Dict, List, Tuple

import requests
import tiktoken
from bs4 import BeautifulSoup
from flask import Flask, jsonify, request
from flask_cors import CORS
from groq import AsyncGroq
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# CONFIG
# ---------------------------------------------------------------------------

MODEL_PRIMARY = "llama-3.3-70b-versatile"
MODEL_FALLBACK = "llama-3.1-8b-instant"
MAX_COMPLETION_TOKENS     = 1_024
MAX_TOKENS_INPUT = 6_000            # keeps total within 8 192 context window
OVERLAP_TOKENS = 200
PARALLEL_LIMIT = 12                 # max concurrent Groq requests
CACHE_DIR = Path("cache")
CACHE_DIR.mkdir(exist_ok=True)

## Debugging configs
DEBUG = bool(os.getenv("DEBUG", "1"))
MODEL_DEBUG = "llama3-70b-8192"      # good JSON + generous rate-limits
MODEL_DEBUG2 = "llama3-8b-8192"
MAX_COMPLETION_TOKENS_DBG = 256
MAX_TOKENS_INPUT_DEBUG    = 1500    


load_dotenv()
API_KEY = os.getenv("GROQ_API_KEY")
if not API_KEY:
    raise RuntimeError("GROQ_API_KEY is not set – add it to your shell env or a .env file")

# ---------------------------------------------------------------------------
# UTILS – logging & caching
# ---------------------------------------------------------------------------
def log(msg: str) -> None:
    if DEBUG:
        print(msg, flush=True)


class FileCache:
    """Dead-simple file-system cache. Stores & retrieves JSON-serialisable objects."""

    @staticmethod
    def _path(*parts: str) -> Path:
        return CACHE_DIR.joinpath(*parts).with_suffix(".json")

    def load(self, *key: str) -> Any | None:
        p = self._path(*key)
        if p.exists():
            try:
                return json.loads(p.read_text())
            except Exception:
                p.unlink(missing_ok=True)
        return None

    def save(self, data: Any, *key: str) -> None:
        p = self._path(*key)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(data, ensure_ascii=False))


cache = FileCache()

# ---------------------------------------------------------------------------
# TOKEN CHUNKING
# ---------------------------------------------------------------------------
try:
    enc = tiktoken.encoding_for_model("gpt-4o")
except KeyError:                     # older tiktoken build
    print("Warning: tiktoken build is old")
    enc = tiktoken.get_encoding("cl100k_base")

def chunk_by_tokens(text: str, max_in: int = MAX_TOKENS_INPUT, overlap: int = OVERLAP_TOKENS) -> List[str]:
    tokens = enc.encode(text)
    chunks: List[str] = []
    i = 0
    while i < len(tokens):
        chunk_tokens = tokens[i : i + max_in]
        chunks.append(enc.decode(chunk_tokens))
        i += max_in - overlap
    log(f"Chunked into {len(chunks)} pieces (≤{max_in} tokens each)")
    return chunks

# ---------------------------------------------------------------------------
# GROQ LLM TOOL SCHEMA
# ---------------------------------------------------------------------------
groq_client = AsyncGroq(api_key=API_KEY)

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "extract_characters_and_interactions",
            "description": "Return character graph for this chunk",
            "parameters": {
                "type": "object",
                "properties": {
                    "characters": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "mentions": {"type": "integer"},
                            },
                            "required": ["name", "mentions"],
                        },
                    },
                    "interactions": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "from": {"type": "string"},
                                "to": {"type": "string"},
                                "sentiment": {
                                    "type": "integer",
                                    "description": "-1 negative, 0 neutral, 1 positive"
                                },
                            },
                            "required": ["from", "to", "sentiment"],
                        },
                    },
                },
                "required": ["characters", "interactions"],
            },
        },
    }
]

PROMPT_BASE = """
You are processing chunk {idx}/{total} from a Project Gutenberg book.

**Output MUST be a single JSON tool call** that follows the given schema – *no extra commentary*.

Instructions:
- Extract all named characters and how many times each is mentioned in this chunk.
- Detect every direct interaction (dialogue, confrontation, cooperation, etc.) between two characters.
- For each interaction add a `sentiment` score: 1 if positive/friendly, 0 if neutral/unclear, -1 if negative/hostile.
{names_rule}
Text:
"""

def build_prompt(idx: int, total: int, names_only: bool) -> str:
    """Build the prompt for the Groq request"""

    names_rule = (
        "- **names_only mode is ON**: **ignore** entities that are not *proper names* "
        "(skip descriptors like “the red man”, “the nurse”, “God”)."
        if names_only else
        "- Include any recurring character or well-defined entity (named or descriptive)."
    )
    return PROMPT_BASE.format(idx=idx+1, total=total, names_rule=names_rule)

# ---------------------------------------------------------------------------
# ASYNC LLM CALL
# ---------------------------------------------------------------------------
async def call_groq(chunk: str, idx: int, total: int, names_only: bool, sem: asyncio.Semaphore) -> Dict[str, Any]:
    """Groq request with fallback model and debug models"""
    async with sem:

        models: tuple[str, ...] = (
            (MODEL_DEBUG, MODEL_DEBUG2)
            if DEBUG else
            (MODEL_PRIMARY, MODEL_FALLBACK)
        )

        max_comp = MAX_COMPLETION_TOKENS_DBG if DEBUG else MAX_COMPLETION_TOKENS

        for model in models:
            try:
                messages = [
                    {
                        "role": "system",
                        "content": "You are a literary analyst. Respond ONLY with the required JSON tool call."
                    },
                    {
                        "role": "user",
                        "content": build_prompt(idx, total, names_only) + chunk,
                    }
                ]
                resp = await groq_client.chat.completions.create(
                    model=model,
                    messages=messages,
                    tools=TOOLS,
                    tool_choice={"type": "function",
                                 "function": {"name": "extract_characters_and_interactions"}},
                    max_completion_tokens=max_comp,
                    temperature=0.1,
                )

                tool_call = resp.choices[0].message.tool_calls[0]
                return json.loads(tool_call.function.arguments)
            except Exception as ex:
                log(f"Model {model} failed on chunk {idx+1}: {ex}")
                await asyncio.sleep(1)
        return {"characters": [], "interactions": []}

# ---------------------------------------------------------------------------
# BOOK DOWNLOAD & SCRAPE
# ---------------------------------------------------------------------------
def fetch_book(book_id: str) -> Dict[str, Any] | None:
    cached = cache.load("books", book_id)
    if cached:
        log(f"Cache hit: book {book_id}")
        return cached

    content_url = f"https://www.gutenberg.org/files/{book_id}/{book_id}-0.txt"
    html_url = f"https://www.gutenberg.org/ebooks/{book_id}"

    txt_res = requests.get(content_url, timeout=30)
    if txt_res.status_code != 200:
        log(f"Book text not found: {content_url}")
        return None

    html_res = requests.get(html_url, timeout=30)
    title, author = f"Book {book_id}", "Unknown"
    if html_res.status_code == 200:
        soup = BeautifulSoup(html_res.text, "html.parser")
        if (h1 := soup.find("h1")):
            title = h1.get_text(strip=True)
        if (a := soup.select_one("a[href*='/ebooks/author/']")):
            author = a.get_text(strip=True)

    # Strip Gutenberg header/footer
    lines = txt_res.text.splitlines()
    start, end = 0, len(lines)
    for i, l in enumerate(lines):
        if "*** START OF" in l:
            start = i + 1
        if "*** END OF" in l:
            end = i
            break
    main_text = "\n".join(lines[start:end])

    book = {"id": book_id, "title": title, "author": author, "text": main_text}
    cache.save(book, "books", book_id)
    return book

# ---------------------------------------------------------------------------
# MAIN ANALYSIS PIPELINE
# ---------------------------------------------------------------------------
async def analyze_book_async(book_id: str, names_only: bool) -> Dict[str, Any]:
    
    book = fetch_book(book_id)
    if not book:
        return {"error": "Book not found"}

    # cache key depends on names_only flag because results differ
    cache_key = f"{book_id}_{'names' if names_only else 'all'}"
    if (cached_graph := cache.load("graphs", cache_key)):
        return cached_graph

    chunk_size = MAX_TOKENS_INPUT_DEBUG if DEBUG else MAX_TOKENS_INPUT
    chunks = chunk_by_tokens(book["text"], max_in=chunk_size)

    if DEBUG:   
        chunks = chunks[:4]    # only use a few chunks for debugging

    sem = asyncio.Semaphore(PARALLEL_LIMIT)
    tasks = [call_groq(c, i, len(chunks), names_only, sem) for i, c in enumerate(chunks)]
    results = await asyncio.gather(*tasks)

    # merge results
    char_counter: Counter[str] = Counter()
    edge_data: defaultdict[Tuple[str, str], Dict[str, int]] = defaultdict(lambda: {"count": 0, "strength": 0})

    for res in results:
        for ch in res.get("characters", []):
            char_counter[ch["name"]] += ch["mentions"]
        for inter in res.get("interactions", []):
            a, b = sorted([inter["from"], inter["to"]])
            edge = edge_data[(a, b)]
            edge["count"] += 1
            edge["strength"] += inter.get("sentiment", 0)

    characters = [{"name": n, "mentions": c} for n, c in char_counter.most_common()]
    interactions = [
        {"from": a, "to": b, "count": d["count"], "strength": d["strength"]}
        for (a, b), d in edge_data.items()
    ]

    graph = {
        "book_id": book_id,
        "title": book["title"],
        "author": book["author"],
        "names_only": names_only,
        "characters": characters,
        "interactions": interactions,
    }
    cache.save(graph, "graphs", cache_key)
    return graph

# ---------------------------------------------------------------------------
# FLASK APP
# ---------------------------------------------------------------------------
app = Flask(__name__)
CORS(app)

@app.route("/api/analyze", methods=["POST"])
def analyze_route():
    data = request.get_json(force=True)
    book_id = data.get("book_id")
    if not book_id:
        return jsonify({"error": "book_id is required"}), 400

    names_only = bool(data.get("names_only", False))

    start = time.time()
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    result = loop.run_until_complete(analyze_book_async(book_id, names_only))
    loop.close()
    log(f"Analysis finished in {time.time() - start:.1f}s (names_only={names_only})")

    status = 200 if "error" not in result else 404
    return jsonify(result), status

@app.route("/api/health")
def health():
    return {"status": "ok"}

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=DEBUG)
