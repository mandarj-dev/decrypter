# Decryption & Log Reader — Unified Design Plan

## 1. Overview

Create a unified dark-mode developer utility dashboard for debugging encrypted API responses and inspecting API logs.

### Core design principle

> **One workspace → two workflows → shared visual language.**

The two workflows are:

- **Decrypt** — decrypt an encrypted API response using a secret key.
- **Log Reader** — upload and parse API log files, using the same secret key when required.

Both workflows should feel like parts of the same application rather than separate pages.

---

## 2. Header

Use a single application header instead of separate header styles.

### Header structure

**Left**
- Security/utility icon
- `Decryption & Log Reader`
- Supporting text: `Decrypt encrypted responses and inspect API logs`

**Right**
- Connection/status indicator
- Current time
- `API Routes` button

Example:

```text
[ 🔐 ]  Decryption & Log Reader
        Decrypt encrypted responses and inspect API logs

                                       ● 11:03:09
                                       [ {} API Routes ]
```

The header should remain compact and should not consume excessive vertical space.

---

## 3. Primary Navigation

Immediately below the header, introduce a segmented workspace switcher.

```text
┌───────────────────────────────────────────────┐
│  🔒 Decrypt        ☷ Log Reader               │
└───────────────────────────────────────────────┘
```

### Active state

The selected mode should have:

- Purple/indigo background or glow
- White text
- Small icon
- Subtle bottom or outer highlight

### Inactive state

- Transparent/dark background
- Muted text

This replaces the existing top-level toggle and makes the relationship between the tools obvious.

---

# 4. Decrypt Workspace

The Decrypt mode should use a two-column workspace.

## Left — Input

Card title:

**Decrypt Response**

Supporting text:

> Enter your secret key and encrypted data to decrypt the response.

### Secret Key

```text
Secret Key
┌──────────────────────────────────────────────┐
│ Enter your secret key...                Show │
└──────────────────────────────────────────────┘
```

### Encrypted Data

```text
Encrypted Data (Base64)

┌──────────────────────────────────────────────┐
│ Paste encrypted response here...             │
│                                              │
│                                              │
│                                              │
└──────────────────────────────────────────────┘
```

### Actions

```text
[ 🔓 Decrypt ]   [ Copy/Paste ]   [ Clear ]
```

### Status bar

At the bottom of the input card:

```text
● Ready — enter your secret key and encrypted data
                              Ctrl + Enter to decrypt
```

Keep the status visible instead of relying only on transient notifications.

---

# 5. Decrypted Output

The right side should be treated like a lightweight developer code viewer.

### Header

```text
Decrypted Output

[ Copy ] [ Format ] [ Minify ] [ Wrap ] [ Download ]
```

### Output area

Use a large code/editor area:

```text
┌───────────────────────────────────────────────┐
│ 1                                             │
│                                               │
│                                               │
│                                               │
│                                               │
└───────────────────────────────────────────────┘
```

### Output requirements

- Monospace font
- Line numbers
- Syntax highlighting when JSON is detected
- Horizontal scrolling
- Optional word wrap
- Clear empty state before decryption

### Layout ratio

The output should be larger than the input.

Recommended:

**40% input / 60% output**

The decrypted response is the primary inspection target, so it should receive more visual space.

---

# 6. Log Reader Workspace

The Log Reader should reuse the exact same card language and visual system.

## Header

```text
Log Reader

Upload or parse API log files to view and analyze
request & response logs.
```

On the right:

```text
[ Secret key... Show ] [ Upload ] [ Parse Logs ] [ Clear ]
```

The Log Reader should feel like an operational debugging workspace rather than a simple upload page.

---

# 7. Upload Area

Below the Log Reader header, use a large drag-and-drop zone.

```text
┌──────────────────────────────────────────────────────────┐
│                                                          │
│                         ↑                                │
│                                                          │
│                  Drop API log files here                 │
│                                                          │
│          or click Upload · .txt · .log                  │
│                 · multiple files supported               │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

Use the same dark surface as the rest of the application.

## Upload interaction states

### Idle

- Dashed border
- Muted upload icon
- Neutral text

### Drag over

- Purple border
- Purple glow
- Slightly brighter background

### Files uploaded

Replace the empty state with file cards:

```text
✓ api-production.log        2.4 MB
✓ api-errors.log             845 KB

                         [ Parse Logs ]
