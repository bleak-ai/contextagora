# Tree Navigation PoC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-time visualization of Claude's navigation path through context modules with minimal backend changes and simple frontend display.

**Architecture:** Backend-driven tree tracking that intercepts Read tool calls, maintains session-scoped state, and emits SSE events. Frontend handles events and displays breadcrumbs with simple module tree highlighting.

**Tech Stack:** FastAPI (Python), React, TypeScript, Server-Sent Events (SSE)

---

## File Structure

### Backend
- **Modify:** `platform/src/routes/chat.py`
  - Add tree state tracking per session
  - Parse Read tool calls and update tree state
  - Emit tree_navigation SSE events

### Frontend
- **Modify:** `platform/frontend/src/hooks/useChatStore.ts`
  - Add tree state to ChatState interface
  - Handle tree_navigation SSE events

- **Create:** `platform/frontend/src/components/chat/DecisionTreePanel.tsx`
  - Display breadcrumb navigation
  - Show module tree with access counts
  - Highlight active module

- **Modify:** `platform/frontend/src/components/ContextPanel.tsx`
  - Add Decision Tree section to panel

---

## Tasks

### Task 1: Add Backend Tree State Tracking

**Files:**
- Modify: `platform/src/routes/chat.py:1-244`

- [ ] **Step 1: Add tree state dictionary**

```python
# Add after existing imports, before router definition
tree_states: dict[str, dict] = {}  # session_id -> tree state
```

- [ ] **Step 2: Implement tree state update function**

```python
def update_tree_state(session_id: str, file_path: str) -> dict | None:
    """Update tree state when Claude reads a file."""
    if session_id not in tree_states:
        tree_states[session_id] = {
            "active_path": [],
            "accessed_files": set(),
            "module_counts": {}
        }
    
    state = tree_states[session_id]
    
    try:
        # Normalize path to relative from CONTEXT_DIR
        relative_path = Path(file_path).relative_to(CONTEXT_DIR)
        path_parts = str(relative_path).split("/")
        
        # Update active path
        state["active_path"] = path_parts
        state["accessed_files"].add(str(relative_path))
        
        # Count module access
        if path_parts:
            module = path_parts[0]
            state["module_counts"][module] = state["module_counts"].get(module, 0) + 1
        
        return {
            "active_path": state["active_path"],
            "accessed_files": list(state["accessed_files"]),
            "module_counts": state["module_counts"]
        }
    except ValueError:
        return None  # Path outside CONTEXT_DIR, ignore
```

- [ ] **Step 3: Add tree navigation event emission in generate()**

Find the section in generate() that handles assistant tool_use events (around line 207) and add after the existing tool_use handling:

```python
elif event_type == "assistant":
    sid = event.get("session_id")
    if sid:
        session.claude_session_id = sid

    message = event.get("message", {})
    content = message.get("content", [])
    for block in content:
        if block.get("type") == "tool_use":
            tool_id = block.get("id", "")
            tool_name = block.get("name", "")
            tool_input = block.get("input", {})
            
            if tool_id not in seen_tool_ids:
                seen_tool_ids.add(tool_id)
                yield f"event: tool_use\ndata: {json.dumps({'tool': tool_name, 'tool_id': tool_id, 'input': tool_input})}\n\n"
            
            # ADD THIS: Track Read operations
            if tool_name == "Read":
                file_path = tool_input.get("path", "")
                tree_state = update_tree_state(body.session_id, file_path)
                if tree_state:
                    yield f"event: tree_navigation\ndata: {json.dumps(tree_state)}\n\n"
```

- [ ] **Step 4: Commit**

