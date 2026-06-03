import { Buffer } from "node:buffer";

const C1_CONTROL_CHARS = /[\u0080-\u009f]/g;
const UTF8_MOJIBAKE_SEQUENCES =
  /(?:Ã|Â|Ð|Ñ)[\u0080-\u00bf\u2018-\u201d\u2020\u2021\u2026\u2030\u0160\u2039\u0152\u017d\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u017e\u0178]/g;

function countMojibakeMarkers(value: string): number {
  return (
    (value.match(C1_CONTROL_CHARS)?.length ?? 0) +
    (value.match(UTF8_MOJIBAKE_SEQUENCES)?.length ?? 0)
  );
}

export function normalizeUploadedFileName(fileName: string): string {
  const originalMojibakeMarkers = countMojibakeMarkers(fileName);
  if (originalMojibakeMarkers === 0) {
    return fileName;
  }

  const decoded = Buffer.from(fileName, "latin1").toString("utf8");
  if (decoded.includes("\uFFFD")) {
    return fileName;
  }

  const decodedMojibakeMarkers = countMojibakeMarkers(decoded);
  if (decodedMojibakeMarkers < originalMojibakeMarkers) {
    return decoded;
  }

  return fileName;
}
