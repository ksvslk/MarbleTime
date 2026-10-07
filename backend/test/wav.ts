/** WAV files for the speech-to-text tests: a header as browsers write it, then `samples` samples of a tone (or silence). */
export function wav(samples: number, options: {rate?: number; channels?: number; bits?: number; format?: number; extensible?: boolean; dataSize?: number; silent?: boolean} = {}): Buffer {
  const {rate = 16000, channels = 1, bits = 16, format = 1, extensible = false} = options;
  const blockAlign = channels * (bits / 8);
  const data = Buffer.alloc(samples * blockAlign);
  for (let i = 0; i < samples && bits === 16 && !options.silent; i++) data.writeInt16LE(Math.round(3000 * Math.sin((i / rate) * 2 * Math.PI * 440)), i * blockAlign);
  const fmt = Buffer.alloc(extensible ? 40 : 16);
  fmt.writeUInt16LE(extensible ? 0xfffe : format, 0);
  fmt.writeUInt16LE(channels, 2);
  fmt.writeUInt32LE(rate, 4);
  fmt.writeUInt32LE(rate * blockAlign, 8);
  fmt.writeUInt16LE(blockAlign, 12);
  fmt.writeUInt16LE(bits, 14);
  if (extensible) {
    fmt.writeUInt16LE(22, 16);
    fmt.writeUInt16LE(bits, 18);
    fmt.writeUInt32LE(channels === 1 ? 4 : 3, 20);
    // The sub-format GUID starts with the real format code.
    fmt.writeUInt16LE(format, 24);
    Buffer.from('000000001000800000aa00389b71', 'hex').copy(fmt, 26);
  }
  const chunk = (id: string, body: Buffer, size = body.length) => {
    const head = Buffer.alloc(8);
    head.write(id, 0, 'ascii');
    head.writeUInt32LE(size, 4);
    return Buffer.concat([head, body, body.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
  };
  // A LIST chunk before the data, as some encoders write.
  const body = Buffer.concat([Buffer.from('WAVE', 'ascii'), chunk('fmt ', fmt), chunk('LIST', Buffer.from('INFOISFT', 'ascii')), chunk('data', data, options.dataSize ?? data.length)]);
  return Buffer.concat([chunk('RIFF', body).subarray(0, 8), body]);
}
