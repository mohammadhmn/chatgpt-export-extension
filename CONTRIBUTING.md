# Contributing

Thanks for your interest in contributing!

## Development

- Chrome (or Chromium): open `chrome://extensions`, enable Developer mode, then “Load unpacked” this repository folder.
- Make changes and reload the extension from the extensions page.

## What to include in PRs

- A clear description of the user-visible change.
- If you update selectors/DOM logic, include screenshots or short notes describing which ChatGPT UI variant you tested.
- Keep the extension MV3-compatible and avoid adding network calls unless absolutely necessary.

## Code style

- Keep changes minimal and readable (no minification).
- Prefer small helper functions over deeply nested logic.
- Avoid adding dependencies unless there is a strong reason.
