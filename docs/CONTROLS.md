# Arcade controls refinement

7 September 2026.

The cabinet's buttons now use satin surfaces, softer outlines and a short press response. Navigation remains flat; primary actions use a cyan keycap. Classic and Chaos share one recessed selector with a distinct selected light, while avatar cards retain their artwork with a cleaner selection border.

Form controls use consistent spacing and dark surfaces. Supporting browsers also render the native dropdown picker with rounded options and a visible selection check. The implementation uses CSS progressive enhancement and preserves standard select/option markup, keyboard selection and the native fallback. Reference: [MDN customizable selects](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Forms/Customizable_select).

Audio sliders have slim tracks and larger thumb indicators. Saved values are unchanged. Mobile challenge options stack vertically to keep their complete labels readable. The first Escape key closes an open native picker; the second closes its parent dialog.

Changes are restricted to presentation, selector grouping and Escape handling. There are no contract, API, financial, database, music or session-format changes. The documentation's button styles and its four feature screenshots are updated.

Before release: TypeScript checking passed. Chrome and Edge visual checks at 1440 and 360 pixels exercised mode switching, keyboard and pointer selection, slider touch control and saved preferences. The existing responsive browser suite now includes the picker/dialog Escape regression.

Backup `20260907T102459Z` completed on the VPS and its private offsite copy was checksum-verified. Retain the current `6ad6559ed049b808568f9f3770de42f4f469d399` release and `pongit-web:controls-previous` image for rollback. Only the web container needs replacement; financial services remain running.

GitHub publication remains pending repository write access. The local commits and deployed source are retained independently of GitHub.
