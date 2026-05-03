.PHONY: dev reset e2e

PORT ?= 9090

e2e:
	uv run pytest tests/browser --video on --output test-results -v

dev:
	@cd frontend && [ -d node_modules ] || pnpm install
	@cleanup() { \
	    jobs -p | xargs -r kill -TERM 2>/dev/null; \
	    lsof -ti tcp:$(PORT) 2>/dev/null | xargs -r kill -TERM 2>/dev/null; \
	    wait 2>/dev/null; \
	  }; \
	  trap cleanup INT TERM EXIT; \
	  uv run python -m uvicorn src.server:app --reload --port $(PORT) & \
	  (cd frontend && PORT=$(PORT) pnpm dev)

reset:
	rm -rf src/modules-repo
	cd src/context && find . -mindepth 1 ! -name 'CLAUDE.md' -exec rm -rf {} + 2>/dev/null || true
