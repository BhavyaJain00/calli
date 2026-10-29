import { getCurrentUser } from "@/lib/session";
import { CallDetail } from "@/components/CallDetail";

export const dynamic = "force-dynamic";

export default async function CallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return null;
  const { id } = await params;
  return <CallDetail callId={id} isAdmin={user.role === "ADMIN"} />;
}
