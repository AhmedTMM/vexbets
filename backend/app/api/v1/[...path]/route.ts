import { getServer } from "../../../../src/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(req: Request): Promise<Response> {
  const { api } = await getServer();
  return api.handle(req);
}

export { handle as GET, handle as POST };
