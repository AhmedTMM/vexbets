import { getServer } from "../../../../src/server";
import { closeDueMarkets } from "../../../../src/services/resolution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Backstop for closing markets. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("unauthorized", { status: 401 });
  }
  const { deps } = await getServer();
  return Response.json({ resolved: await closeDueMarkets(deps) });
}
