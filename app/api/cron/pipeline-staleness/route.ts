import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendWhatsAppTo, formatPipelineStalenessMessage } from "@/lib/whatsappNotify";

// Purely a manual-tracker nudge — there is no live government API this
// polls. It only compares timestamps the tenant themselves set on the
// project card against the expected_days the tenant themselves configured
// in Settings > Pipeline Stages.
//
// Unlike lead-reminders (which queries across all tenants and fires every
// message to one hardcoded OWNER_WHATSAPP_NUMBER — a gap that predates
// this route and isn't touched here), this cron groups stale projects by
// tenant and sends each tenant exactly one digest to their own
// settings.owner_phone, so one tenant's stuck projects never leak into
// another tenant's notification.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: projects, error: projectsError } = await supabaseAdmin
    .from("projects")
    .select("id, tenant_id, client_name, current_stage_id, current_stage_entered_at")
    .not("current_stage_id", "is", null)
    .not("current_stage_entered_at", "is", null);

  if (projectsError) {
    console.error("[cron/pipeline-staleness] failed to query projects", projectsError);
    return NextResponse.json({ error: projectsError.message }, { status: 500 });
  }

  const { data: stages, error: stagesError } = await supabaseAdmin
    .from("tenant_pipeline_stages")
    .select("id, tenant_id, name, expected_days")
    .eq("active", true);

  if (stagesError) {
    console.error("[cron/pipeline-staleness] failed to query stages", stagesError);
    return NextResponse.json({ error: stagesError.message }, { status: 500 });
  }

  const stageById = new Map((stages ?? []).map((s) => [s.id, s]));
  const now = Date.now();

  const staleByTenant = new Map<string, { clientName: string; stageName: string; daysStuck: number }[]>();
  for (const p of projects ?? []) {
    const stage = stageById.get(p.current_stage_id as string);
    if (!stage || stage.expected_days == null) continue;
    const daysElapsed = Math.floor((now - new Date(p.current_stage_entered_at as string).getTime()) / 86400000);
    const daysStuck = daysElapsed - stage.expected_days;
    if (daysStuck <= 0) continue;

    const list = staleByTenant.get(p.tenant_id as string) ?? [];
    list.push({ clientName: p.client_name as string, stageName: stage.name, daysStuck });
    staleByTenant.set(p.tenant_id as string, list);
  }

  if (staleByTenant.size === 0) {
    return NextResponse.json({ tenantsNotified: 0, tenantsSkipped: 0, tenantsWithStaleProjects: 0 });
  }

  const { data: settingsRows, error: settingsError } = await supabaseAdmin
    .from("settings")
    .select("tenant_id, owner_phone")
    .in("tenant_id", Array.from(staleByTenant.keys()));

  if (settingsError) {
    console.error("[cron/pipeline-staleness] failed to query settings", settingsError);
    return NextResponse.json({ error: settingsError.message }, { status: 500 });
  }

  const phoneByTenant = new Map((settingsRows ?? []).map((s) => [s.tenant_id as string, s.owner_phone as string | null]));

  const results = await Promise.all(
    Array.from(staleByTenant.entries()).map(async ([tenantId, staleProjects]) => {
      const phone = phoneByTenant.get(tenantId);
      if (!phone) {
        console.error(`[cron/pipeline-staleness] tenant ${tenantId} has no owner_phone set, skipping`);
        return { tenantId, sent: false, skipped: true, staleCount: staleProjects.length };
      }
      const message = formatPipelineStalenessMessage(staleProjects);
      const result = await sendWhatsAppTo(phone, message);
      return { tenantId, sent: result.ok, error: result.error, staleCount: staleProjects.length };
    }),
  );

  return NextResponse.json({
    tenantsWithStaleProjects: staleByTenant.size,
    tenantsNotified: results.filter((r) => r.sent).length,
    tenantsSkipped: results.filter((r) => "skipped" in r && r.skipped).length,
    failed: results.filter((r) => !r.sent && !("skipped" in r && r.skipped)),
  });
}
