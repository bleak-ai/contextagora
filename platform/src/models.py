from typing import Literal

from pydantic import BaseModel, Field


class FileContentRequest(BaseModel):
    content: str


class UpdateModuleRequest(BaseModel):
    content: str
    summary: str = ""
    secrets: list[str] = []
    requirements: list[str] = []


class ChatRequest(BaseModel):
    prompt: str
    claude_session_id: str | None = None
    mode: Literal["normal", "quick"] = "normal"


class SessionModeRequest(BaseModel):
    mode: Literal["normal", "quick"]


class WorkspaceLoadRequest(BaseModel):
    modules: list[str]


class ModuleInfo(BaseModel):
    name: str
    kind: Literal["integration", "task", "workflow"] = "integration"
    summary: str = ""
    has_growth_areas: bool = False
    archived: bool = False


class PushRequest(BaseModel):
    message: str


class RootFile(BaseModel):
    path: str
    exists: bool
    content: str | None


class RootContextResponse(BaseModel):
    claude_md: RootFile
    llms_txt: RootFile


class BenchmarkTaskBody(BaseModel):
    id: str = Field(..., min_length=1, max_length=64)
    description: str = ""
    prompt: str
    judge_prompt: str


class BenchmarkTaskUpdateBody(BaseModel):
    description: str = ""
    prompt: str
    judge_prompt: str


class SocialPostProblem(BaseModel):
    headline: str
    meta: str


class SocialPostStep(BaseModel):
    text: str
    hint: str = ""
    icon: str = ""


class SocialPostOutcome(BaseModel):
    title: str
    subtitle: str
    file: str = ""
    emoji: str = ""
    punchline: str = ""


class SocialPostStats(BaseModel):
    elapsed_seconds: int
    prompt_count: int


class SocialPostPayload(BaseModel):
    title: str
    meta_bits: list[str] = []
    problem: SocialPostProblem
    steps: list[SocialPostStep]
    outcome: SocialPostOutcome
    services: list[str]
    stats: SocialPostStats


class TweetPayload(BaseModel):
    text: str


class TweetGenerateRequest(BaseModel):
    card: SocialPostPayload


class LinkedinPayload(BaseModel):
    text: str


class LinkedinGenerateRequest(BaseModel):
    card: SocialPostPayload


class UploadedImageResponse(BaseModel):
    path: str
