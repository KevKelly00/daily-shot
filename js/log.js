import { supabase, requireAuth } from './auth.js';
import { esc } from './utils.js';
import { sendNotification } from './push.js';

export async function loadLog() {
  try {
    const session = await requireAuth();
    const userId  = session.user.id;

    let selectedPhoto  = null;
    let logType        = 'home';
    let artStyle       = null;
    let milkType       = null;
    let drinkOrder     = null;
    let artRating      = null;
    let flavourRating  = null;
    let selectedBeanId = null;

    // ── Type toggle ────────────────────────────────────────────────────────────
    window.setType = function(type) {
      logType = type;
      document.getElementById('typeHome').classList.toggle('active',  type === 'home');
      document.getElementById('typeCafe').classList.toggle('active',  type === 'cafe');
      document.getElementById('typeBeans').classList.toggle('active', type === 'beans');
      document.getElementById('homeFields').style.display    = type === 'home'  ? 'flex' : 'none';
      document.getElementById('cafeFields').style.display    = type === 'cafe'  ? 'flex' : 'none';
      document.getElementById('newBagFields').style.display  = type === 'beans' ? 'flex' : 'none';
      document.getElementById('artRatingSection').style.display    = type === 'beans' ? 'none' : '';
      document.getElementById('flavourRatingSection').style.display = type === 'beans' ? 'none' : '';
      document.getElementById('artRatingLabel').textContent         = type === 'cafe' ? 'Latte art rating' : 'Art rating';
      document.getElementById('flavourRatingLabel').textContent     = type === 'cafe' ? 'Coffee rating'    : 'Flavour rating';
      document.getElementById('notesInput').placeholder = type === 'cafe'
        ? 'How was the coffee? Would you go back?'
        : type === 'beans'
        ? 'First impressions, tasting notes, expectations…'
        : 'What went well? What would you do differently?';
    };

    // ── Photo ──────────────────────────────────────────────────────────────────
    window.handlePhoto = function(e) {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) { showError('Photo must be under 10 MB.'); return; }
      selectedPhoto = file;
      const preview = document.getElementById('previewImg');
      preview.src = URL.createObjectURL(file);
      preview.style.display = 'block';
      document.getElementById('changePhotoBtn').style.display = 'block';
      document.querySelector('.upload-icon').style.display = 'none';
      document.querySelector('.upload-hint').style.display = 'none';
    };

    // ── Chips ──────────────────────────────────────────────────────────────────
    function initChips(containerId, onSelect) {
      document.getElementById(containerId).querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', () => {
          document.getElementById(containerId).querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
          chip.classList.add('selected');
          onSelect(chip.dataset.value);
        });
      });
    }

    initChips('artStyleChips',   v => { artStyle   = v; });
    initChips('milkChips',       v => { milkType   = v; });
    initChips('drinkOrderChips', v => {
      drinkOrder = v;
      const otherInput = document.getElementById('drinkOrderOther');
      if (v === 'Other') {
        otherInput.style.display = 'block';
        otherInput.focus();
      } else {
        otherInput.style.display = 'none';
        otherInput.value = '';
      }
    });

    // ── Bean inventory dropdowns ───────────────────────────────────────────────
    const { data: beans } = await supabase
      .from('beans')
      .select('id, name, roast_date')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('name');

    // Home brew bean dropdown
    if (beans && beans.length > 0) {
      const select = document.getElementById('beansSelect');
      const input  = document.getElementById('beansInput');

      select.innerHTML = '<option value="">Select a bean…</option>'
        + beans.map(b => `<option value="${esc(b.name)}" data-id="${b.id}">${esc(b.name)}</option>`).join('')
        + '<option value="__other__">Other (type manually)…</option>';

      select.style.display = 'block';
      input.style.display  = 'none';

      select.addEventListener('change', () => {
        const opt = select.options[select.selectedIndex];
        selectedBeanId = opt?.dataset?.id || null;
        if (select.value === '__other__') {
          selectedBeanId = null;
          select.style.display = 'none';
          input.style.display  = 'block';
          input.focus();
        }
      });
    }

    // New bag bean selector
    const newBagSelect = document.getElementById('newBagBeanSelect');
    const newBagInput  = document.getElementById('newBagBeanInput');
    newBagSelect.innerHTML = '<option value="">Select a bean…</option>'
      + (beans || []).map(b => `<option value="${esc(b.name)}" data-id="${b.id}">${esc(b.name)}</option>`).join('')
      + '<option value="__new__">New bean (type name)…</option>';
    newBagSelect.addEventListener('change', () => {
      if (newBagSelect.value === '__new__') {
        newBagInput.style.display = 'block';
        newBagInput.focus();
      } else {
        newBagInput.style.display = 'none';
        newBagInput.value = '';
      }
    });

    // ── Half-star rating ───────────────────────────────────────────────────────
    function buildStars(containerId, displayId, onRate) {
      const container = document.getElementById(containerId);
      let current = null;

      for (let i = 1; i <= 5; i++) {
        const wrap = document.createElement('div');
        wrap.className = 'star-wrap';
        wrap.innerHTML = `
          <svg viewBox="0 0 24 24" fill="var(--border)" xmlns="http://www.w3.org/2000/svg">
            <path id="star-${containerId}-${i}" d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01z"/>
          </svg>
          <div class="half-l" data-star="${i}" data-half="0.5"></div>
          <div class="half-r" data-star="${i}" data-half="1"></div>`;
        container.appendChild(wrap);
      }

      container.addEventListener('click', e => {
        const half = e.target.dataset.half;
        const star = e.target.dataset.star;
        if (!half || !star) return;
        const value = parseFloat(star) - 1 + parseFloat(half);
        current = value;
        onRate(value);
        renderStars(containerId, displayId, value);
      });

      container.addEventListener('mouseover', e => {
        const half = e.target.dataset.half;
        const star = e.target.dataset.star;
        if (!half || !star) return;
        renderStars(containerId, displayId, parseFloat(star) - 1 + parseFloat(half), true);
      });
      container.addEventListener('mouseleave', () => {
        renderStars(containerId, displayId, current, false);
      });
    }

    function renderStars(containerId, displayId, value, preview = false) {
      const container = document.getElementById(containerId);
      const display   = document.getElementById(displayId);
      const paths     = container.querySelectorAll('path');

      paths.forEach((path, i) => {
        const starNum = i + 1;
        const filled  = value >= starNum ? 1 : value >= starNum - 0.5 ? 0.5 : 0;
        const color   = preview ? '#c0c0c0' : 'var(--accent)';

        if (filled === 1) {
          path.setAttribute('fill', value !== null ? color : 'var(--border)');
        } else if (filled === 0.5) {
          path.setAttribute('fill', `url(#half-${containerId}-${starNum})`);
          ensureHalfGradient(container, containerId, starNum, color);
        } else {
          path.setAttribute('fill', 'var(--border)');
        }
      });

      display.textContent = value !== null ? `${value} / 5` : '—';
    }

    function ensureHalfGradient(container, containerId, starNum, color) {
      const svgEl = container.querySelectorAll('svg')[starNum - 1];
      const gradId = `half-${containerId}-${starNum}`;
      if (!svgEl.querySelector(`#${gradId}`)) {
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        defs.innerHTML = `
          <linearGradient id="${gradId}" x1="0" x2="1" y1="0" y2="0">
            <stop offset="50%" stop-color="${color}"/>
            <stop offset="50%" stop-color="var(--border)"/>
          </linearGradient>`;
        svgEl.prepend(defs);
      }
    }

    buildStars('artStars',     'artRatingDisplay',     v => { artRating = v; });
    buildStars('flavourStars', 'flavourRatingDisplay', v => { flavourRating = v; });

    // ── Submit ─────────────────────────────────────────────────────────────────
    window.handleSubmit = async function(e) {
      e.preventDefault();
      hideError();

      const btn = document.getElementById('submitBtn');
      btn.disabled = true;
      btn.textContent = 'Saving…';

      try {
        let photoUrl = null;
        if (selectedPhoto) {
          const mimeToExt = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' };
          const ext  = mimeToExt[selectedPhoto.type] || selectedPhoto.name.split('.').pop() || 'jpg';
          const path = `${userId}/${Date.now()}.${ext}`;
          const { error: uploadError } = await supabase.storage
            .from('coffee-photos')
            .upload(path, selectedPhoto, { contentType: selectedPhoto.type || 'image/jpeg' });
          if (uploadError) throw uploadError;
          const { data: { publicUrl } } = supabase.storage.from('coffee-photos').getPublicUrl(path);
          photoUrl = publicUrl;
        }

        const row = {
          user_id:  userId,
          log_type: logType,
          notes:    document.getElementById('notesInput').value.trim() || null,
          photo_url: photoUrl,
        };

        if (logType === 'home') {
          row.art_style      = artStyle;
          row.art_rating     = artRating;
          row.flavour_rating = flavourRating;
          row.milk           = milkType;
          const select   = document.getElementById('beansSelect');
          const input    = document.getElementById('beansInput');
          const beansVal = select.style.display !== 'none' ? select.value : input.value.trim();
          row.beans      = (beansVal && beansVal !== '__other__') ? beansVal : (input.value.trim() || null);
          if (selectedBeanId) row.bean_id = selectedBeanId;
        } else if (logType === 'cafe') {
          row.art_rating     = artRating;
          row.flavour_rating = flavourRating;
          row.cafe_name      = document.getElementById('cafeNameInput').value.trim() || null;
          row.cafe_location  = document.getElementById('cafeLocationInput').value.trim() || null;
          const otherVal     = document.getElementById('drinkOrderOther').value.trim();
          row.drink_order    = drinkOrder === 'Other' ? (otherVal || 'Other') : (drinkOrder || null);
        } else if (logType === 'beans') {
          const opt      = newBagSelect.options[newBagSelect.selectedIndex];
          const isNew    = newBagSelect.value === '__new__';
          const beanName = isNew ? newBagInput.value.trim() : newBagSelect.value;
          if (!beanName) { showError('Please enter or select a bean.'); btn.disabled = false; btn.textContent = 'Save brew'; return; }
          const roastDate = document.getElementById('newBagRoastDate').value || null;

          if (isNew) {
            // Create a new bean in inventory
            const { data: newBean, error: beanError } = await supabase
              .from('beans')
              .insert({ user_id: userId, name: beanName, roast_date: roastDate, is_active: true })
              .select('id')
              .single();
            if (beanError) throw beanError;
            row.bean_id = newBean.id;
          } else {
            row.bean_id = opt?.dataset?.id || null;
            // Update roast date on existing bean if provided
            if (roastDate && row.bean_id) {
              await supabase.from('beans').update({ roast_date: roastDate }).eq('id', row.bean_id);
            }
          }
          row.beans = beanName;
        }

        const { error, data: newLog } = await supabase.from('coffee_logs').insert(row).select('id').single();
        if (error) throw error;

        // Notify followers of new post (fire and forget)
        if (logType !== 'beans') {
          const { data: followers } = await supabase.from('follows').select('follower_id').eq('following_id', userId);
          if (followers && followers.length > 0) {
            const { data: poster } = await supabase.from('profiles').select('full_name, username').eq('id', userId).single();
            const name = poster?.full_name || poster?.username || 'Someone you follow';
            const typeLabel = logType === 'cafe' ? 'cafe visit' : 'home brew';
            followers.forEach(f => {
              sendNotification(f.follower_id, '☕ New post', `${name} logged a ${typeLabel}`, `/log-detail.html?id=${newLog.id}`);
            });
          }
        }

        window.location.href = '/dashboard.html';

      } catch (err) {
        showError(err.message || 'Something went wrong. Please try again.');
        btn.disabled = false;
        btn.textContent = 'Save brew';
      }
    };

    function showError(msg) {
      const el = document.getElementById('errorMsg');
      el.textContent = msg;
      el.style.display = 'block';
    }
    function hideError() {
      document.getElementById('errorMsg').style.display = 'none';
    }

  } catch (err) {
    console.error('Log page error:', err);
  }
}
