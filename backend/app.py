from __future__ import annotations

import random   
import asyncio
import json
import os
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Dict, List, Tuple
import urllib.parse

import requests
from bs4 import BeautifulSoup
from flask import Flask, jsonify, request
from flask_cors import CORS
from groq import AsyncGroq
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# CONFIG
# ---------------------------------------------------------------------------

MODEL_PRIMARY = "llama-3.3-70b-versatile"
MODEL_FALLBACK2 = "meta-llama/llama-4-scout-17b-16e-instruct"
MODEL_FALLBACK = "meta-llama/llama-4-maverick-17b-128e-instruct"
MAX_TOTAL_BOOK_TOKENS = 16_000 # discard the rest
MAX_COMPLETION_TOKENS = 1_024
MAX_TOKENS_INPUT = 1_024            # keeps total within 8 192 context window
OVERLAP_TOKENS = 100
PARALLEL_LIMIT = 10                 # max concurrent Groq requests
CACHE_DIR = Path("cache")
CACHE_DIR.mkdir(exist_ok=True)

## Debugging configs
MODEL_DEBUG = "qwen-qwq-32b"
#MODEL_DEBUG = "llama-3.3-70b-versatile"
MODEL_DEBUG3 = "mistral-saba-24b"
MODEL_DEBUG2 = "meta-llama/llama-4-maverick-17b-128e-instruct"
# MODEL_DEBUG = "meta-llama/llama-4-maverick-17b-128e-instruct"
# MODEL_DEBUG2 = "meta-llama/llama-4-scout-17b-16e-instruct"
# MODEL_DEBUG = "llama-3.3-70b-versatile"
#MODEL_DEBUG2 = "llama3-70b-8192"      # good JSON + generous rate-limits
MAX_COMPLETION_TOKENS_DBG = 256
MAX_TOKENS_INPUT_DEBUG = MAX_COMPLETION_TOKENS  

## Chatbot configs
CHATBOT_MODEL2 = "llama-3.1-8b-instant"
CHATBOT_MODEL = "llama3-70b-8192"

load_dotenv()

# Debugging configs - moved after load_dotenv()
DEBUG = bool(int(os.getenv("DEBUG", "0")))

API_KEY = os.getenv("GROQ_API_KEY")
if not API_KEY:
    raise RuntimeError("GROQ_API_KEY is not set – add it to your shell env or a .env file")

# Debug: show current DEBUG value
print(f"[STARTUP] DEBUG value: {DEBUG}")
print(f"[STARTUP] Environment DEBUG: {os.getenv('DEBUG')}")

# ---------------------------------------------------------------------------
# UTILS – logging & caching
# ---------------------------------------------------------------------------
def log(msg: str) -> None:
    if DEBUG:
        print(msg, flush=True)


class FileCache:
    """file-system cache that stores and retrieves JSON objects."""

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

# simple character-based tokenizer
class SimpleTokenizer:
    def encode(self, text: str) -> List[int]:
        return [ord(c) for c in text]
    
    def decode(self, tokens: List[int]) -> str:
        return ''.join(chr(t) for t in tokens)

enc = SimpleTokenizer()
print("Using simple character-based tokenizer")

def chunk_by_tokens( text: str, max_in: int = MAX_TOKENS_INPUT,
    overlap: int = OVERLAP_TOKENS, max_total: int = MAX_TOTAL_BOOK_TOKENS) -> List[str]:
  
    tokens = enc.encode(text)
    chunks: List[str] = []
    used = 0
    i = 0

    while i < len(tokens) and (max_total is None or used < max_total):
        slice_tokens = tokens[i : i + max_in]
        if max_total is not None and used + len(slice_tokens) > max_total:
            slice_tokens = slice_tokens[: max_total - used]

        chunks.append(enc.decode(slice_tokens))
        used += len(slice_tokens)
        i += max_in - overlap

    if max_total is None:
        log(f"Chunked into {len(chunks)} pieces (≤{max_in} tokens each, no limit)")
    else:
        log(
            f"Chunked into {len(chunks)} pieces "
            f"({used} / {max_total} tokens kept, ≤{max_in} each)"
        )
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
        "(skip descriptors like 'the red man', 'the nurse', 'God')."
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
            (MODEL_DEBUG, MODEL_DEBUG2, MODEL_DEBUG3) # more generous rate limits and lower qualities, so exposes bugs
            if DEBUG else
            (MODEL_PRIMARY, MODEL_FALLBACK, MODEL_FALLBACK2)
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
                resp = await asyncio.wait_for(
                    groq_client.chat.completions.create(
                        model=model,
                        messages=messages,
                        tools=TOOLS,
                        tool_choice={"type": "function",
                                     "function": {"name": "extract_characters_and_interactions"}},
                        max_completion_tokens=max_comp,
                        temperature=0.1,    # low so that it follows the schema with less variation
                    ),
                    timeout=8.0
                )

                tool_call = resp.choices[0].message.tool_calls[0]
                result = json.loads(tool_call.function.arguments)
                print(f"success - model {model} completed chunk {idx+1}")
                return result
            except asyncio.TimeoutError:
                log(f"Model {model} timed out on chunk {idx+1}")
                continue
            except Exception as ex:
                log(f"Model {model} failed on chunk {idx+1}: {ex}\n")
                await asyncio.sleep(1)
        
        # If all models fail, return empty result instead of crashing
        log(f"All models failed for chunk {idx+1}, returning empty result")
        return {"characters": [], "interactions": []}

