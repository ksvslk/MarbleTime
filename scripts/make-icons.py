#!/usr/bin/env python3
"""Render the design canvas's SVG icons to PNGs that both the Fire OS and the Vega build can show.

Monochrome icons are drawn white and recoloured in the app with the Image `tintColor` style.
Multi-colour art (avatars, apple, jar logo) keeps its own colours.

Usage: python3 scripts/make-icons.py   (needs `rsvg-convert`: brew install librsvg)
"""
import pathlib
import subprocess
import tempfile

OUT = pathlib.Path(__file__).resolve().parent.parent / "tv/packages/shared/src/assets/icons"

# 24×24 stroke icons from the design canvas (docs/03 §12). hourglass, thumbs and message are Lucide's
# (ISC licence, see THIRD_PARTY_NOTICES.md); the others are ours.
STROKE = {
    "toys": '<path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9.5 15h5"/><circle cx="8" cy="7.5" r="3.5"/><rect x="13" y="3.5" width="6.5" height="6.5" rx="1.5"/>',
    "cat": '<path d="M12 20.5c-4.4 0-8-2.8-8-7V3.5l4.2 3.4A8.4 8.4 0 0 1 12 6c1.4 0 2.7.3 3.8.9L20 3.5v10c0 4.2-3.6 7-8 7z"/><path d="M9 12v.5M15 12v.5"/><path d="M12 15v1M10.2 17c.7.6 1.3.6 1.8 0 .5.6 1.1.6 1.8 0"/><path d="M1.5 13.5l4 .8M1.5 16.5l4-.6M22.5 13.5l-4 .8M22.5 16.5l-4-.6"/>',
    "tooth": '<path d="M7.5 3C5 3 3.5 4.8 3.5 7.3c0 2.2 1 3.7 1.5 5.7.6 2.6.9 8 2.9 8 1.7 0 1.6-5.5 4.1-5.5s2.4 5.5 4.1 5.5c2 0 2.3-5.4 2.9-8 .5-2 1.5-3.5 1.5-5.7C20.5 4.8 19 3 16.5 3c-1.9 0-2.8 1-4.5 1S9.4 3 7.5 3z"/><path d="M7 8c.3-1.2 1.1-2 2.3-2.2"/>',
    "moon": '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/><path d="M18.5 2.5v3M17 4h3"/>',
    "hourglass": '<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/>',
    "thumbs": '<path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/>',
    "play": '<path d="M7 4.5v15l12.5-7.5z"/>',
    "speaker": '<path d="M11 5L6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>',
    "check": '<path d="M5 12l5 5L20 7"/>',
    "lock": '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    "lockopen": '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.6-1.7"/>',
    "undo": '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    "broom": '<path d="M12 2v9"/><path d="M8.5 11h7v3h-7z"/><path d="M8.5 14L5 21h14l-3.5-7"/><path d="M10 17.5v3.5M14 17.5v3.5"/>',
    "clock": '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    "shapes": '<circle cx="7" cy="7" r="4"/><path d="M17 3l4.5 8h-9z"/><rect x="3.5" y="14" width="7" height="7" rx="1"/><circle cx="17" cy="17.5" r="3.5"/>',
    "message": '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
}

