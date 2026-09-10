import {
  concatHex,
  encodeAbiParameters,
  hexToBytes,
  keccak256,
  stringToHex,
  toHex,
  type Hex,
} from "viem";

export const privateNamespaces = {
  notebook: "pongit.xyz/notebook/v1",
  contacts: "pongit.xyz/contacts/v1",
} as const;
export const namespaceHash = (kind: keyof typeof privateNamespaces) =>
  keccak256(stringToHex(privateNamespaces[kind]));
export const CHUNK_BYTES = 4096;
export const MAX_PRIVATE_BYTES = 65536;
const pair = (a: Hex, b: Hex) =>
  keccak256(concatHex(a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a]));
const leaf = (index: number, data: Hex) =>
  keccak256(
    encodeAbiParameters(
      [{ type: "uint8" }, { type: "bytes32" }],
      [index, keccak256(data)],
    ),
  );

/** Only ciphertext crosses this interface. No silent truncation at the contract limit. */
export function preparePrivateUpload(ciphertext: Uint8Array) {
  if (ciphertext.length < 16 || ciphertext.length > MAX_PRIVATE_BYTES)
    throw new Error(
      "Encrypted data exceeds the supported size. Your saved version is unchanged.",
    );
  const chunks: Array<{ index: number; data: Hex; proof: Hex[] }> = [];
  for (let offset = 0; offset < ciphertext.length; offset += CHUNK_BYTES)
    chunks.push({
      index: chunks.length,
      data: toHex(ciphertext.slice(offset, offset + CHUNK_BYTES)),
      proof: [],
    });
  const width = 2 ** Math.ceil(Math.log2(chunks.length));
  const leaves = Array.from({ length: width }, (_, i) =>
    leaf(i, chunks[i]?.data ?? "0x"),
  );
  const levels = [leaves];
  while (levels.at(-1)!.length > 1) {
    const last = levels.at(-1)!;
    levels.push(
      Array.from({ length: last.length / 2 }, (_, i) =>
        pair(last[i * 2], last[i * 2 + 1]),
      ),
    );
  }
  for (const chunk of chunks) {
    let i = chunk.index;
    for (let level = 0; level < levels.length - 1; level++) {
      chunk.proof.push(levels[level][i ^ 1]);
      i = Math.floor(i / 2);
    }
  }
  return {
    size: ciphertext.length,
    root: levels.at(-1)![0],
    dataHash: keccak256(ciphertext),
    chunks,
  };
}
export function verifyPrivateChunk(
  root: Hex,
  index: number,
  data: Hex,
  proof: readonly Hex[],
) {
  if (proof.length > 4 || index < 0 || index >= 16) return false;
  return (
    proof
      .reduce((hash, sibling) => pair(hash, sibling), leaf(index, data))
      .toLowerCase() === root.toLowerCase()
  );
}
export function restoreCiphertext(chunks: readonly Hex[], expectedHash: Hex) {
  const bytes = hexToBytes(concatHex([...chunks]));
  if (keccak256(bytes) !== expectedHash)
    throw new Error("Encrypted backup is incomplete or corrupt.");
  return bytes;
}

