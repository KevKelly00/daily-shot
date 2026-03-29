export function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Fade in images as they load
document.addEventListener('load', e => {
  if (e.target.tagName === 'IMG') e.target.classList.add('loaded');
}, true);

// Mark already-loaded images immediately (cached / sync)
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('img').forEach(img => {
    if (img.complete) img.classList.add('loaded');
  });
});
