# ChatGPT Chat Exporter (Chrome Extension)

This is a MV3 Chrome extension that injects an exporter into the active ChatGPT tab and downloads JSON files named by chat title.

## Install (unpacked)

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select this folder: `workspace/utilities/chatgpt-export-extension`

## Use

1. Go to `https://chatgpt.com/` and open any chat.
2. Make sure the left sidebar is open and shows the **Chats** list.
3. Click the extension icon:
   - **Export current chat** downloads one JSON file.
   - **Export all visible chats** iterates the currently loaded sidebar chat list and downloads one JSON per chat.

If Chrome prompts you to allow multiple downloads, allow it.

## Options

Open the extension’s **Options** page (from the popup) to configure:

- Delay between chats
- Max chats to export
- Auto-scroll sidebar to load more chats
- Load/settle timeouts

## Notes

- It exports chats that are currently present in the sidebar list (scrolling in the sidebar loads more; the script also tries to scroll to load more).
- It uses DOM selectors and may need updates if ChatGPT’s UI changes.

## Publishing checklist

- Icons: `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`
- Privacy policy: `PRIVACY.md`
- License: `LICENSE`
- Listing draft: `STORE_LISTING.md`
