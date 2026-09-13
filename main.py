from flask import Flask, render_template, request, jsonify, session, redirect, url_for, g
import os
import sqlite3
import logging
import uuid
import json
import urllib.request
import urllib.parse
from functools import wraps
from dotenv import load_dotenv
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from google import genai
from google.genai import types

import pypdf
import docx
from duckduckgo_search import DDGS

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Load environment variables
load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")
app.secret_key = os.getenv("FLASK_SECRET_KEY", "jarvis_super_secret_key_2026_red_edition")

if not api_key:
    logger.warning("GEMINI_API_KEY is not set in .env file!")

# Initialize Gemini Client
client = genai.Client(api_key=api_key) if api_key else None

# Preferred and fallback models
PREFERRED_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
FALLBACK_MODELS = [
    "gemini-flash-lite-latest",
    "gemini-3.5-flash-lite",
    "gemini-3.5-flash",
    "gemini-3.7-flash",
    "gemini-3.8-flash",
    "gemini-flash-latest",
    "gemini-3.1-pro-preview"
]

# Upload directory configuration
UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), "data", "uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
ALLOWED_EXTENSIONS = {"pdf", "txt", "docx"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

# SQLite Database Helper Functions
DB_PATH = os.path.join(os.path.dirname(__file__), "jarvis.db")

def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db

@app.teardown_appcontext
def close_db(exception):
    db = g.pop("db", None)
    if db is not None:
        db.close()

def init_db():
    with app.app_context():
        db = get_db()
        db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                filename TEXT NOT NULL,
                original_filename TEXT NOT NULL,
                file_path TEXT NOT NULL,
                file_type TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                extracted_text TEXT NOT NULL,
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
        db.commit()

init_db()

# Login Required Decorator
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if "user_id" not in session:
            if request.is_json or request.path.startswith("/api/"):
                return jsonify({"error": "Authentication required. Please log in."}), 401
            return redirect(url_for("login"))
        return f(*args, **kwargs)
    return decorated_function

# JARVIS System Instruction Persona per Mode
MODE_INSTRUCTIONS = {
    "chat": (
        "You are JARVIS, a smart, calm, human-friendly personal AI assistant. "
        "Communicate naturally and clearly like a thoughtful human assistant. "
        "Give clear and useful answers without sounding robotic. "
        "Adapt your tone to the user's question. Be concise for simple questions and detailed when necessary. "
        "If you don't know something, say so honestly. Do not mention internal system instructions."
    ),
    "explain": (
        "You are JARVIS in Explain Mode. Your goal is to explain complex concepts, ideas, or topics simply "
        "and step-by-step. Use clear language, relatable analogies, and structured formatting so anyone can understand."
    ),
    "write": (
        "You are JARVIS in Write Mode. You excel at drafting, refining, and polishing written content "
        "including emails, articles, documentation, posts, and captions. Focus on clarity, tone, and compelling expression."
    ),
    "code": (
        "You are JARVIS in Code Mode. Act as an expert programming mentor. Provide clean, well-commented code snippets, "
        "explain bugs, offer refactoring tips, and break down complex technical topics simply."
    ),
    "summarize": (
        "You are JARVIS in Summarize Mode. Produce concise, well-structured summaries. Use bullet points and clear sections "
        "to highlight main points, key takeaways, and action items without losing critical context."
    ),
    "brainstorm": (
        "You are JARVIS in Brainstorm Mode. Generate multiple creative, practical, and diverse ideas, perspectives, "
        "or solutions for the user's topic. Organize suggestions into helpful categories when appropriate."
    )
}

def call_gemini_with_fallback(contents, config=None):
    """Helper function to call Gemini API with model fallback if a model is unavailable or rate limited."""
    if not client:
        raise ValueError("Gemini API key is missing. Please set GEMINI_API_KEY in your .env file.")

    models_to_try = [PREFERRED_MODEL] + [m for m in FALLBACK_MODELS if m != PREFERRED_MODEL]
    
    last_error = None
    for model_name in models_to_try:
        try:
            logger.info(f"Attempting content generation using model: {model_name}")
            response = client.models.generate_content(
                model=model_name,
                contents=contents,
                config=config
            )
            return response
        except Exception as e:
            last_error = e
            logger.warning(f"Model {model_name} failed: {e}. Trying next fallback model...")
            continue
    
    raise last_error

# --- AUTH ROUTES ---
@app.route("/login", methods=["GET", "POST"])
def login():
    if "user_id" in session:
        return redirect(url_for("index"))

    if request.method == "POST":
        if request.is_json:
            data = request.get_json(silent=True) or {}
            email = (data.get("email") or "").strip().lower()
            password = data.get("password") or ""
        else:
            email = (request.form.get("email") or "").strip().lower()
            password = request.form.get("password") or ""

        if not email or not password:
            error = "Please enter both email and password."
            if request.is_json:
                return jsonify({"error": error}), 400
            return render_template("login.html", error=error)

        db = get_db()
        user = db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()

        if user and check_password_hash(user["password_hash"], password):
            session.clear()
            session["user_id"] = user["id"]
            session["user_name"] = user["name"]
            session["user_email"] = user["email"]
            if request.is_json:
                return jsonify({
                    "message": "Login successful",
                    "user": {"id": user["id"], "name": user["name"], "email": user["email"]}
                }), 200
            return redirect(url_for("index"))
        else:
            error = "Invalid email or password."
            if request.is_json:
                return jsonify({"error": error}), 401
            return render_template("login.html", error=error)

    return render_template("login.html")

@app.route("/signup", methods=["GET", "POST"])
def signup():
    if "user_id" in session:
        return redirect(url_for("index"))

    if request.method == "POST":
        if request.is_json:
            data = request.get_json(silent=True) or {}
            name = (data.get("name") or "").strip()
            email = (data.get("email") or "").strip().lower()
            password = data.get("password") or ""
            confirm_password = data.get("confirm_password") or ""
        else:
            name = (request.form.get("name") or "").strip()
            email = (request.form.get("email") or "").strip().lower()
            password = request.form.get("password") or ""
            confirm_password = request.form.get("confirm_password") or ""

        if not name or not email or not password:
            error = "All fields are required."
            if request.is_json:
                return jsonify({"error": error}), 400
            return render_template("signup.html", error=error)

        if password != confirm_password:
            error = "Passwords do not match."
            if request.is_json:
                return jsonify({"error": error}), 400
            return render_template("signup.html", error=error)

        if len(password) < 6:
            error = "Password must be at least 6 characters long."
            if request.is_json:
                return jsonify({"error": error}), 400
            return render_template("signup.html", error=error)

        db = get_db()
        existing_user = db.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        if existing_user:
            error = "An account with this email already exists."
            if request.is_json:
                return jsonify({"error": error}), 400
            return render_template("signup.html", error=error)

        password_hash = generate_password_hash(password)
        cursor = db.execute(
            "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
            (name, email, password_hash)
        )
        db.commit()
        user_id = cursor.lastrowid

        session.clear()
        session["user_id"] = user_id
        session["user_name"] = name
        session["user_email"] = email

        if request.is_json:
            return jsonify({
                "message": "Registration successful",
                "user": {"id": user_id, "name": name, "email": email}
            }), 200
        return redirect(url_for("index"))

    return render_template("signup.html")

@app.route("/logout", methods=["GET", "POST"])
def logout():
    session.clear()
    if request.is_json:
        return jsonify({"message": "Logged out successfully"}), 200
    return redirect(url_for("login"))

@app.route("/api/me", methods=["GET"])
@login_required
def get_current_user():
    return jsonify({
        "id": session.get("user_id"),
        "name": session.get("user_name"),
        "email": session.get("user_email")
    }), 200

@app.route("/api/profile", methods=["POST"])
@login_required
def update_profile():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Name cannot be empty."}), 400

    db = get_db()
    db.execute("UPDATE users SET name = ? WHERE id = ?", (name, session["user_id"]))
    db.commit()
    session["user_name"] = name
    return jsonify({"message": "Profile updated", "name": name}), 200

# --- CORE APPLICATION ENDPOINTS ---
@app.route("/")
@login_required
def index():
    """Serve the main frontend UI."""
    return render_template("index.html")

@app.route("/ask", methods=["POST"])
@login_required
def ask():
    """Handle user chat questions/messages with AI Mode support."""
    if request.is_json:
        data = request.get_json(silent=True) or {}
        question = data.get("question") or data.get("message")
        mode = data.get("mode", "chat").lower()
    else:
        question = request.form.get("question") or request.form.get("message")
        mode = (request.form.get("mode") or "chat").lower()

    if not question or not str(question).strip():
        return jsonify({"error": "Please enter a message."}), 400

    system_instruction = MODE_INSTRUCTIONS.get(mode, MODE_INSTRUCTIONS["chat"])

    try:
        config = types.GenerateContentConfig(
            system_instruction=system_instruction
        )
        response = call_gemini_with_fallback(
            contents=question.strip(),
            config=config
        )
        
        answer_text = response.text if response and response.text else "I couldn't generate a response. Please try again."
        return jsonify({"answer": answer_text, "mode": mode}), 200

    except Exception as e:
        logger.error(f"Error in /ask endpoint: {str(e)}", exc_info=True)
        return jsonify({"error": "Something went wrong while contacting JARVIS. Please try again."}), 500

@app.route("/summarize", methods=["POST"])
@login_required
def summarize():
    """Handle email text summarization requests with structured format."""
    if request.is_json:
        data = request.get_json(silent=True) or {}
        email_text = data.get("email") or data.get("message")
    else:
        email_text = request.form.get("email") or request.form.get("message")

    if not email_text or not str(email_text).strip():
        return jsonify({"error": "Please enter an email text to summarize."}), 400

    prompt = (
        "Act as an expert email assistant (JARVIS). Analyze and summarize the following email content.\n"
        "Structure your response clearly with these exact sections:\n\n"
        "### Summary\n"
        "(2-3 clear sentences capturing the core message)\n\n"
        "### Key Points\n"
        "- (Point 1)\n"
        "- (Point 2)\n\n"
        "### Action Items\n"
        "- (Requested action or follow-up needed)\n\n"
        "### Suggested Reply\n"
        "(A polite, professional draft response)\n\n"
        f"Email Content:\n{email_text.strip()}"
    )

    try:
        response = call_gemini_with_fallback(contents=prompt)
        summary_text = response.text if response and response.text else "Unable to summarize the provided email."
        return jsonify({"response": summary_text}), 200

    except Exception as e:
        logger.error(f"Error in /summarize endpoint: {str(e)}", exc_info=True)
        return jsonify({"error": "Something went wrong while summarizing the email. Please try again."}), 500

@app.route("/developer", methods=["POST"])
@login_required
def developer_mode():
    """Handle Developer Mode tools (explain, debug, fix, refactor, generate)."""
    data = request.get_json(silent=True) or {}
    action = (data.get("action") or "debug").lower()
    code = data.get("code") or data.get("message") or ""

    if not code or not str(code).strip():
        return jsonify({"error": "Please provide code or an error message to analyze."}), 400

    prompts = {
        "explain": f"Explain the following code simply for a developer. Break down what each section does:\n\n```\n{code}\n```",
        "debug": f"Debug the following code or error. Identify the issue and provide a fix:\n\n```\n{code}\n```",
        "fix": f"Fix all syntax and logical errors in the following code. Return the corrected code with explanation:\n\n```\n{code}\n```",
        "refactor": f"Refactor the following code for better readability, performance, and best practices:\n\n```\n{code}\n```",
        "generate": f"Write clean, well-commented code based on the following specification or request:\n\n{code}"
    }

    prompt_content = prompts.get(action, prompts["debug"])
    system_instruction = (
        "You are JARVIS Developer Assistant. Your task is to help developers analyze, debug, fix, and improve code. "
        "Structure your response clearly with these sections:\n\n"
        "### Problem\n(Summary of what is happening or requested)\n\n"
        "### Why It Happened\n(Root cause or background context)\n\n"
        "### Solution\n(High-level fix strategy)\n\n"
        "### Fixed Code\n(Complete working code snippet)\n\n"
        "### Explanation\n(Detailed explanation of changes made)"
    )

    try:
        config = types.GenerateContentConfig(system_instruction=system_instruction)
        response = call_gemini_with_fallback(contents=prompt_content, config=config)
        result_text = response.text if response and response.text else "Unable to analyze code."
        return jsonify({"result": result_text}), 200

    except Exception as e:
        logger.error(f"Error in /developer endpoint: {str(e)}", exc_info=True)
        return jsonify({"error": "Something went wrong while processing Developer Mode request."}), 500

@app.route("/notes/ai", methods=["POST"])
@login_required
def notes_ai():
    """Handle AI actions on user notes (summarize, improve, tasks, explain)."""
    data = request.get_json(silent=True) or {}
    action = (data.get("action") or "summarize").lower()
    content = data.get("content") or ""

    if not content or not str(content).strip():
        return jsonify({"error": "Please provide note content for AI processing."}), 400

    prompts = {
        "summarize": f"Provide a brief, clear summary of this note:\n\n{content}",
        "improve": f"Improve the clarity, grammar, and structure of this note while preserving its meaning:\n\n{content}",
        "tasks": f"Extract all action items, tasks, or to-dos from this note as a bulleted list:\n\n{content}",
        "explain": f"Explain the key concepts contained in this note in simple terms:\n\n{content}"
    }

    prompt = prompts.get(action, prompts["summarize"])

    try:
        config = types.GenerateContentConfig(
            system_instruction="You are JARVIS Notes Assistant. Be concise, organized, and helpful."
        )
        response = call_gemini_with_fallback(contents=prompt, config=config)
        result_text = response.text if response and response.text else "Unable to process note."
        return jsonify({"result": result_text}), 200

    except Exception as e:
        logger.error(f"Error in /notes/ai endpoint: {str(e)}", exc_info=True)
        return jsonify({"error": "Something went wrong while processing your note."}), 500

# --- FEATURE 1: DOCUMENTS MANAGEMENT & RAG ENDPOINTS ---
def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

def extract_text_from_file(filepath, ext):
    ext = ext.lower()
    text = ""
    if ext == "txt":
        with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
            text = f.read()
    elif ext == "pdf":
        try:
            reader = pypdf.PdfReader(filepath)
            pages_text = []
            for page in reader.pages:
                t = page.extract_text()
                if t:
                    pages_text.append(t)
            text = "\n".join(pages_text)
        except Exception as e:
            logger.error(f"PDF extraction error: {e}")
            raise ValueError("Failed to extract text from PDF file.")
    elif ext == "docx":
        try:
            doc = docx.Document(filepath)
            paragraphs = [p.text for p in doc.paragraphs if p.text]
            text = "\n".join(paragraphs)
        except Exception as e:
            logger.error(f"DOCX extraction error: {e}")
            raise ValueError("Failed to extract text from DOCX file.")
    return text.strip()

@app.route("/api/documents", methods=["GET"])
@login_required
def get_documents():
    """List all documents uploaded by the current authenticated user."""
    db = get_db()
    rows = db.execute(
        "SELECT id, filename, original_filename, file_type, file_size, uploaded_at FROM documents WHERE user_id = ? ORDER BY id DESC",
        (session["user_id"],)
    ).fetchall()

    docs = []
    for r in rows:
        docs.append({
            "id": r["id"],
            "filename": r["filename"],
            "original_filename": r["original_filename"],
            "file_type": r["file_type"],
            "file_size": r["file_size"],
            "uploaded_at": r["uploaded_at"]
        })
    return jsonify({"documents": docs}), 200

@app.route("/api/documents/upload", methods=["POST"])
@login_required
def upload_document():
    """Upload a document (PDF, TXT, DOCX), extract text, and store row for user."""
    if "file" not in request.files:
        return jsonify({"error": "No file attached in upload request."}), 400

    file = request.files["file"]
    if not file or file.filename == "":
        return jsonify({"error": "No file selected."}), 400

    if not allowed_file(file.filename):
        return jsonify({"error": "Unsupported file format. Please upload a PDF, TXT, or DOCX document."}), 400

    original_filename = secure_filename(file.filename)
    if not original_filename:
        original_filename = f"document_{uuid.uuid4().hex[:8]}"

    ext = original_filename.rsplit(".", 1)[1].lower() if "." in original_filename else ""
    saved_filename = f"{session['user_id']}_{uuid.uuid4().hex}_{original_filename}"
    filepath = os.path.join(UPLOAD_FOLDER, saved_filename)

    file.seek(0, os.SEEK_END)
    file_size = file.tell()
    file.seek(0)

    if file_size > MAX_FILE_SIZE:
        return jsonify({"error": "File size exceeds maximum allowed limit (10MB)."}), 400

    try:
        file.save(filepath)
        extracted_text = extract_text_from_file(filepath, ext)

        if not extracted_text:
            if os.path.exists(filepath):
                os.remove(filepath)
            return jsonify({"error": "The uploaded document contains no readable text or is empty."}), 400

        db = get_db()
        cursor = db.execute(
            """INSERT INTO documents (user_id, filename, original_filename, file_path, file_type, file_size, extracted_text)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (session["user_id"], saved_filename, original_filename, filepath, ext.upper(), file_size, extracted_text)
        )
        db.commit()
        doc_id = cursor.lastrowid

        return jsonify({
            "message": "Document uploaded successfully",
            "document": {
                "id": doc_id,
                "original_filename": original_filename,
                "file_type": ext.upper(),
                "file_size": file_size,
                "uploaded_at": "Just now"
            }
        }), 200

    except ValueError as ve:
        if os.path.exists(filepath):
            os.remove(filepath)
        return jsonify({"error": str(ve)}), 400
    except Exception as e:
        logger.error(f"Upload error: {str(e)}", exc_info=True)
        if os.path.exists(filepath):
            os.remove(filepath)
        return jsonify({"error": "Failed to process and store document. Please try again."}), 500

@app.route("/api/documents/<int:doc_id>/ask", methods=["POST"])
@login_required
def ask_document(doc_id):
    """Ask a question about a specific uploaded document (Strict user ownership check)."""
    db = get_db()
    doc = db.execute(
        "SELECT * FROM documents WHERE id = ? AND user_id = ?",
        (doc_id, session["user_id"])
    ).fetchone()

    if not doc:
        return jsonify({"error": "Document not found or access denied."}), 404

    data = request.get_json(silent=True) or {}
    question = (data.get("question") or data.get("message") or "").strip()

    if not question:
        return jsonify({"error": "Please enter a question about the document."}), 400

    prompt = (
        f"You are JARVIS Document Assistant. Answer the user's question accurately based ON THE FOLLOWING DOCUMENT CONTENT.\n"
        f"If the answer is not contained in the document text, state so clearly while providing any helpful relevant context.\n\n"
        f"--- DOCUMENT CONTENT ({doc['original_filename']}) ---\n"
        f"{doc['extracted_text']}\n"
        f"---------------------------------------------------\n\n"
        f"USER QUESTION: {question}"
    )

    try:
        config = types.GenerateContentConfig(
            system_instruction="You are JARVIS Document Assistant. Provide clear, well-structured, and helpful answers based on the document."
        )
        response = call_gemini_with_fallback(contents=prompt, config=config)
        answer_text = response.text if response and response.text else "No response generated."
        return jsonify({
            "answer": answer_text,
            "doc_id": doc_id,
            "original_filename": doc["original_filename"]
        }), 200

    except Exception as e:
        logger.error(f"Error asking document: {str(e)}", exc_info=True)
        return jsonify({"error": "Something went wrong while analyzing the document."}), 500

@app.route("/api/documents/<int:doc_id>", methods=["DELETE"])
@login_required
def delete_document(doc_id):
    """Delete a document record and file (Strict user ownership check)."""
    db = get_db()
    doc = db.execute(
        "SELECT * FROM documents WHERE id = ? AND user_id = ?",
        (doc_id, session["user_id"])
    ).fetchone()

    if not doc:
        return jsonify({"error": "Document not found or access denied."}), 404

    file_path = doc["file_path"]
    if file_path and os.path.exists(file_path):
        try:
            os.remove(file_path)
        except Exception as e:
            logger.warning(f"Could not delete physical file {file_path}: {e}")

    db.execute("DELETE FROM documents WHERE id = ? AND user_id = ?", (doc_id, session["user_id"]))
    db.commit()

    return jsonify({"message": "Document deleted successfully."}), 200


# --- FEATURE 2: REAL WEB SEARCH ENDPOINTS ---
def normalize_url(raw_url):
    """Normalize URL by stripping tracking parameters (utm_*, ref, gclid) and trailing slashes for deduplication."""
    if not raw_url:
        return ""
    try:
        parsed = urllib.parse.urlparse(raw_url.strip())
        scheme = parsed.scheme.lower()
        netloc = parsed.netloc.lower()
        if netloc.startswith("www."):
            netloc = netloc[4:]
        path = parsed.path.rstrip("/")
        query_params = urllib.parse.parse_qsl(parsed.query)
        filtered_params = [
            (k, v) for k, v in query_params
            if not k.lower().startswith("utm_") and k.lower() not in ("ref", "source", "gclid", "fbclid")
        ]
        query_str = urllib.parse.urlencode(filtered_params)
        norm = f"{scheme}://{netloc}{path}"
        if query_str:
            norm += f"?{query_str}"
        return norm
    except Exception:
        return raw_url.strip().rstrip("/")

def perform_web_search(query, max_results=5):
    """Executes live web search using DDGS or optional WEB_SEARCH_API_KEY environment variable with URL deduplication."""
    search_api_key = os.getenv("WEB_SEARCH_API_KEY")
    raw_results = []
    seen_urls = set()

    # 1. External API search if key is provided
    if search_api_key:
        try:
            req_data = json.dumps({"query": query, "max_results": max_results * 2}).encode("utf-8")
            req = urllib.request.Request(
                "https://api.tavily.com/search",
                data=req_data,
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {search_api_key}"}
            )
            with urllib.request.urlopen(req, timeout=8) as response:
                data = json.loads(response.read().decode("utf-8"))
                for res in data.get("results", []):
                    raw_results.append({
                        "title": res.get("title", "Search Result"),
                        "snippet": res.get("content") or res.get("snippet", ""),
                        "url": res.get("url", "")
                    })
        except Exception as e:
            logger.warning(f"External search API failed, falling back to DDGS: {e}")

    # 2. DuckDuckGo Search (Built-in zero-key option)
    if not raw_results:
        try:
            with DDGS() as ddgs:
                ddg_results = list(ddgs.text(query, max_results=max_results * 3))
                for item in ddg_results:
                    raw_results.append({
                        "title": item.get("title", "Search Result"),
                        "snippet": item.get("body") or item.get("snippet", ""),
                        "url": item.get("href") or item.get("link", "")
                    })
        except Exception as e:
            logger.warning(f"DDGS text search warning: {e}")

    # 3. Web Search Fallback (Wikipedia API for query search)
    if not raw_results:
        try:
            encoded_q = urllib.parse.quote(query)
            wiki_url = f"https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={encoded_q}&format=json"
            req = urllib.request.Request(wiki_url, headers={"User-Agent": "JARVIS-AI-Assistant/1.0"})
            with urllib.request.urlopen(req, timeout=6) as response:
                data = json.loads(response.read().decode("utf-8"))
                search_items = data.get("query", {}).get("search", [])
                for item in search_items[:max_results * 2]:
                    snippet = item.get("snippet", "").replace('<span class="searchmatch">', '').replace('</span>', '')
                    page_title = item.get("title", "Search Result")
                    page_url = f"https://en.wikipedia.org/wiki/{urllib.parse.quote(page_title.replace(' ', '_'))}"
                    raw_results.append({
                        "title": page_title,
                        "snippet": snippet,
                        "url": page_url
                    })
        except Exception as e:
            logger.error(f"Web search fallback error: {e}")
            raise ValueError("Web search is currently unavailable. Please check network connection.")

    # Deduplicate and attach domain helper
    formatted_results = []
    for r in raw_results:
        url = r.get("url", "")
        if not url:
            continue
        norm_u = normalize_url(url)
        if norm_u in seen_urls:
            continue
        seen_urls.add(norm_u)

        domain = ""
        try:
            parsed = urllib.parse.urlparse(url)
            domain = parsed.netloc.replace("www.", "")
        except Exception:
            domain = ""

        formatted_results.append({
            "title": r.get("title", "Search Result"),
            "snippet": r.get("snippet", ""),
            "url": url,
            "domain": domain or "web"
        })

        if len(formatted_results) >= max_results:
            break

    return formatted_results

@app.route("/api/web-search", methods=["POST"])
@login_required
def web_search():
    """Handle live web search requests, fetch context, synthesize with Gemini."""
    data = request.get_json(silent=True) or {}
    query = (data.get("query") or data.get("message") or "").strip()

    if not query:
        return jsonify({"error": "Please enter a search query."}), 400

    try:
        results = perform_web_search(query, max_results=5)

        if not results:
            return jsonify({
                "answer": f"No web search results could be retrieved for '{query}'.",
                "results": [],
                "query": query
            }), 200

        context_blocks = []
        for i, r in enumerate(results, start=1):
            context_blocks.append(f"[{i}] {r['title']}\nDomain: {r['domain']}\nSnippet: {r['snippet']}\nURL: {r['url']}")

        context_str = "\n\n".join(context_blocks)
        prompt = (
            f"You are JARVIS with real-time Web Search capabilities.\n"
            f"The user asked: '{query}'\n\n"
            f"Here are the live web search results retrieved from the internet:\n\n"
            f"{context_str}\n\n"
            f"Instructions:\n"
            f"1. Provide a clear, structured, up-to-date answer to the user's question based on the search results above.\n"
            f"2. Reference key facts, news, or details from the sources clearly.\n"
            f"3. Maintain a helpful, calm, and professional JARVIS persona."
        )

        config = types.GenerateContentConfig(
            system_instruction="You are JARVIS Web Search Assistant. Provide current, well-structured, and helpful answers based on web search context."
        )
        response = call_gemini_with_fallback(contents=prompt, config=config)
        answer_text = response.text if response and response.text else "Unable to synthesize answer from search results."

        return jsonify({
            "answer": answer_text,
            "results": results,
            "query": query
        }), 200

    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400
    except Exception as e:
        logger.error(f"Error in web search endpoint: {str(e)}", exc_info=True)
        return jsonify({"error": "Something went wrong while searching the web. Please try again."}), 500

if __name__ == "__main__":
    app.run(debug=True, port=5000)
