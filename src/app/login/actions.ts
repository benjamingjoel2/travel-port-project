"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { setSession } from "@/lib/auth";
import { isPasswordRequired, safeEqual } from "@/lib/auth/session-core";

export type LoginState = { error?: string } | undefined;

const schema = z.object({ password: z.string().min(1, "Enter the team password."), next: z.string().optional() });

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  if (!isPasswordRequired()) redirect("/");
  const parsed = schema.safeParse({ password: formData.get("password"), next: formData.get("next") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  // Tiny delay to blunt brute-force attempts.
  await new Promise((r) => setTimeout(r, 400));
  if (!safeEqual(parsed.data.password, process.env.DASHBOARD_PASSWORD ?? "")) {
    return { error: "That password isn't right." };
  }
  await setSession({});
  const next = parsed.data.next && parsed.data.next.startsWith("/") && !parsed.data.next.startsWith("//") ? parsed.data.next : "/";
  redirect(next);
}
