# Original Quarrel pixel art

Ported from quarrel-v1/src/components/pixel-art.tsx and src/themes/art/*.tsx; original
provenance notes: quarrel-v1/public/art/ART.md. The source repository is read-only.

These are original SVG pixel-art designs, not traced film characters, purchased asset packs
or external images. Leo is a golden lion with a rust-orange mane and turquoise neckerchief;
Zuri is a zebra in a coral vest; Judge Moki is a ring-tailed lemur with robe and gavel.
Rook is an original teal-and-gold superhero, not Batman/Robin artwork, costume or branding.
The rooftop uses genre scenery, Vale wears a fedora/trench coat, Rowan wears judicial robes.
Lawyers and three-member jury panels use original shared head/suit/animal drawing helpers.
All artwork is bundled locally, with no image-service credentials or runtime AI calls.

## Port and rendering

- Drawing function bodies, path data, fills and transforms are unchanged from v1. Shared
  helpers/palettes live in primitives/. Components are split per asset; judge/player/lawyer
  wrappers use primitives/SvgFrame.tsx. Background pattern IDs and all accessible SVG titles
  use React useId, so arena and catalog instances can render together safely.
- Bench and jury files are static exports of v1's rendered SVG geometry (jury includes its
  rail). They have no internal IDs; each external image is an isolated SVG document.
- Verified at port time: 24 drawing functions match v1 source and all 8 standalone SVG bodies
  match v1's rendered bodies. No build, install or write was performed in v1.
- ViewBoxes: backgrounds 960x440, benches 192x92, actors/lawyers 96x112, jury 192x112.
  Preserve crispEdges, body/mouth groups, transparent bounds and ground/nameplate anchors.
- Jungle retains its embedded wide/compact responsive groups at 850px; its art stays inline.
  Other scenes preserve their original scenery groups; stage cropping is responsive CSS.
- Motion is CSS idle/speaking only: same drawing, not alternate pose frames. OS reduced motion,
  gallery reduced motion and per-asset paused controls stop motion, never debate clocks.
- Player characters and lawyers are global choices, duplicates allowed; judge/jury/scenery
  remain theme-bound. Descriptions/personality are catalog metadata, not part of the drawing.
- UI fonts: locally bundled Pixelify Sans Variable and DM Sans Variable from their approved
  @fontsource-variable packages; retain those packages' font licenses. No Tailwind is needed.

## Full inventory (32 assets)

IDs are namespaced registry keys; paths are relative to ui/src/assets/. Catalog IDs can
differ from asset IDs (e.g. jungle-lion -> character:lion). Native theme records origin only.

| Registry ID | File | v1 drawing | Native theme |
| --- | --- | --- | --- |
| background:jungle | backgrounds/jungle.tsx | pixel-art.tsx / JungleBackdrop | jungle |
| background:superhero | backgrounds/superhero.tsx | art/backgrounds.tsx / SuperheroBackground | superhero |
| background:detective | backgrounds/detective.tsx | art/backgrounds.tsx / DetectiveBackground | detective |
| background:courtroom | backgrounds/courtroom.tsx | art/backgrounds.tsx / CourtroomBackground | courtroom |
| character:lion | characters/lion.tsx | pixel-art.tsx / Lion | jungle |
| character:zebra | characters/zebra.tsx | pixel-art.tsx / Zebra | jungle |
| character:superhero-scout | characters/superhero-scout.tsx | art/characters.tsx / HeroScout | superhero |
| character:superhero-inventor | characters/superhero-inventor.tsx | art/characters.tsx / HeroInventor | superhero |
| character:detective-reporter | characters/detective-reporter.tsx | art/characters.tsx / DetectiveReporter | detective |
| character:detective-witness | characters/detective-witness.tsx | art/characters.tsx / DetectiveWitness | detective |
| character:courtroom-advocate-a | characters/courtroom-advocate-a.tsx | art/characters.tsx / AdvocateA | courtroom |
| character:courtroom-advocate-b | characters/courtroom-advocate-b.tsx | art/characters.tsx / AdvocateB | courtroom |
| judge:lemur | judges/lemur.tsx | pixel-art.tsx / Lemur | jungle |
| judge:superhero-rook | judges/superhero-rook.tsx | art/characters.tsx / HeroRook | superhero |
| judge:detective-vale | judges/detective-vale.tsx | art/characters.tsx / DetectiveVale | detective |
| judge:courtroom-rowan | judges/courtroom-rowan.tsx | art/characters.tsx / CourtJudge | courtroom |
| lawyer:jungle-lawyer-a | lawyers/jungle-lawyer-a.tsx | art/sidekicks.tsx / ToucanCounsel | jungle |
| lawyer:jungle-lawyer-b | lawyers/jungle-lawyer-b.tsx | art/sidekicks.tsx / CapybaraCounsel | jungle |
| lawyer:superhero-lawyer-a | lawyers/superhero-lawyer-a.tsx | art/sidekicks.tsx / HeroCounselA | superhero |
| lawyer:superhero-lawyer-b | lawyers/superhero-lawyer-b.tsx | art/sidekicks.tsx / HeroCounselB | superhero |
| lawyer:detective-lawyer-a | lawyers/detective-lawyer-a.tsx | art/sidekicks.tsx / NoirCounselA | detective |
| lawyer:detective-lawyer-b | lawyers/detective-lawyer-b.tsx | art/sidekicks.tsx / NoirCounselB | detective |
| lawyer:courtroom-lawyer-a | lawyers/courtroom-lawyer-a.tsx | art/sidekicks.tsx / CourtCounselA | courtroom |
| lawyer:courtroom-lawyer-b | lawyers/courtroom-lawyer-b.tsx | art/sidekicks.tsx / CourtCounselB | courtroom |
| bench:jungle | benches/jungle.svg | pixel-art.tsx / JudgeBench | jungle |
| jury:jungle-jury | juries/jungle.svg | art/sidekicks.tsx / JuryBox | jungle |
| bench:superhero | benches/superhero.svg | art/benches.tsx / SuperheroBench | superhero |
| jury:superhero-jury | juries/superhero.svg | art/sidekicks.tsx / JuryBox | superhero |
| bench:detective | benches/detective.svg | art/benches.tsx / DetectiveBench | detective |
| jury:detective-jury | juries/detective.svg | art/sidekicks.tsx / JuryBox | detective |
| bench:courtroom | benches/courtroom.svg | art/benches.tsx / CourtroomBench | courtroom |
| jury:courtroom-jury | juries/courtroom.svg | art/sidekicks.tsx / JuryBox | courtroom |
