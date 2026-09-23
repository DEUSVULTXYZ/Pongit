import type {Metadata} from "next";
import {RegionTable} from "../../../components/RegionTable";
export const metadata:Metadata={title:"Player regions | PONGIT",robots:{index:false}};
export default function Page(){return <RegionTable/>;}
