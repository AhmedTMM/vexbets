import { health } from "../../../src/health";
import { getServer } from "../../../src/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const { deps } = await getServer();
  return Response.json(await health(deps));
}
