# Tree Navigation PoC Design

**Date:** 2026-04-05  
**Status:** Approved  
**Type:** Minimal Proof of Concept

## Overview

Add real-time visualization of Claude's navigation path through context modules in the UI, showing which files and modules Claude accesses as it processes requests.

## Problem Statement

Users currently cannot see Claude's decision-making process when it navigates through context modules. The UI shows which modules are loaded but doesn't reveal:
- Which specific files Claude is reading
- The navigation path through llms.txt structure  
- How frequently different modules are accessed

## Solution

Minimal backend-driven tree tracking that emits SSE events when Claude reads files, with simple frontend visualization.

## Architecture

### Backend Changes

**File:** `platform/src/routes/chat.py`

Add minimal tree state tracking per session:
- Track active path when Claude reads files
- Count module access frequency
- Emit `tree_navigation` SSE events

**Key Implementation:**
- `tree_states: dict[str, dict]` — Session-scoped tree state
- `update_tree_state()` — Normalize paths, update tracking
- Emit events on `Read` tool calls

### Frontend Changes

**Files:** 
- `platform/frontend/src/hooks/useChatStore.ts` — Add tree state handling
- `platform/frontend/src/components/chat/DecisionTreePanel.tsx` — New component
- `platform/frontend/src/components/ContextPanel.tsx` — Add panel section

**Key Implementation:**
- Handle `tree_navigation` SSE events
- Display breadcrumb navigation path
- Show simple module tree with access counts

## Data Flow

1. User sends message → Claude processes
2. Claude calls `Read` tool → Backend intercepts
3. Backend updates tree state → Emits SSE event
4. Frontend receives event → Updates UI
5. Tree shows active path and accessed modules

## Components

### Backend

**Tree State Structure:**
```python
{
  "active_path": ["linear", "info.md"],  # Current navigation path
  "accessed_files": ["linear/info.md", "firestore/info.md"],  # All accessed files
  "module_counts": {"linear": 12, "firestore": 6}  # Access frequency
}
```

**SSE Event:**
```
event: tree_navigation
data: {"active_path": ["linear", "info.md"], "accessed_files": [...], "module_counts": {...}}
```

### Frontend

**DecisionTreePanel:**
- Breadcrumb display showing current path
- Simple module list with access counts
- Active module highlighting

**State Management:**
- Add `treeState` to `ChatState` interface
- Handle `tree_navigation` events in `useChatStore`

## Implementation Scope

**In Scope:**
- Basic path tracking on Read operations
- Simple tree visualization with breadcrumbs
- Module access counting
- Active path highlighting

**Out of Scope:**
- Complex error handling
- File content previews
- Interactive tree nodes
- Click-to-navigate functionality
- Usage analytics beyond basic counting
- Automated tests

## Success Criteria

1. Claude reading a file updates the tree visualization
2. Breadcrumb shows correct navigation path
3. Active module is highlighted
4. Module access counts increment correctly
5. Tree persists across session messages

## Technical Constraints

- Minimal changes to existing codebase
- No external dependencies
- FastAPI/React stack compatibility
- Session-scoped state only

## Next Steps

1. Implement backend tree state tracking in `chat.py`
2. Add SSE event emission for tree_navigation
3. Update frontend ChatState interface
4. Create DecisionTreePanel component
5. Integrate into ContextPanel
6. Test end-to-end with sample Claude requests
