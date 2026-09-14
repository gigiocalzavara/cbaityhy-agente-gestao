import { NextRequest, NextResponse } from "next/server";
import { refreshAllActiveSearchCaches } from "@/lib/active-search-cache";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

let refreshInProgress = false;

export async function POST(request: NextRequest) {
  const configuredSecret = process.env.CACHE_REFRESH_SECRET;
  if (!configuredSecret || request.headers.get("authorization") !== "Bearer " + configuredSecret) {
    return NextResponse.json({ message: "UNAUTHORIZED" }, { status: 401 });
  }

  if (refreshInProgress) {
    return NextResponse.json({ accepted: true, status: "already_running" }, { status: 202 });
  }

  refreshInProgress = true;
  // Entrega o 202 ao proxy antes de abrir SSH ou iniciar consultas pesadas.
  setTimeout(() => {
    void refreshAllActiveSearchCaches()
      .catch((error) => {
        console.error("ACTIVE_SEARCH_BACKGROUND_REFRESH_FAILED", error);
      })
      .finally(() => {
        refreshInProgress = false;
      });
  }, 1_000);

  return NextResponse.json(
    { accepted: true, status: "processing", monitor: "/admin/processamentos" },
    { status: 202 },
  );
}
