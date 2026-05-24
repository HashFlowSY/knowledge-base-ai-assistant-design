# Parser Dependency Research

## Scope

Pick dependencies for MVP uploaded-file parsing: PDF, Markdown, and TXT.

## Repo Constraints

* Root runtime engine is Node `>=20.19.0`.
* Package manager is pnpm.
* Upload validation already limits files to PDF, Markdown, and TXT.
* API upload max defaults to 8 MiB, so MVP parsing can be memory-based at first, but worker code should keep parser boundaries narrow enough to replace later with streaming/native parsers.
* Avoid dependencies that require extra system packages unless there is a clear benefit.

## Package Metadata Checked

Collected with `pnpm view` on 2026-05-24.

| Package | Current version | Engine/dependency notes | Source |
| --- | ---: | --- | --- |
| `pdf-parse` | `2.4.5` | Engine `>=20.16.0 <21 || >=22.3.0`; depends on `pdfjs-dist@5.4.296` and `@napi-rs/canvas@0.1.80`; unpacked size about 21 MB. | https://www.npmjs.com/package/pdf-parse / https://github.com/mehmet-kozan/pdf-parse |
| `unpdf` | `1.6.2` | No direct dependencies in package metadata; peer dependency `@napi-rs/canvas`; unpacked size about 2 MB. | https://www.npmjs.com/package/unpdf / https://github.com/unjs/unpdf |
| `pdfjs-dist` | `5.7.284` | Latest engine `>=22.13.0 || >=24`, which conflicts with repo Node `>=20.19.0`; optional dependency `@napi-rs/canvas`; unpacked size about 35 MB. | https://www.npmjs.com/package/pdfjs-dist / https://github.com/mozilla/pdf.js |
| `marked` | `18.0.4` | Engine `>=20`; no dependencies; fast Markdown lexer/parser. | https://www.npmjs.com/package/marked / https://marked.js.org |
| `mdast-util-from-markdown` | `2.0.3` | No engine metadata; multiple micromark/mdast dependencies; better AST fidelity if heading/source structure matters later. | https://www.npmjs.com/package/mdast-util-from-markdown / https://github.com/syntax-tree/mdast-util-from-markdown |

## Findings

* PDF is the only MVP format that requires a real parser dependency.
* TXT can be decoded with `TextDecoder` after upload validation has rejected binary/control-heavy files.
* Markdown can be treated as text for MVP normalization/chunking while preserving headings as source text. A Markdown AST dependency is only needed if chunking must attach semantic heading paths or strip formatting aggressively.
* Directly depending on latest `pdfjs-dist` is risky because its Node engine requirement is stricter than the repo's current engine.
* `pdf-parse` is the pragmatic PDF candidate for Node 20 compatibility and simple text extraction, but it brings a native canvas dependency transitively.
* `unpdf` is lighter, but still declares `@napi-rs/canvas` as a peer and would require more API validation during implementation.

## Feasible Approaches

### A. Recommended MVP: `pdf-parse` for PDF, no Markdown parser dependency

Use `pdf-parse` for PDF text extraction. Decode TXT/Markdown as UTF-8 text, normalize line endings/spacing, preserve Markdown headings in raw text, then chunk on text structure.

Trade-offs:
* Fastest path to a working upload ingestion pipeline.
* Keeps Markdown/TXT dependency-free.
* Adds a PDF package with native canvas dependency footprint.
* PDF extraction quality is text-layer dependent; scanned PDFs remain out of scope.

### B. Lighter PDF wrapper: `unpdf`, no Markdown parser dependency

Use `unpdf` for PDF extraction and plain decoding for Markdown/TXT.

Trade-offs:
* Smaller package footprint.
* May require more implementation investigation and peer dependency handling.
* Still not a native-free PDF story if rendering/canvas features become required.

### C. Richer Markdown structure: PDF parser plus Markdown AST parser

Use a PDF parser and `mdast-util-from-markdown` for heading-aware Markdown chunk metadata.

Trade-offs:
* Better citation/source locator metadata for Markdown.
* More dependencies and implementation surface.
* Likely unnecessary before retrieval/citation UI consumes heading paths.

## Recommended Decision

Adopt approach A for this task:

* `pdf-parse` for PDF text extraction.
* Built-in `TextDecoder` for Markdown and TXT.
* Keep scanned/image-only PDFs out of scope and fail them with a normalized `PARSE_EMPTY_TEXT` or similar error when no usable text is extracted.
* Add parser interface tests with fixture bytes/text so the library can be swapped later without touching worker orchestration.
