import { NextRequest, NextResponse } from "next/server";
import { refreshAllMunicipalityCaches } from "@/lib/cache-refresh";

export const dynamic = "force-dynamic";
export const maxDuration = 1800;

export async function POST(request: NextRequest) {
  const configuredSecret = process.env.CACHE_REFRESH_SECRET;
  const authorization = request.headers.get("authorization");
  if (!configuredSecret || authorization !== `Bearer ${configuredSecret}`) {
    return NextResponse.json({ message: "UNAUTHORIZED" }, { status: 401 });
  }
  try {
    return NextResponse.json(await refreshAllMunicipalityCaches());
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "CACHE_REFRESH_FAILED" }, { status: 500 });
  }
}

