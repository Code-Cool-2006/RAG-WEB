# 🧠 Notebook RAG Web UI

A premium, interactive web interface for your personal document Retrieval-Augmented Generation (RAG) system. Powered by **FastAPI** on the backend and a sleek, modern **glassmorphic chat workspace** on the frontend.

---

## ✨ Features

- **Grounded Chat Engine:** Ask questions and get answers derived strictly from your notes via `gemini-3.5-flash` with custom prompt protection against hallucinations.
- **Drag & Drop Upload:** Upload your PDF, Markdown (`.md`), and text (`.txt`) documents directly from the browser window.
- **Relevance & Source Citation:** Expand the "View Sources" dropdown under any answer to see which files were retrieved, the exact text snippet, and the relevance score.
- **Instant Re-indexing:** Hit the "Ingest & Re-index" button in the sidebar to sync the database whenever you add or modify files.
- **Modern UI:** Glassmorphism accents, smooth micro-animations, glowing focus states, and a beautiful layout.

---

## 🚀 Setup & Running

### 1. Initialize Virtual Environment
Navigate to the directory, activate the environment, and install dependencies:
```bash
cd rag-web

# Virtual environment is already created
source venv/bin/activate

# Install requirements
pip install -r requirements.txt
```

### 2. Export API Key
Make sure your Gemini API key is configured. You can either:
- Export it in your shell: `export GEMINI_API_KEY="your_api_key"`
- Or verify that the `.env` file exists in the `rag-web/` root containing:
  ```env
  GEMINI_API_KEY="your_api_key"
  ```

### 3. Run the Server
Launch the FastAPI uvicorn server:
```bash
python main.py
```

### 4. Open in Browser
Once running, navigate to the local address in your web browser:
👉 **[http://127.0.0.1:8000](http://127.0.0.1:8000)**

---

## 🛠️ API Reference

- `POST /api/query`: Submits a prompt and returns the grounded answer + source document nodes.
- `POST /api/ingest`: Triggers the document loader and ChromaDB vector-store updates.
- `GET /api/documents`: Returns a list of all files loaded in the local `data/` directory.
- `POST /api/upload`: Asynchronously saves uploaded files from the drag-and-drop panel.
