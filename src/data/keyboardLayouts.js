const K = (id, label, w = 1) => ({ id, label, w });
const G = (w) => ({ gap: true, w }); // invisible spacer

export const LAYOUTS = {
  '60': {
    name: '60%',
    rows: [
      [K('`','`'), K('1','1'), K('2','2'), K('3','3'), K('4','4'), K('5','5'), K('6','6'), K('7','7'), K('8','8'), K('9','9'), K('0','0'), K('-','-'), K('=','='), K('backspace','⌫', 2)],
      [K('tab','Tab', 1.5), K('q','Q'), K('w','W'), K('e','E'), K('r','R'), K('t','T'), K('y','Y'), K('u','U'), K('i','I'), K('o','O'), K('p','P'), K('[','['), K(']',']'), K('\\','\\', 1.5)],
      [K('capslock','Caps', 1.75), K('a','A'), K('s','S'), K('d','D'), K('f','F'), K('g','G'), K('h','H'), K('j','J'), K('k','K'), K('l','L'), K(';',';'), K("'","'"), K('enter','↵', 2.25)],
      [K('shift','⇧', 2.25), K('z','Z'), K('x','X'), K('c','C'), K('v','V'), K('b','B'), K('n','N'), K('m','M'), K(',',','), K('.','.'), K('/','/')  , K('shift','⇧', 2.75)],
      [K('ctrl','Ctrl', 1.25), K('meta','⊞', 1.25), K('alt','Alt', 1.25), K('space','', 6.25), K('alt','Alt', 1.25), K('ctrl','Ctrl', 1.25)],
    ],
  },

  '65': {
    name: '65%',
    rows: [
      [K('`','`'), K('1','1'), K('2','2'), K('3','3'), K('4','4'), K('5','5'), K('6','6'), K('7','7'), K('8','8'), K('9','9'), K('0','0'), K('-','-'), K('=','='), K('backspace','⌫', 2), K('delete','Del')],
      [K('tab','Tab', 1.5), K('q','Q'), K('w','W'), K('e','E'), K('r','R'), K('t','T'), K('y','Y'), K('u','U'), K('i','I'), K('o','O'), K('p','P'), K('[','['), K(']',']'), K('\\','\\', 1.5), K('pageup','PUp')],
      [K('capslock','Caps', 1.75), K('a','A'), K('s','S'), K('d','D'), K('f','F'), K('g','G'), K('h','H'), K('j','J'), K('k','K'), K('l','L'), K(';',';'), K("'","'"), K('enter','↵', 2.25), K('pagedown','PDn')],
      [K('shift','⇧', 2.25), K('z','Z'), K('x','X'), K('c','C'), K('v','V'), K('b','B'), K('n','N'), K('m','M'), K(',',','), K('.','.'), K('/','/')  , K('shift','⇧', 1.75), K('arrowup','↑'), K('end','End')],
      [K('ctrl','Ctrl', 1.25), K('meta','⊞', 1.25), K('alt','Alt', 1.25), K('space','', 6.25), K('alt','Alt', 1), K('fn','Fn', 1), K('arrowleft','←'), K('arrowdown','↓'), K('arrowright','→')],
    ],
  },

  '75': {
    name: '75%',
    rows: [
      [K('escape','Esc'), G(0.5), K('f1','F1'), K('f2','F2'), K('f3','F3'), K('f4','F4'), G(0.25), K('f5','F5'), K('f6','F6'), K('f7','F7'), K('f8','F8'), G(0.25), K('f9','F9'), K('f10','F10'), K('f11','F11'), K('f12','F12'), G(0.25), K('delete','Del')],
      [K('`','`'), K('1','1'), K('2','2'), K('3','3'), K('4','4'), K('5','5'), K('6','6'), K('7','7'), K('8','8'), K('9','9'), K('0','0'), K('-','-'), K('=','='), K('backspace','⌫', 2), K('pageup','PUp')],
      [K('tab','Tab', 1.5), K('q','Q'), K('w','W'), K('e','E'), K('r','R'), K('t','T'), K('y','Y'), K('u','U'), K('i','I'), K('o','O'), K('p','P'), K('[','['), K(']',']'), K('\\','\\', 1.5), K('pagedown','PDn')],
      [K('capslock','Caps', 1.75), K('a','A'), K('s','S'), K('d','D'), K('f','F'), K('g','G'), K('h','H'), K('j','J'), K('k','K'), K('l','L'), K(';',';'), K("'","'"), K('enter','↵', 2.25), K('home','Hom')],
      [K('shift','⇧', 2.25), K('z','Z'), K('x','X'), K('c','C'), K('v','V'), K('b','B'), K('n','N'), K('m','M'), K(',',','), K('.','.'), K('/','/')  , K('shift','⇧', 1.75), K('arrowup','↑'), K('end','End')],
      [K('ctrl','Ctrl', 1.25), K('meta','⊞', 1.25), K('alt','Alt', 1.25), K('space','', 6.25), K('alt','Alt', 1), K('fn','Fn', 1), K('ctrl','Ctrl', 1.25), K('arrowleft','←'), K('arrowdown','↓'), K('arrowright','→')],
    ],
  },

  'tkl': {
    name: 'TKL',
    rows: [
      [K('escape','Esc'), G(0.5), K('f1','F1'), K('f2','F2'), K('f3','F3'), K('f4','F4'), G(0.25), K('f5','F5'), K('f6','F6'), K('f7','F7'), K('f8','F8'), G(0.25), K('f9','F9'), K('f10','F10'), K('f11','F11'), K('f12','F12'), G(0.5), K('printscreen','Prt'), K('scrolllock','Scr'), K('pause','Pau')],
      [K('`','`'), K('1','1'), K('2','2'), K('3','3'), K('4','4'), K('5','5'), K('6','6'), K('7','7'), K('8','8'), K('9','9'), K('0','0'), K('-','-'), K('=','='), K('backspace','⌫', 2), G(0.5), K('insert','Ins'), K('home','Hom'), K('pageup','PUp')],
      [K('tab','Tab', 1.5), K('q','Q'), K('w','W'), K('e','E'), K('r','R'), K('t','T'), K('y','Y'), K('u','U'), K('i','I'), K('o','O'), K('p','P'), K('[','['), K(']',']'), K('\\','\\', 1.5), G(0.5), K('delete','Del'), K('end','End'), K('pagedown','PDn')],
      [K('capslock','Caps', 1.75), K('a','A'), K('s','S'), K('d','D'), K('f','F'), K('g','G'), K('h','H'), K('j','J'), K('k','K'), K('l','L'), K(';',';'), K("'","'"), K('enter','↵', 2.25)],
      [K('shift','⇧', 2.25), K('z','Z'), K('x','X'), K('c','C'), K('v','V'), K('b','B'), K('n','N'), K('m','M'), K(',',','), K('.','.'), K('/','/')  , K('shift','⇧', 2.75), G(0.5+1+0.25), K('arrowup','↑')],
      [K('ctrl','Ctrl', 1.25), K('meta','⊞', 1.25), K('alt','Alt', 1.25), K('space','', 6.25), K('alt','Alt', 1.25), K('meta','⊞', 1.25), K('ctrl','Ctrl', 1.25), G(0.5), K('arrowleft','←'), K('arrowdown','↓'), K('arrowright','→')],
    ],
  },

  'numpad': {
    name: 'Numpad',
    rows: [
      [K('numlock','Num'), K('numpaddivide','/'), K('numpadmultiply','*'), K('numpadsubtract','-')],
      [K('numpad7','7'), K('numpad8','8'), K('numpad9','9'), K('numpadadd','+')],
      [K('numpad4','4'), K('numpad5','5'), K('numpad6','6'), G(1)],
      [K('numpad1','1'), K('numpad2','2'), K('numpad3','3'), K('numpadenter','↵')],
      [K('numpad0','0', 2), K('numpaddecimal','.'), G(1)],
      // F13-F24 macro keys (common on programmable numpads / macro pads)
      [G(4.25)], // visual gap row
      [K('f13','F13'), K('f14','F14'), K('f15','F15'), K('f16','F16')],
      [K('f17','F17'), K('f18','F18'), K('f19','F19'), K('f20','F20')],
      [K('f21','F21'), K('f22','F22'), K('f23','F23'), K('f24','F24')],
    ],
  },

  'macro': {
    name: 'Makro',
    rows: [
      [K('f1','F1'), K('f2','F2'), K('f3','F3'), K('f4','F4')],
      [K('f5','F5'), K('f6','F6'), K('f7','F7'), K('f8','F8')],
      [K('f9','F9'), K('f10','F10'), K('f11','F11'), K('f12','F12')],
      [G(4.25)],
      [K('f13','F13'), K('f14','F14'), K('f15','F15'), K('f16','F16')],
      [K('f17','F17'), K('f18','F18'), K('f19','F19'), K('f20','F20')],
      [K('f21','F21'), K('f22','F22'), K('f23','F23'), K('f24','F24')],
    ],
  },
};

// Extract base key from shortcut string (e.g. "Ctrl+F5" → "f5", "A" → "a", " " → "space")
export function getShortcutBaseKey(shortcut) {
  if (!shortcut) return null;
  const mods = new Set(['ctrl', 'alt', 'shift', 'meta', 'win']);
  const parts = shortcut.split('+').map((p) => p.trim().toLowerCase());
  const base = parts.find((p) => !mods.has(p)) ?? null;
  if (!base) return null;
  if (base === ' ') return 'space';
  return base;
}

export function getShortcutMods(shortcut) {
  if (!shortcut) return { ctrl: false, alt: false, shift: false };
  const parts = shortcut.split('+').map((p) => p.trim().toLowerCase());
  return { ctrl: parts.includes('ctrl'), alt: parts.includes('alt'), shift: parts.includes('shift') };
}
