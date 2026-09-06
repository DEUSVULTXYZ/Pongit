export const authMessage = (player: string, nonce: string, expires: number, chainId: number, game: string) =>
  `PONGIT private app session\nPlayer: ${player.toLowerCase()}\nNonce: ${nonce}\nExpires: ${expires}\nChain: ${chainId}\nGame: ${game.toLowerCase()}\nScope: profile, invitations, encrypted notebook. No transactions or fund access.`;
export type NotebookData = {
  version: 1;
  rivals: { address: string; nickname: string; note: string }[];
  notes: { id: string; matchRef: string; atUs: string; text: string }[];
  settings: { sound: boolean; preferredMode: number };
};
export const emptyNotebook = (): NotebookData => ({version:1,rivals:[],notes:[],settings:{sound:false,preferredMode:0}});
