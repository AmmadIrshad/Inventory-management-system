import "server-only";
import { headers } from "next/headers";

export async function getRequestMeta(): Promise<{ ipAddress: string; userAgent: string | null }> {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ipAddress: forwardedFor || requestHeaders.get("x-real-ip") || "unknown",
    userAgent: requestHeaders.get("user-agent"),
  };
}
