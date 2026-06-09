# UI Context

## Theme

VS Code native only. No custom design system. The extension renders inside the VS Code sidebar webview and must look like a built-in panel — not a third-party app. All colors, fonts, spacing, and surfaces inherit from VS Code's active theme via CSS custom properties exposed by the webview environment. This means the UI automatically adapts to any theme the developer has installed — dark, light, high contrast, or custom. No hardcoded hex values anywhere. No Tailwind. No external component library.

## Colors

All components must use VS Code's built-in CSS variables only. These are injected automatically into every webview by VS Code at runtime.

| Role            | CSS Variable                                    | Value                        |
| --------------- | ----------------------------------------------- | ---------------------------- |
| Page background | `--vscode-sideBar-background`                   | Set by active VS Code theme  |
| Surface         | `--vscode-editor-background`                    | Set by active VS Code theme  |
| Header surface  | `--vscode-sideBarSectionHeader-background`      | Set by active VS Code theme  |
| Primary text    | `--vscode-foreground`                           | Set by active VS Code theme  |
| Muted text      | `--vscode-descriptionForeground`                | Set by active VS Code theme  |
| Primary accent  | `--vscode-button-background`                    | Set by active VS Code theme  |
| Accent text     | `--vscode-button-foreground`                    | Set by active VS Code theme  |
| Input background| `--vscode-input-background`                     | Set by active VS Code theme  |
| Input border    | `--vscode-input-border`                         | Set by active VS Code theme  |
| Focus ring      | `--vscode-focusBorder`                          | Set by active VS Code theme  |
| Border          | `--vscode-panel-border`                         | Set by active VS Code theme  |
| Code background | `--vscode-textCodeBlock-background`             | Set by active VS Code theme  |
| Error           | `--vscode-errorForeground`                      | Set by active VS Code theme  |
| Success         | `#4ec94e` (only hardcoded value — status dot)   | Fixed green, not theme-dependent |
| User bubble     | `--vscode-inputOption-activeBackground`         | Set by active VS Code theme  |
| Hover           | `--vscode-list-hoverBackground`                 | Set by active VS Code theme  |
| Badge           | `--vscode-badge-background`                     | Set by active VS Code theme  |

## Typography

VS Code injects its own font variables into every webview. Use these only — never import external fonts.

| Role      | Font                          | Variable                        |
| --------- | ----------------------------- | ------------------------------- |
| UI text   | VS Code UI font (e.g. Segoe UI, SF Pro) | `--vscode-font-family`  |
| Font size | Matches VS Code UI font size  | `--vscode-font-size`            |
| Code/mono | VS Code editor font (e.g. Fira Code, Cascadia) | `--vscode-editor-font-family` |
| Code size | Matches VS Code editor font size | `--vscode-editor-font-size`  |

## Border Radius

No Tailwind. Use raw CSS values only.

| Context              | Value    |
| -------------------- | -------- |
| Inline / small UI    | `4px`    |
| Bubbles / cards      | `8px`    |
| Status dot           | `50%`    |
| Badge / pill         | `10px`   |

## Component Library

None. No shadcn/ui, no Radix, no Tailwind. The webview is plain HTML + CSS + Vanilla JS only. Components are hand-written HTML elements styled with VS Code CSS variables. This keeps the bundle size at zero and ensures full theme compatibility. Any reusable UI pattern (bubble, button, session item) is a function that returns an HTML string or a DOM element — not a framework component.

## Layout Patterns

- **Sidebar panel**: Full-height flex column — header fixed at top, messages area scrollable and flex-growing, input area fixed at bottom. No horizontal scroll ever.
- **Header**: Single row, space-between, contains status dot + model badge on the left and icon buttons on the right. Separated from content by a 1px border using `--vscode-sideBarSectionHeader-border`.
- **History panel**: Collapsible panel between the header and messages area. Max height 180px with its own vertical scroll. Hidden by default, toggled by the history button.
- **Message bubbles**: User bubbles right-aligned at 90% max width. Assistant bubbles full width left-aligned. System/status messages centered with dashed border.
- **Input area**: Fixed at the bottom. Contains a context bar (active filename), a textarea that auto-resizes up to 120px, and a send button. Separated from messages by a 1px top border.
- **Code blocks inside bubbles**: Full-width pre element with `--vscode-textCodeBlock-background`, 1px border, 4px radius, horizontal scroll for long lines.

## Icons

No icon library. Use VS Code's built-in codicon system via unicode characters or VS Code's `$(icon-name)` syntax for command titles in `package.json`. For webview buttons, use plain unicode symbols only — no SVG imports, no Lucide, no external fonts.

| Element          | Symbol | Notes                        |
| ---------------- | ------ | ---------------------------- |
| Send button      | `➤`   | Inline in button element     |
| History toggle   | `🕓`  | Inline in icon button        |
| New session      | `＋`  | Fullwidth plus for clarity   |
| Clear chat       | `🗑`  | Inline in icon button        |
| File indicator   | `📄`  | Context bar prefix           |
| Warning          | `⚠️`  | Error messages in chat       |
| Streaming cursor | `▋`   | Animated via CSS, not an icon |