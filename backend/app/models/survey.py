"""
ORM models for the survey domain.

Schema:
    Survey      — a named set of questions (e.g. "Job Satisfaction Scale")
    Question    — one item within a survey, with type + ordinal position
    Response    — one participant's submission of a survey
    Answer      — the value a participant gave for one question
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Survey(Base):
    __tablename__ = "surveys"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="draft"
    )  # 'draft' | 'published'
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    questions: Mapped[list["Question"]] = relationship(
        "Question",
        back_populates="survey",
        cascade="all, delete-orphan",
        order_by="Question.position",
    )
    responses: Mapped[list["Response"]] = relationship(
        "Response", back_populates="survey", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Survey id={self.id!r} name={self.name!r} status={self.status!r}>"


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    survey_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("surveys.id", ondelete="CASCADE"), nullable=False
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)
    question_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="likert_5"
    )  # 'text' | 'single_choice' | 'multiple_choice' | 'likert_5' | 'likert_7'
    options: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )  # JSON-encoded list[str] for choice types; NULL for text/Likert
    position: Mapped[int] = mapped_column(Integer, nullable=False)  # 1-based

    survey: Mapped["Survey"] = relationship("Survey", back_populates="questions")
    answers: Mapped[list["Answer"]] = relationship(
        "Answer", back_populates="question", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Question id={self.id!r} type={self.question_type!r} pos={self.position}>"


class Response(Base):
    __tablename__ = "responses"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    survey_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("surveys.id", ondelete="CASCADE"), nullable=False
    )
    respondent_ref: Mapped[str | None] = mapped_column(
        String(255), nullable=True  # opaque external ID or label; NULL = anonymous
    )
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    survey: Mapped["Survey"] = relationship("Survey", back_populates="responses")
    answers: Mapped[list["Answer"]] = relationship(
        "Answer", back_populates="response", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Response id={self.id!r} survey_id={self.survey_id!r}>"


class Answer(Base):
    __tablename__ = "answers"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    response_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("responses.id", ondelete="CASCADE"), nullable=False
    )
    question_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("questions.id", ondelete="CASCADE"), nullable=False
    )
    # value stores all answer types as text:
    #   Likert  → "3"
    #   text    → "Some free text"
    #   single  → "Option A"
    #   multi   → '["Option A","Option C"]'
    value: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # score is populated only for Likert questions (convenience for analysis modules)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)

    response: Mapped["Response"] = relationship("Response", back_populates="answers")
    question: Mapped["Question"] = relationship("Question", back_populates="answers")

    def __repr__(self) -> str:
        return f"<Answer response={self.response_id!r} question={self.question_id!r} value={self.value!r}>"
