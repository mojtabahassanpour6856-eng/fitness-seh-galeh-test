# MuscleMap integration preview — Fitness Seh Galeh

This isolated experiment vendors the MIT-licensed MuscleMap anatomy assets.

## Included
- Male and female front/back diagrams.
- Individually addressable muscle paths and left/right surface IDs.
- Four bundled grayscale body photos aligned to traced paths.
- All assets load locally; no runtime CDN dependency.
- Persian interactive exercise-to-muscle mapping preview.
- Primary, secondary and tertiary activation layers; region filters; click-to-inspect.

## Upstream
- Project: https://github.com/Jsplice/MuscleMap
- Package release inspected: 1.1.0.
- License: MIT. Upstream LICENSE is included as LICENSE-MUSCLEMAP.txt.
- Upstream asset provenance states that muscle paths are original traced vector work and the body photos are AI-generated demo references, manually edited and released under MIT.

## Limitations
- This is a standalone preview, not yet wired to the production workout planner or student records.
- Exercise-to-muscle associations are an initial coach-reviewable mapping, not a clinical reference.
- Some typed groups have no traced path in upstream diagrams (for example, hip flexors).
- Upstream describes the body photos as demo assets and recommends replacing them with branded imagery for production/marketing.
- No production app files, Supabase data, student records, or production deployment were changed by this experiment.
