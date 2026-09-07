import data from "./docs.generated.json";
export type DocPage=typeof data.pages[number];
export const docs=data;
export const docBySlug=(slug:string)=>data.pages.find(p=>p.slug===slug);
export const docsOrigin="https://pongit.xyz";
