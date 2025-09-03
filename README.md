# bbhced_nhimx

This workspace now includes a Chrome extension prototype that scrapes the NHI IMU medication page and organizes a patient's medications from the last 6 months.

Files added:
- `manifest.json` - extension manifest
- `src/content.js` - content script that scrapes the page and classifies meds
- `src/popup.html`, `src/popup.js`, `src/popup.css` - popup UI to view categorized meds

Quick load instructions (developer mode):
1. Open Chrome -> Extensions -> Load unpacked.
2. Select this repository folder.
3. Go to the NHI IMU page and log in / navigate to the patient's medication tab.
4. Open the extension popup to view categorized medications. Use "重新抓取" to trigger a re-scrape.

Assumptions and notes:
- The content script uses heuristics to find medication tables and text; the real page structure may require adjustments.
- Important classes detected: SGLT2, Antiplatelet (aspirin, clopidogrel etc.), NOAC (dabigatran, rivaroxaban, apixaban, edoxaban), Warfarin, Heparin/Enoxaparin (Clexane).
- Date parsing is heuristic and may need locale-specific tweaks for Taiwanese date formats.

Next steps you may want:
- Share the HTML structure or a sanitized example of the medication tab so I can make the scraper accurate.
- Add export (CSV) and print features.
- Add better date parsing and language/encoding handling.
