'use client';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useDesignStore } from '../store/designStore';
import { supabase } from '../lib/supabase';

export type ProjectLoadStatus = 'loading' | 'creating' | 'ready' | 'error';

/**
 * Loads the design tied to ?projectId=, or — for a direct /design visit —
 * creates a real `projects` row first instead of minting a browser-side
 * UUID that has no matching record anywhere in the database.
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
export function useDesignProjectLoader() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { setProjectId, loadFromSupabase, updateProject } = useDesignStore();
  const ranRef = useRef(false);
  const [status, setStatus] = useState<ProjectLoadStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const pid = searchParams.get('projectId');

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

    // No ?projectId= — a direct /design visit (e.g. the global "Design"
    // nav item, which intentionally supports starting a design with no
    // prior project). Create the backing project record for real instead
    // of silently assuming a client-generated id is valid.
    (async () => {
      setStatus('creating');
      const newId = crypto.randomUUID();
      const { error } = await supabase.from('projects').insert({
        id: newId,
        client_name: 'New Client',
        project_type: 'EPC',
        status: 'In Progress',
      });
      if (error) {
        console.error('Could not create a project record for this design:', error.message);
        setErrorMessage(error.message);
        setStatus('error');
        return;
      }
      setProjectId(newId);
      const params = new URLSearchParams(searchParams.toString());
      params.set('projectId', newId);
      router.replace(`${pathname}?${params.toString()}`);
      setStatus('ready');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount only — searchParams intentionally not a dep here

  return { status, errorMessage };
}