```bash
git add platform/src/routes/chat.py
git commit -m "feat(chat): add tree state tracking for Read operations

Track Claude's file navigation through context modules.
Emit tree_navigation SSE events with path and module counts.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Update Frontend Chat Event Types

**Files:**
- Modify: `platform/frontend/src/hooks/useChatStore.ts:1-15`

- [ ] **Step 1: Add tree_navigation to ChatEvent type**

```typescript
export type ChatEvent =
  | { type: "thinking"; text: string }
  | { type: "text"; text: string }
  | { type: "tool_use"; tool: string; tool_id: string; input: Record<string, unknown> }
  | { type: "tool_input"; partial_json: string }
  | { type: "tool_result"; tool_id: string; output: string }
  | { type: "session"; session_id: string }
  | { type: "session_name"; name: string }
  | { type: "error"; message: string }
  | { type: "done" }
  | { type: "tree_navigation"; active_path: string[]; accessed_files: string[]; module_counts: Record<string, number> };
```

- [ ] **Step 2: Add tree state to ChatState interface**

```typescript
interface ChatState {
  messagesBySession: Record<string, ChatMessage[]>;
  streamingSessionId: string | null;
  abortController: AbortController | null;
  moduleToolCompletedCount: number;
  treeState: {
    active_path: string[];
    accessed_files: string[];
    module_counts: Record<string, number>;
  } | null;
}
```

- [ ] **Step 3: Initialize treeState in state**

```typescript
export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      messagesBySession: {},
      streamingSessionId: null,
      abortController: null,
      moduleToolCompletedCount: 0,
      treeState: null,  // ADD THIS
```

- [ ] **Step 4: Commit**

```bash
git add platform/frontend/src/hooks/useChatStore.ts
git commit -m "feat(chat): add tree state types and interface

Add tree_navigation event type and treeState to ChatState.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Handle Tree Navigation Events in Store

**Files:**
- Modify: `platform/frontend/src/hooks/useChatStore.ts:48-200`

- [ ] **Step 1: Add tree_navigation case in sendMessage event handler**

Find the switch statement that handles different event types (around line 99) and add:

```typescript
streamChat(
  prompt,
  sessionId,
  (event: ChatEvent) => {
    switch (event.type) {
      // ... existing cases ...
      case "tree_navigation":
        set((state) => ({
          ...state,
          treeState: {
            active_path: event.active_path,
            accessed_files: event.accessed_files,
            module_counts: event.module_counts
          }
        }));
        break;
      case "error":
        // ... existing error handling ...
```

- [ ] **Step 2: Commit**

```bash
git add platform/frontend/src/hooks/useChatStore.ts
git commit -m "feat(chat): handle tree_navigation SSE events

Update treeState when navigation events are received.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Create DecisionTreePanel Component

**Files:**
- Create: `platform/frontend/src/components/chat/DecisionTreePanel.tsx`

- [ ] **Step 1: Write DecisionTreePanel component**

```typescript
import { useQuery } from "@tanstack/react-query";
import { fetchModules } from "../../api/modules";
import { useChatStore } from "../../hooks/useChatStore";

