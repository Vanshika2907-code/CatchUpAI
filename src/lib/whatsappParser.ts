import type { ChatMessage, ChatStats, ImportedChat } from '../types';

const MAX_FILE_BYTES = 2.5 * 1024 * 1024;
const MAX_ZIP_BYTES = 25 * 1024 * 1024;
const utf8FatalDecoder = new TextDecoder('utf-8', { fatal: true });
const utf16LeDecoder = new TextDecoder('utf-16le');
const utf16BeDecoder = new TextDecoder('utf-16be');
const windows1252Decoder = new TextDecoder('windows-1252');

const patterns = [
  /^\[?(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?\s?(?:AM|PM|am|pm)?)\]?\s-\s([^:]+):\s([\s\S]*)$/,
  /^\[?(\d{1,2}-\d{1,2}-\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?\s?(?:AM|PM|am|pm)?)\]?\s-\s([^:]+):\s([\s\S]*)$/,
  /^(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?\s?(?:AM|PM|am|pm)?)\s-\s([^:]+):\s([\s\S]*)$/,
  /^(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2})\s-\s([^:]+):\s([\s\S]*)$/
];

const systemPatterns = [
  /^\[?(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?\s?(?:AM|PM|am|pm)?)\]?\s-\s([\s\S]*)$/,
  /^(\d{1,2}-\d{1,2}-\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?\s?(?:AM|PM|am|pm)?)\s-\s([\s\S]*)$/
];

export function validateChatFile(file: File): string | null {
  const fileName = file.name.toLowerCase();
  const isTextExport = fileName.endsWith('.txt');
  const isZipExport = fileName.endsWith('.zip');

  if (!isTextExport && !isZipExport) {
    return 'Please choose a WhatsApp .txt or .zip export.';
  }
  if (file.size === 0) {
    return 'That file is empty. Export the chat as a .txt or .zip file and try again.';
  }
  if (isTextExport && file.size > MAX_FILE_BYTES) {
    return 'This export is too large for the in-browser model. Try a smaller date range under 2.5 MB.';
  }
  if (isZipExport && file.size > MAX_ZIP_BYTES) {
    return 'This zip export is too large. Try exporting without media or choose a smaller date range.';
  }
  return null;
}

export async function importChatFile(file: File): Promise<ImportedChat> {
  const validationError = validateChatFile(file);
  if (validationError) throw new Error(validationError);

  const rawBytes = new Uint8Array(await readFileAsArrayBuffer(file));
  const rawText = file.name.toLowerCase().endsWith('.zip') ? await extractChatTextFromZip(rawBytes) : decodeChatText(rawBytes);

  if (new TextEncoder().encode(rawText).byteLength > MAX_FILE_BYTES) {
    throw new Error('This chat is too large for the in-browser model. Try a smaller date range under 2.5 MB.');
  }

  const messages = parseWhatsAppExport(rawText);
  if (messages.length === 0) {
    throw new Error('No WhatsApp-style messages were found. Check that this is an exported .txt conversation.');
  }

  return {
    fileName: file.name,
    fileSize: file.size,
    rawText,
    messages,
    stats: getChatStats(messages, rawText)
  };
}

async function extractChatTextFromZip(bytes: Uint8Array): Promise<string> {
  const entries = readZipEntries(bytes);
  const textEntries = entries.filter((entry) => entry.name.toLowerCase().endsWith('.txt') && !entry.isDirectory);

  if (textEntries.length === 0) {
    throw new Error('No .txt chat file was found inside this zip export.');
  }

  const chatEntry =
    textEntries.find((entry) => /(^|\/)_?chat\.txt$/i.test(entry.name)) ??
    textEntries.find((entry) => /whatsapp.*chat|chat.*whatsapp/i.test(entry.name)) ??
    textEntries[0];

  const textBytes = await readZipEntry(bytes, chatEntry);
  return decodeChatText(textBytes);
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  if ('arrayBuffer' in file && typeof file.arrayBuffer === 'function') return file.arrayBuffer();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('This zip export could not be read.'));
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(file);
  });
}

interface ZipEntry {
  name: string;
  isDirectory: boolean;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

function readZipEntries(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(view);
  const entryCount = view.getUint16(eocdOffset + 10, true);
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
  const entries: ZipEntry[] = [];
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error('This zip export could not be read.');
    }

    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const fileNameStart = offset + 46;
    const name = decodeZipFileName(bytes.slice(fileNameStart, fileNameStart + fileNameLength)).replace(/\\/g, '/');

    entries.push({
      name,
      isDirectory: name.endsWith('/'),
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset
    });

