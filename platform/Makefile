.PHONY: dev reset e2e

PORT ?= 9090

E2E_VIDEO_DIR ?= ../e2e-videos

e2e:
	uv run pytest tests/browser --video=on --output=$(E2E_VIDEO_DIR) -v

e2e-one:
	@if [ -z "$(T)" ]; then echo "Usage: make e2e-one T=test_chat" >&2; exit 1; fi
	uv run pytest tests/browser/$(T).py --video=on --output=$(E2E_VIDEO_DIR) -v

dev:
	@cd frontend && [ -d node_modules ] || pnpm install
	@cleanup() { \
	    jobs -p | xargs -r kill -TERM 2>/dev/null; \
	    lsof -ti tcp:$(PORT) 2>/dev/null | xargs -r kill -TERM 2>/dev/null; \
	    wait 2>/dev/null; \
	  }; \
	  trap cleanup INT TERM EXIT; \
	  PORT=$(PORT) uv run python -m src.dev & \
	  (cd frontend && PORT=$(PORT) pnpm dev)

reset:
	rm -rf src/modules-repo
	cd src/context && find . -mindepth 1 ! -name 'CLAUDE.md' -exec rm -rf {} + 2>/dev/null || true
