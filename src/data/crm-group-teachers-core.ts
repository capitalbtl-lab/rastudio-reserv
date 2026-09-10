/** Наборы педагогов: ответственные группы vs педагоги бита регулярки. Не [0]. */

export function teacherIdSet(raw: unknown): number[] {
  const arr = Array.isArray(raw) ? raw : raw != null && raw !== "" ? [raw] : [];
  const out: number[] = [];
  for (const x of arr) {
    const n = Number(x);
    if (n && Number.isFinite(n) && !out.includes(n)) out.push(n);
  }
  return out;
}

export function sameIdSet(a: unknown, b: unknown) {
  const left = teacherIdSet(a).slice().sort((x, y) => x - y);
  const right = teacherIdSet(b).slice().sort((x, y) => x - y);
  return left.length === right.length && left.every((n, i) => n === right[i]);
}

/** Пустой набор не шлём — в Alfa [] затирает всех. */
export function teacherIdsPayload(ids: unknown): { teacher_ids: number[] } | Record<string, never> {
  const list = teacherIdSet(ids);
  return list.length ? { teacher_ids: list } : {};
}

export function namesOfTeachers(ids: number[], roster: { id: number; name: string }[], fallback = "") {
  const map = new Map(roster.map((t) => [t.id, t.name]));
  const names = ids.map((id) => map.get(id) || "").filter(Boolean);
  return names.join(", ") || fallback;
}

export type BeatTeachers = {
  day?: number;
  timeFrom?: string;
  timeTo?: string;
  lessonId?: number;
  bDate?: string;
  eDate?: string;
  teacherIds?: number[];
  teacher?: string;
};

export type SlotTeachers = {
  teacherId?: number;
  teacherIds?: number[];
  teacher?: string;
  ownerTeacherIds?: number[];
  ownerTeacher?: string;
  beats?: BeatTeachers[];
};

export function beatTeacherIds(beat: BeatTeachers | undefined, slot?: SlotTeachers) {
  if (Array.isArray(beat?.teacherIds)) return teacherIdSet(beat.teacherIds);
  return teacherIdSet(slot?.teacherIds?.length ? slot.teacherIds : slot?.teacherId);
}

export function ownerTeacherIdsOf(slot: SlotTeachers) {
  if (Array.isArray(slot.ownerTeacherIds)) return teacherIdSet(slot.ownerTeacherIds);
  return teacherIdSet(slot.teacherIds?.length ? slot.teacherIds : slot.teacherId);
}

export function slotBeatTeacherIds(slot: SlotTeachers) {
  const beats = slot.beats || [];
  if (beats.length) {
    const ids: number[] = [];
    for (const b of beats) {
      for (const n of beatTeacherIds(b, slot)) if (!ids.includes(n)) ids.push(n);
    }
    if (ids.length) return ids;
  }
  return teacherIdSet(slot.teacherIds?.length ? slot.teacherIds : slot.teacherId);
}

/** Урок, иначе педагоги бита. Не ответственные группы. */
export function pickLessonTeacherIds(lessonIds: unknown, beatIds: unknown) {
  const lesson = teacherIdSet(lessonIds);
  return lesson.length ? lesson : teacherIdSet(beatIds);
}

/**
 * Раскладка диска: если двух полей ещё нет — копируем текущий массив слота
 * целиком в биты и в ответственных. Уже разведённое не склеивать.
 */
export function hydrateGroupTeachers<T extends SlotTeachers>(slot: T): T {
  const hadOwner = Array.isArray(slot.ownerTeacherIds);
  const slotIds = teacherIdSet(slot.teacherIds?.length ? slot.teacherIds : slot.teacherId);
  const owner = hadOwner ? teacherIdSet(slot.ownerTeacherIds) : slotIds;
  const rawBeats = slot.beats?.length ? slot.beats : [];
  const beats = (rawBeats.length
    ? rawBeats
    : [
        {
          teacherIds: slotIds,
          teacher: slot.teacher,
        } as BeatTeachers,
      ]
  ).map((b) => {
    const had = Array.isArray(b.teacherIds);
    const ids = had ? teacherIdSet(b.teacherIds) : slotIds;
    return { ...b, teacherIds: ids, teacher: b.teacher || (ids.length ? slot.teacher : b.teacher) };
  });
  const shown = beats[0];
  const shownIds = teacherIdSet(shown?.teacherIds);
  return {
    ...slot,
    ownerTeacherIds: owner,
    ownerTeacher: slot.ownerTeacher || (hadOwner ? slot.ownerTeacher : slot.teacher),
    beats: rawBeats.length ? beats : slot.beats,
    teacherIds: shownIds.length ? shownIds : slotIds,
    teacherId: (shownIds[0] || slotIds[0] || 0) as T["teacherId"],
  };
}

export function ownerOnlyTeacherIds(slot: SlotTeachers) {
  const beat = slotBeatTeacherIds(slot);
  return ownerTeacherIdsOf(slot).filter((id) => !beat.includes(id));
}