export type UploadPort = {
  player: string;
  namespace: Hex;
  currentRevision(): Promise<bigint>;
  currentUpload(): Promise<Hex>;
  begin(
    prepared: ReturnType<typeof preparePrivateUpload>,
    iv: Hex,
    revision: bigint,
  ): Promise<Hex>;
  bitmap(id: Hex): Promise<number>;
  upload(id: Hex): Promise<{
    player: string;
    namespace: Hex;
    root: Hex;
    dataHash: Hex;
    iv: Hex;
    size: number;
    expected: bigint;
  }>;
  put(
    id: Hex,
    chunk: ReturnType<typeof preparePrivateUpload>["chunks"][number],
  ): Promise<void>;
  commit(id: Hex): Promise<void>;
};
/** Re-reads the head before committing. The contract independently enforces the same CAS. */
export async function saveEncryptedChunks(
  port: UploadPort,
  ciphertext: Uint8Array,
  iv: Hex,
  revision: bigint,
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
  resume?: Hex,
) {
  if (hexToBytes(iv).length !== 12)
    throw new Error("AES-GCM requires a fresh 12-byte nonce.");
  const prepared = preparePrivateUpload(ciphertext);
  signal?.throwIfAborted();
  if (resume) {
    const stored = await port.upload(resume);
    if (
      stored.player.toLowerCase() !== port.player.toLowerCase() ||
      stored.namespace.toLowerCase() !== port.namespace.toLowerCase() ||
      stored.root.toLowerCase() !== prepared.root.toLowerCase() ||
      stored.dataHash.toLowerCase() !== prepared.dataHash.toLowerCase() ||
      stored.iv.toLowerCase() !== iv.toLowerCase() ||
      stored.size !== prepared.size ||
      stored.expected !== revision
    )
      throw new Error(
        "This upload belongs to a different backup. Start a new save.",
      );
  }
  const current = await port.currentRevision();
  if (
    resume &&
    current === revision + 1n &&
    (await port.currentUpload()) === resume
  ) {
    onProgress(prepared.chunks.length, prepared.chunks.length);
    return resume;
  }
  if (current !== revision)
    throw new Error(
      "This backup changed on another device. Reload before saving.",
    );
  const id = resume ?? (await port.begin(prepared, iv, revision));
  const bitmap = await port.bitmap(id);
  for (const chunk of prepared.chunks) {
    signal?.throwIfAborted();
    if (!(bitmap & (1 << chunk.index))) await port.put(id, chunk);
    onProgress(chunk.index + 1, prepared.chunks.length);
  }
  signal?.throwIfAborted();
  if ((await port.currentRevision()) !== revision)
    throw new Error(
      "This backup changed on another device. Your upload was not published.",
    );
  await port.commit(id);
  return id;
}
/** PRF input must come from Mera with the matching namespace salt; wallet derivation is untouched. */
export async function privateKeyFromPrf(
  prf: Uint8Array<ArrayBuffer>,
  kind: keyof typeof privateNamespaces,
) {
  const enc = new TextEncoder();
  const namespace = privateNamespaces[kind];
  try {
    const material = await crypto.subtle.importKey("raw", prf, "HKDF", false, [
      "deriveKey",
    ]);
    return await crypto.subtle.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: enc.encode(namespace),
        info: enc.encode(
          `PONGIT ${kind === "notebook" ? "notebook" : "contacts"} AES-GCM encryption`,
        ),
      },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  } finally {
    prf.fill(0);
  }
}
export async function encryptPrivate(
  key: CryptoKey,
  kind: keyof typeof privateNamespaces,
  player: string,
  value: unknown,
) {
  const enc = new TextEncoder();
  const plain = enc.encode(JSON.stringify(value));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  try {
    const cipher = new Uint8Array(
      await crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv,
          additionalData: enc.encode(
            `${privateNamespaces[kind]}:${player.toLowerCase()}`,
          ),
        },
        key,
        plain,
      ),
    );
    preparePrivateUpload(cipher);
    return { iv: toHex(iv), ciphertext: cipher };
  } finally {
    plain.fill(0);
  }
}
export async function decryptPrivate(
  key: CryptoKey,
  kind: keyof typeof privateNamespaces,
  player: string,
  iv: Hex,
  ciphertext: Uint8Array<ArrayBuffer>,
) {
  const plain = new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: new Uint8Array(hexToBytes(iv)),
        additionalData: new TextEncoder().encode(
          `${privateNamespaces[kind]}:${player.toLowerCase()}`,
        ),
      },
      key,
      ciphertext,
    ),
  );
  try {
    return JSON.parse(new TextDecoder().decode(plain)) as unknown;
  } finally {
    plain.fill(0);
  }
}
