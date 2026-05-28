import type { ParsedDocumentFormat } from "../contracts/schemas";

export function adjustOverlapStart(input: {
  proposedStart: number;
  text: string;
}): number {
  if (input.proposedStart <= 0) {
    return 0;
  }

  const searchFloor = Math.max(0, input.proposedStart - 24);
  for (let index = input.proposedStart; index >= searchFloor; index -= 1) {
    if (/\s/.test(input.text.charAt(index - 1))) {
      return index;
    }
  }

  return input.proposedStart;
}

export function chooseChunkEnd(input: {
  format: ParsedDocumentFormat;
  hardEnd: number;
  start: number;
  text: string;
}): number {
  const minimumSoftEnd =
    input.start + Math.floor((input.hardEnd - input.start) * 0.5);
  const boundaries = collectBoundaries(input.text, input.format).filter(
    (boundary) => boundary > minimumSoftEnd && boundary <= input.hardEnd,
  );
  const structuralBoundary = boundaries.at(-1);
  if (structuralBoundary !== undefined) {
    return structuralBoundary;
  }

  const wordBoundary = findLastWordBoundary({
    hardEnd: input.hardEnd,
    minimumSoftEnd,
    text: input.text,
  });

  return wordBoundary ?? input.hardEnd;
}

function collectBoundaries(
  text: string,
  format: ParsedDocumentFormat,
): number[] {
  const boundaries = new Set<number>();
  const structuralPattern =
    format === "markdown"
      ? /(?:\n{2,})|(?:\n(?=#{1,6}\s))|(?:\n(?=\s*[-*+]\s))|(?:\n(?=\s*\d+\.\s))/g
      : /\n{2,}|[.!?。！？]\s+/g;
  let match: RegExpExecArray | null;

  while ((match = structuralPattern.exec(text)) !== null) {
    boundaries.add(match.index + match[0].length);
  }

  return Array.from(boundaries).sort((left, right) => left - right);
}

function findLastWordBoundary(input: {
  hardEnd: number;
  minimumSoftEnd: number;
  text: string;
}): number | null {
  for (let index = input.hardEnd; index > input.minimumSoftEnd; index -= 1) {
    if (/\s/.test(input.text.charAt(index))) {
      return index;
    }
  }

  return null;
}
