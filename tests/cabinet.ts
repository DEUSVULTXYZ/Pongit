import type {Page} from "@playwright/test";
export async function openCabinet(page:Page){const toggle=page.getByRole("button",{name:"Cabinet tools",exact:true});if(await toggle.isVisible() && await toggle.getAttribute("aria-expanded")!=="true")await toggle.click();}

export async function openWallet(page:Page){const close=page.getByRole("button",{name:"Close cabinet tools",exact:true});if(await close.isVisible())await close.click();await page.getByRole("button",{name:"Open account details",exact:true}).click();}
export async function closeWallet(page:Page){await page.getByRole("button",{name:"Close account details",exact:true}).click();}
export async function activity(page:Page,name:string){await page.getByRole("button",{name:"More",exact:false}).click();await page.getByRole("dialog",{name:"More arcade activities"}).getByRole("button",{name:name==="Archive"?"Replays":name,exact:false}).click();}