    offset = fileNameStart + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function findEndOfCentralDirectory(view: DataView): number {
  const minimumOffset = Math.max(0, view.byteLength - 65557);
  for (let offset = view.byteLength - 22; offset >= minimumOffset; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  throw new Error('This zip export could not be read.');
}

async function readZipEntry(bytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  if (entry.uncompressedSize > MAX_FILE_BYTES) {
    throw new Error('The chat inside this zip is too large. Try a smaller date range under 2.5 MB.');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offset = entry.localHeaderOffset;
  if (view.getUint32(offset, true) !== 0x04034b50) {
    throw new Error('This zip export could not be read.');
  }

  const fileNameLength = view.getUint16(offset + 26, true);
  const extraLength = view.getUint16(offset + 28, true);
  const dataStart = offset + 30 + fileNameLength + extraLength;
  const compressedData = bytes.slice(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === 0) return compressedData;
  if (entry.compressionMethod === 8) return inflateRaw(compressedData);

  throw new Error('This zip uses an unsupported compression method. Export the chat without media and try again.');
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([toArrayBuffer(bytes)]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function decodeZipFileName(bytes: Uint8Array): string {
  try {
    return utf8FatalDecoder.decode(bytes);
  } catch {
    return windows1252Decoder.decode(bytes);
  }
}

function decodeChatText(bytes: Uint8Array): string {
  if (bytes.length >= 2) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return utf16LeDecoder.decode(bytes.slice(2));
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return utf16BeDecoder.decode(bytes.slice(2));
  }

  if (looksLikeUtf16Le(bytes)) return utf16LeDecoder.decode(bytes);

  try {
    return utf8FatalDecoder.decode(bytes).replace(/^\uFEFF/, '');
  } catch {
    return windows1252Decoder.decode(bytes);
  }
}

function looksLikeUtf16Le(bytes: Uint8Array): boolean {
  const sampleLength = Math.min(bytes.length, 2000);
  if (sampleLength < 20) return false;

  let oddNulls = 0;
  let evenNulls = 0;
  for (let index = 0; index < sampleLength; index += 1) {
    if (bytes[index] !== 0) continue;
    if (index % 2 === 0) evenNulls += 1;
    else oddNulls += 1;
  }

  return oddNulls > sampleLength * 0.2 && evenNulls < sampleLength * 0.05;
}

export function parseWhatsAppExport(rawText: string): ChatMessage[] {
  const lines = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const messages: ChatMessage[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const parsed = parseLine(line);
    if (parsed) {
      messages.push({
        index: messages.length,
        timestamp: parsed.timestamp,
        sender: parsed.sender,
        text: parsed.text.trim(),
        isSystem: parsed.isSystem,
        raw: line
      });
      continue;
    }

    const current = messages[messages.length - 1];
    if (current) {
      current.text = `${current.text}\n${line}`.trim();
      current.raw = `${current.raw}\n${line}`;
    }
  }

  return messages;
}

function parseLine(line: string): { timestamp: string; sender: string | null; text: string; isSystem: boolean } | null {
  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match) {
      return {
        timestamp: `${match[1]} ${match[2]}`,
        sender: match[3].trim(),
        text: match[4],
        isSystem: false
      };
    }
  }

  for (const pattern of systemPatterns) {
    const match = line.match(pattern);
    if (match && !match[3].includes(': ')) {
      return {
        timestamp: `${match[1]} ${match[2]}`,
        sender: null,
        text: match[3].trim(),
        isSystem: true
      };
    }
  }

  return null;
}

export function getChatStats(messages: ChatMessage[], rawText: string): ChatStats {
  const participants = new Set(messages.filter((m) => !m.isSystem && m.sender).map((m) => m.sender as string));
  return {
    totalMessages: messages.length,
    participantCount: participants.size,
    systemMessages: messages.filter((m) => m.isSystem).length,
    firstTimestamp: messages[0]?.timestamp ?? null,
    lastTimestamp: messages[messages.length - 1]?.timestamp ?? null,
    textLength: rawText.length
  };
}

export function messagesToTranscript(messages: ChatMessage[], maxChars = 12000): string {
  const rendered = messages
    .map((message) => {
      const sender = message.isSystem ? 'system' : message.sender ?? 'unknown';
      return `#${message.index} [${message.timestamp ?? 'unknown time'}] ${sender}: ${message.text}`;
    })
    .join('\n');

  if (rendered.length <= maxChars) return rendered;

  const head = rendered.slice(0, Math.floor(maxChars * 0.55));
  const tail = rendered.slice(rendered.length - Math.floor(maxChars * 0.35));
  return `${head}\n\n[Middle omitted for model context. Use the visible evidence only.]\n\n${tail}`;
}

export function chunkMessages(messages: ChatMessage[], maxChars = 9000): ChatMessage[][] {
  const chunks: ChatMessage[][] = [];
  let current: ChatMessage[] = [];
  let currentLength = 0;

  for (const message of messages) {
    const length = message.text.length + (message.sender?.length ?? 0) + 40;
    if (current.length > 0 && currentLength + length > maxChars) {
      chunks.push(current);
      current = [];
      currentLength = 0;
    }
    current.push(message);
    currentLength += length;
  }

  if (current.length > 0) chunks.push(current);
  return chunks;
}
