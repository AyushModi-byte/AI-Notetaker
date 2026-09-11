import json
import os

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

_client: OpenAI | None = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        api_key = os.environ.get("GROQ_API_KEY")
        if not api_key:
            raise RuntimeError("GROQ_API_KEY is not set")
        _client = OpenAI(api_key=api_key, base_url="https://api.groq.com/openai/v1")
    return _client


SYSTEM_PROMPT = """You are a strict information-extraction engine for voice note transcripts.

Discard entirely, and never let them appear anywhere in your output:
- filler words, false starts, stutters
- small talk (greetings, weather, pleasantries)
- meta-commentary about the recording itself (e.g. "testing the microphone", "is this thing \
on", "let's begin", "okay so", "never mind", "I'll do this later" with no stated subject)

A task, deadline, decision, or idea is only valid if it names a CONCRETE, SPECIFIC subject and \
action. Reject anything built on a vague, unresolved pronoun or placeholder — "this", "that", \
"it", "the thing", "later" — where the transcript never says what it refers to. For example, \
"never mind, I'll do this later" contains no identifiable subject and must NOT be extracted as \
a task. When in doubt about whether something is concrete enough, leave it out.

Extract only meaningful content and return it as JSON matching EXACTLY this schema, \
with no additional top-level keys:

{
  "title": string,
  "tasks": [{"content": string, "due_date": string or null}],
  "deadlines": [{"content": string, "due_date": string or null}],
  "decisions": [{"content": string}],
  "ideas": [{"content": string}],
  "names_mentioned": [string]
}

Rules:
- "title" is a concise 3-to-5 word title naming the core subject of the transcript, even if \
no tasks/decisions/ideas were found (e.g. "Microphone Test", "Q3 Budget Planning").
- "tasks" are action items someone needs to do, with a specific action and subject.
- "deadlines" are specific dates/times something is due (distinct from the action itself).
- "decisions" are choices that were made or agreed on.
- "ideas" are suggestions, proposals, or brainstorm points not yet decided.
- "names_mentioned" are proper names of people referenced in the transcript.
- due_date should be an ISO date (YYYY-MM-DD) if an absolute date is stated, a short \
natural phrase (e.g. "next Friday") if only a relative date is stated, or null if no \
date is mentioned.
- If a category has no items, return an empty list for it.
- Return ONLY the JSON object. No markdown code fences, no commentary, no explanation.
"""


def extract_structured_data(raw_text: str) -> dict:
    client = _get_client()
    response = client.chat.completions.create(
        model="openai/gpt-oss-120b",
        response_format={"type": "json_object"},
        temperature=0,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": raw_text},
        ],
    )
    content = response.choices[0].message.content
    return json.loads(content)


MIN_TRANSCRIPT_WORDS = 5


def is_transcript_too_short(raw_text: str) -> bool:
    return len(raw_text.split()) < MIN_TRANSCRIPT_WORDS


def has_meaningful_content(structured: dict) -> bool:
    return bool(
        structured.get("tasks") or structured.get("decisions") or structured.get("ideas")
    )


TITLE_WORD_LIMIT = 8


def generate_title(raw_text: str) -> str:
    """Fallback title used only if the LLM extraction omits/fails to produce one."""
    words = raw_text.split()
    title = " ".join(words[:TITLE_WORD_LIMIT])
    if len(words) > TITLE_WORD_LIMIT:
        title += "…"
    return title
