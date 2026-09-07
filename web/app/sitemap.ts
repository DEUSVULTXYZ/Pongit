import type {MetadataRoute} from "next";
import {docs,docsOrigin} from "../lib/docs";
export default function sitemap():MetadataRoute.Sitemap{return [{url:docsOrigin+"/",changeFrequency:"weekly",priority:1},{url:docsOrigin+"/docs",changeFrequency:"weekly",priority:.8},...docs.pages.map(p=>({url:`${docsOrigin}/docs/${p.slug}`,lastModified:new Date(p.updated),changeFrequency:"monthly" as const,priority:.6}))];}
