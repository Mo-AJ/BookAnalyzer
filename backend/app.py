from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import json
import re
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
import groq
import time
import random

# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app)

# Debug flag 
DEBUG = True

# Rate limits config 
RATE_LIMIT_DELAY = 2  
MAX_RETRIES = 3
RETRY_DELAY = 60  

def log(message):
    """Print message only if debug is enabled"""
    if DEBUG:
        print(message)

def download_and_analyze_book(book_id: str):
    """Download a book from Project Gutenberg and print its format"""
    try:
        log(f"\n=== DOWNLOADING BOOK {book_id} ===")
        
        # URLs
        content_url = f"https://www.gutenberg.org/files/{book_id}/{book_id}-0.txt"
        metadata_url = f"https://www.gutenberg.org/ebooks/{book_id}"
        
        log(f"Content URL: {content_url}")
        log(f"Metadata URL: {metadata_url}")
        
        # Download book content
        log("\n--- DOWNLOADING CONTENT ---")
        content_response = requests.get(content_url)
        log(f"Content response status: {content_response.status_code}")
        
        if content_response.status_code != 200:
            log(f"❌ Failed to download content: {content_response.status_code}")
            return None
        
        content = content_response.text
        log(f"✅ Content downloaded successfully!")
        log(f"Content length: {len(content)} characters")
        log(f"Content preview (first 500 chars):")
        log("-" * 50)
        log(content[:500])
        log("-" * 50)
        
        # Download metadata
        log("\n--- DOWNLOADING METADATA ---")
        metadata_response = requests.get(metadata_url)
        log(f"Metadata response status: {metadata_response.status_code}")
        
        title = f"Book {book_id}"
        author = "Unknown"
        
        if metadata_response.status_code == 200:
            soup = BeautifulSoup(metadata_response.text, 'html.parser')
            
            # Try to find title
            title_elem = soup.find('h1')
            if title_elem:
                title = title_elem.get_text().strip()
                log(f"✅ Found title: {title}")
            else:
                log("❌ No title found")
            
            # Try to find author
            author_elem = soup.find('a', href=lambda x: x and '/ebooks/author/' in x)
            if author_elem:
                author = author_elem.get_text().strip()
                log(f"✅ Found author: {author}")
            else:
                log("❌ No author found")
        else:
            log(f"❌ Failed to download metadata: {metadata_response.status_code}")
        
        # Analyze content structure
        log("\n--- CONTENT STRUCTURE ANALYSIS ---")
        lines = content.split('\n')
        log(f"Total lines: {len(lines)}")
        
        # Find Project Gutenberg markers
        start_marker = None
        end_marker = None
        
        for i, line in enumerate(lines):
            if "*** START OF" in line or "***START OF" in line:
                start_marker = i
                log(f"✅ Found start marker at line {i}: {line.strip()}")
            elif "*** END OF" in line or "***END OF" in line:
                end_marker = i
                log(f"✅ Found end marker at line {i}: {line.strip()}")
        
        if start_marker is not None and end_marker is not None:
            actual_content = '\n'.join(lines[start_marker + 1:end_marker])
            log(f"✅ Extracted actual content: {len(actual_content)} characters")
            log("Actual content preview (first 300 chars):")
            log("-" * 50)
            log(actual_content[:300])
            log("-" * 50)
        else:
            log("❌ Could not find start/end markers")
            actual_content = content
        
        return {
            "book_id": book_id,
            "title": title,
            "author": author,
            "content_length": len(content),
            "actual_content_length": len(actual_content),
            "actual_content": actual_content
        }
        
    except Exception as e:
        log(f"❌ Error: {e}")
        return None

def chunk_text(text: str, chunk_size: int = 3000, overlap: int = 200) -> list:
    """Split text into overlapping chunks for LLM processing"""
    chunks = []
    start = 0
    
    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end]
        chunks.append(chunk)
        start = end - overlap
        
    log(f"Created {len(chunks)} chunks of ~{chunk_size} characters each")
    return chunks

