import { NextResponse } from "next/server";
import { supabase } from "@/src/lib/supabase/client";
import type { Client } from "@/lib/database.types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(
      new URL("/?error=missing_code", request.url)
    );
  }

  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("code_client", code)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.redirect(
      new URL("/?error=client_not_found", request.url)
    );
  }

  const client = data as Client;

  return NextResponse.redirect(
    new URL(`/commande?code=${client.code_client}`, request.url)
  );
}