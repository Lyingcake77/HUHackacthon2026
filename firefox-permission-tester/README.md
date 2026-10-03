# Firefox Permission Tester

This Firefox extension tests which permissions can be requested through `browser.permissions` in Firefox. It attempts each permission one-by-one, reports the result, and tracks which ones are treated as granted, denied, or unsupported.

## Files

- `manifest.json` — Firefox extension manifest.
- `popup.html` — extension popup UI.
- `popup.css` — popup styling.
- `popup.js` — permission tests and result rendering.

## Load in Firefox

1. Open Firefox.
2. Go to `about:debugging`.
3. Select `This Firefox`.
4. Click `Load Temporary Add-on...`.
5. Choose the `manifest.json` file in this folder.

## Notes

- Some permissions are valid in the browser permissions model and can be requested at runtime.
- Some permissions are only supported as static manifest permissions and will show as unsupported in this tester.
- Host permissions are also checked via `origins` so the tester can cover common Firefox permission patterns.
- set up an ollama instance using gemma3:4b.
- using bash, add OLLAMA_ORIGINS="moz-extension://*" to whitelist the cors for ollama
- run ollama serve

