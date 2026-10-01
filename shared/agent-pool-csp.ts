import {validateAgentPoolManifest,type AgentPoolManifest} from './agent-pool';
import {NO_LEASE_HUB} from './hub-lease';

/** The build and API accept the same generations. Closed manifests still need
 * their exact HTTPS/WSS origins for private browser qualification. */
export function agentPoolCspOrigins(raw:unknown):string{
 const m=validateAgentPoolManifest(raw as AgentPoolManifest);
 return m.arenas.flatMap(a=>{
  const approved=m.hub.toLowerCase()===NO_LEASE_HUB.toLowerCase()
   ?m.version===5&&a.node===`https://il2-eu-${a.app.slice(2,18).toLowerCase()}.fly.dev`
   :/^https:\/\/il-[a-f0-9]+\.fly\.dev$/.test(a.node);
  if(!approved)throw Error('Unapproved pool arena in CSP manifest');
  return[a.node,a.node.replace(/^https:/,'wss:')];
 }).join(' ');
}
