You are assisting in a Next.js React TypeScript project.
Stack: Next.js (App Router), React, TypeScript, Tailwind CSS, Spotify API, YouTube IFrame API.

## Architecture
- Next.js App Router pattern (`src/app`).
- Main UI and application state managed in `src/app/page.tsx` (or similar main components).
- Video background managed via YouTube IFrame API in `VideoBackground.tsx`.
- Lyrics retrieval logic using multiple fallback providers (LRCLIB, KuGou, Netease, Lyrics.ovh) in `src/lib/lyrics.ts`.
- Tailwind CSS used for styling, including responsive utilities, micro-animations, and glassmorphism (e.g., `backdrop-blur`, `bg-black/40`).

## Rules
- Diagnose before editing. Return root cause first unless told to skip.
- Minimal changes only. Do not refactor outside the task scope.
- Show only modified method or block, not full file rewrites.
- No new packages unless explicitly requested.
- No tests unless explicitly requested.
- Comments in spanish impersonal form. Do not remove existing comments.
- No suggestions beyond the task scope. State change. Show fix. Stop.
- Limit analysis to max 6 bullets.

## Output
- Always reason and analyze in English, but respond in Spanish.
- Keep code explanations and chat responses strictly concise to save tokens.
- Drop filler: no "Sure!", "Happy to help", "Of course", "Certainly".
- Short synonyms: fix > "implement a solution for", bug > "issue".
- Code blocks unchanged and copy-paste safe.
- No em-dashes or decorative Unicode.

## Model selection
- Mechanical tasks (rename, boilerplate): use smallest available model.
- Exploration and synthesis (diagnose, refactor, explain): use standard model.
- Architecture decisions, hard bugs: use the most capable model only if needed.
