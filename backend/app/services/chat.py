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


SYSTEM_PROMPT = """You are a helpful assistant that answers questions using ONLY the voice \
note context provided below. Every fact you state must be supported by the context — never \
invent information or use outside knowledge.

Within that constraint, reason over the context rather than just quoting it: summarize, \
combine related items across multiple notes, and count, compare, or sort when the question \
calls for it, phrasing the answer naturally in your own words.

If the answer cannot be found in the context, respond with exactly: "I don't have that \
information."

Be concise and direct.

Respond with ONLY a JSON object matching this exact schema, no markdown fences:
{"answer": string, "source_note_ids": [integer]}

"source_note_ids" must list the "Note #" integers (from the context) of every note you \
actually drew on to answer. If you don't have the information, set "answer" to exactly \
"I don't have that information." and "source_note_ids" to [].
"""


def answer_question(question: str, context: str) -> dict:
    client = _get_client()
    response = client.chat.completions.create(
        model="openai/gpt-oss-120b",
        response_format={"type": "json_object"},
        temperature=0,
        messages=[
            {"role": "system", "content": f"{SYSTEM_PROMPT}\n\nContext:\n{context}"},
            {"role": "user", "content": question},
        ],
    )
    content = response.choices[0].message.content or "{}"
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        return {"answer": content, "source_note_ids": []}

    return {
        "answer": parsed.get("answer", ""),
        "source_note_ids": parsed.get("source_note_ids", []) or [],
    }
