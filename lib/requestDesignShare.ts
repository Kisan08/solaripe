export async function requestDesignShare(projectId: string): Promise<string> {
  const response = await fetch('/api/design-share', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId }), cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok || typeof data.token !== 'string') throw new Error(data.error || 'Could not create a secure design link.');
  return data.token;
}
