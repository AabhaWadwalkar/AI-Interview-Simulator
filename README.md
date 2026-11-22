# AI Interview Simulator

A private, locally runnable interview-practice app. React + TypeScript provides the interview room; FastAPI stores accounts and interview transcripts in SQLite and asks a locally installed Ollama model to conduct the interview and prepare feedback. The app does not call a paid AI or speech API.

## What works

- Local email/password accounts, with password hashes and signed local sessions.
- Setup for role, experience, general/company interview, interviewer voice, PDF/DOCX resume, or pasted preparation material.
- Adaptive, one-question-at-a-time interviews. The interviewer receives the candidate context and full conversation, varies question depth, and can probe the candidate's actual response.
- Ollama-generated end-of-interview feedback: strengths, weak answers, concepts to revise, communication, example improvements, and next topics. No score or percentage.
- SQLite persistence, PDF text extraction (PyMuPDF), and DOCX text/table extraction (python-docx). Uploaded files are processed in memory and aren't copied into the project.
- Typed answers, animated interviewer illustration, spoken questions, and an option to end the interview.
- Local Whisper transcription on CPU, typed answers, and browser speech output. Piper text-to-speech is also supported as an optional local voice engine.

## Requirements

- Windows 10/11, macOS, or Linux
- Python 3.10+ (tested with Python 3.11)
- Node.js 20+ and npm
- [Ollama](https://ollama.com/download) installed locally
- Enough memory for the chosen Ollama model. `qwen2.5:7b` is the default and typically needs several GB of available RAM; choose another locally installed Ollama model by setting `OLLAMA_MODEL`.

The browser app and API are local. Ollama must be running on the same machine. No API key, account with an AI vendor, subscription, or cloud model is used. Network access is needed initially to install dependencies and download your model.

## Setup and run (Windows PowerShell)

Open two PowerShell terminals in this project folder.

### 1. Download and start a local model

Install Ollama from the link above. Then:

```powershell
ollama pull qwen2.5:7b
ollama serve
```

If Ollama is already running as a background service, the `ollama serve` command may report that its port is in use; that's fine. Confirm the model is available with `ollama list`.

### 2. Start the backend

In the first terminal:

```powershell
cd backend
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn main:app --reload
```

If PowerShell blocks activation, either allow it for the current terminal with `Set-ExecutionPolicy -Scope Process Bypass`, or use the venv interpreter directly:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn main:app --reload
```

The API listens on `http://127.0.0.1:8000`; its local status endpoint is `http://127.0.0.1:8000/api/health`.

### 3. Start the web app

In the second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`). Create an account and start practicing. Your account, interview context, messages, and feedback are stored in `backend/data/interviews.sqlite3`, which is ignored by Git.

### Configuration

Copy `backend/.env.example` to `backend/.env` to configure the local model:

```dotenv
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:7b
APP_SECRET_KEY=replace-this-with-a-long-random-local-secret
```

Set `OLLAMA_MODEL` to a name shown by `ollama list` if you use a different model. Restart the backend after changing `.env`. Keep `.env` private; it is ignored by Git. The default signing key is intended only for local development.

## Optional speech features

**Speech input:** The app records audio in your browser and posts it only to the local backend. `faster-whisper` is installed with the backend requirements and runs on CPU. Its default Whisper `small` model is downloaded on first transcription and then used locally; the first run can take time and needs free disk space. Choose a different model with `WHISPER_MODEL` in `.env`. Microphone access requires localhost or HTTPS and user permission. Recordings are held temporarily for transcription and are not saved as interview attachments. If Whisper can't run, typing remains available.

**Speech output:** If Piper is installed and a compatible voice model is downloaded, configure its executable and model paths in `backend/.env`:

```dotenv
PIPER_EXECUTABLE=C:\path\to\piper.exe
PIPER_MODEL=C:\path\to\voice.onnx
```

Restart the backend. Without Piper configured, the browser's built-in speech synthesis is used when available; voice selection depends on voices installed in the operating system/browser. Text subtitles are always shown. Piper voice/model distribution and installation vary by platform; download only a voice compatible with your local Piper installation.

## Privacy and data

- Ollama prompts, transcripts, resume text, and feedback are sent only to the Ollama server URL you configure (default: `localhost`).
- No resumes or audio recordings are uploaded to an external service. Extracted resume text is saved with the interview in the local SQLite database so the interviewer can use it during the session.
- To clear locally saved accounts and interviews, stop the backend and delete only `backend/data/interviews.sqlite3`. This permanently deletes that local data.
- Do not commit `backend/.env`, `backend/data/`, resume files, recordings, or any other personal data. `.gitignore` excludes common sensitive/local files.

## Tests and production build

Backend tests (from the project root, after installing backend requirements):

```powershell
cd backend
python -m pytest
```

Frontend type-check and production build:

```powershell
cd frontend
npm run build
```

## Troubleshooting

- **Ollama not running / connection error:** Start the Ollama app or `ollama serve`; then check `http://127.0.0.1:8000/api/health`.
- **Model missing:** Run `ollama pull qwen2.5:7b`, or set `OLLAMA_MODEL` to an installed model name and restart FastAPI.
- **Slow first answer:** Local model loading and first-run initialization take time. Ensure sufficient RAM; a smaller Ollama model can be configured.
- **Model response error:** Update Ollama, check its terminal/service output, confirm the model is installed, and retry. The app reports failures rather than substituting mock AI answers.
- **Resume rejected:** Upload a text-readable `.pdf` or `.docx` smaller than 8 MB. Scanned/image-only PDFs need OCR before upload.
- **Microphone unavailable:** Grant browser microphone permission on localhost; install optional `faster-whisper` for local transcription or type your answer.
- **No interviewer audio:** Subtitles remain available. Install/configure Piper or enable a speech voice in the browser/operating system.
- **Backend dependency installation fails:** Use Python 3.10+, upgrade pip (`python -m pip install --upgrade pip`), and retry in the backend virtual environment.
- **Port already used:** Run Uvicorn on another port and update the `/api` proxy in `frontend/vite.config.ts` to match.

## Uploading this project to GitHub

1. Review `git status --ignored` and confirm no resume, recording, `.env`, `backend/data/`, or virtual environment is being added. Never use real candidate data in the repository.
2. Create an empty repository on GitHub, then from this project directory:

   ```powershell
   git init
   git add .gitignore README.md backend frontend
   git status --short
   git commit -m "Build local AI interview simulator"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
   git push -u origin main
   ```

3. Use your own repository URL. Do not commit `.env`, local SQLite data, uploaded documents, audio, or credentials.
