"use client";

/** Кнопка входа в визуальный редактор. Не режим отладки. */
export function EditorEntry() {
  return (
    <button
      type="button"
      className="inline-flex h-8 items-center rounded-full bg-white/10 px-3.5 text-[0.72rem] font-semibold text-header-fg hover:bg-white/16"
      onClick={() => {
        const path = location.pathname || "/";
        location.href = path === "/" ? "/?edit=1" : `${path}?edit=1`;
      }}
    >
      Редактор
    </button>
  );
}
