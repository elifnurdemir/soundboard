// Çevrimiçi sesleri dinleme: önizleme linki doğrudan akış olarak çalınır, diske hiçbir şey yazılmaz.
// Sadece senin hoparlöründe çalar (AudioEngine'e ve sanal kabloya girmez), aynı anda tek ses.
let audio = null;
let currentId = null;

export function stopPreview() {
  if (audio) {
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    audio = null;
  }
  currentId = null;
}

/** onEnd(err?) — ses bitince ya da hata olunca bir kez çağrılır. */
export function playPreview(id, url, onEnd) {
  stopPreview();
  const a = new Audio(url);
  a.volume = 0.9;
  audio = a;
  currentId = id;
  const done = (err) => {
    if (audio !== a) return;
    audio = null;
    currentId = null;
    onEnd?.(err);
  };
  a.onended = () => done();
  a.onerror = () => done(new Error('Önizleme çalınamadı'));
  a.play().catch((e) => done(e));
}

export const previewingId = () => currentId;