# ---------------------------------------------------------------------------
# BOOK DOWNLOAD & SCRAPE
# ---------------------------------------------------------------------------
def fetch_book(book_id: str) -> Dict[str, Any] | None:
    
    # ---------- meta (cached) ---------- #
    meta = cache.load("books_meta", book_id)
    if meta is None:
        html_url = f"https://www.gutenberg.org/ebooks/{book_id}"
        html_res = requests.get(html_url, timeout=10)

        title, author = f"Book {book_id}", "Unknown"
        if html_res.status_code == 200:
            soup = BeautifulSoup(html_res.text, "html.parser")
            h1 = soup.find("h1")
            if (h1):
                raw = h1.get_text(" ", strip=True)
                title = raw.split(" by ", 1)[0].strip()  # removes ' by ' <author>
                author = raw.split(" by ", 1)[1].strip() 
    

        meta = {"id": book_id, "title": title, "author": author}
        cache.save(meta, "books_meta", book_id)

    # ---------- text  ---------- #
    content_url = f"https://www.gutenberg.org/files/{book_id}/{book_id}-0.txt"
    txt_res = requests.get(content_url, timeout=15)
    if txt_res.status_code != 200:
        log(f"Book text not found: {content_url}")
        return None
    
    main_text = txt_res.text   # could strip footer and headers but not necessary and negligible

    return {**meta, "text": main_text}

# ---------------------------------------------------------------------------
# MAIN ANALYSIS PIPELINE
# ---------------------------------------------------------------------------
async def analyze_book_async(book_id: str, names_only: bool) -> Dict[str, Any]:
    
    book = fetch_book(book_id)
    if not book:
        return {"error": "Book not found"}

    # cache key depends on names_only flag because results differ
    cache_key = f"{book_id}_{'names' if names_only else 'all'}"
    cached_graph = cache.load("graphs", cache_key)
    if (cached_graph):
        return cached_graph

    # save ALL chunks to cache for chatbot use (no token limit)
    all_chunks = chunk_by_tokens(book["text"], max_in=MAX_TOKENS_INPUT, overlap=OVERLAP_TOKENS, max_total=None)
    cache.save(all_chunks, "books_chunks", book_id)

    # use limited chunks for analysis - not whole book
    chunk_size = MAX_TOKENS_INPUT_DEBUG if DEBUG else MAX_TOKENS_INPUT
    analysis_chunks = chunk_by_tokens(book["text"], max_in=chunk_size, max_total=MAX_TOTAL_BOOK_TOKENS)

    # async calls with overall timeout
    sem = asyncio.Semaphore(PARALLEL_LIMIT)
    tasks = [call_groq(c, i, len(analysis_chunks), names_only, sem) for i, c in enumerate(analysis_chunks)]
    
    try:
        results = await asyncio.wait_for(
            asyncio.gather(*tasks, return_exceptions=True),
            timeout=45  # 45 seconds overall timeout
        )
    except asyncio.TimeoutError:
        log("Analysis timed out, returning partial results")
        return {
            "book_id": book_id,
            "title": book["title"],
            "author": book["author"],
            "names_only": names_only,
            "characters": [],
            "interactions": [],
            "error": "Analysis timed out - partial results only"
        }

    # merge results, handling exceptions
    char_counter: Counter[str] = Counter()
    edge_data: defaultdict[Tuple[str, str], Dict[str, int]] = defaultdict(lambda: {"count": 0, "strength": 0})

    for i, res in enumerate(results):
        if isinstance(res, Exception):
            log(f"Chunk {i+1} failed with exception: {res}")
            continue
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

# to test: curl http://localhost:5001/api/test_book/<id>
@app.route("/api/test_book/<book_id>")
def test_book(book_id: str):
    """Test endpoint to fetch book metadata"""
    book = fetch_book(book_id)
    if not book:
        return jsonify({"error": "Book not found"}), 404
    
    return jsonify({
        "title": book["title"],
        "author": book["author"]
    })


