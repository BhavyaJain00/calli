import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { needsSetup } from "@/lib/setup";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (await needsSetup()) redirect("/setup");
  const session = await getSession();
  redirect(session ? "/dashboard" : "/login");
}
