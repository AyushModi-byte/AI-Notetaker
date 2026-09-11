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


SYSTEM_PROMPT = """You write short executive summaries of voice note transcripts.

Summarize the transcript in at most 2 sentences, capturing only the substantive content \
(ignore filler words and small talk). Return plain text only, no markdown, no preamble.
"""


def summarize_note(raw_text: str) -> str:
    client = _get_client()
    response = client.chat.completions.create(
        model="openai/gpt-oss-120b",
        temperature=0,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": raw_text},
        ],
    )
    return (response.choices[0].message.content or "").strip()
