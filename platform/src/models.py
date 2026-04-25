from pydantic import BaseModel, Field


class FileContentRequest(BaseModel):
    content: str


class CreateModuleRequest(BaseModel):
    name: str
    kind: str = "integration"
    content: str = ""
    summary: str = ""
    description: str = ""
    secrets: list[str] = []
    requirements: list[str] = []


class UpdateModuleRequest(BaseModel):
    content: str
    summary: str = ""
    secrets: list[str] = []
    requirements: list[str] = []


class ChatRequest(BaseModel):
    prompt: str
    claude_session_id: str | None = None


class WorkspaceLoadRequest(BaseModel):
    modules: list[str]


class GenerateModuleRequest(BaseModel):
    content: str  # raw info.md content


class GenerateModuleResponse(BaseModel):
    summary: str  # 1-2 sentence module summary


class ModuleInfo(BaseModel):
    name: str
    kind: str = "integration"
    summary: str = ""
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
    sticker_face: str = ""
    sticker_note: str = ""


class SocialPostStep(BaseModel):
    text: str
    hint: str = ""
    note: str = ""
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


class SocialPostSession(BaseModel):
    id: str
    date_iso: str


class SocialPostPayload(BaseModel):
    title: str
    tagline: str = ""
    meta_bits: list[str] = []
    problem: SocialPostProblem
    steps: list[SocialPostStep]
    outcome: SocialPostOutcome
    services: list[str]
    stats: SocialPostStats
    session: SocialPostSession


class TweetPayload(BaseModel):
    text: str


class TweetGenerateRequest(BaseModel):
    card: SocialPostPayload