def rate_limited_request(groq_client, messages, functions, chunk_index, total_chunks):
    """Make a rate-limited request to Groq with retry logic"""
    # List of models to try in order of preference
    models_to_try = [
        "gemma2-9b-it",
        "llama3-70b-8192", 
        "llama3-8b-8192"
    ]
    
    for model in models_to_try:
        for attempt in range(MAX_RETRIES):
            try:
                log(f"Attempt {attempt + 1}/{MAX_RETRIES} for chunk {chunk_index + 1} using {model}")
                
                # Add delay between requests to avoid rate limiting
                if attempt > 0:
                    time.sleep(RATE_LIMIT_DELAY)
                
                chat_completion = groq_client.chat.completions.create(
                    messages=messages,
                    model=model,
                    temperature=0.1,
                    max_tokens=1024,
                    tools=functions,
                    tool_choice={"type": "function", "function": {"name": "extract_characters_and_interactions"}}
                )
                
                log(f"✅ Chunk {chunk_index + 1}: Request successful with {model}")
                return chat_completion
                
            except Exception as e:
                error_str = str(e)
                log(f"❌ Attempt {attempt + 1} failed with {model}: {error_str}")
                
                # Check if it's a rate limit error or function call error
                if ("rate_limit" in error_str.lower() or "429" in error_str or 
                    "tool_use_failed" in error_str or "400" in error_str):
                    if attempt < MAX_RETRIES - 1:
                        wait_time = RETRY_DELAY + random.uniform(0, 10)  # Add some randomness
                        log(f"Error occurred. Waiting {wait_time:.1f} seconds before retry...")
                        time.sleep(wait_time)
                    else:
                        log(f"❌ Max retries reached for chunk {chunk_index + 1} with {model}")
                        # Try next model
                        break
                else:
                    # For other errors, try next model
                    log(f"❌ Non-retryable error with {model}: {error_str}")
                    break
    
    log(f"❌ All models failed for chunk {chunk_index + 1}")
    return None

def analyze_chunk_with_llm(chunk: str, chunk_index: int, total_chunks: int) -> dict:
    """Analyze a single chunk using LLM with function calls"""
    try:
        log(f"\n--- ANALYZING CHUNK {chunk_index + 1}/{total_chunks} ---")
        log(f"Chunk length: {len(chunk)} characters")
        log(f"Chunk preview: {chunk[:200]}...")
        
        prompt = f"""
        You are analyzing chunk {chunk_index + 1} of {total_chunks} from a book.
        
        Text chunk:
        {chunk}
        
        Instructions:
        1. Find all CHARACTER NAMES mentioned in this chunk (first names, last names, full names, titles like "Mr.", "Dr.", etc.)
        2. Count how many times each character appears
        3. Identify interactions between characters (conversations, meetings, conflicts, etc.) by counting them
        4. IMPORTANT: Only include actual character names, NOT pronouns like "he", "she", "him", "her", "I", "you", "they", "them", "we", "us"
        5. Look for proper names like "Elizabeth", "Mr. Darcy", "Dr. Watson", "Sherlock Holmes", etc.
        """
        
        # Function definition for structured output
        functions = [
            {
                "type": "function",
                "function": {
                    "name": "extract_characters_and_interactions",
                    "description": "Extract characters and their interactions from the text chunk",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "characters": {
                                "type": "array",
                                "description": "Characters found in this chunk",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "name": {"type": "string", "description": "Character name (use full name if possible)"},
                                        "mentions": {"type": "integer", "description": "Number of times this character is mentioned in this chunk"}
                                    },
                                    "required": ["name", "mentions"]
                                }
                            },
                            "interactions": {
                                "type": "array",
                                "description": "Character interactions found in this chunk",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "from": {"type": "string", "description": "First character name"},
                                        "to": {"type": "string", "description": "Second character name"},
                                        "count": {"type": "integer", "description": "Number of interactions between these characters in this chunk"}
                                    },
                                    "required": ["from", "to", "count"]
                                }
                            }
                        },
                        "required": ["characters", "interactions"]
                    }
                }
            }
        ]
        
        # Initialize Groq client
        groq_client = groq.Groq(api_key=os.getenv("GROQ_API_KEY"))
        
        log("Sending request to Groq LLM...")
        
        chat_completion = rate_limited_request(groq_client, [{"role": "user", "content": prompt}], functions, chunk_index, total_chunks)
        
        if chat_completion is None:
            log(f"❌ Chunk {chunk_index + 1}: All models failed, using fallback extraction")
            return fallback_extraction(chunk, chunk_index)
        
        log(f"LLM response received")
        
        # Extract function call response
        if chat_completion.choices[0].message.tool_calls:
            tool_call = chat_completion.choices[0].message.tool_calls[0]
            function_args = json.loads(tool_call.function.arguments)
            log(f"✅ Chunk {chunk_index + 1}: Found {len(function_args.get('characters', []))} characters, {len(function_args.get('interactions', []))} interactions")
            log(f"Characters: {[char['name'] for char in function_args.get('characters', [])]}")
            return function_args
        else:
            log(f"❌ Chunk {chunk_index + 1}: No tool call response, using fallback extraction")
            log(f"Raw LLM response: {chat_completion.choices[0].message.content}")
            return fallback_extraction(chunk, chunk_index)
            
    except Exception as e:
        log(f"❌ Error analyzing chunk {chunk_index}: {e}")
        return {"characters": [], "interactions": []}

