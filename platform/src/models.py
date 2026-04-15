from pydantic import BaseModel


class FileContentRequest(BaseModel):
    content: str


class CreateModuleRequest(BaseModel):
    name: str
    content: str
    summary: str = ""
    secrets: list[str] = []
    requirements: list[str] = []


class UpdateModuleRequest(BaseModel):
    content: str
    summary: str = ""
    secrets: list[str] = []
    requirements: list[str] = []


class ModuleDetail(BaseModel):
    name: str
    content: str
    summary: str
    secrets: list[str]
    requirements: list[str]


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


class CreateTaskRequest(BaseModel):
    name: str
    description: str = ""
