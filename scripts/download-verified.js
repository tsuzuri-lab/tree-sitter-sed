const { createHash } = require("node:crypto");
const { createReadStream } = require("node:fs");
const { mkdir, open, unlink } = require("node:fs/promises");
const { setGlobalProxyFromEnv } = require("node:http");
const { dirname } = require("node:path");
const { Readable } = require("node:stream");

setGlobalProxyFromEnv();

const allowedDownloadHosts = new Set([
  "github.com",
  "release-assets.githubusercontent.com",
]);

async function downloadVerified({ url, destination, sha256, maxBytes }) {
  if (!/^[0-9a-f]{64}$/.test(sha256)) {
    throw new Error("Expected SHA-256 must be 64 lowercase hexadecimal characters");
  }

  await mkdir(dirname(destination), { recursive: true });

  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(180_000),
  });
  const finalUrl = new URL(response.url);

  if (
    !response.ok ||
    finalUrl.protocol !== "https:" ||
    !allowedDownloadHosts.has(finalUrl.hostname) ||
    response.body === null
  ) {
    throw new Error(
      `Download failed or redirected to an untrusted location: ${response.status} ${response.url}`,
    );
  }

  const advertisedLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(advertisedLength) && advertisedLength > maxBytes) {
    throw new Error(`Download is larger than the ${maxBytes}-byte safety limit`);
  }

  const hash = createHash("sha256");
  const file = await open(destination, "wx", 0o600);
  let byteCount = 0;

  try {
    for await (const chunk of Readable.fromWeb(response.body)) {
      byteCount += chunk.length;
      if (byteCount > maxBytes) {
        throw new Error(`Download exceeded the ${maxBytes}-byte safety limit`);
      }
      hash.update(chunk);
      let offset = 0;
      while (offset < chunk.length) {
        const { bytesWritten } = await file.write(
          chunk,
          offset,
          chunk.length - offset,
        );
        if (bytesWritten === 0) {
          throw new Error("Download write made no forward progress");
        }
        offset += bytesWritten;
      }
    }
    await file.sync();
  } catch (error) {
    await file.close();
    await unlink(destination).catch(() => {});
    throw error;
  }

  await file.close();
  const actual = hash.digest("hex");

  if (actual !== sha256) {
    await unlink(destination).catch(() => {});
    throw new Error(`SHA-256 mismatch: expected ${sha256}, received ${actual}`);
  }

  // Re-read the completed file to guard against an incomplete or altered write.
  const persisted = await hashFile(destination);
  if (persisted !== sha256) {
    await unlink(destination).catch(() => {});
    throw new Error(`Persisted SHA-256 mismatch: expected ${sha256}, received ${persisted}`);
  }
}

async function hashFile(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

module.exports = { downloadVerified };
