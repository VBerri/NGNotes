# Report Framework Templates

This folder holds report templates the app can offer as structure guidance.

- **Curated templates** (`.doc`, `.docx`, `.rtf`) — e.g. `IEEE Template.docx`, `Monthly Report Template.docx`, `Patient Care Report Template.docx`. These ship with the app, are listed by `/api/report-templates`, and are read-only from the UI (they can't be edited or deleted through the app).
- **User-saved templates** (`.txt`) — created automatically when you use "Save as template" in the app. These store *section headings only*, never document content, and can be renamed, edited, or deleted from the Manage Templates screen in the UI.

When a template is selected for generation, its section headings are passed to the model as a soft style/structure reference — the actual note content always takes priority over the template's wording.

Files starting with `~$` (Microsoft Office lock files, created automatically while a `.docx` is open elsewhere) are ignored by the app and safe to delete.
