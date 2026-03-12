import { estimateBase64DecodedBytes } from "../media/base64.js";
import { sniffMimeFromBase64 } from "../media/sniff-mime-from-base64.js";

function isAudioMime(mime?: string): boolean {
  return typeof mime === "string" && mime.startsWith("audio/");
}

const URL_FETCH_MAX_BYTES = 20_000_000; // 20 MB limit for URL-fetched attachments
const URL_FETCH_TIMEOUT_MS = 30_000;

export type ChatAttachment = {
  type?: string;
  mimeType?: string;
  fileName?: string;
  content?: unknown;
  url?: string;
};

export type ChatImageContent = {
  type: "image";
  data: string;
  mimeType: string;
  sourceUrl?: string;
};

export type ParsedMessageWithImages = {
  message: string;
  images: ChatImageContent[];
};

type AttachmentLog = {
  warn: (message: string) => void;
};

type NormalizedAttachment = {
  label: string;
  mime: string;
  base64: string;
};

function normalizeMime(mime?: string): string | undefined {
  if (!mime) {
    return undefined;
  }
  const cleaned = mime.split(";")[0]?.trim().toLowerCase();
  return cleaned || undefined;
}

function isImageMime(mime?: string): boolean {
  return typeof mime === "string" && mime.startsWith("image/");
}

function isValidBase64(value: string): boolean {
  // Minimal validation; avoid full decode allocations for large payloads.
  return value.length > 0 && value.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function normalizeAttachment(
  att: ChatAttachment,
  idx: number,
  opts: { stripDataUrlPrefix: boolean; requireImageMime: boolean },
): NormalizedAttachment {
  const mime = att.mimeType ?? "";
  const content = att.content;
  const label = att.fileName || att.type || `attachment-${idx + 1}`;

  if (typeof content !== "string") {
    throw new Error(`attachment ${label}: content must be base64 string`);
  }
  if (opts.requireImageMime && !mime.startsWith("image/")) {
    throw new Error(`attachment ${label}: only image/* supported`);
  }

  let base64 = content.trim();
  if (opts.stripDataUrlPrefix) {
    // Strip data URL prefix if present (e.g., "data:image/jpeg;base64,...").
    const dataUrlMatch = /^data:[^;]+;base64,(.*)$/.exec(base64);
    if (dataUrlMatch) {
      base64 = dataUrlMatch[1];
    }
  }
  return { label, mime, base64 };
}

function validateAttachmentBase64OrThrow(
  normalized: NormalizedAttachment,
  opts: { maxBytes: number },
): number {
  if (!isValidBase64(normalized.base64)) {
    throw new Error(`attachment ${normalized.label}: invalid base64 content`);
  }
  const sizeBytes = estimateBase64DecodedBytes(normalized.base64);
  if (sizeBytes <= 0 || sizeBytes > opts.maxBytes) {
    throw new Error(
      `attachment ${normalized.label}: exceeds size limit (${sizeBytes} > ${opts.maxBytes} bytes)`,
    );
  }
  return sizeBytes;
}

/**
 * Fetch a URL and return its body as a base64 string.
 * Enforces a byte-size limit and timeout. Retries once after a short delay
 * to handle CDN propagation lag for freshly-uploaded assets.
 */
async function fetchUrlAsBase64(
  url: string,
  opts: { maxBytes: number; timeoutMs: number },
): Promise<{ base64: string; contentType?: string }> {
  async function attempt(): Promise<{ base64: string; contentType?: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "OpenClaw-Gateway/1.0" },
        redirect: "follow",
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const buf = await res.arrayBuffer();
      if (buf.byteLength > opts.maxBytes) {
        throw new Error(`response too large (${buf.byteLength} > ${opts.maxBytes} bytes)`);
      }
      const base64 = Buffer.from(buf).toString("base64");
      const contentType = res.headers.get("content-type") ?? undefined;
      return { base64, contentType };
    } finally {
      clearTimeout(timer);
    }
  }

  try {
    return await attempt();
  } catch {
    // Retry once after a short delay to handle CDN propagation lag
    await new Promise((r) => setTimeout(r, 1500));
    return await attempt();
  }
}

/**
 * Parse attachments and extract images as structured content blocks.
 * Returns the message text (potentially augmented with file/audio references)
 * and an array of image content blocks compatible with Claude API's image format.
 *
 * Supports three attachment categories:
 * - Base64 image attachments (existing behaviour)
 * - Base64 audio attachments: embedded as data-URL in the message text
 * - URL-based attachments: images are fetched and converted to base64;
 *   non-images are appended as markdown links in the message text
 */
