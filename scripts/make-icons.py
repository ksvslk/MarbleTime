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

# 24×24 stroke icons from the design canvas (docs/03 §12).
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

FILLED = {
    "sparkle": '<path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z" fill="#FFFFFF"/>',
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
    for name, body in STROKE.items():
        render(name, f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" '
                     f'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">{body}</svg>', 192)
    for name, body in FILLED.items():
        render(name, f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">{body}</svg>', 96)
    for name, (view_box, body) in ART.items():
        render(name, f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view_box}">{body}</svg>', 384)
    print(f"wrote {len(STROKE) + len(FILLED) + len(ART)} icons to {OUT}")


if __name__ == "__main__":
    main()
