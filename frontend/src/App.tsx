import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  LockKeyhole,
  LogOut,
  Mic,
  MicOff,
  RotateCcw,
  Send,
  Volume2,
  X,
} from "lucide-react";
import { api, ApiError, type Feedback } from "./api";

type Screen = "auth" | "setup" | "interview" | "feedback";
type Voice = "female" | "male";

const experienceLevels = ["Fresher", "0–1 years", "1–2 years", "2–3 years", "3+ years"];

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem("interview-token") ?? "");
  const [email, setEmail] = useState(() => localStorage.getItem("interview-email") ?? "");
  const [screen, setScreen] = useState<Screen>(() =>
    localStorage.getItem("interview-token") ? "setup" : "auth",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [signupMode, setSignupMode] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [password, setPassword] = useState("");

  const [role, setRole] = useState("");
  const [experience, setExperience] = useState("Fresher");
  const [interviewType, setInterviewType] = useState("General Interview");
  const [company, setCompany] = useState("");
  const [voice, setVoice] = useState<Voice>("female");
  const [material, setMaterial] = useState("");
  const [resume, setResume] = useState<File | null>(null);
  const [ollamaStatus, setOllamaStatus] = useState<{
    ollama: boolean;
    model: string;
    model_available: boolean;
    models: string[];
  } | null>(null);

  const [interviewId, setInterviewId] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [answerCount, setAnswerCount] = useState(0);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [retryingQuestion, setRetryingQuestion] = useState(false);
  const [avatarSpeaking, setAvatarSpeaking] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const playback = useRef<HTMLAudioElement | null>(null);

  const clearError = () => setError("");

  useEffect(() => {
    if (!token) return;
    api.health().then(setOllamaStatus).catch(() => setOllamaStatus(null));
  }, [token]);

  function signOut() {
    window.speechSynthesis?.cancel();
    playback.current?.pause();
    localStorage.removeItem("interview-token");
    localStorage.removeItem("interview-email");
    setToken("");
    setEmail("");
    setScreen("auth");
    setError("");
  }

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearError();
    setBusy(true);
    try {
      const account = signupMode
        ? await api.signup(authEmail, password)
        : await api.login(authEmail, password);
      setToken(account.token);
      setEmail(account.user.email);
      localStorage.setItem("interview-token", account.token);
      localStorage.setItem("interview-email", account.user.email);
      setScreen("setup");
      setPassword("");
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  }

  function speakInBrowser(text: string) {
    if (!("speechSynthesis" in window)) {
      setError("Audio playback isn't supported in this browser. You can read the question on screen.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const voiceMatch = voices.find((item) =>
      voice === "female" ? /female|samantha|zira|karen/i.test(item.name) : /male|david|daniel/i.test(item.name),
    );
    if (voiceMatch) utterance.voice = voiceMatch;
    utterance.rate = 0.94;
    utterance.onstart = () => setAvatarSpeaking(true);
    utterance.onend = () => setAvatarSpeaking(false);
    utterance.onerror = () => setAvatarSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }

  async function speakQuestion(text: string) {
    if (!token || !text) return;
    window.speechSynthesis?.cancel();
    playback.current?.pause();
    setAvatarSpeaking(false);
    try {
      const url = await api.speak(token, text);
      if (playback.current) URL.revokeObjectURL(playback.current.src);
      const audio = new Audio(url);
      playback.current = audio;
      audio.onplay = () => setAvatarSpeaking(true);
      audio.onended = () => {
        setAvatarSpeaking(false);
        URL.revokeObjectURL(url);
      };
      audio.onpause = () => setAvatarSpeaking(false);
      audio.onerror = () => setAvatarSpeaking(false);
      await audio.play();
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 501) {
        speakInBrowser(text);
      } else {
        setError(`The question is ready, but audio playback failed: ${errorText(caught)}`);
      }
    }
  }

  async function startInterview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    clearError();
    setBusy(true);
    try {
      const form = new FormData();
      form.append("role", role.trim());
      form.append("experience", experience);
      form.append("interview_type", interviewType);
      form.append("company", company.trim());
      form.append("interviewer", voice);
      form.append("material", material);
      if (resume) form.append("resume", resume);
      const session = await api.start(token, form);
      setInterviewId(session.id);
      setQuestion(session.question);
      setAnswer("");
      setAnswerCount(0);
      setRetryingQuestion(false);
      setScreen("interview");
      void speakQuestion(session.question);
    } catch (caught) {
      setError(errorText(caught));
      if (caught instanceof ApiError && caught.status === 401) signOut();
    } finally {
      setBusy(false);
    }
  }

  async function submitAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = answer.trim();
    if (!trimmed || busy || retryingQuestion) return;
    clearError();
    setBusy(true);
    try {
      const result = await api.answer(token, interviewId, trimmed);
      setAnswer("");
      setAnswerCount((count) => count + 1);
      setQuestion(result.question);
      void speakQuestion(result.question);
    } catch (caught) {
      setRetryingQuestion(true);
      setError(`${errorText(caught)} Your answer is saved if the interviewer received it.`);
    } finally {
      setBusy(false);
    }
  }

  async function retryQuestion() {
    setBusy(true);
    clearError();
    try {
      const result = await api.retryQuestion(token, interviewId);
      setQuestion(result.question);
      setAnswer("");
      setRetryingQuestion(false);
      if (answer.trim()) setAnswerCount((count) => count + 1);
      void speakQuestion(result.question);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  }

  async function endInterview() {
    if (!token || !interviewId || answerCount < 1) return;
    clearError();
    setBusy(true);
    try {
      const result = await api.end(token, interviewId);
      setFeedback(result.feedback);
      window.speechSynthesis?.cancel();
      playback.current?.pause();
      setScreen("feedback");
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  }

  async function toggleRecording() {
    if (recording) {
      recorder.current?.stop();
      setRecording(false);
      setTranscribing(true);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError("Microphone recording isn't supported here. Type your answer instead.");
      return;
    }
    clearError();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      recorder.current = mediaRecorder;
      audioChunks.current = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size) audioChunks.current.push(event.data);
      };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(audioChunks.current, { type: mediaRecorder.mimeType || "audio/webm" });
        try {
          const result = await api.transcribe(token, blob);
          setAnswer((current) => `${current}${current ? " " : ""}${result.text}`);
        } catch (caught) {
          setError(errorText(caught));
        } finally {
          setTranscribing(false);
        }
      };
      mediaRecorder.start();
      setRecording(true);
    } catch {
      setError("Microphone access was denied or unavailable. You can type your answer instead.");
    }
  }

  function resetInterview() {
    setScreen("setup");
    setInterviewId("");
    setQuestion("");
    setAnswer("");
    setAnswerCount(0);
    setFeedback(null);
    setRetryingQuestion(false);
    setError("");
  }

  const feedbackSections: Array<[keyof Feedback, string]> = [
    ["strengths", "What went well"],
    ["weak_answers", "Answers to strengthen"],
    ["concepts_to_revise", "Concepts to revisit"],
    ["communication_improvements", "Communication"],
    ["improved_examples", "Ways to improve your answers"],
    ["next_topics", "Good next topics"],
  ];

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="wordmark" onClick={() => screen !== "interview" && setScreen(token ? "setup" : "auth")}>
          <span className="brand-mark">i.</span>
          <span>practice room</span>
        </button>
        <div className="topbar-right">
          {screen === "setup" && ollamaStatus && (
            <span className={`service-status ${ollamaStatus.model_available ? "online" : "offline"}`}>
              <span className="status-dot" />
              {ollamaStatus.model_available ? `${ollamaStatus.model} ready` : ollamaStatus.ollama ? `${ollamaStatus.model} not installed` : "Ollama not running"}
            </span>
          )}
          {token && <span className="account-email">{email}</span>}
          {token && screen !== "interview" && (
            <button className="icon-button" title="Sign out" aria-label="Sign out" onClick={signOut}>
              <LogOut size={17} />
            </button>
          )}
        </div>
      </header>

      <div className="page-content">
        {screen === "auth" && (
          <section className="auth-layout">
            <div className="auth-copy">
              <p className="eyebrow">A little practice goes a long way</p>
              <h1>Walk into your next interview <em>ready.</em></h1>
              <p className="lede">
                Thoughtful, realistic interview practice powered by a model running on your own computer.
              </p>
              <div className="privacy-note"><LockKeyhole size={15} /> Your practice stays on this device.</div>
            </div>
            <form className="auth-form" onSubmit={handleAuth}>
              <div>
                <p className="eyebrow">{signupMode ? "Start here" : "Welcome back"}</p>
                <h2>{signupMode ? "Create your account" : "Sign in to practice"}</h2>
                <p className="subtle">Your interview history is saved locally, just for you.</p>
              </div>
              <label className="field-label" htmlFor="auth-email">Email address</label>
              <input id="auth-email" autoComplete="email" type="email" required value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="you@example.com" />
              <label className="field-label" htmlFor="auth-password">Password</label>
              <input id="auth-password" autoComplete={signupMode ? "new-password" : "current-password"} type="password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" />
              {error && <ErrorBanner message={error} />}
              <button className="primary-button full-width" type="submit" disabled={busy}>
                {busy ? "One moment…" : signupMode ? "Create account" : "Sign in"} <ArrowRight size={17} />
              </button>
              <p className="switch-auth">
                {signupMode ? "Already have an account?" : "New to the practice room?"}{" "}
                <button type="button" onClick={() => { setSignupMode(!signupMode); clearError(); }}>
                  {signupMode ? "Sign in" : "Create an account"}
                </button>
              </p>
            </form>
          </section>
        )}

        {screen === "setup" && (
          <section className="setup-layout">
            <div className="section-heading">
              <p className="eyebrow">Before we begin</p>
              <h1>Make it your interview.</h1>
              <p className="lede">A few details help your interviewer ask the right questions.</p>
            </div>
            <form className="setup-form" onSubmit={startInterview}>
              <div className="field-group">
                <label className="field-label" htmlFor="role">What role are you preparing for?</label>
                <input id="role" required maxLength={120} value={role} onChange={(event) => setRole(event.target.value)} placeholder="e.g. Frontend Developer" />
              </div>

              <div className="field-group">
                <label className="field-label">Experience level</label>
                <div className="choice-row experience-choices">
                  {experienceLevels.map((level) => (
                    <button className={`choice-chip ${experience === level ? "selected" : ""}`} type="button" key={level} onClick={() => setExperience(level)}>{level}</button>
                  ))}
                </div>
              </div>

              <div className="field-group">
                <label className="field-label">Interview style</label>
                <div className="choice-row">
                  {["General Interview", "Specific Company"].map((item) => (
                    <button className={`choice-chip ${interviewType === item ? "selected" : ""}`} type="button" key={item} onClick={() => setInterviewType(item)}>{item}</button>
                  ))}
                </div>
                {interviewType === "Specific Company" && (
                  <input className="company-input" required maxLength={120} value={company} onChange={(event) => setCompany(event.target.value)} placeholder="Company name" aria-label="Company name" />
                )}
              </div>

              <div className="field-group">
                <label className="field-label">Choose your interviewer</label>
                <div className="choice-row">
                  {(["female", "male"] as const).map((item) => (
                    <button className={`voice-choice ${voice === item ? "selected" : ""}`} type="button" key={item} onClick={() => setVoice(item)}>
                      <span className={`voice-swatch ${item}`} />
                      {item === "female" ? "Female voice" : "Male voice"}
                      {voice === item && <Check size={15} />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="material">Add a resume or preparation material <span className="optional">optional</span></label>
                <label className={`upload-field ${resume ? "has-file" : ""}`} htmlFor="resume">
                  <FileText size={18} />
                  <span>{resume ? resume.name : "Choose a PDF or DOCX resume"}</span>
                  {resume && <button className="remove-file" type="button" aria-label="Remove resume" onClick={(event) => { event.preventDefault(); setResume(null); }}><X size={15} /></button>}
                  {!resume && <span className="upload-action">Browse</span>}
                </label>
                <input id="resume" className="visually-hidden" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => setResume(event.target.files?.[0] ?? null)} />
                <textarea id="material" value={material} maxLength={30000} onChange={(event) => setMaterial(event.target.value)} placeholder="Or paste a topic, concept, project description, or anything you'd like to prepare…" rows={3} />
                <span className="privacy-caption">Your resume and notes stay in your local database and are never uploaded to a cloud AI service.</span>
              </div>

              {error && <ErrorBanner message={error} />}
              {ollamaStatus && !ollamaStatus.model_available && (
                <div className="inline-notice">
                  {ollamaStatus.ollama ? <>Download <code>{ollamaStatus.model}</code> with <code>ollama pull {ollamaStatus.model}</code> before beginning.</> : <>Start Ollama and download <code>{ollamaStatus.model}</code> before beginning.</>}
                  {" "}The interview uses your local model.
                </div>
              )}
              <button className="primary-button start-button" type="submit" disabled={busy}>
                {busy ? <><span className="spinner" /> Preparing your interview…</> : <>Start interview <ArrowRight size={17} /></>}
              </button>
            </form>
          </section>
        )}

        {screen === "interview" && (
          <section className="interview-layout">
            <div className="interview-topline">
              <button className="back-button" onClick={() => { window.speechSynthesis?.cancel(); playback.current?.pause(); setScreen("setup"); setError(""); }}>
                <ArrowLeft size={16} /> Setup
              </button>
              <span className="live-indicator"><span className="status-dot" /> Interview in progress</span>
              <button className="text-button end-button" onClick={endInterview} disabled={busy || answerCount < 1}>End interview</button>
            </div>
            <div className="interviewer-scene">
              <div className={`interviewer-avatar ${voice} ${busy ? "thinking" : ""} ${avatarSpeaking ? "speaking" : ""}`}>
                <div className="avatar-hair" />
                <div className="avatar-face">
                  <div className="avatar-eyes"><i /><i /></div>
                  <div className="avatar-nose" />
                  <div className="avatar-mouth" />
                </div>
                <div className="avatar-shoulders" />
                <div className="avatar-halo" />
              </div>
              <p className="interviewer-name">{voice === "female" ? "Your interviewer" : "Your interviewer"}</p>
              <span className="interviewer-caption">{busy ? "Listening and thinking" : "Ready when you are"}</span>
            </div>
            <div className="question-block">
              <span className="question-label">YOUR INTERVIEWER ASKS</span>
              <h1 key={question} className="question-text">{question}</h1>
              <button className="play-question" onClick={() => speakQuestion(question)} disabled={busy} aria-label="Play question aloud">
                <Volume2 size={16} /> Hear question again
              </button>
            </div>
            {error && <ErrorBanner message={error} />}
            {retryingQuestion ? (
              <button className="primary-button response-button" onClick={retryQuestion} disabled={busy}>
                {busy ? <><span className="spinner" /> Reconnecting…</> : <><RotateCcw size={17} /> Retry interviewer response</>}
              </button>
            ) : (
              <form className="answer-form" onSubmit={submitAnswer}>
                <label className="field-label" htmlFor="answer">Your answer</label>
                <textarea id="answer" rows={4} maxLength={12000} value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Take a breath, then answer as you would in the room…" disabled={busy || transcribing} />
                <div className="answer-actions">
                  <button className={`record-button ${recording ? "recording" : ""}`} type="button" onClick={toggleRecording} disabled={busy || transcribing}>
                    {recording ? <MicOff size={17} /> : <Mic size={17} />}
                    {recording ? "Stop recording" : transcribing ? "Transcribing locally…" : "Answer with mic"}
                  </button>
                  <button className="primary-button" type="submit" disabled={busy || transcribing || !answer.trim()}>
                    {busy ? <><span className="spinner" /> Thinking…</> : <>Continue <Send size={15} /></>}
                  </button>
                </div>
                <p className="speech-caption">Microphone answers use optional on-device Whisper. Typing always works.</p>
              </form>
            )}
          </section>
        )}

        {screen === "feedback" && feedback && (
          <section className="feedback-layout">
            <div className="feedback-heading">
              <p className="eyebrow">Interview complete</p>
              <h1>Good work showing up.</h1>
              <p className="lede">A few honest reflections to take into your next round.</p>
            </div>
            <div className="feedback-list">
              {feedbackSections.map(([key, title]) => {
                const items = feedback[key];
                if (!items?.length) return null;
                return (
                  <section className="feedback-section" key={key}>
                    <h2>{title}</h2>
                    <ul>{items.map((item, index) => <li key={`${key}-${index}`}>{item}</li>)}</ul>
                  </section>
                );
              })}
            </div>
            <div className="feedback-actions">
              <button className="primary-button" onClick={resetInterview}>Practice again <RotateCcw size={16} /></button>
              <button className="back-button" onClick={signOut}>Sign out <LogOut size={15} /></button>
            </div>
          </section>
        )}
      </div>
      <footer className="site-footer">
        <span>Made for the moment before the interview.</span>
        <span><LockKeyhole size={12} /> Private by design · Local AI</span>
      </footer>
    </main>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return <div className="error-banner" role="alert"><X size={15} /><span>{message}</span></div>;
}

export default App;