export async function parseMessageWithAttachments(
  message: string,
  attachments: ChatAttachment[] | undefined,
  opts?: { maxBytes?: number; log?: AttachmentLog },
): Promise<ParsedMessageWithImages> {
  const maxBytes = opts?.maxBytes ?? 5_000_000; // decoded bytes (5,000,000)
  const log = opts?.log;
  if (!attachments || attachments.length === 0) {
    return { message, images: [] };
  }

  const images: ChatImageContent[] = [];
  const textAppendBlocks: string[] = [];

  for (const [idx, att] of attachments.entries()) {
    if (!att) {
      continue;
    }

    const label = att.fileName || att.type || `attachment-${idx + 1}`;
    const providedMime = normalizeMime(att.mimeType);

    // --- URL-based attachments (no inline content) ---
    if (att.url && !att.content) {
      if (isImageMime(providedMime)) {
        try {
          const { base64, contentType } = await fetchUrlAsBase64(att.url, {
            maxBytes: URL_FETCH_MAX_BYTES,
            timeoutMs: URL_FETCH_TIMEOUT_MS,
          });
          const resolvedMime = normalizeMime(contentType) ?? providedMime ?? "image/jpeg";
          images.push({ type: "image", data: base64, mimeType: resolvedMime, sourceUrl: att.url });
        } catch (err) {
          log?.warn(
            `attachment ${label}: failed to fetch image URL (${err instanceof Error ? err.message : String(err)}), falling back to text`,
          );
          textAppendBlocks.push(`[Attached image: ${label}](${att.url})`);
        }
      } else {
        textAppendBlocks.push(`[Attached file: ${label}](${att.url})`);
      }
      continue;
    }

    // --- Base64 content attachments ---
    if (!att.content) {
      continue;
    }

    // Audio attachments: embed as data URL in message text
    if (isAudioMime(providedMime)) {
      const normalized = normalizeAttachment(att, idx, {
        stripDataUrlPrefix: true,
        requireImageMime: false,
      });
      validateAttachmentBase64OrThrow(normalized, { maxBytes });
      const mime = providedMime ?? "audio/webm";
      textAppendBlocks.push(`[Audio: data:${mime};base64,${normalized.base64}]`);
      continue;
    }

    // Image attachments (existing behaviour)
    const normalized = normalizeAttachment(att, idx, {
      stripDataUrlPrefix: true,
      requireImageMime: false,
    });
    validateAttachmentBase64OrThrow(normalized, { maxBytes });
    const { base64: b64, mime } = normalized;

    const sniffedMime = normalizeMime(await sniffMimeFromBase64(b64));
    if (sniffedMime && !isImageMime(sniffedMime)) {
      log?.warn(`attachment ${label}: detected non-image (${sniffedMime}), dropping`);
      continue;
    }
    if (!sniffedMime && !isImageMime(providedMime)) {
      log?.warn(`attachment ${label}: unable to detect image mime type, dropping`);
      continue;
    }
    if (sniffedMime && providedMime && sniffedMime !== providedMime) {
      log?.warn(
        `attachment ${label}: mime mismatch (${providedMime} -> ${sniffedMime}), using sniffed`,
      );
    }

    images.push({
      type: "image",
      data: b64,
      mimeType: sniffedMime ?? providedMime ?? mime,
    });
  }

  const finalMessage =
    textAppendBlocks.length > 0
      ? `${message}${message.trim().length > 0 ? "\n\n" : ""}${textAppendBlocks.join("\n\n")}`
      : message;

  return { message: finalMessage, images };
}

/**
 * @deprecated Use parseMessageWithAttachments instead.
 * This function converts images to markdown data URLs which Claude API cannot process as images.
 */
export function buildMessageWithAttachments(
  message: string,
  attachments: ChatAttachment[] | undefined,
  opts?: { maxBytes?: number },
): string {
  const maxBytes = opts?.maxBytes ?? 2_000_000; // 2 MB
  if (!attachments || attachments.length === 0) {
    return message;
  }

  const blocks: string[] = [];

  for (const [idx, att] of attachments.entries()) {
    if (!att) {
      continue;
    }
    const normalized = normalizeAttachment(att, idx, {
      stripDataUrlPrefix: false,
      requireImageMime: true,
    });
    validateAttachmentBase64OrThrow(normalized, { maxBytes });
    const { base64, label, mime } = normalized;

    const safeLabel = label.replace(/\s+/g, "_");
    const dataUrl = `![${safeLabel}](data:${mime};base64,${base64})`;
    blocks.push(dataUrl);
  }

  if (blocks.length === 0) {
    return message;
  }
  const separator = message.trim().length > 0 ? "\n\n" : "";
  return `${message}${separator}${blocks.join("\n\n")}`;
}
