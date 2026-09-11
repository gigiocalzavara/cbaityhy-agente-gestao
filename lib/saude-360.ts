import methodology from "@/config/saude-360-indicators.json";

export type Saude360Status = "schema_pending" | "partial" | "ready" | "validated";
export type Saude360Indicator = (typeof methodology.indicators)[number] & { status: Saude360Status };
export const saude360Methodology = methodology;
export function getSaude360Indicators() { return methodology.indicators as Saude360Indicator[]; }

export function classifySaude360(indicatorId: string, score: number) {
  if (!Number.isFinite(score) || score < 0 || score > 100) return "Sem classificação";
  if (indicatorId === "C1") {
    if (score > 50 && score <= 70) return "Ótimo";
    if (score > 30 && score <= 50) return "Bom";
    if (score > 10 && score <= 30) return "Suficiente";
    return "Regular";
  }
  if (score > 75) return "Ótimo";
  if (score > 50) return "Bom";
  if (score > 25) return "Suficiente";
  return "Regular";
}
