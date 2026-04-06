from pydantic import BaseModel


class FileContentRequest(BaseModel):
    content: str


class CreateModuleRequest(BaseModel):
    name: str
    content: str
    summary: str = ""
    secrets: list[str] = []


class UpdateModuleRequest(BaseModel):
    content: str
    summary: str = ""
    secrets: list[str] = []


class ModuleDetail(BaseModel):
    name: str
    content: str
    summary: str
    secrets: list[str]


class ChatRequest(BaseModel):
    prompt: str
    session_id: str


class CreateSessionRequest(BaseModel):
    name: str = "New chat"


class RenameSessionRequest(BaseModel):
    name: str


class WorkspaceLoadRequest(BaseModel):
    modules: list[str]


class GenerateModuleRequest(BaseModel):
    content: str  # raw info.md content


class GenerateDocFile(BaseModel):
    path: str     # e.g. "docs/payments.md"
    content: str


class GenerateModuleResponse(BaseModel):
    content: str              # restructured info.md
    summary: str              # extracted one-line summary
    secrets: list[str]        # detected env var names
    docs: list[GenerateDocFile]  # optional additional doc files
