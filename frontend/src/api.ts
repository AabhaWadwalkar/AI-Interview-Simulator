const API_ROOT = "/api";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

async function readError(response: Response): Promise<ApiError> {
  let message = `Request failed (${response.status}).`;
  try {
    const body = await response.json();
    if (typeof body.detail === "string") message = body.detail;
  } catch {
    // Keep the HTTP status message when the server does not return JSON.
  }
  return new ApiError(message, response.status);
}

async function request<T>(path: string, token?: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init?.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(`${API_ROOT}${path}`, { ...init, headers });
  if (!response.ok) throw await readError(response);
  return response.json() as Promise<T>;
}

export type Account = { token: string; user: { id: number; email: string } };
export type Feedback = {
  strengths: string[];
  weak_answers: string[];
  concepts_to_revise: string[];
  communication_improvements: string[];
  improved_examples: string[];
  next_topics: string[];
};

export const api = {
  signup: (email: string, password: string) =>
    request<Account>("/auth/signup", undefined, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  login: (email: string, password: string) =>
    request<Account>("/auth/login", undefined, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  health: () =>
    request<{ ollama: boolean; model: string; model_available: boolean; models: string[] }>("/health"),
  start: async (token: string, form: FormData) =>
    request<{ id: string; question: string }>("/interviews", token, {
      method: "POST",
      body: form,
    }),
  answer: (token: string, interviewId: string, answer: string) =>
    request<{ question: string }>(`/interviews/${interviewId}/answers`, token, {
      method: "POST",
      body: JSON.stringify({ answer }),
    }),
  retryQuestion: (token: string, interviewId: string) =>
    request<{ question: string }>(`/interviews/${interviewId}/next`, token, { method: "POST" }),
  end: (token: string, interviewId: string) =>
    request<{ feedback: Feedback }>(`/interviews/${interviewId}/end`, token, { method: "POST" }),
  transcribe: async (token: string, blob: Blob) => {
    const form = new FormData();
    form.append("audio", blob, "answer.webm");
    return request<{ text: string }>("/speech/transcribe", token, { method: "POST", body: form });
  },
  speak: async (token: string, text: string) => {
    const response = await fetch(`${API_ROOT}/speech/synthesize`, {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) throw await readError(response);
    return URL.createObjectURL(await response.blob());
  },
};