# ---------------------------------------------------------------------------
# CHATBOT
# ---------------------------------------------------------------------------

async def call_groq_simple(prompt: str,
                           sem: asyncio.Semaphore) -> str:
    """Same as call_groq but without function-calling"""
  
    models: tuple[str, ...] = (CHATBOT_MODEL, CHATBOT_MODEL2)

    async with sem:
        for model in models:
            try:
                log(f"[DEBUG] Trying model: {model}")
                resp = await groq_client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system",
                         "content": "You are a helpful literary assistant. Answer questions about this snippet of the book based on the provided text. Be helpful and informative and concise."},
                        {"role": "user", "content": prompt}
                    ],
                    max_completion_tokens=MAX_COMPLETION_TOKENS_DBG
                    if DEBUG else MAX_COMPLETION_TOKENS,
                    temperature=0.7,
                )
                response = resp.choices[0].message.content.strip()
                log(f"[DEBUG] Model {model} response: {response[:100]}...")  # First 100 chars
                return response
            except Exception as ex:
                log(f"[chunk-call] {model} failed: {ex}")
                await asyncio.sleep(0.5)

    # all models failed
    log(f"[DEBUG] All models failed for prompt: {prompt[:100]}...")
    return "NO_DATA"

async def single_call(prompt: str) -> str:
    "Call the main chatbot agent"

    models: tuple[str, ...] = (CHATBOT_MODEL, CHATBOT_MODEL2)

    for model in models:
        try:
            resp = await groq_client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system",
                     "content": "You are a knowledgeable literary assistant. Provide clear, accurate, concise, and helpful answers about the book given its snippets. Write in a conversational but informative tone."},
                    {"role": "user", "content": prompt}
                ],
                max_completion_tokens=MAX_COMPLETION_TOKENS,
                temperature=0.8,
            )
            return resp.choices[0].message.content.strip()
        except Exception as ex:
            log(f"[synthesis] {model} failed: {ex}")
            await asyncio.sleep(0.5)

    return "Sorry, I couldn't generate an answer right now."

QUESTION_PROMPT = """
Based on the following text chunk, answer the user's question as best you can. 
If the chunk contains relevant information, provide a helpful answer.
If the chunk has no relevant information at all, respond with: "NO_DATA"

User question: "{question}"
Chunk:
\"\"\"
{chunk}
\"\"\"
"""

async def answer_question(book_id: str, question: str, chunks: list[str], chunk_selection: str = "random", selected_chunks: list[int] = None) -> str:

    # Determine which chunks to use
    if chunk_selection == "user" and selected_chunks:
        # Validate user-selected chunks
        valid_chunks = []
        for chunk_idx in selected_chunks:
            if 0 <= chunk_idx < len(chunks):
                valid_chunks.append(chunks[chunk_idx])
            else:
                return f"Error: Chunk {chunk_idx} is out of range. Available chunks: 0-{len(chunks)-1}"
        
        if len(valid_chunks) == 0:
            return "Error: No valid chunks selected. Please select chunks between 0 and {len(chunks)-1}."
        
        sample = valid_chunks
        log(f"[DEBUG] User selected chunks: {selected_chunks}")
    else:
        # pick only 3 random chunks to answer the question due to rate limits
        sample = random.sample(chunks, k=min(3, len(chunks)))
        log(f"[DEBUG] Random chunk selection")
    
    log(f"[DEBUG] Question: {question}")
    log(f"[DEBUG] Using {len(sample)} chunks out of {len(chunks)} total chunks")

    # Debug: show chunk content
    for i, chunk in enumerate(sample):
        log(f"[DEBUG] Chunk {i+1} content (first 200 chars): {chunk[:200]}...")

    sem   = asyncio.Semaphore(PARALLEL_LIMIT)
    tasks = [
        call_groq_simple(
            QUESTION_PROMPT.format(question=question, chunk=c),
            sem
        ) for c in sample
    ]
    partials = await asyncio.gather(*tasks)

    # Debug: print all responses
    log(f"[DEBUG] All LLM responses:")
    for i, response in enumerate(partials):
        log(f"[DEBUG] Chunk {i+1}: {response[:200]}...")  # First 200 chars

    # filter out "NO_DATA"
    snippets = [p for p in partials if p.strip() != "NO_DATA"]
    log(f"[DEBUG] Valid responses after filtering: {len(snippets)}")
    
    if not snippets:
        return "Sorry, that information isn't in this part of the book."

    # final synthesis with one more LLM call
    synthesis_prompt = f"""Based on the following snippets from the book, answer this specific question: "{question}"

Compile the knowledge from these snippets to provide a comprehensive answer:

{chr(10).join(snippets)}"""
    log(f"[DEBUG] Synthesis prompt: {synthesis_prompt[:300]}...")  # First 300 chars
    
    final_answer = await single_call(synthesis_prompt) # the main chatbot agent
    log(f"[DEBUG] Final answer: {final_answer[:200]}...")  # First 200 chars
    
    return final_answer

