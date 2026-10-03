# Zippy knowledge base

Every `*.md` file here (except this one) is embedded into Zippy's vector store by
`POST /api/internal/zippy/ingest` (n8n workflow 06 or `npm`-free curl, see
`docs/n8n-webhook-setup.md`).

Each file starts with front matter:

    ---
    source: manual | faq | guide | policy | menu
    audience: all | customer | vendor | delivery | admin
    title: Short human title
    ---

Content is split on `##` and `###` headings, so each section should answer one
question on its own. Never put secrets, keys, internal developer notes or
anything from CLAUDE.md / MEMORY.md here.
