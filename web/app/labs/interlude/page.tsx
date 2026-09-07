import type {Metadata} from "next";
import {InterludeLab} from "../../../components/InterludeLab";
import "./interlude.css";
export const metadata:Metadata={title:"Interlude lab | PONGIT",description:"Try PONGIT Classic on its dedicated Interlude engine. Experimental friendly matches on Monad Testnet.",alternates:{canonical:"https://pongit.xyz/labs/interlude"}};
export default function Page(){return <InterludeLab/>;}
