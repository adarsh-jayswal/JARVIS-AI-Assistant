# 🤖 JARVIS — Your Personal AI Assistant

> A smart, modern, and powerful personal AI assistant powered by Google Gemini.

JARVIS is a personal AI assistant built with **Flask** and **Google Gemini**. It provides a modern conversational interface with multiple AI modes and productivity tools designed to help with everyday questions, coding, writing, brainstorming, email summarization, and more.

---

## ✨ Features

### 💬 AI Chat

Have natural conversations with JARVIS using Google Gemini.

### 🧠 Multiple AI Modes

Choose the mode that best fits your task:

- 💬 **Chat** — General conversations and questions
- 💡 **Explain** — Understand complex topics simply
- ✍️ **Write** — Generate and improve written content
- 💻 **Code** — Coding assistance and programming help
- 📊 **Summarize** — Summarize long content
- 🚀 **Brainstorm** — Generate creative ideas

### ➕ Multiple Conversations

- Create new conversations
- Automatically save chats
- Switch between previous conversations
- Search conversations
- Rename conversations
- Delete conversations
- Clear the current conversation

### 📧 Email Summarizer

Paste an email and JARVIS generates a structured breakdown including:

- Summary
- Key Points
- Action Items
- Important Dates
- Suggested Reply

### 👨‍💻 Developer Mode

A dedicated coding assistant for:

- Debugging errors
- Explaining code
- Fixing code
- Refactoring
- Generating code

### 📝 Notes & Task Assistant

Create and manage notes with AI-powered tools such as:

- Summarize
- Improve Writing
- Extract Tasks
- Explain

### 🔐 Authentication

Secure user authentication using:

- Flask Sessions
- SQLite
- Werkzeug password hashing
- Login & Signup
- Logout
- User profile

### 👤 User Profile

Customize your JARVIS profile with:

- Profile name
- Profile avatar
- Account information

### 🎙️ Voice Input

Use your microphone to interact with JARVIS using voice input.

### 🎨 Premium UI

Modern dark interface featuring:

- Red & Black JARVIS theme
- Responsive design
- Subtle red glow effects
- Modern AI dashboard
- Mobile-friendly layout

### 🌓 Theme Support

Choose between available theme modes from Settings.

---

## 📸 Screenshots

### 🔐 Authentication

#### Login

![JARVIS Login](screenshots/login.png)

#### Create Account

![JARVIS Signup](screenshots/signup.png)

---

### 🤖 JARVIS Chat

![JARVIS Chat](screenshots/chat.png)

---

### ⚙️ Settings

![JARVIS Settings](screenshots/settings.png)

---

### 📧 Email Summarizer

![Email Summarizer](screenshots/email-summarizer.png)

---

### 👨‍💻 Developer Mode

![Developer Mode](screenshots/developer-mode.png)

---

### 📝 Notes & Task Assistant

![JARVIS Notes](screenshots/notes.png)

---

## 🛠️ Tech Stack

### Backend

- Python
- Flask
- Google Gemini API
- SQLite
- Werkzeug

### Frontend

- HTML5
- CSS3
- JavaScript
- Web Speech API
- LocalStorage

### AI

- Google Gemini

---

## 📂 Project Structure

```text
JARVIS-AI-Assistant/
│
├── static/
│   ├── css/
│   ├── js/
│   └── images/
│       └── jarvis_logo.jpg
│
├── templates/
│   ├── index.html
│   ├── login.html
│   └── signup.html
│
├── screenshots/
│   ├── login.png
│   ├── signup.png
│   ├── chat.png
│   ├── settings.png
│   ├── email-summarizer.png
│   ├── developer-mode.png
│   └── notes.png
│
├── main.py
├── requirements.txt
├── .env.example
├── .gitignore
└── README.md