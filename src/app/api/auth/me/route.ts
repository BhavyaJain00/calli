import { requireUser, json } from "@/lib/api";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { user } = auth;
  return json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      orgName: user.org.name,
    },
  });
}
