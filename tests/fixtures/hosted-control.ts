import {LEGACY_HOSTED_HUB} from '../../shared/hosted-control';
/** Session tests inject their own response. Route configuration is a separate,
 * correctly identified public response; hosted-control.test covers its failures. */
export function configuredControl(session:typeof fetch):typeof fetch{
 return (async(input,init)=>String(input).endsWith('/config')?Response.json({hub:LEGACY_HOSTED_HUB,
  chainId:10143,validator:'0xB28E684815b095aB5Fb324214cfEa63d76F3d691'}):session(input,init)) as typeof fetch;
}
