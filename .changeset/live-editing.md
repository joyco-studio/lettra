---
'lettra': minor
---

Live editing out of the box. `caretLayout` (with `hitTest`, `verticalMove`, `lineEdge`, `wordAt`, `sentenceAt`) gives caret stops from the same pen `layoutRuns` draws with, and rich text handles expose it as `handle.caret`. `createTextDocument` stacks headings and paragraphs with per-block size, line height and letter spacing, falling back to loaded faces while the rest load; `createEditableDocument` adds a blinking caret, selection highlight, pointer hit-testing through the camera and the caret's screen position. The new `lettra/editor` entry (`attachEditor`, optional peers `@tiptap/core` and `@tiptap/pm`) wires a Tiptap editor on a hidden field to it: typing, IME, undo, clipboard, bold/italic, spacing, line moves and multi-click selection. `resolveRichRuns` is exported so measuring code sees the same runs the ink does.