def analyze_book_with_llm(book_data: dict) -> dict:
    """Analyze book content using LLM with chunking and function calls"""
    try:
        log("\n=== LLM ANALYSIS ===")
        
        actual_content = book_data["actual_content"]
        
        # Chunk the content
        chunks = chunk_text(actual_content, chunk_size=3000, overlap=200)
        
        # Limit the number of chunks to process to avoid rate limits
        max_chunks = 5  # Process only first 5 chunks for testing
        if len(chunks) > max_chunks:
            log(f"⚠️  Limiting analysis to first {max_chunks} chunks (out of {len(chunks)}) for testing")
            chunks = chunks[:max_chunks]
        
        # Analyze each chunk
        all_characters = {}
        all_interactions = {}
        
        for i, chunk in enumerate(chunks):
            log(f"Processing chunk {i+1}/{len(chunks)}")
            result = analyze_chunk_with_llm(chunk, i, len(chunks))
            
            # Aggregate characters
            for char in result.get("characters", []):
                name = char["name"]
                mentions = char["mentions"]
                if name in all_characters:
                    all_characters[name] += mentions
                else:
                    all_characters[name] = mentions
            
            # Aggregate interactions
            chunk_interactions = result.get("interactions", [])
            log(f"Chunk {i+1} interactions: {chunk_interactions}")
            
            for interaction in chunk_interactions:
                # Create tuple key for interaction
                char1, char2 = sorted([interaction["from"], interaction["to"]])
                interaction_key = (char1, char2)
                
                if interaction_key in all_interactions:
                    all_interactions[interaction_key]["count"] += interaction["count"]
                    log(f"Updated interaction {char1} <-> {char2}: {all_interactions[interaction_key]['count']} total")
                else:
                    all_interactions[interaction_key] = {
                        "from": char1,
                        "to": char2,
                        "count": interaction["count"]
                    }
                    log(f"New interaction {char1} <-> {char2}: {interaction['count']} interactions")
            
            # Add delay between chunks to avoid rate limiting
            if i < len(chunks) - 1:  # Don't delay after the last chunk
                time.sleep(RATE_LIMIT_DELAY)
        
        # Convert to final format
        characters = [{"name": name, "mentions": count} for name, count in all_characters.items()]
        characters.sort(key=lambda x: x["mentions"], reverse=True)
        
        # Convert interactions to list format
        interactions = []
        log(f"\n--- ALL INTERACTIONS FOUND ---")
        for interaction_key, data in all_interactions.items():
            log(f"Interaction: {data['from']} <-> {data['to']}: {data['count']} interactions")
            # Include all interactions between any characters found
            interactions.append({
                "from": data["from"],
                "to": data["to"],
                "strength": data["count"]
            })
            log(f"✅ Included in final results: {data['from']} <-> {data['to']}")
        
        log(f"✅ LLM Analysis Complete:")
        log(f"  - Found {len(characters)} characters")
        log(f"  - Found {len(interactions)} interactions")
        log(f"  - Total interactions found: {len(all_interactions)}")
        
        return {
            "characters": characters,
            "interactions": interactions
        }
        
    except Exception as e:
        log(f"❌ Error in LLM analysis: {e}")
        return {"characters": [], "interactions": []}

