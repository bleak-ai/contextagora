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


class WorkspaceLoadRequest(BaseModel):
    modules: list[str]