# our own chatbot 
@app.route("/api/query", methods=["POST"])
def query_route():
    data = request.get_json(force=True)
    book_id  = data["book_id"]
    question = data["question"]
    chunk_selection = data.get("chunk_selection", "random")  # "random" or "user"
    selected_chunks = data.get("selected_chunks", None)  # list of chunk indices

    # load cached chunks
    chunks = cache.load("books_chunks", book_id)
    if not chunks:
        return jsonify({"error": "Run /api/analyze first"}), 400

    # Validate chunk selection
    if chunk_selection == "user":
        if not selected_chunks:
            return jsonify({"error": "selected_chunks is required when chunk_selection is 'user'"}), 400
        if not isinstance(selected_chunks, list):
            return jsonify({"error": "selected_chunks must be a list"}), 400
        if len(selected_chunks) > 3:
            return jsonify({"error": "Maximum 3 chunks allowed"}), 400

    # ask helper LLMs in parallel (re-use call_groq but different prompt)
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    answer = loop.run_until_complete(answer_question(book_id, question, chunks, chunk_selection, selected_chunks))
    loop.close()

    return jsonify({"answer": answer})

# get chunk count for a book
@app.route("/api/chunks/<book_id>")
def get_chunk_count(book_id: str):
    chunks = cache.load("books_chunks", book_id)
    if not chunks:
        return jsonify({"error": "Book not analyzed yet"}), 404
    
    return jsonify({
        "book_id": book_id,
        "chunk_count": len(chunks),
        "available_chunks": list(range(len(chunks)))
    })


# ---------------------------------------------------------------------------
# CHARACTER IMAGE
# ---------------------------------------------------------------------------

@app.route("/api/character_image")
def character_image():
    name = request.args.get("name", "").strip()
    if not name:
        return {"error": "missing name"}, 400

    # try Wikipedia summary endpoint
    wiki = (
        "https://en.wikipedia.org/api/rest_v1/page/summary/"
        + urllib.parse.quote(name)
    )
    try:
        data = requests.get(wiki, timeout=4).json()
        thumb = data.get("thumbnail", {}).get("source")
        if thumb:
            return {"url": thumb}
    except Exception:
        pass  # network or JSON error → ignore

    # deterministic SVG avatar as fallback
    avatar = (
        "https://api.dicebear.com/7.x/bottts/svg?seed="
        + urllib.parse.quote(name)
    )
    return {"url": avatar}

# basic health check
@app.route("/api/health")
def health():
    return {"status": "ok"}

# clear cache endpoint
# curl -X POST https://bookanalyzer.onrender.com/api/clear_cache
@app.route("/api/clear_cache", methods=["POST"])
def clear_cache():
    """Clear all cached data"""
    try:
        import shutil
        
        # Check if cache directory exists
        if CACHE_DIR.exists():
            # Remove the entire cache directory and its contents
            shutil.rmtree(CACHE_DIR)
            # Recreate the empty cache directory
            CACHE_DIR.mkdir(exist_ok=True)
            
            return jsonify({
                "status": "success",
                "message": "Cache cleared successfully",
                "cache_dir": str(CACHE_DIR)
            }), 200
        else:
            return jsonify({
                "status": "success", 
                "message": "Cache directory was already empty",
                "cache_dir": str(CACHE_DIR)
            }), 200
            
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Failed to clear cache: {str(e)}"
        }), 500

# get cache info endpoint
@app.route("/api/cache_info")
def cache_info():
    """Get information about the cache directory"""
    try:
        if not CACHE_DIR.exists():
            return jsonify({
                "status": "success",
                "cache_dir": str(CACHE_DIR),
                "exists": False,
                "size": 0,
                "items": 0
            }), 200
        
        # Calculate cache size and count items
        total_size = 0
        total_items = 0
        
        for root, dirs, files in os.walk(CACHE_DIR):
            for file in files:
                file_path = Path(root) / file
                total_size += file_path.stat().st_size
                total_items += 1
        
        return jsonify({
            "status": "success",
            "cache_dir": str(CACHE_DIR),
            "exists": True,
            "size_bytes": total_size,
            "size_mb": round(total_size / (1024 * 1024), 2),
            "items": total_items
        }), 200
        
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Failed to get cache info: {str(e)}"
        }), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=DEBUG)
