import { useState } from 'react';
import useSoundStore from '../store/useSoundStore';

function CategoryItem({ category, isActive, soundCount, onSelect, onEdit, onDelete }) {
  const [showActions, setShowActions] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(category.name);

  const handleEditSubmit = (e) => {
    e.preventDefault();
    if (editName.trim()) onEdit(category.id, { name: editName.trim() });
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <form onSubmit={handleEditSubmit} className="px-2 py-1">
        <input
          autoFocus
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={() => setIsEditing(false)}
          className="w-full bg-app-input text-white px-2 py-1 text-sm outline-none focus-lime font-mono border border-app-border"
        />
      </form>
    );
  }

  return (
    <div
      className={`group relative flex items-center gap-2 px-3 py-2 cursor-pointer transition-all mx-1 ${
        isActive
          ? 'bg-[rgba(196,255,0,0.08)] border-l-2'
          : 'text-[#8e9c8b] hover:bg-app-surface hover:text-[#d0d8ce]'
      }`}
      style={isActive ? { borderLeftColor: 'var(--accent)', color: 'var(--accent)' } : {}}
      onClick={onSelect}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div
        className="w-2 h-2 shrink-0 ring-1 ring-white/10"
        style={{ backgroundColor: category.color }}
      />
      <span className="text-sm flex-1 truncate font-mono">{category.name}</span>
      <span className={`text-[10px] px-1.5 py-0.5 font-mono ${isActive ? 'text-[#c4ff00]/70 bg-[rgba(196,255,0,0.12)]' : 'bg-app-raised text-[#5c665a]'}`}>
        {soundCount}
      </span>

      {category.id !== 'default' && showActions && (
        <div className="absolute right-1 flex gap-0.5 bg-app-raised border border-app-border p-0.5 shadow-lg z-10">
          <button
            onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
            className="p-1 hover:bg-app-muted text-[#5c665a] hover:text-white"
            title="Düzenle"
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(category.id); }}
            className="p-1 hover:bg-red-600/30 text-[#5c665a] hover:text-red-400"
            title="Sil"
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6M14 11v6"/>
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

export default function Sidebar() {
  const { categories, sounds, activeCategory, setActiveCategory, addCategory, updateCategory, deleteCategory } = useSoundStore();
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  const handleAddCategory = (e) => {
    e.preventDefault();
    if (newCatName.trim()) {
      addCategory(newCatName.trim());
      setNewCatName('');
    }
    setIsAddingCategory(false);
  };

  const allCount = sounds.length;
  const favoriteCount = sounds.filter((s) => s.favorite).length;
  const topCount = sounds.filter((s) => (s.playCount || 0) > 0).length;

  return (
    <aside className="w-52 shrink-0 border-r border-app-border flex flex-col overflow-hidden" style={{ background: '#0d0f0d' }}>
      {/* Header */}
      <div className="px-3 pt-3 pb-2">
        <p className="text-[10px] font-bold tracking-[0.12em] uppercase font-mono px-2 mb-1" style={{ color: 'var(--accent)' }}>
          KATEGORİLER
        </p>
      </div>

      {/* Category list */}
      <nav className="flex-1 overflow-y-auto py-1 space-y-0.5">
        {/* All sounds */}
        <div
          className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-all mx-1 ${
            activeCategory === 'all'
              ? 'bg-[rgba(196,255,0,0.08)] border-l-2'
              : 'text-[#8e9c8b] hover:bg-app-surface hover:text-[#d0d8ce]'
          }`}
          style={activeCategory === 'all' ? { borderLeftColor: 'var(--accent)', color: 'var(--accent)' } : {}}
          onClick={() => setActiveCategory('all')}
        >
          <div className="w-2 h-2 shrink-0" style={{ background: 'linear-gradient(135deg, #c4ff00, #00ffa3)' }}/>
          <span className="text-sm flex-1 font-mono">Tüm Sesler</span>
          <span className={`text-[10px] px-1.5 py-0.5 font-mono ${activeCategory === 'all' ? 'text-[#c4ff00]/70 bg-[rgba(196,255,0,0.12)]' : 'bg-app-raised text-[#5c665a]'}`}>
            {allCount}
          </span>
        </div>

        {/* Favorites */}
        <div
          className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-all mx-1 ${
            activeCategory === 'favorites'
              ? 'bg-[rgba(196,255,0,0.08)] border-l-2'
              : 'text-[#8e9c8b] hover:bg-app-surface hover:text-[#d0d8ce]'
          }`}
          style={activeCategory === 'favorites' ? { borderLeftColor: 'var(--accent)', color: 'var(--accent)' } : {}}
          onClick={() => setActiveCategory('favorites')}
        >
          <span className="w-2 h-2 shrink-0 flex items-center justify-center text-xs leading-none">⭐</span>
          <span className="text-sm flex-1 font-mono">Favoriler</span>
          <span className={`text-[10px] px-1.5 py-0.5 font-mono ${activeCategory === 'favorites' ? 'text-[#c4ff00]/70 bg-[rgba(196,255,0,0.12)]' : 'bg-app-raised text-[#5c665a]'}`}>
            {favoriteCount}
          </span>
        </div>

        {/* Top played */}
        <div
          className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-all mx-1 ${
            activeCategory === 'top'
              ? 'bg-[rgba(196,255,0,0.08)] border-l-2'
              : 'text-[#8e9c8b] hover:bg-app-surface hover:text-[#d0d8ce]'
          }`}
          style={activeCategory === 'top' ? { borderLeftColor: 'var(--accent)', color: 'var(--accent)' } : {}}
          onClick={() => setActiveCategory('top')}
        >
          <span className="w-2 h-2 shrink-0 flex items-center justify-center text-xs leading-none">🔥</span>
          <span className="text-sm flex-1 font-mono">En Çok Çalınanlar</span>
          <span className={`text-[10px] px-1.5 py-0.5 font-mono ${activeCategory === 'top' ? 'text-[#c4ff00]/70 bg-[rgba(196,255,0,0.12)]' : 'bg-app-raised text-[#5c665a]'}`}>
            {topCount}
          </span>
        </div>

        {categories.map((cat) => (
          <CategoryItem
            key={cat.id}
            category={cat}
            isActive={activeCategory === cat.id}
            soundCount={sounds.filter((s) => s.categoryId === cat.id).length}
            onSelect={() => setActiveCategory(cat.id)}
            onEdit={updateCategory}
            onDelete={deleteCategory}
          />
        ))}

        {/* Add category */}
        {isAddingCategory ? (
          <form onSubmit={handleAddCategory} className="px-2 py-1">
            <input
              autoFocus
              placeholder="Kategori adı..."
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onBlur={() => { setIsAddingCategory(false); setNewCatName(''); }}
              className="w-full bg-app-input text-white px-2 py-1.5 text-sm outline-none focus-lime placeholder-[#5c665a] border border-app-border font-mono"
            />
          </form>
        ) : (
          <button
            onClick={() => setIsAddingCategory(true)}
            className="flex items-center gap-2 px-3 py-2 cursor-pointer text-[#5c665a] hover:text-[#c4ff00] hover:bg-app-surface transition-all w-full mx-1 text-sm font-mono"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            + KATEGORİ
          </button>
        )}
      </nav>

      {/* Footer */}
      <div className="border-t border-app-border">
        <p className="text-[10px] text-[#3c4238] text-center font-mono py-2">
          {allCount} SES · {categories.length} KATEGORİ
        </p>
        {window.electronAPI && (
          <button
            onClick={() => window.electronAPI.quitApp()}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-[#5c665a] hover:text-red-400 hover:bg-red-600/10 border-t border-app-border transition-colors text-xs font-bold font-mono tracking-wider"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            ÇIKIŞ YAP
          </button>
        )}
      </div>
    </aside>
  );
}