```

---

# 8. Parsed Log View

After logs are parsed, do not simply dump them into a text area.

Create a log analysis workspace.

Example:

```text
┌───────────────────────────────────────────────────────────┐
│ Logs (248)                     [Search logs...] [Filters] │
├───────────────────────────────────────────────────────────┤
│ 11:02:41  POST /orders       200   142ms                 │
│ 11:02:43  POST /returns      401   84ms                  │
│ 11:02:46  GET  /shipments    200   213ms                 │
│ 11:02:49  POST /orders       500   421ms                 │
└───────────────────────────────────────────────────────────┘
```

Clicking a log should open an expandable detail panel.

### Log details

```text
Request
  Headers
  Payload

Response
  Headers
  Encrypted Payload
  Decrypted Payload
```

This makes the Log Reader substantially more useful than a basic text viewer.

---

# 9. Shared Design System

Both tools should share the same component language.

## Color palette

```text
Background       #0B0C0F
Panel             #111318
Elevated panel    #171A21
Border            #252934
Primary           Indigo / Purple
Success           Green
Warning           Amber
Error             Red
Primary text      #F1F3F7
Secondary text    #9AA2B1
Muted text        #646C7D
```

The primary accent should be used sparingly for:

- Active tabs
- Primary buttons
- Focus states
- Selected logs
- Important status indicators

---

# 10. Typography

Use a clean UI font such as:

- Inter
- Geist
- SF Pro

For API payloads and logs:

- JetBrains Mono
- Geist Mono

### Suggested sizing

```text
Application title       24–28px
Section title           18px
Field label             12–13px
Body                    14px
Code                    13–14px
Metadata                11–12px
```

---

# 11. Component Language

Use consistent:

- 8–12px border radius
- Thin borders
- Subtle shadows
- Compact buttons
- Consistent iconography
- 8px spacing system

Avoid making every element look like a floating card.

The workspace itself should be the main container, with cards and controls inside it.

---

# 12. Recommended Information Architecture

```text
Decryption & Log Reader
│
├── Header
│   ├── App identity
│   ├── Status
│   └── API Routes
│
├── Workspace Switcher
│   ├── Decrypt
│   └── Log Reader
│
├── Decrypt
│   ├── Input
│   │   ├── Secret Key
│   │   ├── Encrypted Data
│   │   ├── Decrypt
│   │   └── Status
│   │
│   └── Output
│       ├── Copy
│       ├── Format
│       ├── Minify
│       ├── Wrap
│       └── Download
│
└── Log Reader
    ├── Secret Key
    ├── Upload
    ├── Parse
    ├── File List
    ├── Log List
    ├── Search / Filters
    └── Log Details
        ├── Request
        ├── Response
        └── Decrypted Payload
```

---

# 13. Key UX Direction

Do not simply merge the two existing screens visually.

The product should feel like:

> **A developer debugging console with two modes.**

### Decrypt answers:

> “I have an encrypted response — let me inspect it.”

### Log Reader answers:

> “I have API logs — let me parse, search, and inspect them.”

### Shared secret key

The secret key should be treated as a shared concept between both workflows rather than an independent control duplicated in different places.

This creates a coherent product experience while keeping the two workflows clearly separated.

---

# 14. Suggested Implementation Phases

## Phase 1 — Unified shell

- Build common dark theme
- Create application header
- Add Decrypt / Log Reader segmented navigation
- Establish spacing, typography, colors, borders, and button styles

## Phase 2 — Decrypt workflow

- Secret key input
- Encrypted Base64 input
- Decrypt action
- Persistent status bar
- Output code viewer
- Copy / Format / Minify / Wrap / Download controls

## Phase 3 — Log Reader workflow

- Shared secret key input
- Upload button
- Drag-and-drop zone
- Multiple file support
- Uploaded file list
- Parse Logs action
- Clear/reset state

## Phase 4 — Log analysis

- Parsed log table/list
- Search
- Filters
- HTTP method
- Status code
- Response time
- Request/response detail drawer
- Encrypted/decrypted payload viewer

## Phase 5 — Polish

- Loading states
- Empty states
- Error states
- Drag/drop animations
- Button hover/focus states
- Keyboard shortcuts
- Responsive behavior
- Accessibility
- Performance optimization

---

# 15. Final Design Goal

The finished application should feel like a **small internal developer tool / API debugging console**, not two independent utilities placed on the same page.

The visual hierarchy should be:

```text
Application
    ↓
Workspace / Mode
    ↓
Task
    ↓
Input / Controls
    ↓
Result / Analysis
```

The most important principle is:

> **Keep the interface visually unified, but keep each workflow operationally focused.**
dec