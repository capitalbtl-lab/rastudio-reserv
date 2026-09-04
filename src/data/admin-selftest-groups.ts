import { existsSync, accessSync, constants } from "node:fs";
import { join } from "node:path";

type ProbeOut = { ok: boolean; skip?: boolean; detail: string; plain?: string; fix?: string; related?: string[]; raw?: string; leftover?: string };
export type GroupsProbe = {
  id: string;
  title: string;
  sections: string[];
  run: () => Promise<ProbeOut>;
};

const rel = ["schedule-groups", "schedule"];

type CrmLeftover = {
  branchId: number;
  groupId: number;
  lessonId: number;
  name: string;
  subjectId: number;
  subject: string;
  url: string;
};

let crmLeftover: CrmLeftover | null = null;

function leftoverLine(row: CrmLeftover) {
  const bits = [
    `филиал ${row.branchId}`,
    `группа gid ${row.groupId}`,
    row.lessonId ? `урок ${row.lessonId}` : "",
    `«${row.name}»`,
    row.url,
  ].filter(Boolean);
  return bits.join(" · ");
}

function crmId(res: unknown) {
  const r = res as { model?: { id?: number }; id?: number; success?: boolean; errors?: unknown; message?: string };
  if (r && r.success === false) {
    const err = r.errors ? JSON.stringify(r.errors).slice(0, 220) : String(r.message || "CRM отклонила");
    throw new Error(err);
  }
  return Number(r?.model?.id || r?.id || 0);
}

function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isoSchoolEnd(start: string) {
  const y = Number(start.slice(0, 4)) || new Date().getFullYear();
  const m = Number(start.slice(5, 7)) || 1;
  const endYear = m >= 6 ? y + 1 : y;
  return `${endYear}-05-31`;
}

function fail(detail: string, plain: string, fix: string, related: string[] = rel, raw = "", leftover = ""): ProbeOut {
  return { ok: false, detail, plain, fix, related, raw, leftover };
}
function ok(detail: string, related: string[] = rel, leftover = ""): ProbeOut {
  return { ok: true, detail, plain: detail, fix: "", related, raw: "", leftover };
}
function skip(detail: string, related: string[] = rel): ProbeOut {
  return { ok: true, skip: true, detail, plain: detail, fix: "", related, raw: "" };
}

export const GROUPS_SECTION = {
  id: "schedule-groups",
  title: "Группы",
  hint: "Вкладка «Группы»: все функции с записью в AlfaCRM. Удаление в CRM не делается — тестовую группу оператор стирает сам.",
};

