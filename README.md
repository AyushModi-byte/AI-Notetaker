# AI Notetaker

A voice-first notetaking app: record a thought out loud, and it's automatically transcribed, distilled into structured tasks/decisions/ideas, and made queryable through a chat interface — with citations back to the source note.

## What you built

**`frontend/`** — a React Native (Expo, TypeScript) mobile client. It records audio, uploads it to the backend, and renders whatever structured data comes back: a Home feed of captured "contexts," a full-screen recording UI with a live waveform and timer, an editable Note Detail view with AI-assist tools (summarize, re-classify, copy to clipboard), and a persistent Chat screen with source-citation chips. The client holds no business logic of its own — it records, uploads, and displays.

**`backend/`** — a Python FastAPI service backed by SQLite. It handles audio transcription, LLM-based structured extraction (tasks, deadlines, decisions, ideas, names, a title), full note CRUD, task aggregation, and a chat endpoint that answers questions using the user's own notes as context, citing which notes it drew on.

## Your product decisions

- **Auto-pruning empty notes.** Voice capture inevitably includes mic tests, false starts, and "never mind" moments. If we saved every recording verbatim, the note feed would quickly fill with noise, and the user would stop trusting (and using) it. We discard a note server-side if the transcript is under 5 words, or if extraction finds no concrete tasks, decisions, or ideas — so the feed only ever contains something worth coming back to.
- **Strict JSON schemas for extraction.** Rather than parsing free-text LLM output with regex or string-matching, the backend forces the model into JSON mode with an exact schema (`title`, `tasks`, `deadlines`, `decisions`, `ideas`, `names_mentioned`), validated again on the way out through Pydantic response models. This makes storage and retrieval deterministic and type-safe, and makes failures explicit (a JSON parse error, not silently mangled data) rather than fragile.
- **Clean UI over ambient background listening.** For this MVP, recording is explicit and user-initiated rather than always-on. Ambient listening raises real privacy concerns (recording without a clear start/stop moment), costs battery and data continuously, and needs voice-activity detection and wake-word handling that's a project of its own. A deliberate "tap to record" flow was the right scope for the time available, and it made the rest of the product — accurate transcripts, trustworthy extraction, a fast feed — much more solid than spreading effort across always-on capture too.

## Your technical architecture

The client and server are fully decoupled over HTTP on the local network (the mobile app points at the backend's LAN IP). The backend is the single source of truth: SQLite holds two tables, `notes` (raw transcript, title, summary, audio filename) and `structured_items` (typed rows — task/deadline/decision/idea/name — foreign-keyed to a note).

All AI calls go through **Groq's OpenAI-compatible API** (`https://api.groq.com/openai/v1`, via the standard `openai` Python SDK pointed at that base URL) — chosen specifically to keep the whole project on a free tier rather than requiring a paid OpenAI key. Groq's `whisper-large-v3-turbo` handles transcription. For structured extraction, summarization, and chat, the backend uses `openai/gpt-oss-120b` — **not Llama 3** as originally planned: Groq deprecated the Llama 3.x models from this account's catalog mid-project, so the extraction/chat/summarization model was swapped to their current flagship open-weight model instead. (Flagging this explicitly since it's a deviation from the original brief.)

## How you clean and structure captured context

The extraction system prompt (`backend/app/services/extraction.py`) does two jobs at once: it tells the model what to throw away, and what shape to return.

On the "throw away" side, it explicitly instructs the model to drop filler words, false starts, small talk, and — after an early bug where "never mind, I'll do this later" was hallucinated into a task — any statement built on an unresolved pronoun ("this", "that", "it") with no stated subject. A task, deadline, decision, or idea only survives if it names something concrete.

On the "shape" side, the model is forced into JSON mode (`response_format={"type": "json_object"}`) against an exact schema, including a 3–5 word `title` generated per note. That JSON is then walked by `main.py` into typed `StructuredItem` rows (one per task/deadline/decision/idea/name) and a `Note` row, both validated through Pydantic schemas (`NoteOut`, `StructuredItemOut`) before ever reaching the client. If the model's JSON doesn't parse, extraction retries once before the note falls back to raw-transcript-only rather than crashing the request.

## How your chat retrieves and uses that context

Given the 24-hour project scope, retrieval is intentionally simple rather than a full RAG pipeline: `/chat` queries SQLite for every note (`ORDER BY created_at DESC`) along with its structured items, and flattens all of it into one text context block — no vector search, no chunking, no embeddings.

That context plus the user's question goes to the LLM in JSON mode, with the model required to return `{"answer": string, "source_note_ids": [integer]}` — it names which notes it actually drew on, not just answers freely. The backend cross-references those IDs against the notes it queried (so a hallucinated or stale ID can't leak through), attaches each real match's timestamp and title, and returns them as a `sources` array alongside the answer. The mobile Chat screen renders each source as a tappable citation chip (`📌 Source: ...`) that opens the referenced note directly.

## What you would improve with another week

- **Vector embeddings (Pinecone or Chroma) instead of dump-all-rows retrieval.** The current "fetch everything into context" approach works at a handful of notes but won't scale — past a modest note count it'll blow the context window and get slower and more expensive per chat call. Real semantic search would fix both.
- **True background ambient listening**, with on-device voice-activity detection so the app can passively capture context without an explicit tap, while still respecting the privacy tradeoffs mentioned above (e.g. a clear visual/audio cue whenever it's actively recording).
- Real audio-level metering for the recording waveform (currently simulated animation, not driven by actual mic input).
- A proper migration tool (Alembic) instead of the ad hoc `ALTER TABLE` check used to add the `title`/`summary` columns.
- Persisted "done" state for action items (currently a session-local, unsaved checklist), and real freeform tags/categories/reminders (currently placeholder UI elements).
- An automated test suite — testing so far has been manual (`curl` against every endpoint, `tsc`/`expo-doctor`/bundle-export checks on the client) rather than CI-backed.

## Any shortcuts, assumptions, or limitations

Due to developing on a Windows machine without access to macOS/Xcode, I built the client using React Native (Expo) to ensure native iOS device testing, while focusing my engineering efforts on the Context Engine backend as permitted by the technical freedom clause.

Other notable shortcuts and assumptions:

- **No authentication** — the app assumes a single implicit user; there's no login, and every note is globally visible to whoever can reach the backend's URL.
- **CORS is wide open** (`allow_origins=["*"]`), which is fine for local development but not production-safe.
- **Model substitution under free-tier constraints:** the brief originally called for OpenAI (Whisper-1, GPT-4o-mini). To keep the project fully free, the backend was moved to Groq's API (`whisper-large-v3-turbo`, `openai/gpt-oss-120b`) instead — see the architecture section above for why the model further changed mid-project.
- **The database schema evolved without a migration framework** — new columns are added via a small startup check that runs `ALTER TABLE` if a column is missing, which works for this project's scope but wouldn't scale to a real schema-versioning need.
- **No push notifications, background jobs, or offline queueing** — if the backend is unreachable, an upload or chat request simply fails with a retry option in the UI; it isn't queued for later.
