import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyDesignToken } from '@/lib/security/designShareToken';

// Only an owner-issued, expiring capability permits these scoped service-role reads.
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  const scope = verifyDesignToken(req.nextUrl.searchParams.get('shareToken'), projectId || '', process.env.DESIGN_SHARE_SECRET);
  if (!scope) {
    return NextResponse.json({ error: 'This link is invalid or expired. Ask your EPC vendor for a new link.' }, { status: 403, headers: { 'Cache-Control': 'private, no-store' } });
  }

  const [{ data: design, error: designError }, { data: project, error: projectError }] = await Promise.all([
    supabaseAdmin
      .from("designs")
      .select("project_id, roofs, obstacles, panels, walkways, equipment, map_config, wall_height_m")
      .eq("project_id", projectId)
      .eq('tenant_id', scope.tenantId)
      .maybeSingle(),
    supabaseAdmin
      .from("projects")
      .select("client_name, address")
      .eq("id", projectId)
      .eq('tenant_id', scope.tenantId)
      .maybeSingle(),
  ]);

  if (designError || projectError) {
    return NextResponse.json({ error: "Failed to load design" }, { status: 500 });
  }

  if (!design || !project) return NextResponse.json({ error: 'Design not found' }, { status: 404 });
  return NextResponse.json({ design, project }, { headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
}