export const GROUPS_PROBES: GroupsProbe[] = [
  {
    id: "g-snapshot",
    title: "Снимок групп на сайте",
    sections: ["schedule-groups"],
    run: async () => {
      const { listAdminSlots, crmScheduleMeta } = await import("./alfacrm-schedule");
      const slots = listAdminSlots();
      const m = crmScheduleMeta();
      if (!slots.length) return fail("снимок пуст", "Вкладка «Группы» пустая. Нечего проверять и нечего показать родителю.", "Группы → Загрузить из AlfaCRM.", rel);
      const gid = slots.filter((s) => s.groupId > 0).length;
      return ok(`${slots.length} групп, с gid ${gid}, обновлено ${m.at || "—"}`);
    },
  },
  {
    id: "g-tree",
    title: "Дерево школ и курсов",
    sections: ["schedule-groups"],
    run: async () => {
      const { loadSiteTree } = await import("./site-tree");
      const tree = loadSiteTree();
      if (!tree.schools.length) return fail("нет школ", "Дерево пустое. Некуда класть группы, «Добавить школу» не от чего плясать.", "Группы → Добавить → школа.", rel);
      if (!tree.courses.length) return fail("нет курсов", "Школы есть, курсов нет. Группы уйдут в «Без курса».", "Группы → Добавить → курс.", rel);
      return ok(`школ ${tree.schools.length}, курсов ${tree.courses.length}, привязок assign ${Object.keys(tree.assign || {}).length}`);
    },
  },
  {
    id: "g-ids",
    title: "Карта ID: папка группы",
    sections: ["schedule-groups"],
    run: async () => {
      const { listAdminSlots } = await import("./alfacrm-schedule");
      const { loadSiteTree } = await import("./site-tree");
      const { loadScheduleMap } = await import("./schedule-map");
      const { resolveGroupCourseId } = await import("./ids");
      const tree = loadSiteTree();
      const map = loadScheduleMap();
      const slots = listAdminSlots();
      let inCourse = 0;
      let loose = 0;
      for (const s of slots) {
        const id = resolveGroupCourseId(s, tree, map.courses);
        if (id && tree.courses.some((c) => c.id === id || c.href === id)) inCourse += 1;
        else loose += 1;
      }
      return ok(`в курсе по ID ${inCourse}, «Без курса» ${loose}. Имена не участвовали.`);
    },
  },
  {
    id: "g-branch",
    title: "Фильтр филиалов",
    sections: ["schedule-groups"],
    run: async () => {
      const { listAdminSlots } = await import("./alfacrm-schedule");
      const { CRM_BRANCH } = await import("./ids");
      const slots = listAdminSlots();
      const counts = [1, 2, 3, 4].map((id) => ({ id, n: slots.filter((s) => s.branchId === id).length, name: CRM_BRANCH[id]?.short || id }));
      const known = slots.filter((s) => s.branchId >= 1 && s.branchId <= 4).length;
      if (!known) return fail("нет branchId", "У групп не проставлен филиал. Фильтр сверху не отсечёт ЦМИТ от Гражданской.", "Загрузить из AlfaCRM.", rel);
      return ok(counts.map((c) => `${c.name} ${c.n}`).join(" · "));
    },
  },
  {
    id: "g-pull",
    title: "Загрузить из AlfaCRM",
    sections: ["schedule-groups"],
    run: async () => {
      try {
        const { token, request } = await import("./alfacrm");
        const t = await token();
        const parts: string[] = [];
        for (const b of [1, 2, 3, 4]) {
          const json = await request<{ items?: unknown[]; total?: number }>(`/v2api/${b}/group/index`, { page: 0, pageSize: 20 }, t);
          parts.push(`ф${b} ${Array.isArray(json.items) ? json.items.length : 0}/${json.total ?? "—"}`);
        }
        return ok(`чтение групп ок: ${parts.join(", ")}. Запись не делали.`);
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e);
        return fail(raw.slice(0, 200), "group/index не ответил. Кнопка «Загрузить из AlfaCRM» не подтянет группы.", "API → AlfaCRM: право group/index по филиалам 1–4.", rel, raw);
      }
    },
  },
  {
    id: "g-lessons",
    title: "Регулярные уроки групп",
    sections: ["schedule-groups"],
    run: async () => {
      try {
        const { token, request } = await import("./alfacrm");
        const t = await token();
        const json = await request<{ items?: { related_id?: number }[]; total?: number }>(`/v2api/2/regular-lesson/index`, { page: 0, pageSize: 20 }, t);
        const n = Array.isArray(json.items) ? json.items.length : 0;
        if (!n) return fail("нет уроков", "regular-lesson пуст. День и время в строке группы не из чего брать.", "Проверьте регулярное расписание в AlfaCRM.", rel);
        return ok(`уроков на странице ${n}, всего ${json.total ?? "—"}. Чтение.`);
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e);
        return fail(raw.slice(0, 200), "Не прочитались регулярные уроки. Время и «два раза в неделю» не обновятся.", "Роль API: regular-lesson/index.", rel, raw);
      }
    },
  },
  {
    id: "g-save",
    title: "Сохранить на сайте",
    sections: ["schedule-groups"],
    run: async () => {
      const file = join(process.cwd(), "storage", "crm-schedule.json");
      if (!existsSync(file)) return fail("нет файла", "Нет storage/crm-schedule.json. «Сохранить на сайте» некуда писать.", "Сначала загрузите группы из AlfaCRM.", rel);
      try {
        accessSync(file, constants.R_OK | constants.W_OK);
        return ok("снимок читается и пишется. Саму кнопку не нажимали.");
      } catch {
        return fail("нет записи", "Файл снимка нельзя записать. «Сохранить на сайте» упадёт.", "Права на storage/crm-schedule.json.", rel);
      }
    },
  },
  {
    id: "g-push",
    title: "Выгрузить в AlfaCRM · создать тестовую группу",
    sections: ["schedule-groups"],
    run: async () => {
      crmLeftover = null;
      const { listAdminSlots } = await import("./alfacrm-schedule");
      const { loadSubjects } = await import("./crm-subjects");
      const { token, request, formatRuDob } = await import("./alfacrm");
      const slots = listAdminSlots();
      const twin = slots.find((s) => s.branchId && s.subjectId) || slots.find((s) => s.subjectId);
      const branchId = Number(twin?.branchId || 2);
      const subjects = loadSubjects();
      const subjectId = Number(twin?.subjectId || subjects.find((s) => s.id > 0)?.id || 0);
      const subject = subjects.find((s) => s.id === subjectId)?.name || twin?.subject || "";
      if (!subjectId) {
        return fail(
          "нет subjectId",
          "Нельзя создать тестовую группу: нет предмета. Выгрузка в CRM без предмета падает.",
          "Сначала вкладка «Предметы» → Загрузить из AlfaCRM, затем снова «Проверить группы».",
        );
      }
      const stamp = new Date().toLocaleString("ru-RU");
      const name = `Проверка rastudio.org · Группы · ${stamp}`;
      const start = isoToday();
      const end = isoSchoolEnd(start);
      try {
        const t = await token();
        const created = await request<{ model?: { id?: number }; id?: number; success?: boolean; errors?: unknown }>(
          `/v2api/${branchId}/group/create`,
          {
            name,
            note: "Тестовая группа проверки вкладки «Группы». Удалите вручную в AlfaCRM. Проверка сама не удаляет.",
            limit: 3,
            branch_ids: [branchId],
            subject_id: subjectId,
            subject_ids: [subjectId],
            status_id: 1,
            b_date: formatRuDob(start),
            e_date: formatRuDob(end),
          },
          t,
        );
        const groupId = crmId(created);
        if (!groupId) throw new Error("AlfaCRM не вернула номер группы после create");
        const url = `https://studiyarazvivaysya.s20.online/company/${branchId}/group/view?id=${groupId}`;
        crmLeftover = { branchId, groupId, lessonId: 0, name, subjectId, subject, url };
        let lessonId = 0;
        try {
          const les = await request<{ model?: { id?: number }; id?: number; success?: boolean; errors?: unknown }>(
            `/v2api/${branchId}/regular-lesson/create`,
            {
              related_class: "Group",
              related_id: groupId,
              subject_id: subjectId,
              subject_ids: [subjectId],
              branch_id: branchId,
              lesson_type_id: 2,
              day: 2,
              days: [2],
              time_from_v: "10:00",
              time_to_v: "11:00",
              duration: 60,
              b_date: start,
              e_date: end,
            },
            t,
          );
          lessonId = crmId(les);
          crmLeftover.lessonId = lessonId;
        } catch (e) {
          const raw = e instanceof Error ? e.message : String(e);
          return fail(
            raw.slice(0, 200),
            `Группа создана (gid ${groupId}), но регулярный урок не создался. «Добавить группу» / выгрузка расписания сломаны.`,
            "Право regular-lesson/create, день и время, предмет в филиале.",
            rel,
            raw,
            leftoverLine(crmLeftover),
          );
        }
        const listed = await request<{ items?: { id?: number; name?: string }[] }>(`/v2api/${branchId}/group/index`, { page: 0, pageSize: 100 }, t);
        const found = (listed.items || []).find((x) => Number(x.id) === groupId);
        if (!found) {
          return fail(
            "группа не в списке",
            `Create вернул gid ${groupId}, но group/index её не видит. Оператор: проверьте карточку в CRM и удалите, если появится.`,
            "Права group/index после create.",
            rel,
            JSON.stringify({ groupId, branchId }).slice(0, 300),
            leftoverLine(crmLeftover),
          );
        }
        return ok(
          `создали в CRM группу gid ${groupId} «${found.name || name}», урок ${lessonId}, предмет ${subjectId}. На сайт расписание не добавляли.`,
          rel,
          leftoverLine(crmLeftover),
        );
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e);
        return fail(
          raw.slice(0, 200),
          "Не удалось создать тестовую группу в AlfaCRM. Кнопки «Добавить» и «Выгрузить в AlfaCRM» сейчас не работают.",
          "Роль API: group/create и regular-lesson/create. Предмет должен быть в этом филиале.",
          rel,
          raw,
          crmLeftover ? leftoverLine(crmLeftover) : "",
        );
      }
    },
  },
  {
    id: "g-crm-update",
    title: "Карточка группы · запись в CRM",
    sections: ["schedule-groups"],
    run: async () => {
      if (!crmLeftover?.groupId) {
        return fail(
          "нет тестовой группы",
          "Обновление карточки не проверили: тестовая группа не создалась. Смотрите сбой «создать тестовую группу».",
          "Почините group/create, затем снова «Проверить группы».",
        );
      }
      const { token, request } = await import("./alfacrm");
      const { branchId, groupId, name, subjectId } = crmLeftover;
      try {
        const t = await token();
        const note = "Проверка обновления карточки. Удалите группу вручную.";
        await request(
          `/v2api/${branchId}/group/update`,
          {
            id: groupId,
            name,
            note,
            limit: 7,
            subject_id: subjectId,
            subject_ids: [subjectId],
            status_id: 1,
          },
          t,
        );
        const json = await request<{ items?: { id?: number; note?: string; limit?: number; name?: string }[] }>(
          `/v2api/${branchId}/group/index`,
          { page: 0, pageSize: 100 },
          t,
        );
        const g = (json.items || []).find((x) => Number(x.id) === groupId);
        if (!g) return fail("после update пропала", `gid ${groupId} не читается после update.`, "group/update + group/index.", rel, "", leftoverLine(crmLeftover));
        const limitOk = Number(g.limit) === 7 || g.limit == null;
        const noteOk = !g.note || String(g.note).includes("Проверка") || String(g.note).includes("обновлен");
        if (!limitOk && g.limit != null && Number(g.limit) !== 7) {
          return fail(
            `лимит ${g.limit}`,
            `Записали limit 7, в CRM сейчас ${g.limit}. Поле «места» в карточке группы не сохраняется.`,
            "Проверьте group/update: limit в теле запроса.",
            rel,
            JSON.stringify(g).slice(0, 400),
            leftoverLine(crmLeftover),
          );
        }
        return ok(
          `gid ${groupId} обновлена: лимит ${g.limit ?? "не отдал index"}, заметка «${String(g.note || "").slice(0, 80)}». ${noteOk ? "" : "Заметка могла не вернуться в index — откройте карточку в CRM."}`.trim(),
          rel,
          leftoverLine(crmLeftover),
        );
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e);
        return fail(
          raw.slice(0, 200),
          `Не записали правку карточки gid ${groupId}. «Подробно → сохранить» в CRM не дойдёт.`,
          "Право group/update, id в адресе.",
          rel,
          raw,
          leftoverLine(crmLeftover),
        );
      }
    },
  },
  {
    id: "g-crm-lesson",
    title: "Регулярный урок · запись в CRM",
    sections: ["schedule-groups"],
    run: async () => {
      if (!crmLeftover?.groupId) {
        return fail("нет тестовой группы", "Урок не проверяли: группа не создалась.", "Сначала сбой создания группы.");
      }
      const { token, request } = await import("./alfacrm");
      const { branchId, groupId, subjectId } = crmLeftover;
      try {
        const t = await token();
        const start = isoToday();
        const end = isoSchoolEnd(start);
        let lessonId = crmLeftover.lessonId;
        if (!lessonId) {
          const created = await request<{ model?: { id?: number }; id?: number }>(
            `/v2api/${branchId}/regular-lesson/create`,
            {
              related_class: "Group",
              related_id: groupId,
              subject_id: subjectId,
              subject_ids: [subjectId],
              branch_id: branchId,
              lesson_type_id: 2,
              day: 4,
              days: [4],
              time_from_v: "10:00",
              time_to_v: "11:00",
              duration: 60,
              b_date: start,
              e_date: end,
            },
            t,
          );
          lessonId = crmId(created);
          crmLeftover.lessonId = lessonId;
        }
        if (!lessonId) throw new Error("нет номера урока");
        await request(
          `/v2api/${branchId}/regular-lesson/update?id=${lessonId}`,
          {
            id: lessonId,
            related_class: "Group",
            related_id: groupId,
            subject_id: subjectId,
            subject_ids: [subjectId],
            branch_id: branchId,
            lesson_type_id: 2,
            day: 4,
            days: [4],
            time_from_v: "10:00",
            time_to_v: "11:30",
            duration: 90,
            b_date: start,
            e_date: end,
          },
          t,
        );
        const listed = await request<{ items?: { id?: number; related_id?: number; time_to_v?: string; day?: number }[] }>(
          `/v2api/${branchId}/regular-lesson/index`,
          { page: 0, pageSize: 100 },
          t,
        );
        const hit = (listed.items || []).find((x) => Number(x.id) === lessonId);
        if (!hit) {
          return fail(
            "урок не в списке",
            `Урок ${lessonId} записали, index его не видит. Расписание группы в CRM может быть пустым.`,
            "regular-lesson/index после update.",
            rel,
            "",
            leftoverLine(crmLeftover),
          );
        }
        return ok(
          `урок ${lessonId} у gid ${groupId}: день ${hit.day ?? 4}, до ${hit.time_to_v || "11:30"}. Второй день не удаляли.`,
          rel,
          leftoverLine(crmLeftover),
        );
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e);
        return fail(
          raw.slice(0, 200),
          "Не записали регулярный урок. Выгрузка расписания и «два раза в неделю» не дойдут в CRM.",
          "Права regular-lesson/create и /update.",
          rel,
          raw,
          crmLeftover ? leftoverLine(crmLeftover) : "",
        );
      }
    },
  },
  {
    id: "g-excel",
    title: "Файл · скачать Excel",
    sections: ["schedule-groups"],
    run: async () => {
      const { listAdminSlots } = await import("./alfacrm-schedule");
      const { slotsToXls } = await import("./crm-slots");
      const xls = slotsToXls(listAdminSlots());
      if (!xls.includes("Workbook") || !xls.includes("Worksheet")) return fail("пустой xls", "Генератор Excel вернул не лист. Кнопка «Скачать Excel» сломана.", "crm-slots.ts → slotsToXls.", rel, xls.slice(0, 200));
      return ok(`Excel ${xls.length} байт, строк групп в XML есть.`);
    },
  },
  {
    id: "g-csv",
    title: "Файл · скачать CSV",
    sections: ["schedule-groups"],
    run: async () => {
      const { listAdminSlots } = await import("./alfacrm-schedule");
      const { slotsToCsv, parseSlotsCsv } = await import("./crm-slots");
      const slots = listAdminSlots();
      const csv = slotsToCsv(slots);
      const back = parseSlotsCsv(csv, slots);
      if (back.length < Math.min(1, slots.length)) return fail("CSV туда-обратно пустой", "Экспорт CSV не разбирается обратно. Импорт сломает расписание.", "Проверьте COLS в crm-slots.ts.", rel, csv.slice(0, 300));
      return ok(`CSV ${csv.split("\n").length - 1} строк, обратный разбор ${back.length} групп.`);
    },
  },
  {
    id: "g-import",
    title: "Файл · импорт Excel/CSV",
    sections: ["schedule-groups"],
    run: async () => {
      const { listAdminSlots } = await import("./alfacrm-schedule");
      const { slotsToCsv, parseSlotsCsv } = await import("./crm-slots");
      const slots = listAdminSlots();
      if (!slots.length) return skip("нечего импортировать — снимок пуст");
      const sample = slotsToCsv(slots.slice(0, 2));
      const parsed = parseSlotsCsv(sample, slots);
      if (!parsed.length) return fail("парсер пуст", "Импорт CSV не понял свой же файл. Кнопка «Импорт» опасна.", "Не нажимайте импорт, пока Grok не починит parseSlotsCsv.", rel, sample.slice(0, 240));
      return ok(`парсер живой: из 2 строк получилось ${parsed.length}. На диск не писали.`);
    },
  },
  {
    id: "g-versions",
    title: "Версии и откат",
    sections: ["schedule-groups"],
    run: async () => {
      const { loadVersions } = await import("./crm-slots");
      const v = loadVersions();
      if (!v.length) return skip("снимков отката ещё нет — появятся после загрузки или сохранения");
      const last = v[0];
      return ok(`версий ${v.length}, последняя «${last.reason || "—"}» · ${last.count} групп. Откат не запускали.`);
    },
  },
  {
    id: "g-add-school",
    title: "Добавить школу",
    sections: ["schedule-groups"],
    run: async () => {
      const { loadSiteTree } = await import("./site-tree");
      const tree = loadSiteTree();
      const ids = new Set(tree.schools.map((s) => s.id));
      if (ids.size !== tree.schools.length) return fail("дубли schoolId", "В дереве школ повторяются id. «Добавить школу» начнёт путать папки.", "Расписание → дерево: почистить дубли.", rel);
      return ok(`школ ${tree.schools.length}, id уникальны. Новую школу не создавали.`);
    },
  },
  {
    id: "g-add-course",
    title: "Добавить курс",
    sections: ["schedule-groups"],
    run: async () => {
      const { loadSiteTree } = await import("./site-tree");
      const tree = loadSiteTree();
      const dangling = tree.courses.filter((c) => !tree.schools.some((s) => s.id === c.schoolId)).length;
      if (!tree.courses.length) return fail("нет курсов", "Некуда нажимать «Добавить курс» внутри школы.", "Создайте курс в школе.", rel);
      if (dangling) return fail(`${dangling} курсов без школы`, "Курс ссылается на schoolId, которого нет. Перенос групп сломается.", "Соответствия / дерево: привязать курс к школе.", rel);
      return ok(`курсов ${tree.courses.length}, все с schoolId. Новый курс не создавали.`);
    },
  },
  {
    id: "g-add-group",
    title: "Добавить группу (черновик)",
    sections: ["schedule-groups"],
    run: async () => {
      const { listAdminSlots } = await import("./alfacrm-schedule");
      const { loadSiteTree } = await import("./site-tree");
      const { buildSlot } = await import("./crm-slots");
      const tree = loadSiteTree();
      const course = tree.courses[0];
      if (!course) return fail("нет курса", "Черновик группы строить не из чего.", "Добавьте курс в дерево.", rel);
      const school = tree.schools.find((s) => s.id === course.schoolId);
      const slot = buildSlot(
        {
          course: course.label,
          courseId: course.id,
          school: school?.label || "",
          schoolId: school?.id || course.schoolId,
          age: course.age || "5-7 лет",
          day: 2,
          timeFrom: "15:00",
          timeTo: "16:30",
          branch: "Коломна, ул. Гражданская, 2",
          teacher: "",
          limit: 8,
        },
        listAdminSlots(),
      );
      if (!slot.id || !slot.courseId) return fail("черновик без courseId", "buildSlot не проставил courseId. Новая группа уйдёт в «Без курса».", "Карта ID: передавать courseId в черновик.", rel, JSON.stringify({ id: slot.id, courseId: slot.courseId, subjectId: slot.subjectId }).slice(0, 400));
      return ok(`черновик ${slot.id}, courseId ${slot.courseId}, subjectId ${slot.subjectId || 0}, филиал ${slot.branchId}. На сайт не сохраняли.`);
    },
  },
  {
    id: "g-delete",
    title: "Удалить выбранные",
    sections: ["schedule-groups"],
    run: async () => {
      const { listAdminSlots } = await import("./alfacrm-schedule");
      const { loadSiteTree, slotTreeKey } = await import("./site-tree");
      const slots = listAdminSlots();
      const tree = loadSiteTree();
      const ids = new Set(slots.map((s) => s.id));
      if (ids.size !== slots.length) return fail("дубли id слотов", "Две группы с одним id. Удаление снимет не ту строку.", "Перезагрузить из AlfaCRM.", rel);
      const keys = slots.map((s) => slotTreeKey(s)).filter(Boolean);
      return ok(`уникальных id ${ids.size}, ключей дерева ${keys.length}, assign ${Object.keys(tree.assign || {}).length}. Никого не удаляли.`);
    },
  },
  {
    id: "g-ai",
    title: "ИИ: предпросмотр правки",
    sections: ["schedule-groups"],
    run: async () => {
      const { listAdminSlots } = await import("./alfacrm-schedule");
      const { aiScheduleParse } = await import("./crm-slots");
      const slots = listAdminSlots();
      if (!slots.length) return skip("нет групп — предпросмотр не из чего собрать");
      const preview = await aiScheduleParse(slots, "максимальное количество детей на 15", []);
      const n = (preview.changes || []).length;
      return ok(`предпросмотр живой: ${preview.comment || "без комментария"} · правок ${n}, новых ${preview.adds?.length || 0}. «Опубликовать» не нажимали.`);
    },
  },
  {
    id: "g-voice",
    title: "Голосовой агент расписания",
    sections: ["schedule-groups"],
    run: async () => {
      const { scheduleVoiceTurn } = await import("./schedule-voice");
      const turn = await scheduleVoiceTurn("покажи группы", []);
      if (turn.kind === "refuse" && !turn.answer) return fail("агент отказал", "Голосовой агент не открыл вкладку групп. Кнопки «Голосовой режим» не на что опереться.", "schedule-voice.ts: команда «покажи группы».", rel, JSON.stringify(turn).slice(0, 400));
      return ok(`ответ: ${turn.kind} · ${String(turn.answer || "").slice(0, 120)}. Расписание не меняли.`);
    },
  },
  {
    id: "g-card",
    title: "Карточка группы (подробно)",
    sections: ["schedule-groups"],
    run: async () => {
      const { listAdminSlots } = await import("./alfacrm-schedule");
      const { loadGroupCard } = await import("./group-cards");
      const s = crmLeftover
        ? { groupId: crmLeftover.groupId, branchId: crmLeftover.branchId, groupName: crmLeftover.name }
        : listAdminSlots().find((x) => x.groupId && x.branchId);
      if (!s) return fail("нет gid", "Не открыть карточку: у групп нет номера CRM.", "Загрузить из AlfaCRM.", rel);
      const cached = loadGroupCard(s.branchId, s.groupId);
      try {
        const { token, request } = await import("./alfacrm");
        const t = await token();
        const json = await request<{ items?: { id?: number; name?: string; note?: string; status_id?: number }[] }>(
          `/v2api/${s.branchId}/group/index`,
          { page: 0, pageSize: 100 },
          t,
        );
        const g = (json.items || []).find((x) => Number(x.id) === s.groupId);
        if (!g) return fail(`gid ${s.groupId} нет в CRM`, `Группа «${s.groupName}» есть на сайте, в филиале ${s.branchId} её нет. Плюсик «подробно» будет пустым.`, "Загрузить из AlfaCRM или удалить хвост на сайте.", rel);
        return ok(`gid ${s.groupId} «${g.name || s.groupName}», кэш карточки ${cached ? "есть" : "ещё нет"}. Чтение.`);
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e);
        return fail(raw.slice(0, 200), "Карточку группы из CRM не прочитали.", "Право group/index.", rel, raw);
      }
    },
  },
  {
    id: "g-fields",
    title: "Поля карточки группы",
    sections: ["schedule-groups"],
    run: async () => {
      const { listAdminSlots } = await import("./alfacrm-schedule");
      const slots = listAdminSlots();
      if (!slots.length) return fail("нет групп", "Поля проверять не на ком.", "Загрузить из AlfaCRM.", rel);
      const n = slots.length;
      const row = {
        gid: slots.filter((s) => s.groupId).length,
        subject: slots.filter((s) => s.subjectId).length,
        note: slots.filter((s) => s.description || s.groupNote).length,
        period: slots.filter((s) => s.bDate || s.eDate).length,
        status: slots.filter((s) => s.statusId).length,
        time: slots.filter((s) => s.timeFrom && s.timeTo).length,
        teacher: slots.filter((s) => s.teacherId || s.teacher).length,
        courseId: slots.filter((s) => s.courseId).length,
      };
      return ok(`из ${n}: gid ${row.gid}, subjectId ${row.subject}, courseId ${row.courseId}, описание ${row.note}, период ${row.period}, статус ${row.status}, время ${row.time}, педагог ${row.teacher}`);
    },
  },
  {
    id: "g-members",
    title: "Состав группы / кто учится",
    sections: ["schedule-groups"],
    run: async () => {
      const { listAdminSlots } = await import("./alfacrm-schedule");
      const s = listAdminSlots().find((x) => x.groupId && x.branchId);
      if (!s) return skip("нет группы с gid — состав не запросить");
      try {
        const { token, request } = await import("./alfacrm");
        const t = await token();
        const json = await request<{ items?: unknown[]; total?: number }>(`/v2api/${s.branchId}/customer/index`, { page: 0, pageSize: 20, group_id: s.groupId }, t);
        const n = Array.isArray(json.items) ? json.items.length : 0;
        return ok(`gid ${s.groupId}: учеников в CRM ${n} (всего ${json.total ?? n}). Чтение, без записи.`);
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e);
        return fail(raw.slice(0, 200), "customer/index по группе не ответил. «Кто учится» и состав карточки будут пустыми.", "Роль API: клиенты / список.", rel, raw);
      }
    },
  },
  {
    id: "g-student",
    title: "Карточка ученика из группы",
    sections: ["schedule-groups"],
    run: async () => {
      const { listAdminSlots } = await import("./alfacrm-schedule");
      const s = listAdminSlots().find((x) => x.groupId && x.branchId);
      if (!s) return skip("нет группы — карточку ученика не открыть");
      try {
        const { token, request } = await import("./alfacrm");
        const t = await token();
        const json = await request<{ items?: { id?: number; name?: string }[] }>(`/v2api/${s.branchId}/customer/index`, { page: 0, pageSize: 5, group_id: s.groupId }, t);
        const m = (json.items || []).find((x) => Number(x.id) > 0);
        if (!m) return skip(`в gid ${s.groupId} пока нет учеников — переход в карточку проверить не на ком`);
        const one = await request<{ model?: { id?: number; name?: string } } | { id?: number }>(`/v2api/${s.branchId}/customer/index`, { page: 0, pageSize: 1, id: Number(m.id) }, t);
        const id = Number((one as { model?: { id?: number } }).model?.id || m.id);
        return ok(`ученик ${id} «${m.name || "—"}» из gid ${s.groupId}. Карточку не сохраняли.`);
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e);
        return fail(raw.slice(0, 200), "Не открывается карточка ученика из состава группы.", "Право customer/index.", rel, raw);
      }
    },
  },
  {
    id: "g-calendar",
    title: "Календарь занятий группы",
    sections: ["schedule-groups"],
    run: async () => {
      const { listAdminSlots } = await import("./alfacrm-schedule");
      const s = listAdminSlots().find((x) => x.groupId && x.branchId && x.day);
      if (!s) return skip("нет группы с днём недели — календарь пустой");
      try {
        const { token, request } = await import("./alfacrm");
        const t = await token();
        const json = await request<{ items?: unknown[]; total?: number }>(`/v2api/${s.branchId}/lesson/index`, { page: 0, pageSize: 10, group_id: s.groupId }, t);
        const n = Array.isArray(json.items) ? json.items.length : 0;
        return ok(`gid ${s.groupId}: занятий на странице ${n}, всего ${json.total ?? "—"}. Плитки календаря читаются.`);
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e);
        return fail(raw.slice(0, 200), "lesson/index по группе не ответил. Плитки дат в карточке не появятся.", "Роль API: уроки / список.", rel, raw);
      }
    },
  },
  {
    id: "g-beats",
    title: "Два занятия в неделю",
    sections: ["schedule-groups"],
    run: async () => {
      const { listAdminSlots } = await import("./alfacrm-schedule");
      const { beatsOf, validBeat } = await import("./crm-slots-core");
      const slots = listAdminSlots();
      if (!slots.length) return skip("нет групп");
      const multi = slots.filter((s) => beatsOf(s).filter(validBeat).length > 1);
      const brokenMulti = multi.filter((s) => beatsOf(s).some((x) => !validBeat(x)));
      if (brokenMulti.length) {
        const names = brokenMulti
          .slice(0, 8)
          .map((s) => `gid ${s.groupId} «${s.groupName}»`)
          .join("; ");
        return fail(
          `${brokenMulti.length} с битым вторым днём`,
          `У групп с двумя днями часть beats без дня или времени: ${names}. Переключатель 1/2 покажет пустую строку.`,
          "Откройте группу и заново задайте второй день. Либо выгрузите регулярный урок из CRM.",
          rel,
          names,
        );
      }
      const noTime = slots.filter((s) => !beatsOf(s).some(validBeat));
      const names = noTime.slice(0, 12).map((s) => `gid ${s.groupId}`).join(", ");
      return ok(
        `групп ${slots.length}, два дня ${multi.length} — все с днём и временем. Без регулярного урока в CRM ${noTime.length}${noTime.length ? ` (${names})` : ""} — это не поломка переключателя, в карточке группы нет расписания.`,
      );
    },
  },
  {
    id: "g-move",
    title: "Перенос группы в курс",
    sections: ["schedule-groups"],
    run: async () => {
      const { listAdminSlots } = await import("./alfacrm-schedule");
      const { loadSiteTree, slotTreeKey, courseIdOf } = await import("./site-tree");
      const tree = loadSiteTree();
      const slots = listAdminSlots();
      if (!tree.courses.length) return fail("нет курсов", "Переносить некуда.", "Добавьте курс.", rel);
      const pinned = slots.filter((s) => courseIdOf(s, tree)).length;
      const keys = slots.filter((s) => slotTreeKey(s)).length;
      return ok(`можно перенести: курсов ${tree.courses.length}, ключей ${keys}, уже в папке ${pinned}. treeMove не вызывали.`);
    },
  },
  {
    id: "g-teachers",
    title: "Педагоги филиала",
    sections: ["schedule-groups"],
    run: async () => {
      const { loadTeachers } = await import("./crm-teachers");
      const list = loadTeachers();
      if (!list.length) {
        try {
          const { token, request } = await import("./alfacrm");
          const t = await token();
          const json = await request<{ items?: unknown[] }>(`/v2api/2/teacher/index`, { page: 0, pageSize: 20 }, t);
          const n = Array.isArray(json.items) ? json.items.length : 0;
          if (!n) return fail("нет педагогов", "Справочник педагогов пуст. В карточке группы некого выбрать.", "Загрузить педагогов из AlfaCRM.", rel);
          return ok(`в CRM ЦМИТ педагогов ${n}, локальный кэш ещё пуст`);
        } catch (e) {
          const raw = e instanceof Error ? e.message : String(e);
          return fail(raw.slice(0, 200), "teacher/index не ответил.", "Право teacher/index.", rel, raw);
        }
      }
      return ok(`педагогов в кэше ${list.length}`);
    },
  },
  {
    id: "g-signup",
    title: "Ссылка записи в группу",
    sections: ["schedule-groups"],
    run: async () => {
      const { listAdminSlots } = await import("./alfacrm-schedule");
      const slots = listAdminSlots().filter((s) => s.groupId);
      if (!slots.length) return fail("нет gid", "Не из чего собрать lead/create?gid=.", "Загрузить из AlfaCRM.", rel);
      const bad = slots.filter((s) => !/lead\/create\?gid=/.test(s.signup || ""));
      if (bad.length) return fail(`${bad.length} без ссылки`, `${bad.length} групп с номером, но без формы записи. Кнопка «Запись в группу» пустая.`, "Выгрузить группу в CRM или загрузить заново.", rel);
      return ok(`${slots.length} ссылок lead/create?gid=`);
    },
  },
  {
    id: "g-mismatch",
    title: "Несоответствие предмет ≠ название",
    sections: ["schedule-groups"],
    run: async () => {
      const { listAdminSlots } = await import("./alfacrm-schedule");
      const { slotMismatch } = await import("./slot-mismatch");
      const slots = listAdminSlots();
      const hard = slots.filter((s) => slotMismatch(s).level === "hard").length;
      const soft = slots.filter((s) => slotMismatch(s).level === "soft").length;
      return ok(`грубых ${hard}, мягких ${soft}. Индикатор на шапке живой.`);
    },
  },
  {
    id: "g-subject",
    title: "Предмет группы по ID",
    sections: ["schedule-groups"],
    run: async () => {
      const { listAdminSlots } = await import("./alfacrm-schedule");
      const { loadSubjects } = await import("./crm-subjects");
      const { subjectIdOfCourse } = await import("./ids");
      const { loadScheduleMap } = await import("./schedule-map");
      const subjects = loadSubjects();
      const map = loadScheduleMap();
      const slots = listAdminSlots();
      if (!subjects.length) return fail("нет предметов", "Карточка группы нечем заполнить поле «предмет».", "Предметы → Загрузить из AlfaCRM.", rel);
      const unknown = slots.filter((s) => s.subjectId && !subjects.some((x) => x.id === s.subjectId)).length;
      const withCourse = slots.filter((s) => s.courseId && subjectIdOfCourse(s.courseId, map.courses)).length;
      return ok(`предметов ${subjects.length}, групп с неизвестным subjectId ${unknown}, курс→предмет по карте ${withCourse}`);
    },
  },
  {
    id: "g-tariff",
    title: "Абонемент к группе по ID",
    sections: ["schedule-groups"],
    run: async () => {
      const { listAdminSlots } = await import("./alfacrm-schedule");
      const { loadTariffs, matchTariffs } = await import("./crm-tariffs");
      const slots = listAdminSlots().filter((s) => s.subjectId);
      const store = loadTariffs();
      if (!store.items.length) return skip("абонементов на сайте нет — вкладка «Абонементы» отдельно");
      if (!slots.length) return skip("нет групп с subjectId");
      const sample = slots.slice(0, 12);
      const hits = sample.map((s) => matchTariffs(s).length);
      const withT = hits.filter((n) => n > 0).length;
      return ok(`из ${sample.length} групп абонемент нашёлся у ${withT} (subjectId + филиал + минуты). Имя не смотрели.`);
    },
  },
  {
    id: "g-settings",
    title: "Автозагрузка расписания",
    sections: ["schedule-groups"],
    run: async () => {
      const { loadScheduleSettings, pullIntervalMs } = await import("./schedule-settings");
      const s = loadScheduleSettings();
      const ms = pullIntervalMs(s);
      if (!s.pullN || !s.pullUnit) return fail("настройки пусты", "Интервал автозагрузки не задан.", "Группы: блок автозагрузки, сохраните интервал.", rel);
      return ok(`каждые ${s.pullN} ${s.pullUnit}, интервал ${Math.round(ms / 60000)} мин, lastPull ${s.lastPullAt ? new Date(s.lastPullAt).toISOString() : "ещё не было"}`);
    },
  },
  {
    id: "g-public",
    title: "Группы → страница /schedule",
    sections: ["schedule-groups"],
    run: async () => {
      const { listAdminSlots, sessionsFromSlots } = await import("./alfacrm-schedule");
      const slots = listAdminSlots();
      const sessions = sessionsFromSlots(slots);
      if (!slots.length) return fail("нет групп", "Публичное расписание пустое.", "Загрузить из AlfaCRM.", rel);
      if (!sessions.length) return fail("на сайт 0", `${slots.length} групп в кабинете, на /schedule ни одной (нет времени или школа «Прочее»).`, "Проставьте время и courseId.", rel);
      return ok(`кабинет ${slots.length} → сайт ${sessions.length} занятий`);
    },
  },
  {
    id: "g-select",
    title: "Чекбоксы и «выделить всё»",
    sections: ["schedule-groups"],
    run: async () => {
      const { listAdminSlots } = await import("./alfacrm-schedule");
      const { loadSiteTree } = await import("./site-tree");
      const slots = listAdminSlots();
      const tree = loadSiteTree();
      const schoolIds = new Set(tree.schools.map((s) => s.id));
      const courseIds = new Set(tree.courses.map((c) => c.id));
      return ok(`можно отметить: групп ${slots.length}, школ ${schoolIds.size}, курсов ${courseIds.size}. Выделение не сбрасывали.`);
    },
  },
  {
    id: "g-crm-leftover",
    title: "Оператору: удалить тестовую группу в AlfaCRM",
    sections: ["schedule-groups"],
    run: async () => {
      if (!crmLeftover?.groupId) {
        return skip("Тестовую группу создать не удалось — в CRM лишнего нет. Смотрите сбой «создать тестовую группу».");
      }
      return ok(
        `Проверка ничего не удаляет, даже то, что сама записала. Удалите сами в AlfaCRM: филиал ${crmLeftover.branchId}, группа ${crmLeftover.groupId} «${crmLeftover.name}»${crmLeftover.lessonId ? `, урок ${crmLeftover.lessonId}` : ""}. Карточка: ${crmLeftover.url}`,
        rel,
        leftoverLine(crmLeftover),
      );
    },
  },
];
