import enum

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class ItemType(str, enum.Enum):
    task = "task"
    deadline = "deadline"
    decision = "decision"
    idea = "idea"
    name = "name"
    other = "other"


class Note(Base):
    __tablename__ = "notes"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    raw_transcript = Column(Text, nullable=False)
    audio_filename = Column(Text, nullable=True)
    title = Column(Text, nullable=True)
    summary = Column(Text, nullable=True)

    structured_items = relationship(
        "StructuredItem", back_populates="note", cascade="all, delete-orphan"
    )


class StructuredItem(Base):
    __tablename__ = "structured_items"

    id = Column(Integer, primary_key=True, index=True)
    note_id = Column(Integer, ForeignKey("notes.id"), nullable=False)
    type = Column(Enum(ItemType), nullable=False)
    content = Column(Text, nullable=False)
    due_date = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    note = relationship("Note", back_populates="structured_items")
