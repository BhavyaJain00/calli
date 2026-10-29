import { brandIcon } from "@/lib/brand-icon";

const SIZES = ["192", "512"] as const;

export const dynamic = "force-static";
export function generateStaticParams() {
  return SIZES.map((size) => ({ size }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  if (!(SIZES as readonly string[]).includes(size)) {
    return new Response("Not found", { status: 404 });
  }
  return brandIcon(Number(size));
}
