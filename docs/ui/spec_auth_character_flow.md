# Auth -> Character -> Loading -> Enter World Flow

## Scope

This spec documents the implemented client UX flow for:

- Account auth (`signin` / `signup`)
- Character selection/creation
- Loading and connection stages
- Enter-world handoff into active gameplay HUD
- Reconnect/back-to-menu behavior

Primary implementation files:

- `client/index.html`
- `client/menu.js`
- `client/auth.js`
- `client/client.js`
- `client/connection.js`
- `client/ui.js`
- `client/style/menu.css`
- `client/style/overlay.css`

## 1. Menu State Model

Menu root (`#menu`) tracks three public dimensions:

- `data-step`: `auth | characters | create`
- `data-tab`: `signin | signup` (only meaningful in `auth` step)
- `data-progress`: `account | character | enter`

`menu.getState()` includes these values plus selected/primary character IDs for automated checks.

## 2. Step Definitions

### 2.1 Account (`data-progress="account"`)

- Visible step: `auth`
- Tabs:
  - Sign In
  - Create Account
- Field-level validation:
  - Username: `^[a-zA-Z0-9_]{3,20}$`
  - Password: 8-64 chars
- Async status line (`#menu-status`) is always present (`aria-live="polite"`).

### 2.2 Character (`data-progress="character"`)

- Visible step: `characters` or `create`
- Characters step includes:
  - account label
  - last-played label
  - smart continue panel (`#menu-continue-panel`) when a primary character exists
  - character rows with class role + level
- Smart continue target resolution:
  1. saved last-played character ID if still valid
  2. first available character

### 2.3 Enter (`data-progress="enter"`)

- Triggered on connect initiation (`connectCharacter`)
- Menu shows entering status and transitions into loading overlay.

## 3. CTA Behavior

### 3.1 Primary actions

- Auth step:
  - `Sign In`
  - `Create Account`
- Character step:
  - `Continue` (smart continue)
  - row-level `Play`
  - `Create Character`
- Create step:
  - `Create`

### 3.2 Secondary actions

- `Sign Out`
- `Delete`
- `Back` from create step

## 4. Character Creation UX

- Local validation:
  - Name: `^[A-Za-z0-9 ]{3,16}$`
  - Class: valid class ID
- Class preview panel shows:
  - class name
  - role
  - shared metadata blurb from `shared/classes.js`

## 5. Loading Stage Semantics

Loading overlay API accepts:

- `stage` (headline)
- `message` (detail text)
- `progress` (0-100 determinate)
- `indeterminate` (boolean)

Implemented stages:

1. `Preparing session`
2. `Loading world assets`
3. `Connecting realm`
4. `Syncing world state`

Connection stage callbacks (`connection.start(..., { onStageChange })`):

- `socket_open`
- `awaiting_welcome`
- `world_ready`

Determinate mode is used for asset preload progress; indeterminate mode is used during socket handshake/snapshot wait.

## 6. Error and Retry UX

### 6.1 Auth/character errors

- Server errors are mapped to clearer user-facing messages in `client/auth.js`.
- Field errors and section errors are both used:
  - field errors: local validation failures
  - section error: request-level failure summary

### 6.2 Reconnect overlay

- On unexpected disconnect, error overlay offers:
  - Reconnect
  - Back to menu
- Reconnect uses exponential backoff and status updates.

## 7. Enter-World Handoff

After successful world sync:

- Loading transitions to finalizing message
- Entry banner appears (`#entry-banner`) with character/class context
- Banner auto-hides after timeout or early on movement input

## 8. Accessibility and Motion

- Menu root uses `aria-busy` during async operations.
- Status line and loading regions use `aria-live`.
- Global reduced-motion profile (`prefers-reduced-motion: reduce`) disables non-essential transitions/animations.

## 9. Keyboard Path

Auth/create/connect path is keyboard-completable via focus + Enter submit.
E2E verifies keyboard-driven auth and create submit behavior.

## 10. Non-Goals

- No backend contract changes (HTTP auth, character APIs, WS ticket flow unchanged).
- No protocol version changes.
