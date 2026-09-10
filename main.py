from flask import Flask, render_template, request, jsonify, session, redirect, url_for, g
import os
import sqlite3
import logging
from functools import wraps
from dotenv import load_dotenv
from werkzeug.security import generate_password_hash, check_password_hash
from google import genai
from google.genai import types

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
FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-3.5-flash", "gemini-1.5-flash"]

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
    """Helper function to call Gemini API with model fallback if a model is unavailable."""
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
            error_str = str(e)
            logger.warning(f"Model {model_name} failed: {error_str}")
            if "404" in error_str or "NOT_FOUND" in error_str or "not available" in error_str:
                continue
            else:
                raise e
    
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

if __name__ == "__main__":
    app.run(debug=True, port=5000)
