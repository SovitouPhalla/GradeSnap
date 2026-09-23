import { NextRequest } from "next/server";
import { getAnonSupabase } from "@/lib/supabase/server";

export async function requireTeacher(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;

  if (!token) {
    throw new Error("Missing authorization token.");
  }

  const supabase = getAnonSupabase();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw new Error("Invalid or expired session.");
  }

  return user;
}
