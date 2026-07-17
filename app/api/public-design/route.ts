import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// SERVER-ONLY, service-role — the ONE deliberate exception to tenant RLS.
// Used exclusively by the ?client=1 shared read-only design view, for
// visitors who are never logged in at all (customers, not Solaripe users).
//
// This is intentionally NOT a general bypass: it takes exactly one
// projectId and returns exactly the design + project fields the client
// view renders — no list endpoint, no other columns, no way to enumerate
// another tenant's data. A permissive "anon can select" RLS policy was
// considered and rejected: RLS can't tell "this request came with a
// specific known projectId" from "this is anyone with the public anon key
// running an unfiltered query" — the anon key is embedded in the client
// bundle and visible to anyone, so a blanket policy would let anyone dump
// every tenant's entire designs table with one raw REST call. This route
// is the narrow alternative: the security boundary is "you must already
// know the unguessable project UUID," identical to how shared links
// already worked before tenants existed at all.
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const [{ data: design, error: designError }, { data: project, error: projectError }] = await Promise.all([
    supabaseAdmin
      .from("designs")
      .select("project_id, roofs, obstacles, panels, walkways, project_info, equipment, map_config, wall_height_m")
      .eq("project_id", projectId)
      .maybeSingle(),
    supabaseAdmin
      .from("projects")
      .select("client_name, address")
      .eq("id", projectId)
      .maybeSingle(),
  ]);

  if (designError || projectError) {
    console.error("[public-design]", designError, projectError);
    return NextResponse.json({ error: "Failed to load design" }, { status: 500 });
  }

  return NextResponse.json({ design, project });
}
