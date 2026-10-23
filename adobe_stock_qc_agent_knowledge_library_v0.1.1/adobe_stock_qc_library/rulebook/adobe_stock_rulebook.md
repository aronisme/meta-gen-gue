# Adobe Stock Rulebook for QC Agent

**Version:** 0.1.1  
**Research checked:** 2026-10-22  
**Current scope:** still images, especially AI-generated JPEG/transparent PNG.  
**Explicitly excluded:** Adobe Stock catalogue similarity search and batch/portfolio similarity.

## How to interpret this rulebook

- `official_policy` / `technical_requirement` / `official_quality_standard` means grounded in a public Adobe source.
- `internal_heuristic_grounded_in_quality_standards` means an engineering check that is useful but is **not** a verbatim standalone Adobe rule.
- `BLOCK` means a confirmed hard requirement failure or confirmed policy violation.
- `REVIEW` means context, rights, provenance, or visual interpretation is uncertain.
- `READY` means only that configured checks found no known issue; it never guarantees Adobe acceptance.
- A model confidence score is not a calibrated probability unless a validation set demonstrates that calibration.

## Rules index

| Rule | Domain | Summary | Default handling |
|---|---|---|---|
| `AS-MOD-001` | moderation | Adobe moderates each submission against technical, legal, metadata, creative/commercial value and other criteria; documented refusal categories include technical issues, IP, metadata/non-compliance and generative-AI anomalies. | Informational context only |
| `AS-PHOTO-TECH-001` | technical_photo | Photo submissions must be JPEG, 4-100 MP, max 45 MB, sRGB, without watermarks, timestamps or branding; image should be sharp and well-lit. | BLOCK_IF_CONFIRMED |
| `AS-PNG-TECH-001` | technical_png | PNG submission requirements include 4-100 MP, max 45 MB, sRGB, true transparent background and no watermark/timestamp/branding. Quality guidance also requires clarity, preserved details, minimal excess space and no decorative frame. | BLOCK_IF_CONFIRMED |
| `AS-VECTOR-TECH-001` | technical_vector | Vector requirements specify max 45 MB, artboard 15-65 MP, RGB mode and artboard offset/origin (0,0). Vector quality should be clean, scalable and editable. | BLOCK_IF_CONFIRMED |
| `AS-VIDEO-TECH-001` | technical_video | Adobe video requirements list formats, 5-60 second duration, max 3900 MB, accepted frame rates and supported native resolutions. Video QC is out of initial JPEG/PNG MVP scope. | BLOCK_IF_CONFIRMED |
| `AS-AI-001` | generative_ai | Contributor must have the necessary rights to submit content generated with AI tools for commercial licensing; verify the tool's terms and license. | REVIEW when unknown; BLOCK when no commercial submission rights are confirmed |
| `AS-AI-002` | generative_ai | Content created with generative AI tools must be labeled using the appropriate 'Created using generative AI tools' checkbox. Adobe notes some limited edits (e.g., background extension, removing distracting objects or background recoloring) are not necessarily required to be labeled; changes/additions to a primary subject and certain material modifications are examples requiring labeling. | HIGH |
| `AS-AI-003` | generative_ai | For AI content depicting, based on, or intended to portray an identifiable real person, Adobe requires a model release. If AI content was not based on a real person but visually resembles a person/property, select the 'People and Property are fictional' checkbox. If there are no recognizable people or property, the box may be left unchecked. | HIGH |
| `AS-AI-004` | generative_ai | Photo-realistic AI content that looks like a camera-captured real-world photo belongs in Photos; artistic/imaginary/fantasy content that would not appear in real life belongs in Illustrations. Generative AI content cannot be submitted as Illustrative Editorial. | HIGH |
| `AS-AI-005` | generative_ai | Generative AI prompts, titles and keywords must not include artist names, real people or fictional character names, references to creative works still under copyright, government agency names, third-party IP references or descriptions implying an actual newsworthy event. | HIGH |
| `AS-VIS-001` | visual_quality | Review images at 100% zoom; the main subject should be sharp and clearly defined. Unintentional softness/blur or important subject detail out of focus may cause refusal. | HIGH |
| `AS-VIS-002` | visual_quality | Avoid over- or underexposure, lost detail, unbalanced lighting/exposure, poor white balance and unnatural color correction. | HIGH |
| `AS-VIS-003` | visual_quality | Avoid excessive noise, compression artifacts, over-editing, over-sharpening, excessive saturation, dust spots and chromatic aberration/color fringing. | MEDIUM_HIGH |
| `AS-VIS-004` | visual_quality | AI-generated content must be checked for unintentional anatomy, proportions, inaccurate details and other visual errors in humans and animals. | HIGH |
| `AS-VIS-005` | visual_quality | Check object integrity, impossible joins, duplicated/melted parts, texture discontinuities, shadows/reflections that conflict with scene geometry, and unintended gibberish text as internal QC indicators for AI-image artifacts. | MEDIUM_HIGH |
| `AS-IP-001` | ip_rights | Visible logos, trademarks, brand names, recognizable product packaging or distinctive protected designs may cause IP refusal. Removing a logo does not make all protected products/designs acceptable. | HIGH |
| `AS-IP-002` | ip_rights | Model release may be needed for a recognizable person. Adobe's guidance notes recognition may come from face, voice, tattoos, clothing or specific surroundings. Property release scenarios include clearly visible private homes, artwork/gallery/murals and recognizable products/designs; generic buildings/public landscapes can differ; some landmarks are restricted even with release. | HIGH |
| `AS-IP-003` | ip_rights | Adobe's Known Restrictions list contains examples of designs, products and locations not acceptable for commercial submissions. Adobe explicitly states that the list is updated periodically and is not all-inclusive. | HIGH |
| `AS-META-001` | metadata | Title should be brief, accurate, focused on the visible content, ideally under 70 characters. Avoid IP references, artist names and real-person names. Up to 49 keywords is stated on the metadata tips page, with the first ten prioritized by search. | MEDIUM |
| `AS-PNG-002` | technical_png | For transparent PNG assets, minimize empty surrounding canvas, isolate edges cleanly, only keep shadows where useful/integral, use true transparency and avoid decorative borders; do not submit the same work both as JPEG and PNG. | MEDIUM |
| `AS-POLICY-001` | content_policy | Adobe lists hateful or defamatory content among potential non-compliance refusal reasons; other policy restrictions may depend on subject and context. | REVIEW for potential/contextual issue; BLOCK only for a confirmed rule violation |

