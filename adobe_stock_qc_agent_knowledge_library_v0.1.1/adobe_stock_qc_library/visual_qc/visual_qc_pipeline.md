# AI Visual QC: Inspection library

**Version:** 0.1.1 · **Checked:** 2026-10-22  
**Scope:** single-image inspection only. Similarity checks intentionally skipped.

## Inspection protocol

1. Load the final delivery file, not only the generator preview. Preserve a read-only original.
2. Run deterministic file checks first: decode status, format, pixel dimensions, MP, file size, color profile and (for PNG) alpha channel.
3. Render the entire image, then inspect at native size / 100% zoom. Do not upscale a small input and treat the invented pixels as evidence.
4. Detect subject regions and risk regions. Generate crop evidence for hands, face, animals, product joins, text/signage, high-contrast boundaries and transparent edges where relevant.
5. Run objective image metrics as *signals*: focus/sharpness, clipping, noise, edge halos, alpha-edge contamination. Do not use one global metric as an unconditional reject threshold.
6. Run a vision-language review using the structured prompt in `../prompts/visual_inspector_system_prompt.md`. Require concrete evidence and an uncertainty label.
7. Run policy checks independently: watermark/branding, possible IP, metadata alignment, AI label and releases/provenance.
8. Aggregate into BLOCK / REVIEW / READY. Keep every individual check and its source provenance in the report.

## Defect families

See `visual_qc_taxonomy.json` for machine-readable checks. The taxonomy includes anatomy, face, animal anatomy, object geometry, unintended text, focus, exposure, color/white balance, noise/compression, overprocessing, reflections/shadows, composition, PNG alpha edges, IP screening and metadata-image alignment.

## Metric cautions

- **Laplacian variance / edge energy:** useful as a blur signal, not a universal pass/fail threshold. It varies with texture, image size, sharpening, subject matter and intended depth of field. Calibrate by asset type and review subject crops.
- **OCR:** misses small/curved/stylized/multilingual text and may hallucinate text on texture. OCR findings trigger review; OCR absence does not prove there is no text/IP.
- **Logo/object detectors:** model training coverage is incomplete; lookalikes and generic shapes can false-positive. Preserve crops and source.
- **VLM:** useful for semantic inspection but may overlook tiny pixel defects, hallucinate defects, or confidently describe invisible evidence. Force it to say `not_observable` or `uncertain` where appropriate.
- **Generic AI-image detector:** do not make it the main quality classifier or provenance source. The ICLR 2026 research page notes that binary AI-image detectors often lack fine-grained, interpretable evidence. Our goal is quality defects in the image, not to guess how it was generated.
- **Aesthetic score:** optional product signal only, not an Adobe compliance rule. Commercial value is contextual and cannot be reduced to one style score.

## Evidence standard

Every finding needs at least: `check_id`, `status`, `severity`, `confidence`, `evidence_type`, `region` (bounding box or crop id when available), `observation`, `why_it_matters`, `source_class`, `source_ids`, `suggested_action`, and `requires_human_review`. If no region can be located for a visual flaw, the model must say so and lower the status to REVIEW/UNCERTAIN rather than assert a defect as fact.

## Verdict logic

- `BLOCK`: only a deterministic hard spec failure or an explicitly confirmed policy failure.
- `REVIEW`: visually questionable, possible IP/release issue, missing provenance, uncertain interpretation or detector disagreement.
- `READY`: all configured checks ran and nothing is flagged. It must be worded “no known issues detected”; never “Adobe will accept this.”

## Initial implementation scope

**MVP:** raster JPEG and transparent PNG, still images only.  
**Phase 2:** vector structural checks and video frame/technical checks.  
**Excluded for now:** marketplace similarity, portfolio clustering, automatic uploads, and automatic legal-clearance claims.
