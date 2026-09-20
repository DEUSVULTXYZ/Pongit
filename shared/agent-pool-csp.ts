import {validateAgentPoolManifest,type AgentPoolManifest} from './agent-pool';

/** The build and API accept the same generations. Closed manifests still need
 * their exact HTTPS/WSS origins for private browser qualification. */
export function agentPoolCspOrigins(raw:unknown):string{
 const m=validateAgentPoolManifest(raw as AgentPoolManifest);
 return m.arenas.flatMap(a=>{
  if(!/^https:\/\/il-[a-f0-9]+\.fly\.dev$/.test(a.node))throw Error('Unapproved pool arena in CSP manifest');
  return[a.node,a.node.replace(/^https:/,'wss:')];
 }).join(' ');
}
