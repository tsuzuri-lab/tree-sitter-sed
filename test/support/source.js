const CR = "\r";
const CRLF = "\r\n";
const FF = "\f";
const TAB = "\t";
const VT = "\v";

function joinLines(lineEnding, lines) {
  return lines.join(lineEnding);
}

function applyEdits(source, edits) {
  let result = Buffer.from(source, "utf8");
  for (const { byteOffset, deletedByteLength, text } of edits) {
    result = Buffer.concat([
      result.subarray(0, byteOffset),
      Buffer.from(text, "utf8"),
      result.subarray(byteOffset + deletedByteLength),
    ]);
  }
  return result;
}

module.exports = {
  CR,
  CRLF,
  FF,
  TAB,
  VT,
  applyEdits,
  joinLines,
};
