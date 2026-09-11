from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict

from app.models import ItemType


class StructuredItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    note_id: int
    type: ItemType
    content: str
    due_date: Optional[str] = None
    created_at: datetime


class NoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    raw_transcript: str
    audio_filename: Optional[str] = None
    title: Optional[str] = None
    summary: Optional[str] = None
    structured_items: List[StructuredItemOut] = []


class DiscardedNoteOut(BaseModel):
    status: Literal["discarded"] = "discarded"
    message: str


class StructuredItemIn(BaseModel):
    type: ItemType
    content: str
    due_date: Optional[str] = None


class NoteUpdate(BaseModel):
    title: Optional[str] = None
    summary: Optional[str] = None
    structured_items: Optional[List[StructuredItemIn]] = None


class ManualNoteIn(BaseModel):
    text: str


class TaskOut(BaseModel):
    id: int
    note_id: int
    content: str
    due_date: Optional[str] = None
    created_at: datetime


class ChatRequest(BaseModel):
    question: str


class ChatSource(BaseModel):
    id: int
    timestamp: datetime
    title: Optional[str] = None


class ChatResponse(BaseModel):
    answer: str
    sources: List[ChatSource] = []
