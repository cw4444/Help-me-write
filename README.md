
# Help Me Write

An AI-powered writing assistant that runs on your own computer. You bring the story — Help Me Write helps you keep writing, tighten your prose, track your characters, and brainstorm ideas without any of it leaving your machine.

---

## What does it actually do?

- **Collaborate** — stuck mid-scene? Help Me Write continues the story from where you left off, matching your tone and style
- **Edit** — paste a passage and it'll tidy up typos, awkward phrasing, and continuity slips
- **Character memory** — build profiles for your characters (appearance, voice, backstory, relationships) and Help Me Write keeps track of them as the story evolves
- **Continuity review** — flags moments where a character acts out of character or contradicts themselves, so you can decide whether it's a mistake or a plot twist
- **Scratchpad** — a place to dump ideas, chapter notes, and inspiration that links back to your story
- **Style controls** — dial in your tone, writing style, and content intensity

Your API key never leaves your computer. It goes from your browser to the local app running on your machine — that's it.

---

## Quick start (no terminal experience needed)

You'll need two things before you start:

**1. An AI API key**

Help Me Write uses either OpenAI or Anthropic to do the AI stuff. You only need one.

- **OpenAI** — sign up at [platform.openai.com](https://platform.openai.com), go to API keys, and create one
- **Anthropic** — sign up at [console.anthropic.com](https://console.anthropic.com), go to API keys, and create one

Both have free trial credit when you sign up. Copy your key somewhere safe.

**2. Node.js**

This is the engine that runs Help Me Write locally. Download the LTS version from [nodejs.org](https://nodejs.org) and install it like any other program.

---

### Running Help Me Write

**On Windows:**

1. Download this project — click the green **Code** button at the top of this page, then **Download ZIP**
2. Unzip the folder somewhere on your computer
3. Open the folder, then open a terminal in it:
   - Hold **Shift** and right-click inside the folder → **Open PowerShell window here** (or **Open Terminal here**)
4. Type this and press Enter:
   ```
   npm install
   ```
5. Once that finishes, type this and press Enter:
   ```
   npm run dev
   ```
6. Open your browser and go to **http://localhost:3000**
7. Paste your API key into the Settings panel and you're off

**On Mac:**

1. Download and unzip the project (same as above)
2. Open **Terminal** (search for it in Spotlight with Cmd+Space)
3. Drag the project folder into the Terminal window — it'll type the path for you. Press Enter
4. Run:
   ```
   npm install
   ```
   Then:
   ```
   npm run dev
   ```
5. Open **http://localhost:3000** in your browser

> The terminal window needs to stay open while you're using Help Me Write. When you're done, press **Ctrl+C** in the terminal to stop it.

---

## For the technically inclined

### Stack

- **Next.js 15** (App Router) with **React 19**
- All AI calls are proxied through Next.js API routes — the client never calls OpenAI/Anthropic directly
- No database — project state persists in `localStorage`, exportable as JSON
- No auth layer — designed for single-user local use

### API providers

| Provider | Streaming | Non-streaming |
|---|---|---|
| Anthropic | `/v1/messages` (SSE) | `/v1/messages` |
| OpenAI | `/v1/chat/completions` (SSE) | `/v1/chat/completions` |

API version headers: `anthropic-version: 2024-06-01`

### Running locally

```bash
npm install
npm run dev
```

### Project structure

```
app/
  api/
    generate/   # Streaming story generation + editing
    review/     # Continuity + typo review (non-streaming)
    memory/     # Character sheet updates from story content (non-streaming)
  page.tsx      # Entire client — single-page app
```

### Security model

- API keys are submitted per-request from the client to the local Next.js server in the POST body
- The server never stores or logs keys
- Raw API error bodies are logged server-side only; the client receives a sanitized status code message
- Intended for local use — if you deploy this publicly, add an auth layer before exposing the API routes

### Ubuntu bootstrap script

```bash
bash scripts/bootstrap-and-run.sh
```

Installs Node via nvm if needed, runs `npm install`, and starts the dev server.

---

## Credits

Built collaboratively with AI assistance — human direction and product taste by [cw444](https://github.com/cw4444), implementation and debugging support by Claude (Anthropic). See [CREDITS.md](./CREDITS.md) for the full breakdown.
