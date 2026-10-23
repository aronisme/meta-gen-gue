# Adobe Stock QC Agent Knowledge Library

**Version:** 0.1.1  
**Research last checked:** 2026-10-22  
**Language:** Indonesian/English hybrid labels; source rules preserved in plain language.

## Contents

- `rulebook/adobe_stock_rulebook.json` — machine-readable policy and technical rules with severity, automation guidance and source IDs.
- `rulebook/adobe_stock_rulebook.md` — human-readable rulebook summary and implementation caveats.
- `visual_qc/visual_qc_taxonomy.json` — machine-readable visual-defect taxonomy and per-check detection strategy (now includes policy-context screening).
- `visual_qc/visual_qc_index.csv` — spreadsheet-friendly index of visual QC checks.
- `visual_qc/visual_qc_pipeline.md` — suggested pipeline, metrics caveats and verdict logic.
- `prompts/visual_inspector_system_prompt.md` — starting system prompt for a vision-language model.
- `schemas/qc_report.schema.json` — proposed JSON Schema for QC reports.
- `examples/qc_report_example.json` — synthetic schema example, not an actual image review.
- `sources/sources.json` — source catalog including source class, last-updated metadata and use in the library.

## Included now

1. Still image technical preflight for JPEG photos and transparent PNG.
2. Visual AI-QC checks: anatomy, face, animals, object geometry, unintended text, sharpness, exposure, color, noise/compression, overprocessing, reflections/shadows as heuristic, composition, transparency edges, visible IP screening, metadata/visual alignment.
3. Adobe rulebook: AI content rights and labeling, AI prompt/title/keyword restrictions, content type, model/property release checks, known restrictions warning, title/keyword guidance and technical specs.
4. Human-in-the-loop handling and traceable evidence.

## Excluded on purpose

- **Similarity checks** against Adobe Stock catalogue or local portfolio; explicitly skipped per instruction.
- Automatic submission/upload.
- Claiming an asset is legally cleared from pixels alone.
- Using generic AI-image detection to decide whether the user must declare AI.
- A universal `Laplacian variance` blur threshold or universal VLM confidence threshold.

## Data model principles

1. Preserve `source_class`: official Adobe policy, internal heuristic, or research background.
2. A detection result must include specific evidence and region when possible.
3. Use `BLOCK` only for confirmed hard requirement/policy failure; use `REVIEW` when context or legal facts are uncertain.
4. Keep facts about people/property and tool license as `unknown` until the contributor confirms them.
5. `READY` means no known issue was detected by the configured tests; it is not an acceptance guarantee.
6. `Known restrictions` is a live, non-exhaustive Adobe list. The local library should refresh its link/cache periodically.

## Build priority

**MVP:** JPEG + transparent PNG, deterministic checks, crops, VLM review, IP/metadata preflight, report generation.  
**Phase 2:** vector structure checks and video checks using official per-type requirements.

## Refresh cadence

Check official sources at least monthly, and whenever a refusal reason suggests a rule changed. Save the page title, URL, live update date if present, retrieval date, exact relevant excerpt, and hash of the stored source snapshot. Update rules with `source_ids`; do not overwrite history silently.
