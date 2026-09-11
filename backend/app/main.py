import logging
import os
import uuid
from typing import List, Union

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session, joinedload

from app.database import Base, DATA_DIR, engine, get_db, run_lightweight_migrations
from app.models import ItemType, Note, StructuredItem
from app.schemas import (
    ChatRequest,
    ChatResponse,
    ChatSource,
    DiscardedNoteOut,
    ManualNoteIn,
    NoteOut,
    NoteUpdate,
    TaskOut,
)
from app.services.chat import answer_question
from app.services.extraction import (
    extract_structured_data,
    generate_title,
    has_meaningful_content,
    is_transcript_too_short,
)
from app.services.summarize import summarize_note
from app.services.transcription import transcribe_audio

logger = logging.getLogger("notetaker")

AUDIO_DIR = os.path.join(DATA_DIR, "audio")

app = FastAPI(title="Notetaker API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    run_lightweight_migrations()
    os.makedirs(AUDIO_DIR, exist_ok=True)


@app.get("/health")
def health(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"database unavailable: {exc}")
    return {"status": "ok"}


@app.get("/notes", response_model=List[NoteOut])
def get_notes(db: Session = Depends(get_db)):
    notes = (
        db.query(Note)
        .options(joinedload(Note.structured_items))
        .order_by(Note.created_at.desc())
        .all()
    )
    return notes


_LIST_FIELD_TO_TYPE = {
    "tasks": ItemType.task,
    "deadlines": ItemType.deadline,
    "decisions": ItemType.decision,
    "ideas": ItemType.idea,
}


def _structured_items_from_payload(note_id: int, structured: dict) -> List[StructuredItem]:
    items: List[StructuredItem] = []
    for field, item_type in _LIST_FIELD_TO_TYPE.items():
        for entry in structured.get(field, []) or []:
            content = (entry or {}).get("content")
            if not content:
                continue
            items.append(
                StructuredItem(
                    note_id=note_id,
                    type=item_type,
                    content=content,
                    due_date=(entry or {}).get("due_date"),
                )
            )
    for name in structured.get("names_mentioned", []) or []:
        if not name:
            continue
        items.append(
            StructuredItem(
                note_id=note_id,
                type=ItemType.name,
                content=name,
                due_date=None,
            )
        )
    return items


def _delete_audio_file(audio_path: str) -> None:
    try:
        os.remove(audio_path)
    except OSError:
        logger.warning("Could not remove discarded audio file: %s", audio_path)


def _extract_with_retry(raw_text: str) -> dict:
    structured: dict = {}
    for attempt in range(2):
        try:
            structured = extract_structured_data(raw_text)
            break
        except Exception as exc:
            logger.warning("Extraction attempt %d failed: %s", attempt + 1, exc)
            structured = {}
    return structured


def _process_and_save_note(
    db: Session, raw_text: str, audio_filename: str | None, audio_path: str | None
) -> Union[Note, DiscardedNoteOut]:
    """Shared pipeline for both audio uploads and manual text notes."""
    if is_transcript_too_short(raw_text):
        if audio_path:
            _delete_audio_file(audio_path)
        return DiscardedNoteOut(message="No meaningful context detected.")

    structured = _extract_with_retry(raw_text)

    if not has_meaningful_content(structured):
        if audio_path:
            _delete_audio_file(audio_path)
        return DiscardedNoteOut(message="No meaningful context detected.")

    note = Note(
        raw_transcript=raw_text,
        audio_filename=audio_filename,
        title=structured.get("title") or generate_title(raw_text),
    )
    db.add(note)
    db.flush()

    for item in _structured_items_from_payload(note.id, structured):
        db.add(item)

    db.commit()
    db.refresh(note)
    _ = note.structured_items  # ensure relationship is loaded before session closes
    return note


@app.post("/notes/upload", response_model=Union[NoteOut, DiscardedNoteOut])
def upload_note(file: UploadFile = File(...), db: Session = Depends(get_db)):
    os.makedirs(AUDIO_DIR, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1] or ".wav"
    audio_filename = f"{uuid.uuid4().hex}{ext}"
    audio_path = os.path.join(AUDIO_DIR, audio_filename)

    with open(audio_path, "wb") as out_file:
        out_file.write(file.file.read())

    try:
        raw_text = transcribe_audio(audio_path)
    except Exception as exc:
        logger.exception("Whisper transcription failed")
        raise HTTPException(status_code=502, detail=f"Transcription failed: {exc}")

    return _process_and_save_note(db, raw_text, audio_filename, audio_path)


@app.post("/notes/manual", response_model=Union[NoteOut, DiscardedNoteOut])
def create_manual_note(payload: ManualNoteIn, db: Session = Depends(get_db)):
    return _process_and_save_note(db, payload.text, None, None)


def _get_note_or_404(db: Session, note_id: int) -> Note:
    note = (
        db.query(Note)
        .options(joinedload(Note.structured_items))
        .filter(Note.id == note_id)
        .first()
    )
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")
    return note


@app.put("/notes/{note_id}", response_model=NoteOut)
def update_note(note_id: int, payload: NoteUpdate, db: Session = Depends(get_db)):
    note = _get_note_or_404(db, note_id)

    if payload.title is not None:
        note.title = payload.title
    if payload.summary is not None:
        note.summary = payload.summary

    if payload.structured_items is not None:
        for item in list(note.structured_items):
            db.delete(item)
        db.flush()
        for item_in in payload.structured_items:
            db.add(
                StructuredItem(
                    note_id=note.id,
                    type=item_in.type,
                    content=item_in.content,
                    due_date=item_in.due_date,
                )
            )

    db.commit()
    db.refresh(note)
    _ = note.structured_items
    return note


@app.delete("/notes/{note_id}")
def delete_note(note_id: int, db: Session = Depends(get_db)):
    note = _get_note_or_404(db, note_id)
    if note.audio_filename:
        _delete_audio_file(os.path.join(AUDIO_DIR, note.audio_filename))
    db.delete(note)
    db.commit()
    return {"status": "deleted", "id": note_id}


@app.delete("/notes")
def delete_all_notes(db: Session = Depends(get_db)):
    notes = db.query(Note).all()
    count = len(notes)
    for note in notes:
        if note.audio_filename:
            _delete_audio_file(os.path.join(AUDIO_DIR, note.audio_filename))
        db.delete(note)
    db.commit()
    return {"status": "deleted", "count": count}


@app.post("/notes/{note_id}/summarize", response_model=NoteOut)
def summarize_note_endpoint(note_id: int, db: Session = Depends(get_db)):
    note = _get_note_or_404(db, note_id)
    try:
        note.summary = summarize_note(note.raw_transcript)
    except Exception as exc:
        logger.exception("Summarization failed")
        raise HTTPException(status_code=502, detail=f"Summarization failed: {exc}")

    db.commit()
    db.refresh(note)
    _ = note.structured_items
    return note


@app.post("/notes/{note_id}/reclassify", response_model=NoteOut)
def reclassify_note(note_id: int, db: Session = Depends(get_db)):
    note = _get_note_or_404(db, note_id)

    try:
        structured = extract_structured_data(note.raw_transcript)
    except Exception as exc:
        logger.exception("Reclassification failed")
        raise HTTPException(status_code=502, detail=f"Reclassification failed: {exc}")

    for item in list(note.structured_items):
        db.delete(item)
    db.flush()

    for item in _structured_items_from_payload(note.id, structured):
        db.add(item)

    db.commit()
    db.refresh(note)
    _ = note.structured_items
    return note


@app.get("/tasks", response_model=List[TaskOut])
def get_tasks(db: Session = Depends(get_db)):
    items = (
        db.query(StructuredItem)
        .filter(StructuredItem.type == ItemType.task)
        .order_by(StructuredItem.id)
        .all()
    )
    return items


_TYPE_TO_LABEL = {
    ItemType.task: "Tasks",
    ItemType.deadline: "Deadlines",
    ItemType.decision: "Decisions",
    ItemType.idea: "Ideas",
    ItemType.name: "Names mentioned",
    ItemType.other: "Other",
}


def _build_chat_context(notes: List[Note]) -> str:
    if not notes:
        return "No notes have been recorded yet."

    blocks = []
    for note in notes:
        lines = [f"Note #{note.id} (created {note.created_at}):", f"Transcript: {note.raw_transcript}"]

        grouped: dict[ItemType, List[StructuredItem]] = {}
        for item in note.structured_items:
            grouped.setdefault(item.type, []).append(item)

        for item_type, label in _TYPE_TO_LABEL.items():
            entries = grouped.get(item_type)
            if not entries:
                continue
            lines.append(f"{label}:")
            for entry in entries:
                due = f" (due: {entry.due_date})" if entry.due_date else ""
                lines.append(f"- {entry.content}{due}")

        blocks.append("\n".join(lines))

    return "\n\n".join(blocks)


@app.post("/chat", response_model=ChatResponse)
def chat(payload: ChatRequest, db: Session = Depends(get_db)):
    notes = (
        db.query(Note)
        .options(joinedload(Note.structured_items))
        .order_by(Note.id)
        .all()
    )
    context = _build_chat_context(notes)

    try:
        result = answer_question(payload.question, context)
    except Exception as exc:
        logger.exception("Chat completion failed")
        raise HTTPException(status_code=502, detail=f"Chat failed: {exc}")

    notes_by_id = {note.id: note for note in notes}
    sources = [
        ChatSource(id=note.id, timestamp=note.created_at, title=note.title)
        for note_id in result.get("source_note_ids", [])
        if (note := notes_by_id.get(note_id)) is not None
    ]

    return {"answer": result.get("answer", ""), "sources": sources}
