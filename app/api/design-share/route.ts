import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { issueDesignToken } from '@/lib/security/designShareToken';

export async function POST(req: NextRequest) {
  const db = await createServerSupabaseClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null);
  const projectId = body?.projectId;
  if (typeof projectId !== 'string' || !/^[0-9a-f-]{36}$/i.test(projectId)) {
    return NextResponse.json({ error: 'Invalid project' }, { status: 400 });
  }
  const { data: project, error } = await db.from('projects').select('id')
    .eq('id', projectId).eq('tenant_id', user.id).maybeSingle();
  const { data: design, error: designError } = await db.from('designs').select('project_id')
    .eq('project_id', projectId).eq('tenant_id', user.id).maybeSingle();
  if (error || designError || !project || !design) {
    return NextResponse.json({ error: 'Saved design not found' }, { status: 404 });
  }
  try {
    return NextResponse.json(issueDesignToken(projectId, user.id, process.env.DESIGN_SHARE_SECRET), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch {
    return NextResponse.json({ error: 'Secure design sharing is not configured. Contact your administrator.' }, { status: 503 });
  }
}
