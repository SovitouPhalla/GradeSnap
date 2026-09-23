import { NextRequest } from "next/server";
import { getAnonSupabase } from "@/lib/supabase/server";

export class AuthError extends Error {
  status: number;

  constructor(message = "Authentication required.", status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export async function requireTeacher(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;

  if (!token) {
    throw new AuthError("Missing authorization token.", 401);
  }

  const supabase = getAnonSupabase();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw new AuthError("Invalid or expired session.", 401);
  }

  return user;
}
