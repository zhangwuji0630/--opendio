# opendio UI Information Architecture Lock

Current decision: opendio has separated interaction layers. Do not collapse all functions into the white-card player.

## Page layers

### 1. Radio Home (`/`, first-level page)

Purpose: main AI radio interaction surface.

Reference: user's supplied screenshots / original blogger video main app UI. Must preserve the Claudio pixel aesthetic, not a generic dashboard.

Owns:
- persistent chat input
- user ↔ Claudio replies
- now playing summary
- playback controls
- queue overview
- profile/taste entry
- settings/status entry
- route into player detail

Visual constraints:
- pixel / dot-matrix language
- restrained black/white/green status color
- original Claudio-like spacing and texture
- no debug pills as product UI
- no generic dark SaaS dashboard
- no free design unless user asks

Implementation rule:
- First make a static structure draft.
- User visually confirms before wiring full functionality.

### 2. Player Detail (`/player`, second-level page)

Purpose: focused player detail page.

Reference: existing restored Claudio white-card player.

Owns:
- current song detail
- white vertical waveform
- transcript / lyrics / DJ narration
- basic play/pause and progress
- small top-right component entries only

Must NOT own:
- main persistent chat
- full queue management
- backend/provider debug status
- large settings/profile panels
- first-level app dashboard functions

Visual constraints:
- keep existing white-card player aesthetics
- do not redesign layout
- only add lightweight top-right components if needed

### 3. Profile / Taste panel

Purpose: Claudio identity and user taste.

Entry:
- from Radio Home primarily
- optional small entry from Player Detail top-right

Owns:
- Claudio profile
- taste.md / routines / mood rules summary
- tags and stats

## Immediate next steps

1. Clean current white-card page back to Player Detail: remove/weakly hide main-home functions.
2. Create a separate Radio Home static draft file, not served as `/` until visually approved.
3. Do not overwrite current working page with an unapproved homepage.

## Safety

- No privateKey/secrets in docs or code.
- Keep netease-cli + mpv backend working.
- Small edits only.
