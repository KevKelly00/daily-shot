import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Returns the current session, or null
export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

// Returns the current user, or null
export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// Redirect to dashboard if already logged in
export async function requireGuest() {
  const session = await getSession();
  if (session) window.location.href = '/dashboard.html';
}

// Redirect to login if not logged in — never resolves if unauthenticated
export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    window.location.href = '/index.html';
    return new Promise(() => {});
  }
  return session;
}

export async function signUpWithEmail(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  return { data, error };
}

export async function signInWithEmail(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return { data, error };
}

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/dashboard.html` }
  });
  return { error };
}

export async function signOut() {
  await supabase.auth.signOut();
  window.location.href = '/index.html';
}
