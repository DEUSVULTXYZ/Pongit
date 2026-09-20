import type {Hex} from 'viem';

/** Early SDK diagnostic mirroring StrategyCode.verify. The catalogue remains
 * authoritative and checks the runtime again when registration is included. */
export function validateStrategyRuntime(code: Hex | undefined): void {
  if (!code || !/^0x(?:[\da-f]{2})+$/i.test(code) || (code.length - 2) / 2 > 16_384)
    throw Error('Deploy an immutable strategy contract of at most 16384 bytes');
  if (code.toLowerCase().startsWith('0xef0100')) throw Error('A delegated wallet is not an immutable strategy');
  const size = (code.length - 2) / 2;
  for (let i = 0; i < size; i++) {
    const op = Number.parseInt(code.slice(2 + i * 2, 4 + i * 2), 16);
    if (op >= 0x60 && op <= 0x7f) {
      if (i + op - 0x5f >= size) throw Error('Strategy runtime contains a truncated PUSH instruction');
      i += op - 0x5f; continue;
    }
    if ([0x31, 0x32, 0x33, 0x3a, 0x3b, 0x3c, 0x3f, 0x54, 0x55, 0x5a, 0x5c, 0x5d,
      0xf0, 0xf1, 0xf2, 0xf4, 0xf5, 0xfa, 0xff].includes(op) || op >= 0x40 && op <= 0x4f || op >= 0xa0 && op <= 0xa4)
      throw Error(`Strategy contains forbidden opcode 0x${op.toString(16)} at byte ${i}. Build with FOUNDRY_PROFILE=strategies and redeploy; metadata is also checked.`);
  }
}
