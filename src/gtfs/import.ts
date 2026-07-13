import * as Crypto from "expo-crypto";
import { File } from "expo-file-system";

import { extractGtfsZip } from "./archive";
import { GtfsFeedRecord, importGtfsFeed, listGtfsFeeds } from "./database";
import { parseGtfs } from "./parser";
import type { GtfsWarning } from "./types";

export type GtfsImportPhase =
  "reading" | "validating-archive" | "parsing" | "committing";

export interface GtfsImportResult {
  feed: GtfsFeedRecord;
  duplicate: boolean;
  warnings: GtfsWarning[];
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function withoutExtension(name: string) {
  return name.replace(/\.(zip|gtfs)$/i, "").trim() || "Offline transit feed";
}

/**
 * Imports a user-selected GTFS ZIP without contacting a server. The archive is
 * bounded and validated before SQLite starts its atomic staging transaction.
 */
export async function importGtfsZip(
  uri: string,
  fileName: string,
  onProgress?: (phase: GtfsImportPhase) => void,
): Promise<GtfsImportResult> {
  onProgress?.("reading");
  const bytes = new Uint8Array(await new File(uri).arrayBuffer());

  onProgress?.("validating-archive");
  const files = extractGtfsZip(bytes);

  onProgress?.("parsing");
  const { dataset, warnings } = parseGtfs(files);
  const checksum = toHex(
    await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes),
  );
  const existingFeeds = await listGtfsFeeds();
  const duplicate = existingFeeds.find(
    (feed) => feed.checksumSha256 === checksum,
  );
  if (duplicate) return { feed: duplicate, duplicate: true, warnings };

  const agency = dataset.agencies[0];
  const publisher = dataset.feedInfo;
  const identity = [
    publisher?.publisherUrl,
    agency?.url,
    publisher?.publisherName,
    agency?.name,
    agency?.timezone,
  ]
    .filter(Boolean)
    .join("|");
  const identityHash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    identity || checksum,
  );
  const feedId = `gtfs-${identityHash.slice(0, 24)}`;
  const feedName =
    publisher?.publisherName || agency?.name || withoutExtension(fileName);

  onProgress?.("committing");
  const feed = await importGtfsFeed(
    {
      id: feedId,
      name: feedName,
      sourcePageUrl: publisher?.publisherUrl ?? agency?.url ?? null,
      attribution: agency?.name ?? publisher?.publisherName ?? feedName,
      checksumSha256: checksum,
    },
    dataset,
  );
  return { feed, duplicate: false, warnings };
}
