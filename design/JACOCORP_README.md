# JACO CORP

The visual identity of JACO CORP, the economics fest. It is built from one piece of artwork — the **crest**: an eagle with spread, feathered wings holding a wireframe globe, drawn as a charcoal shield outlined in gold, set on black with sweeping champagne light. Everything here takes its cue from that: **black, charcoal and one gold**, formal and a little ceremonial, like an embossed invitation.

## Content fundamentals

- **Voice:** confident, formal, economical. Speak like a summit programme, not a party flyer. Short declarative lines: "Four rounds. One market."
- **Case:** titles and labels set in Cinzel, which is capitals-only — write them in title case in source and let the face do the rest. Body copy is sentence case.
- **Names:** always **JACO CORP**, two words, all capitals. Never "Jaco Corp" in display type, never abbreviated.
- **Numbers:** rounds and events as numerals with a leading zero in eyebrows ("Event 02"); money and figures in body text as figures, not words.
- No emoji. No exclamation marks in headings.

## Visual foundations

**Colour.** The system is dark-first: the primary theme is **Night**, taken directly from the artwork (`surface` #070302 field, `surface-raised` #121619 crest fill, `gold` #d8b870). A **Parchment** light theme exists for print and documents; its grounds are derived, not from the artwork.

- Gold is the only accent. Use it for outlines (`stroke-crest`), rules, the primary action and focus — not as a wash over large areas. A screen should read as mostly black with gold drawing on it.
- `gold` as text works only on dark grounds. On Parchment, gold words use `gold-text` (#7a5c1e); gold *fills* keep #d8b870 with `on-gold` text.
- `sheen` and `bronze` come from the silk light in the background. They're for atmosphere — glows, dividers, chart fills — never for text or controls.
- `night` and `emblem` never change with theme: use them wherever the crest or a hero band must stay black.

**Type.** Cinzel (display, capitals, generous tracking) over EB Garamond (text). Both load from Google Fonts. Keep Cinzel to titles, eyebrows and buttons; never set paragraphs in it.

**Shape.** Frames are the crest's language: a charcoal field with a 2px gold outline and softly rounded corners (`radius-md` 8px). Buttons and inputs use `radius-sm`. No drop shadows — depth comes from charcoal on black and the gold line.

**Imagery.** Dark photography or the silk-light background from the crest artwork. Keep imagery warm and low-key; no saturated colour, no blue-purple gradients.

## The crest (logo)

Two uploads in **Logos**: `jaco-crest.png` (the crest cropped with its background) and `jaco-crest-hero.png` (the full portrait artwork). Both are raster screenshots of the artwork with the background baked in.

- Place the crest on `night` or `surface` in the Night theme; give it at least `space-16` of clear space.
- Don't recolour, outline, stretch or place it on Parchment — its black background would show as a box. For light layouts, put it inside a `night` band.
- No wordmark was supplied: set the name in Cinzel 600, tracked 0.04em, in `ink` or `gold-text`.

## Iconography

None supplied. If icons are needed, use thin-line outline icons at `stroke-crest` weight in `gold-text`, matching the crest's single-weight gold line.

## Open items

- A **vector (SVG) crest** on a transparent background — needed for print, merch and light layouts.
- Confirm the Parchment light theme and the Cinzel + EB Garamond pairing (chosen, not from brand files).
- An official tagline, if JACO CORP has one.
