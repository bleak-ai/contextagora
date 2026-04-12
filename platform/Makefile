.PHONY: reset

reset:
	rm -rf src/modules-repo
	cd src/context && find . -mindepth 1 ! -name 'CLAUDE.md' -exec rm -rf {} + 2>/dev/null || true
