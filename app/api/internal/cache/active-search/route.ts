import { NextRequest, NextResponse } from "next/server";
import { refreshAllActiveSearchCaches } from "@/lib/active-search-cache";
export const dynamic = "force-dynamic";
export const maxDuration = 1800;
export async function POST(request: NextRequest) {
  const configuredSecret = process.env.CACHE_REFRESH_SECRET;
  if (!configuredSecret || request.headers.get("authorization") !== "Bearer " + configuredSecret) return NextResponse.json({ message: "UNAUTHORIZED" }, { status: 401 });
  try { return NextResponse.json(await refreshAllActiveSearchCaches()); }
  catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "ACTIVE_SEARCH_REFRESH_FAILED" }, { status: 500 }); }
}