# Job icons from Lucide 1.52.0 (https://lucide.dev, ISC licence; see THIRD_PARTY_NOTICES.md): our name → (Lucide name, SVG).
# The AI picks a job's icon from this set plus our own job icons above (JOB_ICONS in tv/packages/shared/src/marble/data.ts).
LUCIDE = {
    "bed": ("bed", '<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>'),
    "shirt": ("shirt", '<path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/>'),
    "laundry": ("washing-machine", '<path d="M3 6h3"/><path d="M17 6h.01"/><rect width="18" height="20" x="3" y="2" rx="2"/><circle cx="12" cy="13" r="5"/><path d="M12 18a2.5 2.5 0 0 0 0-5 2.5 2.5 0 0 1 0-5"/>'),
    "trash": ("trash-2", '<path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'),
    "recycle": ("recycle", '<path d="M7 19H4.815a1.83 1.83 0 0 1-1.57-.881 1.785 1.785 0 0 1-.004-1.784L7.196 9.5"/><path d="M11 19h8.203a1.83 1.83 0 0 0 1.556-.89 1.784 1.784 0 0 0 0-1.775l-1.226-2.12"/><path d="m14 16-3 3 3 3"/><path d="M8.293 13.596 7.196 9.5 3.1 10.598"/><path d="m9.344 5.811 1.093-1.892A1.83 1.83 0 0 1 11.985 3a1.784 1.784 0 0 1 1.546.888l3.943 6.843"/><path d="m13.378 9.633 4.096 1.098 1.097-4.096"/>'),
    "table": ("utensils", '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>'),
    "cook": ("chef-hat", '<path d="M17 21a1 1 0 0 0 1-1v-5.35c0-.457.316-.844.727-1.041a4 4 0 0 0-2.134-7.589 5 5 0 0 0-9.186 0 4 4 0 0 0-2.134 7.588c.411.198.727.585.727 1.041V20a1 1 0 0 0 1 1Z"/><path d="M6 17h12"/>'),
    "wash": ("droplets", '<path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"/><path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97"/>'),
    "shower": ("shower-head", '<path d="m4 4 2.5 2.5"/><path d="M13.5 6.5a4.95 4.95 0 0 0-7 7"/><path d="M15 5 5 15"/><path d="M14 17v.01"/><path d="M10 16v.01"/><path d="M13 13v.01"/><path d="M16 10v.01"/><path d="M11 20v.01"/><path d="M17 14v.01"/><path d="M20 11v.01"/>'),
    "bath": ("bath", '<path d="M10 4 8 6"/><path d="M17 19v2"/><path d="M2 12h20"/><path d="M7 19v2"/><path d="M9 5 7.621 3.621A2.121 2.121 0 0 0 4 5v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/>'),
    "dog": ("dog", '<path d="M11.25 16.25h1.5L12 17z"/><path d="M16 14v.5"/><path d="M4.42 11.247A13.152 13.152 0 0 0 4 14.556C4 18.728 7.582 21 12 21s8-2.272 8-6.444a11.702 11.702 0 0 0-.493-3.309"/><path d="M8 14v.5"/><path d="M8.5 8.5c-.384 1.05-1.083 2.028-2.344 2.5-1.931.722-3.576-.297-3.656-1-.113-.994 1.177-6.53 4-7 1.923-.321 3.651.845 3.651 2.235A7.497 7.497 0 0 1 14 5.277c0-1.39 1.844-2.598 3.767-2.277 2.823.47 4.113 6.006 4 7-.08.703-1.725 1.722-3.656 1-1.261-.472-1.855-1.45-2.239-2.5"/>'),
    "fish": ("fish", '<path d="M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.47-3.44 6-7 6s-7.56-2.53-8.5-6Z"/><path d="M18 12v.5"/><path d="M16 17.93a9.77 9.77 0 0 1 0-11.86"/><path d="M7 10.67C7 8 5.58 5.97 2.73 5.5c-1 1.5-1 5 .23 6.5-1.24 1.5-1.24 5-.23 6.5C5.58 18.03 7 16 7 13.33"/><path d="M10.46 7.26C10.2 5.88 9.17 4.24 8 3h5.8a2 2 0 0 1 1.98 1.67l.23 1.4"/><path d="m16.01 17.93-.23 1.4A2 2 0 0 1 13.8 21H9.5a5.96 5.96 0 0 0 1.49-3.98"/>'),
    "bird": ("bird", '<path d="M16 7h.01"/><path d="M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20"/><path d="m20 7 2 .5-2 .5"/><path d="M10 18v3"/><path d="M14 17.75V21"/><path d="M7 18a6 6 0 0 0 3.84-10.61"/>'),
    "rabbit": ("rabbit", '<path d="M13 16a3 3 0 0 1 2.24 5"/><path d="M18 12h.01"/><path d="M18 21h-8a4 4 0 0 1-4-4 7 7 0 0 1 7-7h.2L9.6 6.4a1 1 0 1 1 2.8-2.8L15.8 7h.2c3.3 0 6 2.7 6 6v1a2 2 0 0 1-2 2h-1a3 3 0 0 0-3 3"/><path d="M20 8.54V4a2 2 0 1 0-4 0v3"/><path d="M7.612 12.524a3 3 0 1 0-1.6 4.3"/>'),
    "plant": ("sprout", '<path d="M14 9.536V7a4 4 0 0 1 4-4h1.5a.5.5 0 0 1 .5.5V5a4 4 0 0 1-4 4 4 4 0 0 0-4 4c0 2 1 3 1 5a5 5 0 0 1-1 3"/><path d="M4 9a5 5 0 0 1 8 4 5 5 0 0 1-8-4"/><path d="M5 21h14"/>'),
    "leaf": ("leaf", '<path d="M11 20a10 10 0 0010-10 25.9 25.9 0 00-1.04-7.281 1 1 0 00-1.755-.325C15.833 5.5 13 5.5 9.8 6.1A7 7 0 0011 20"/><path d="M2 21a5 5 0 012.911-4.544C7.613 15.212 8.351 15.24 11 13"/>'),
    "snow": ("snowflake", '<path d="m10 20-1.25-2.5L6 18"/><path d="M10 4 8.75 6.5 6 6"/><path d="m14 20 1.25-2.5L18 18"/><path d="m14 4 1.25 2.5L18 6"/><path d="m17 21-3-6h-4"/><path d="m17 3-3 6 1.5 3"/><path d="M2 12h6.5L10 9"/><path d="m20 10-1.5 2 1.5 2"/><path d="M22 12h-6.5L14 15"/><path d="m4 10 1.5 2L4 14"/><path d="m7 21 3-6-1.5-3"/><path d="m7 3 3 6h4"/>'),
    "book": ("book-open", '<path d="M12 5v16"/><path d="M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z"/>'),
    "pencil": ("pencil", '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>'),
    "backpack": ("backpack", '<path d="M4 10a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M8 10h8"/><path d="M8 18h8"/><path d="M8 22v-6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>'),
    "music": ("music", '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
    "paint": ("palette", '<path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"/><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>'),
    "puzzle": ("puzzle", '<path d="M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z"/>'),
    "bike": ("bike", '<circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>'),
    "shoes": ("footprints", '<path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"/><path d="M16 17h4"/><path d="M4 13h4"/>'),
    "car": ("car", '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>'),
    "shopping": ("shopping-basket", '<path d="m15 11-1 9"/><path d="m19 11-4-7"/><path d="M2 11h20"/><path d="m3.5 11 1.6 7.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6l1.7-7.4"/><path d="M4.5 15.5h15"/><path d="m5 11 4-7"/><path d="m9 11 1 9"/>'),
    "spray": ("spray-can", '<path d="M3 3h.01"/><path d="M7 5h.01"/><path d="M11 7h.01"/><path d="M3 7h.01"/><path d="M7 9h.01"/><path d="M3 11h.01"/><rect width="4" height="4" x="15" y="5"/><path d="m19 9 2 2v10c0 .6-.4 1-1 1h-6c-.6 0-1-.4-1-1V11l2-2"/><path d="m13 14 8-2"/><path d="m13 19 8-2"/>'),
    "sofa": ("sofa", '<path d="M20 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v3"/><path d="M2 16a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v1.5a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5V11a2 2 0 0 0-4 0z"/><path d="M4 18v2"/><path d="M20 18v2"/><path d="M12 4v9"/>'),
    "lamp": ("lamp", '<path d="M12 12v6"/><path d="M4.077 10.615A1 1 0 0 0 5 12h14a1 1 0 0 0 .923-1.385l-3.077-7.384A2 2 0 0 0 15 2H9a2 2 0 0 0-1.846 1.23Z"/><path d="M8 20a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1z"/>'),
    "baby": ("baby", '<path d="M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5"/><path d="M15 12h.01"/><path d="M19.38 6.813A9 9 0 0 1 20.8 10.2a2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1"/><path d="M9 12h.01"/>'),
    "heart": ("heart", '<path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"/>'),
    "water": ("glass-water", '<path d="M5.116 4.104A1 1 0 0 1 6.11 3h11.78a1 1 0 0 1 .994 1.105L17.19 20.21A2 2 0 0 1 15.2 22H8.8a2 2 0 0 1-2-1.79z"/><path d="M6 12a5 5 0 0 1 6 0 5 5 0 0 0 6 0"/>'),
    "fruit": ("apple", '<path d="M12 6.528V3a1 1 0 0 1 1-1h0"/><path d="M18.237 21A15 15 0 0 0 22 11a6 6 0 0 0-10-4.472A6 6 0 0 0 2 11a15.1 15.1 0 0 0 3.763 10 3 3 0 0 0 3.648.648 5.5 5.5 0 0 1 5.178 0A3 3 0 0 0 18.237 21"/>'),
    "veggie": ("carrot", '<path d="M15 16a1 1 0 0 0-7-7q-4 4-5.987 12.385a.5.5 0 0 0 .602.602Q11 20 15 16l-3-3"/><path d="M15 9q4 4 7 0-3-4-7 0 4-4 0-7-4 3 0 7"/><path d="m8 15-2.58-2.58"/>'),
    "sun": ("sun", '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>'),
    "mail": ("mail", '<path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"/><rect x="2" y="4" width="20" height="16" rx="2"/>'),
    "star": ("star", '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>'),
}

# Interface icons from Lucide (same licence): the two groups on the kid's board.
LUCIDE_UI = {
    # On the jar's time chip: what the minutes are for.
    "tv": ("tv", '<path d="m17 2-5 5-5-5"/><rect width="20" height="15" x="2" y="7" rx="2"/>'),
    "home": ("house", '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
    "games": ("gamepad-2", '<line x1="6" x2="10" y1="11" y2="11"/><line x1="8" x2="8" y1="9" y2="13"/><line x1="15" x2="15.01" y1="12" y2="12"/><line x1="18" x2="18.01" y1="10" y2="10"/><path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"/>'),
}

FILLED = {
    # The next character, not made yet: a creature's shape with nothing in it (ours). The app sets a "?" on it.
    "mystery": '<g fill="#FFFFFF"><path d="M18.4 16.8c2.8.4 4-1.2 4.4-2.8-1.6.8-2.8.4-4 0z"/><ellipse cx="12.4" cy="16" rx="6.8" ry="5.2"/><rect x="8.4" y="19.6" width="2.4" height="2.8" rx="1"/><rect x="14" y="19.6" width="2.4" height="2.8" rx="1"/><path d="M6 4.8l1.2-2.8 1.6 2.4zM12 4.4l2-2.4.4 3z"/><circle cx="10" cy="8.8" r="4.8"/></g>',
    "sparkle": '<path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z" fill="#FFFFFF"/>',
    # An earned star: the outlined star (Lucide's, above) filled in, so it reads as lit next to the ones still to earn.
    "starfull": '<path fill="#FFFFFF" stroke="#FFFFFF" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
}

# Multi-colour art, viewBox 0 0 200 200 (avatars) or 0 0 100 100 (apple) or 24 (logo).
ART = {
    "bear": ("0 0 200 200", '<circle cx="52" cy="58" r="28" fill="#8A5530"/><circle cx="148" cy="58" r="28" fill="#8A5530"/><circle cx="52" cy="58" r="14" fill="#D9A07A"/><circle cx="148" cy="58" r="14" fill="#D9A07A"/><circle cx="100" cy="112" r="72" fill="#A8693F"/><ellipse cx="100" cy="140" rx="36" ry="28" fill="#F1D2B3"/><ellipse cx="100" cy="128" rx="13" ry="9" fill="#1D2147"/><path d="M100 137v9M88 148c6 7 18 7 24 0" fill="none" stroke="#1D2147" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="74" cy="102" r="9" fill="#1D2147"/><circle cx="126" cy="102" r="9" fill="#1D2147"/><circle cx="77" cy="99" r="3" fill="#FFFFFF"/><circle cx="129" cy="99" r="3" fill="#FFFFFF"/><circle cx="58" cy="132" r="10" fill="#FF8FA3" opacity="0.55"/><circle cx="142" cy="132" r="10" fill="#FF8FA3" opacity="0.55"/>'),
    "bunny": ("0 0 200 200", '<ellipse cx="74" cy="56" rx="19" ry="46" fill="#FFFFFF" transform="rotate(-8 74 56)"/><ellipse cx="126" cy="56" rx="19" ry="46" fill="#FFFFFF" transform="rotate(8 126 56)"/><ellipse cx="74" cy="60" rx="8" ry="32" fill="#FFB3C1" transform="rotate(-8 74 60)"/><ellipse cx="126" cy="60" rx="8" ry="32" fill="#FFB3C1" transform="rotate(8 126 60)"/><circle cx="100" cy="124" r="64" fill="#FFFFFF"/><circle cx="78" cy="116" r="9" fill="#1D2147"/><circle cx="122" cy="116" r="9" fill="#1D2147"/><circle cx="81" cy="113" r="3" fill="#FFFFFF"/><circle cx="125" cy="113" r="3" fill="#FFFFFF"/><ellipse cx="100" cy="134" rx="9" ry="6" fill="#FF8FA3"/><path d="M100 140v7M90 150c5 6 15 6 20 0" fill="none" stroke="#1D2147" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="62" cy="140" r="10" fill="#FF8FA3" opacity="0.5"/><circle cx="138" cy="140" r="10" fill="#FF8FA3" opacity="0.5"/>'),
    "apple": ("0 0 100 100", '<path d="M50 30c-9-8-31-7-35 13-4 21 11 46 27 46 4 0 6-2 8-2s4 2 8 2c16 0 31-25 27-46-4-20-26-21-35-13z" fill="#FF7A59"/><path d="M50 31c0-8 2-14 7-19" fill="none" stroke="#7A4B2A" stroke-width="5" stroke-linecap="round"/><path d="M55 21c5-9 16-10 21-5-5 9-15 10-21 5z" fill="#86E3B8"/><ellipse cx="33" cy="48" rx="6" ry="11" fill="#FFFFFF" opacity="0.45" transform="rotate(20 33 48)"/>'),
    "logo": ("0 0 24 24", '<rect x="6.5" y="2" width="11" height="3.5" rx="1.2" fill="#FF7A59"/><path d="M7.5 5.5v1.2C5.6 7.7 4.5 9.4 4.5 11.5V19a3 3 0 0 0 3 3h9a3 3 0 0 0 3-3v-7.5c0-2.1-1.1-3.8-3-4.8V5.5" fill="none" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.8" cy="17.8" r="2.1" fill="#FFC93C"/><circle cx="14.4" cy="18" r="2.1" fill="#FFC93C"/><circle cx="12.2" cy="14.4" r="2.1" fill="#FFC93C"/>'),
}


def render(name: str, svg: str, px: int) -> None:
    with tempfile.NamedTemporaryFile("w", suffix=".svg", delete=False) as f:
        f.write(svg)
    subprocess.run(["rsvg-convert", "-w", str(px), "-h", str(px), "-o", str(OUT / f"{name}.png"), f.name], check=True)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, body in {**STROKE, **{ours: svg for ours, (_, svg) in {**LUCIDE, **LUCIDE_UI}.items()}}.items():
        render(name, f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" '
                     f'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">{body}</svg>', 192)
    for name, body in FILLED.items():
        render(name, f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">{body}</svg>', 192)
    for name, (view_box, body) in ART.items():
        render(name, f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view_box}">{body}</svg>', 384)
    print(f"wrote {len(STROKE) + len(LUCIDE) + len(LUCIDE_UI) + len(FILLED) + len(ART)} icons to {OUT}")


if __name__ == "__main__":
    main()
