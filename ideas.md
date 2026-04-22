# Ideas

## Run Claude Code with minimal system prompt (`--system-prompt "."`)

Opus 4.7 may reason better in CC with the default system prompt stripped. Our slash commands + appended `context/CLAUDE.md` already carry the instructions, so the CC default is largely redundant. Worth testing on benchmarks and one-shot calls (summary, auto-detect) first; keep `--append-system-prompt` for chat where tone matters.
