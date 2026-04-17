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