## Important caveats

1. **Do not run similarity checks in this version.** That subsystem is explicitly out of scope.
2. **Do not determine AI provenance using only an AI detector.** Prefer a generation/editing manifest and ask the contributor if it is missing.
3. **Do not set `People and Property are fictional` merely because no release file exists.** This is a factual declaration, and UNKNOWN must stay UNKNOWN until confirmed.
4. **Do not auto-inpaint and mark an IP issue cleared.** A distinctive protected design may remain restricted even after a logo is removed.
5. **Adobe Known Restrictions is not all-inclusive.** Refresh it; a match is a review signal and a no-match is not legal clearance. The accompanying watchlist is a partial cache, not a full mirror of Adobe's list.
6. **Keyword count varies across public pages:** the metadata tips page says up to 49; some photo/PNG submission pages say 5–50. Default to 49, make the rule configurable, and preserve source/page date.
7. **Localized page timestamps can differ.** Record the canonical URL and retrieval date; prefer the live canonical content over assuming the newest date in a regional mirror.
8. **No blanket legal certainty:** QC is a preflight risk-reduction system, not legal advice or an Adobe moderation simulator.

## Supported content-type baseline

### Photo JPEG
- 4–100 MP; maximum file size 45 MB; JPEG; sRGB; no watermarks, timestamps or branding; sharp focus and good lighting.
- Review people/property release and IP conditions separately.

### Transparent PNG
- 4–100 MP; maximum 45 MB; PNG with true transparency; sRGB; no watermarks, timestamps or branding.
- Check for baked checkerboard, opaque matte, edge halos, jagged cutout boundaries, excessive empty canvas, decorative frame and unwanted shadow residue.

### Vector and video
- Official technical specs are in the rule JSON and source list, but detailed validators are future work. Do not silently apply the JPEG rules to vectors/video.