@app.route('/api/analyze', methods=['POST'])
def analyze_book_endpoint():
    """Analyze a book by ID - debug version"""
    try:
        data = request.get_json()
        book_id = data.get('book_id')
        
        if not book_id:
            return jsonify({"error": "book_id is required"}), 400
        
        log(f"\n🔍 REQUEST: Analyzing book {book_id}")
        
        # Step 1: Download and basic analysis
        book_data = download_and_analyze_book(book_id)
        
        if book_data is None:
            return jsonify({
                "error": f"Book {book_id} not found on Project Gutenberg. Please try a different book ID.",
                "suggestion": "Try popular book IDs like: 1342 (Pride and Prejudice), 11 (Alice in Wonderland), 1661 (Sherlock Holmes)"
            }), 404
        
        # Step 2: LLM analysis with function calls
        llm_result = analyze_book_with_llm(book_data)
        
        # Combine results
        response_data = {
            "book_id": book_data["book_id"],
            "title": book_data["title"],
            "author": book_data["author"],
            "characters": llm_result["characters"],
            "interactions": llm_result["interactions"]
        }
        
        log(f"\n✅ SUCCESS: Returning {len(llm_result['characters'])} characters and {len(llm_result['interactions'])} interactions")
        return jsonify(response_data)
        
    except Exception as e:
        log(f"❌ ERROR in analyze endpoint: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/search', methods=['GET'])
def search_books():
    """Search for books by title, author, or keywords"""
    query = request.args.get('q', '').lower()
    
    # Popular books for search - only include verified existing book IDs
    POPULAR_BOOKS = [
        {"id": "1342", "title": "Pride and Prejudice", "author": "Jane Austen", "language": "English"},
        {"id": "11", "title": "Alice's Adventures in Wonderland", "author": "Lewis Carroll", "language": "English"},
        {"id": "1661", "title": "The Adventures of Sherlock Holmes", "author": "Arthur Conan Doyle", "language": "English"},
        {"id": "84", "title": "Frankenstein", "author": "Mary Shelley", "language": "English"},
        {"id": "98", "title": "A Tale of Two Cities", "author": "Charles Dickens", "language": "English"},
        {"id": "2701", "title": "Moby Dick", "author": "Herman Melville", "language": "English"},
        {"id": "76", "title": "Adventures of Huckleberry Finn", "author": "Mark Twain", "language": "English"},
        {"id": "345", "title": "Dracula", "author": "Bram Stoker", "language": "English"},
        {"id": "1952", "title": "The Yellow Wallpaper", "author": "Charlotte Perkins Gilman", "language": "English"},
        {"id": "74", "title": "The Adventures of Tom Sawyer", "author": "Mark Twain", "language": "English"},
        {"id": "1184", "title": "The Count of Monte Cristo", "author": "Alexandre Dumas", "language": "English"},
        {"id": "1400", "title": "Great Expectations", "author": "Charles Dickens", "language": "English"},
    ]
    
    if not query:
        return jsonify({"books": POPULAR_BOOKS})
    
    # Simple search through popular books
    results = []
    for book in POPULAR_BOOKS:
        if (query in book['title'].lower() or 
            query in book['author'].lower() or
            query in book['id']):
            results.append(book)
    
    # If no exact matches, return popular books
    if not results:
        results = POPULAR_BOOKS
    
    return jsonify({"books": results})

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({"status": "healthy"})

if __name__ == '__main__':
    print("Starting Project Gutenberg Book Analyzer")
    print(f"Debug logging: {'ON' if DEBUG else 'OFF'}")
    print("Backend will print detailed information about book downloads")
    print("API endpoints:")
    print("  - GET  /api/health")
    print("  - GET  /api/search?q=<query>")
    print("  - POST /api/analyze (with book_id)")
    print("")
    app.run(debug=True, host='0.0.0.0', port=5001) 