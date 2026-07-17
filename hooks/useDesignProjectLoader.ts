'use client';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useDesignStore } from '../store/designStore';
// The plain lib/supabase.ts client has its own separate (non-cookie)
// session storage and never sees the logged-in session proxy.ts/login use
// — every request through it looks anonymous to Postgrest (auth.uid() is
// null), which is exactly what caused "new row violates row-level
// security policy for table projects" here once projects became
// tenant-scoped. lib/supabase/client.ts's createClient() is the one built
// on @supabase/ssr that actually carries the real session.
import { createClient } from '../lib/supabase/client';

const supabase = createClient();

export type ProjectLoadStatus = 'loading' | 'creating' | 'ready' | 'error';

/**
 * Loads the design tied to ?projectId=, or — for a direct /design visit —
 * creates a real `projects` row first instead of minting a browser-side
 * UUID that has no matching record anywhere in the database.
 *
 * `isClientView` (the ?client=1 shared read-only link) takes a completely
 * different, unauthenticated-safe path: `leads`/`designs`/`projects` are
 * now RLS-protected (tenant_id = auth.uid()), so a logged-out visitor's
 * direct client-side Supabase queries would return nothing at all. Instead
 * this fetches through app/api/public-design — a narrow, service-role,
 * single-project-only read (see that route for why a permissive RLS
 * policy was rejected in favor of this).
 *
 * IMPORTANT — not verified against a live Supabase instance from this
 * environment. The insert below assumes the `projects` table has
 * `id` (client-suppliable uuid), `client_name`, `project_type`,
 * `status` columns matching the app's `Project` TS type, and that any
 * other columns either allow NULL or have DB-level defaults. If any
 * other column is NOT NULL with no default, this insert will fail and
 * `status` will surface as 'error'. Please test a direct /design visit
 * against your actual database before relying on this.
 */
export function useDesignProjectLoader(isClientView: boolean) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { loadFromSupabase, loadDesignData, updateProject } = useDesignStore();
  const ranRef = useRef(false);
  const [status, setStatus] = useState<ProjectLoadStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const pid = searchParams.get('projectId');

    if (isClientView) {
      // Shared read-only link. Must always carry a projectId — there's no
      // "create a new project" concept for a logged-out visitor.
      if (!pid) {
        setErrorMessage('This share link is missing a project id.');
        setStatus('error');
        return;
      }
      (async () => {
        try {
          const res = await fetch(`/api/public-design?projectId=${encodeURIComponent(pid)}`);
          const data = await res.json();
          if (!res.ok) {
            setErrorMessage(data?.error || 'Failed to load this design.');
            setStatus('error');
            return;
          }
          loadDesignData(pid, data.design ?? null);
          if (data.project) {
            updateProject({
              clientName: data.project.client_name || 'New Client',
              address: data.project.address || 'Enter address...',
            });
          }
          setStatus('ready');
        } catch (err) {
          console.error('Could not load shared design:', err);
          setErrorMessage('Failed to load this design.');
          setStatus('error');
        }
      })();
      return;
    }

    if (pid) {
      (async () => {
        // loadFromSupabase pulls roofs/panels/obstacles from the DESIGNS
        // table — it has nothing to do with the project's own identity.
        await loadFromSupabase(pid);
        // The client's real name & address live on the PROJECT record
        // itself (see ProjectCard's "Open in Designer" link — it only
        // ever passes ?projectId=, never name/address as params). Fetch
        // that record directly and let it win over whatever the saved
        // design's own project_info snapshot had.
        try {
          const { data, error } = await supabase
            .from('projects')
            .select('client_name, address')
            .eq('id', pid)
            .single();
          if (!error && data) {
            updateProject({
              clientName: data.client_name || 'New Client',
              address: data.address || 'Enter address...',
            });
          }
        } catch (err) {
          console.error('Could not load project name/address:', err);
        }
        setStatus('ready');
      })();
      return;
    }

    // No ?projectId= — a bare /design visit. This used to auto-create a
    // brand-new blank project on every single mount (the sidebar's
    // "Design" nav item pointed straight here), which meant just clicking
    // that nav link repeatedly left behind a pile of empty "New Client"
    // projects. Projects already has its own "+ New Project" button that
    // creates exactly one project and links into the designer with a real
    // projectId — send bare /design visits there instead of minting
    // another row here.
    router.replace('/projects');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount only — searchParams/isClientView intentionally not deps here

  return { status, errorMessage };
}