export function DecisionTreePanel() {
  const treeState = useChatStore((s) => s.treeState);
  const { data: modulesData } = useQuery({
    queryKey: ["modules"],
    queryFn: fetchModules,
  });
  
  const modules = modulesData?.modules || [];
  
  // Show empty state for new sessions
  if (!treeState || treeState.active_path.length === 0) {
    return (
      <div className="text-xs text-text-muted px-1 py-2">
        No navigation yet
      </div>
    );
  }
  
  return (
    <div className="space-y-2 px-1 py-2">
      {/* Breadcrumb navigation */}
      <div className="text-xs text-text-muted mb-2 flex items-center gap-1">
        <span>📍</span>
        <span className="truncate">
          {treeState.active_path.join(" → ")}
        </span>
      </div>
      
      {/* Simple module tree */}
      <div className="text-xs space-y-1">
        {modules.map((module) => {
          const isActive = treeState.active_path[0] === module;
          const count = treeState.module_counts[module] || 0;
          
          return (
            <div
              key={module}
              className={`flex items-center gap-1 ${
                isActive
                  ? "text-accent font-bold"
                  : "text-text-secondary"
              }`}
            >
              <span>📁</span>
              <span className="truncate">{module}</span>
              {count > 0 && (
                <span className="text-[10px] text-text-muted">
                  ({count})
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add platform/frontend/src/components/chat/DecisionTreePanel.tsx
git commit -m "feat(chat): add DecisionTreePanel component

Display breadcrumb navigation and module access counts.
Simple tree visualization with active highlighting.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Integrate DecisionTreePanel into ContextPanel

**Files:**
- Modify: `platform/frontend/src/components/ContextPanel.tsx:1-356`

- [ ] **Step 1: Import DecisionTreePanel**

Add to imports at top of file:

```typescript
import { DecisionTreePanel } from "./chat/DecisionTreePanel";
```

- [ ] **Step 2: Add Decision Tree section to panel**

Find the secrets section (around line 290) and add after it:

```typescript
{/* Secrets */}
<div className="pt-3 border-t border-border">
  <div className="flex items-center justify-between mb-2 px-1">
    <span className="text-[10px] text-text-muted tracking-wider">
      SECRETS
    </span>
    <button
      onClick={() => secretsMutation.mutate()}
      disabled={secretsMutation.isPending}
      className="flex items-center gap-1 text-[10px] text-text-secondary bg-border border border-border-light px-1.5 py-0.5 rounded hover:text-text"
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
      >
        <path d="M23 4v6h-6" />
        <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
      </svg>
      {secretsMutation.isPending ? "..." : "Refresh"}
    </button>
  </div>
  {/* ... existing secrets rendering ... */}
</div>

{/* ADD THIS: Decision Tree */}
<div className="pt-3 border-t border-border">
  <div className="text-[10px] text-text-muted tracking-wider mb-2 px-1">
    DECISION TREE
  </div>
  <DecisionTreePanel />
</div>
```

- [ ] **Step 3: Commit**

```bash
git add platform/frontend/src/components/ContextPanel.tsx
git commit -m "feat(context): add Decision Tree section to ContextPanel

Integrate DecisionTreePanel into sidebar navigation.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 6: Update llms.txt

**Files:**
- Modify: `llms.txt:1-51`

- [ ] **Step 1: Add DecisionTreePanel reference**

Add to the components section:

```markdown
- [platform/frontend/src/components/chat/DecisionTreePanel.tsx](platform/frontend/src/components/chat/DecisionTreePanel.tsx) — Tree navigation visualization with breadcrumbs and module access counts
```

- [ ] **Step 2: Commit**

```bash
git add llms.txt
git commit -m "docs(llms): add DecisionTreePanel to navigation

Update llms.txt with new component reference.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Testing Steps (Manual Verification)

After completing all tasks, manually verify the feature:

1. **Start the application:**
   ```bash
   cd platform
   uv run python -m uvicorn src.server:app --reload --port 8080
   ```

2. **Send a message that triggers file reading:**
   - Ask Claude to "tell me about the Linear module"
   - Claude should read `/context/linear/llms.txt` then `/context/linear/info.md`

3. **Verify tree updates:**
   - Check Context Panel shows "DECISION TREE" section
   - Breadcrumb shows: `📍 llms.txt → linear → info.md`
   - Linear module is highlighted in accent color
   - Linear shows access count: `📁 linear (2)`

4. **Send another message about different module:**
   - Ask about Firestore module
   - Tree should update to show Firestore as active
   - Both Linear and Firestore show access counts

5. **Verify persistence:**
   - Send multiple messages
   - Tree should continue updating
   - Access counts should accumulate

---

## Rollback Plan

If issues arise, rollback in reverse order:

```bash
git revert HEAD~6  # Undo all commits
```

Or selectively revert specific tasks by commit hash.

---

## Success Criteria

✅ Claude reading a file updates tree visualization  
✅ Breadcrumb shows correct navigation path  
✅ Active module is highlighted  
✅ Module access counts increment correctly  
✅ Tree persists across session messages  
✅ No build errors or runtime exceptions
