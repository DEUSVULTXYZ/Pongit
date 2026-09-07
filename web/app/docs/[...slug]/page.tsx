import {notFound} from "next/navigation";
import type {Metadata} from "next";
import {docs,docBySlug,docsOrigin} from "../../../lib/docs";
import {articles} from "../../../content/docs/registry.generated";
import {DocsArticle} from "../../../components/docs/DocsArticle";
export const dynamicParams=false;
export function generateStaticParams(){return docs.pages.map(p=>({slug:p.slug.split("/")}));}
export async function generateMetadata({params}:{params:Promise<{slug:string[]}>}):Promise<Metadata>{const {slug}=await params,page=docBySlug(slug.join("/"));if(!page)return {};return {title:page.title,description:page.description,alternates:{canonical:`${docsOrigin}/docs/${page.slug}`},openGraph:{title:`${page.title} | PONGIT Docs`,description:page.description,url:`${docsOrigin}/docs/${page.slug}`}};}
export default async function DocPage({params}:{params:Promise<{slug:string[]}>}){const {slug}=await params,page=docBySlug(slug.join("/")),Content=articles[slug.join("/")];if(!page||!Content)notFound();return <DocsArticle page={page}><Content/></DocsArticle>;}
