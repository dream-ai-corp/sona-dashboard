const API_URL =
  typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_SONA_API_URL ?? ''
    : process.env.SONA_API_URL ?? 'http://172.17.0.1:8080';

export async function fetchAPI(path: string, opts?: RequestInit) {
  const res = await fetch(`${API_URL}${path}`, {
    cache: 'no-store',
    ...opts,
  });
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res.json();
}

export async function postAPI(path: string, body: unknown) {
  return fetchAPI(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
