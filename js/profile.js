import { supabase, requireAuth, signOut } from './auth.js';

export async function loadProfile() {
  try {
    const session = await requireAuth();
    const user    = session.user;
    let profile   = {};

    document.getElementById('profileEmail').textContent = user.email || '';
    document.getElementById('signOutBtn').addEventListener('click', signOut);

    async function fetchProfile() {
      const [profileRes, brewsRes, followersRes, followingRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('coffee_logs').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', user.id),
        supabase.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', user.id),
      ]);

      profile = profileRes.data || {};

      const displayName = profile.full_name || profile.username || user.email;
      document.getElementById('profileName').textContent   = displayName;
      document.getElementById('profileBio').textContent    = profile.bio || '';
      document.getElementById('statBrews').textContent     = brewsRes.count     ?? 0;
      document.getElementById('statFollowers').textContent = followersRes.count ?? 0;
      document.getElementById('statFollowing').textContent = followingRes.count ?? 0;
      if (profile.avatar_url) document.getElementById('profileAvatar').src = profile.avatar_url;
    }

    window.startEdit = function() {
      document.getElementById('editName').value     = profile.full_name || '';
      document.getElementById('editUsername').value = profile.username  || '';
      document.getElementById('editBio').value      = profile.bio       || '';
      document.getElementById('viewMode').style.display = 'none';
      document.getElementById('editMode').style.display = 'flex';
      document.getElementById('editError').style.display = 'none';
    };

    window.cancelEdit = function() {
      document.getElementById('editMode').style.display = 'none';
      document.getElementById('viewMode').style.display = 'flex';
    };

    window.saveProfile = async function() {
      const btn      = document.getElementById('saveBtn');
      const fullName = document.getElementById('editName').value.trim();
      const username = document.getElementById('editUsername').value.trim().replace(/^@/, '');
      const bio      = document.getElementById('editBio').value.trim();

      btn.disabled = true;
      btn.textContent = 'Saving…';
      document.getElementById('editError').style.display = 'none';

      const { error } = await supabase
        .from('profiles')
        .upsert({ id: user.id, full_name: fullName || null, username: username || null, bio: bio || null });

      if (error) {
        const msg = error.message.includes('unique') ? 'That username is already taken.' : error.message;
        const errEl = document.getElementById('editError');
        errEl.textContent = msg;
        errEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Save';
        return;
      }

      await fetchProfile();
      window.cancelEdit();
      btn.disabled = false;
      btn.textContent = 'Save';
    };

    await fetchProfile();

  } catch (err) {
    console.error('Profile load error:', err);
  }
}
