import { useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import useSoundStore from '../store/useSoundStore';
import SoundButton from './SoundButton';

function EmptyState({ onAdd, isFiltered }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-64 gap-5 text-center">
      <div className="bracket-4 p-6 bg-app-surface">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#3c4238" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18V5l12-2v13"/>
          <circle cx="6" cy="18" r="3"/>
          <circle cx="18" cy="16" r="3"/>
        </svg>
      </div>
      <div>
        <h3 className="font-bold text-sm uppercase tracking-widest mb-1" style={{ color: isFiltered ? '#8e9c8b' : 'var(--accent)' }}>
          {isFiltered ? 'SONUÇ YOK' : 'HENÜZ SES YOK'}
        </h3>
        <p className="text-[#5c665a] text-xs font-mono">
          {isFiltered ? 'Farklı bir terim deneyin' : 'Soundboard\'unuza ses dosyası ekleyin'}
        </p>
      </div>
      {!isFiltered && (
        <button
          onClick={onAdd}
          className="btn-accent flex items-center gap-2 px-4 py-2 text-xs font-bold font-mono tracking-wider"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          + SES EKLE
        </button>
      )}
    </div>
  );
}

export default function SoundGrid() {
  const { categories, activeCategory, searchQuery, settings, openAddModal, reorderSounds, getFilteredSounds } = useSoundStore();
  const filteredSounds = getFilteredSounds();
  const isFiltered = !!(searchQuery.trim()) || activeCategory !== 'all';

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragEnd = useCallback(({ active, over }) => {
    if (over && active.id !== over.id) {
      reorderSounds(active.id, over.id);
    }
  }, [reorderSounds]);

  const cols = settings.gridColumns || 5;

  if (filteredSounds.length === 0) {
    return <EmptyState onAdd={() => openAddModal()} isFiltered={isFiltered} />;
  }

  const renderGrid = (sounds) => (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={sounds.map((s) => s.id)} strategy={rectSortingStrategy}>
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {sounds.map((sound) => <SoundButton key={sound.id} sound={sound} />)}
        </div>
      </SortableContext>
    </DndContext>
  );

  if (activeCategory === 'all' && !searchQuery.trim()) {
    const grouped = categories.map((cat) => ({
      category: cat,
      sounds: filteredSounds.filter((s) => s.categoryId === cat.id),
    })).filter((g) => g.sounds.length > 0);

    const knownIds = new Set(categories.map((c) => c.id));
    const orphans = filteredSounds.filter((s) => !knownIds.has(s.categoryId));

    return (
      <div className="space-y-7">
        {grouped.map(({ category, sounds }) => (
          <section key={category.id}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-2 h-2 shrink-0" style={{ backgroundColor: category.color }}/>
              <h2 className="text-[10px] font-bold uppercase tracking-[0.12em] font-mono" style={{ color: '#8e9c8b' }}>
                {category.name}
              </h2>
              <div className="flex-1 h-px" style={{ background: '#1e231e' }}/>
              <span className="text-[10px] font-mono" style={{ color: '#3c4238' }}>{sounds.length}</span>
            </div>
            {renderGrid(sounds)}
          </section>
        ))}
        {orphans.length > 0 && (
          <section>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-2 h-2 bg-[#3c4238] shrink-0"/>
              <h2 className="text-[10px] font-bold uppercase tracking-[0.12em] font-mono text-[#5c665a]">DİĞER</h2>
              <div className="flex-1 h-px" style={{ background: '#1e231e' }}/>
            </div>
            {renderGrid(orphans)}
          </section>
        )}
      </div>
    );
  }

  return renderGrid(filteredSounds);
}
