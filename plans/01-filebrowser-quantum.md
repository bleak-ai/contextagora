# Plan: FileBrowser Quantum Integration

## Goal

Add FileBrowser Quantum to the container so users can visually browse, edit, and manage files inside `/context/` through a web UI — alongside the existing module picker.

## What changes

1. **Add FileBrowser Quantum as a second service** in `docker-compose.yml`
   - Image: `gtstef/filebrowser:stable`
   - Mount the same `context-data` volume at its root path
   - Expose on port `8081`

2. **Add a link in `index.html`** pointing to `http://localhost:8081` so users can jump from the picker to the file browser after loading modules.

3. **That's it.** No config files, no auth setup — just mount and go.

## File changes

```
docker-compose.yml   — add filebrowser service sharing context-data volume
templates/index.html — add "Open File Browser" link
```

## docker-compose.yml addition

```yaml
filebrowser:
  image: gtstef/filebrowser:stable
  ports:
    - "8081:80"
  volumes:
    - context-data:/data
```

Both services share the `context-data` volume:
- FastAPI writes to it at `/app/context/`
- FileBrowser reads/writes at `/data/`
- Same files, two interfaces.

## Verification

1. `docker compose up --build`
2. Open `http://localhost:8080`, load some modules
3. Open `http://localhost:8081`, confirm the same module files appear
4. Edit a file in FileBrowser, verify the change persists
5. Reload modules from the picker, confirm FileBrowser reflects the reset

## Out of scope

- FileBrowser auth/users
- Custom FileBrowser config
- FileBrowser API integration with the picker
