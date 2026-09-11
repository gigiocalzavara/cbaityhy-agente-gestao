import { getSaude360Indicators } from "@/lib/saude-360";
import oral from "@/config/oral-health-indicators.json";
import emulti from "@/config/emulti-indicators.json";

export type IndicatorGroup = "aps" | "oral" | "emulti";
export type OfficialIndicator = {
  id:string; title:string; toolId:string|null; status:"schema_pending"|"partial"|"ready"|"validated";
  description:string; formula?:string; unit?:string; polarity?:string; ranges?:string;
  weights?: Array<{code:string;label:string;points:number}>; requiredDomains:string[];
};

export function getOfficialIndicators(group: IndicatorGroup): OfficialIndicator[] {
  if (group === "oral") return oral.indicators as OfficialIndicator[];
  if (group === "emulti") return emulti.indicators as OfficialIndicator[];
  return getSaude360Indicators() as OfficialIndicator[];
}
