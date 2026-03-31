# StorySmith

Local-friendly writing assistant for collaboration, editing, character memory, and style control.

## Run locally

1. Install dependencies:
   `npm install`
2. Start the app:
   `npm run dev`
3. Open the local URL Next.js prints.

## What it does

- Collaboration mode: AI continues the story from your draft
- Editor mode: AI rewrites for obvious inconsistencies and typos
- Character builder: persistent profile stored in your browser
- Continuity review: flags character conflicts so you can allow or correct them
- Personalisation: writer intro, tone, and house style
- Spice slider: keeps the writing in platform-safe bounds while changing intensity

## Notes

- Your API key is stored locally in the browser and sent to the local Next.js server only when you generate text.
- Supported providers: OpenAI and Anthropic.
