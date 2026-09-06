import type {Page} from "@playwright/test";
export async function openCabinet(page:Page){const toggle=page.getByRole("button",{name:"Cabinet tools",exact:true});if(await toggle.isVisible() && await toggle.getAttribute("aria-expanded")!=="true")await toggle.click();}
