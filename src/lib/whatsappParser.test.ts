import { describe, expect, it } from 'vitest';
import { chunkMessages, importChatFile, parseWhatsAppExport, validateChatFile } from './whatsappParser';

describe('parseWhatsAppExport', () => {
  it('parses messages, system lines, and multiline content', () => {
    const text = `12/01/24, 9:01 AM - Alice: Hi team
12/01/24, 9:02 AM - Bob: Please send the deck
by 5 PM
12/01/24, 9:03 AM - Messages and calls are end-to-end encrypted.`;

    const messages = parseWhatsAppExport(text);

    expect(messages).toHaveLength(3);
    expect(messages[0]).toMatchObject({ sender: 'Alice', text: 'Hi team', isSystem: false });
    expect(messages[1].text).toContain('by 5 PM');
    expect(messages[2]).toMatchObject({ sender: null, isSystem: true });
  });

  it('chunks without dropping messages', () => {
    const messages = parseWhatsAppExport(`1/1/24, 10:00 AM - A: ${'x'.repeat(50)}
1/1/24, 10:01 AM - B: ${'y'.repeat(50)}
1/1/24, 10:02 AM - C: ${'z'.repeat(50)}`);

    const chunks = chunkMessages(messages, 90);
    expect(chunks.flat()).toHaveLength(3);
  });

  it('imports a WhatsApp chat text file from a zip export', async () => {
    const chatText = `1/1/24, 10:00 AM - A: Hello 👋
1/1/24, 10:01 AM - B: नमस्ते`;
    const zip = makeZip('_chat.txt', new TextEncoder().encode(chatText));
    const file = new File([toArrayBuffer(zip)], 'whatsapp-export.zip', { type: 'application/zip' });

    expect(validateChatFile(file)).toBeNull();

    const imported = await importChatFile(file);
    expect(imported.fileName).toBe('whatsapp-export.zip');
    expect(imported.messages).toHaveLength(2);
    expect(imported.messages[0]).toMatchObject({ sender: 'A', text: 'Hello 👋' });
    expect(imported.messages[1]).toMatchObject({ sender: 'B', text: 'नमस्ते' });
  });

  it('imports UTF-16LE text exports with a BOM', async () => {
    const chatText = `1/1/24, 10:00 AM - A: Hello
1/1/24, 10:01 AM - B: Good morning`;
    const file = new File([toArrayBuffer(encodeUtf16LeWithBom(chatText))], 'chat.txt', { type: 'text/plain' });

    const imported = await importChatFile(file);
    expect(imported.messages).toHaveLength(2);
    expect(imported.messages[1]).toMatchObject({ sender: 'B', text: 'Good morning' });
  });

  it('falls back for Windows-1252 text exports', async () => {
    const bytes = new Uint8Array([
      ...new TextEncoder().encode('1/1/24, 10:00 AM - A: caf'),
      0xe9
    ]);
    const file = new File([toArrayBuffer(bytes)], 'chat.txt', { type: 'text/plain' });

    const imported = await importChatFile(file);
    expect(imported.messages).toHaveLength(1);
    expect(imported.messages[0]).toMatchObject({ sender: 'A', text: 'café' });
  });
});

function makeZip(fileName: string, fileContent: Uint8Array): Uint8Array {
  const encodedName = new TextEncoder().encode(fileName);
  const localHeader = new Uint8Array(30 + encodedName.length);
  const centralHeader = new Uint8Array(46 + encodedName.length);
  const endOfCentralDirectory = new Uint8Array(22);
  const localView = new DataView(localHeader.buffer);
  const centralView = new DataView(centralHeader.buffer);
  const endView = new DataView(endOfCentralDirectory.buffer);

  localView.setUint32(0, 0x04034b50, true);
  localView.setUint16(4, 20, true);
  localView.setUint16(8, 0, true);
  localView.setUint32(14, 0, true);
  localView.setUint32(18, fileContent.length, true);
  localView.setUint32(22, fileContent.length, true);
  localView.setUint16(26, encodedName.length, true);
  localHeader.set(encodedName, 30);

  const centralOffset = localHeader.length + fileContent.length;
  centralView.setUint32(0, 0x02014b50, true);
  centralView.setUint16(4, 20, true);
  centralView.setUint16(6, 20, true);
  centralView.setUint16(10, 0, true);
  centralView.setUint32(16, 0, true);
  centralView.setUint32(20, fileContent.length, true);
  centralView.setUint32(24, fileContent.length, true);
  centralView.setUint16(28, encodedName.length, true);
  centralHeader.set(encodedName, 46);

  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, 1, true);
  endView.setUint16(10, 1, true);
  endView.setUint32(12, centralHeader.length, true);
  endView.setUint32(16, centralOffset, true);

  const zip = new Uint8Array(localHeader.length + fileContent.length + centralHeader.length + endOfCentralDirectory.length);
  zip.set(localHeader, 0);
  zip.set(fileContent, localHeader.length);
  zip.set(centralHeader, centralOffset);
  zip.set(endOfCentralDirectory, centralOffset + centralHeader.length);
  return zip;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function encodeUtf16LeWithBom(text: string): Uint8Array {
  const bytes = new Uint8Array(2 + text.length * 2);
  bytes[0] = 0xff;
  bytes[1] = 0xfe;

  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    const offset = 2 + index * 2;
    bytes[offset] = code & 0xff;
    bytes[offset + 1] = code >> 8;
  }

  return bytes;
}
