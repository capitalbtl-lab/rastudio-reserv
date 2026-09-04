  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-3 sm:items-center" onClick={onClose}>
      <div
        className="flex max-h-[min(92dvh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-[1.6rem] bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pretty-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
        <p className="kicker text-primary">{mode === "group" ? "Группа" : "Пробное занятие"}</p>
        <h2 className="display mt-1 text-2xl">{mode === "group" ? "Запись в группу" : "Запись на пробное"}</h2>
        <div className="mt-3 rounded-2xl bg-bg px-3.5 py-3 text-sm">
          <p className="font-semibold">{tidyGroupName(session.group)}</p>
          <p className="mt-1 text-muted">
            {whenShort(session)}
            {session.teacher ? ` · ${session.teacher}` : ""}
          </p>
          {session.level ? <p className="mt-0.5 text-muted">Уровень: {session.level}</p> : null}
          <p className="mt-0.5 text-muted">
            {branchLabel}
            {seats.label ? ` · ${seats.label}` : ""}
            {next ? ` · ${formatTrialDate(next)}` : ""}
          </p>
        </div>
        {done ? (
          <p className="mt-4 text-sm">Заявку приняли. Напишем в течение 15 минут.</p>
        ) : (
          <form onSubmit={onSubmit} className="mt-4 grid gap-3">
            <label>
              <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted">ФИО родителя</span>
              <input name="parent" required autoComplete="name" className={field} />
            </label>
            <label>
              <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted">ФИО ребёнка</span>
              <input name="child" required className={field} />
            </label>
            <label>
              <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted">Дата рождения</span>
              <input name="dob" type="date" required className={field} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted">Телефон</span>
                <input name="phone" type="tel" required autoComplete="tel" className={field} />
              </label>
              <label>
                <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted">Почта</span>
                <input name="email" type="email" autoComplete="email" className={field} />
              </label>
            </div>
            <label>
              <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted">Филиал</span>
              <input readOnly value={branchLabel} className={cn(field, "bg-white text-fg")} />
            </label>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <div className="mt-1 flex gap-2">
              <Button type="submit" className="flex-1" disabled={pending}>
                {pending ? "Отправляем…" : mode === "group" ? "Записать в группу" : "Отправить заявку"}
              </Button>
              <Button type="button" variant="secondary" onClick={onClose}>
                Закрыть
              </Button>
            </div>
          </form>
        )}
        </div>
      </div>
    </div>
  );