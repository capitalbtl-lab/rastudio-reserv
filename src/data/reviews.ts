import { schoolIdOfPath } from "./site-bind-core";

export const YANDEX_REVIEWS =
  "https://yandex.ru/maps/org/razvivaysya/34620041541/reviews/?ll=38.793880%2C55.086244&z=17";

export const YANDEX_RATING = { score: "4,9", ratings: 115, reviews: 44 };

export type Review = {
  name: string;
  date: string;
  course: string;
  text: string;
  paths: string[];
};

export const REVIEWS: Review[] = [
  {
    name: "Софья Харламова",
    date: "4 июня 2025",
    course: "Художественная школа",
    paths: ["/art-studio", "/art-studio-5-6", "/art-studio-7-8", "/art-studio-9-13"],
    text: "Я очень благодарна художественной студии «Развивайся»! Здесь я не только научилась рисовать, но и нашла настоящих друзей. Благодарна преподавателю Мормуль Нине Константиновне — она прекрасный педагог и человек. Рекомендую всем, кто хочет научиться рисовать.",
  },
  {
    name: "Инна Н.",
    date: "13 октября 2024",
    course: "Модельная школа",
    paths: ["/model-school", "/model-school-podium", "/model-school-makeup", "/model-school-growth"],
    text: "На протяжении двух лет дочь посещала модельную школу. Ольга Викторовна помогла ей стать увереннее, научила ухаживать за собой, делать макияж и собирать образы. Мы прошли кастинг в модельном агентстве в Москве. Это отличная возможность стать прекрасной леди.",
  },
  {
    name: "Анна Матяш",
    date: "12 января 2024",
    course: "Скульптура и живопись",
    paths: ["/art-studio", "/sculptural-studio", "/art-studio-9-13", "/art-studio-7-8"],
    text: "Самая лучшая студия города Коломны. Дочь ходит уже 5 лет. Нина Константиновна не навязывает свой взгляд — старается в каждом раскрыть талант, в скульптуре и в живописи. Дочь всегда с удовольствием идёт на уроки.",
  },
  {
    name: "Сергей Куценко",
    date: "20 декабря 2023",
    course: "Робототехника",
    paths: ["/robototehnika-v-kolomne", "/robototehnika-7-9", "/robototehnika-5-7"],
    text: "Ребёнку 7,5 лет, ходит на робототехнику с удовольствием и ждёт каждое занятие. Курс насыщенный: программирование и моделирование, лего с электрическими элементами. Есть лагерь на каникулах. Рекомендую.",
  },
  {
    name: "Алексей Елистратов",
    date: "27 декабря 2023",
    course: "Программирование",
    paths: [
      "/programming-school",
      "/robototehnika-v-kolomne",
      "/kursy-shkoly-programmirovaniya/it-школа-программирование-на-python",
      "/kursy-shkoly-programmirovaniya/it-лаборатория-dev-для-детей-9-10-лет",
    ],
    text: "Старший сын ходит второй год на программирование, в этом году средний занялся робототехникой — оба в восторге. Персонал отзывчивый, педагоги квалифицированные. За полтора года ни одной нерешаемой проблемы.",
  },
  {
    name: "Валерия Белоус",
    date: "2 августа 2024",
    course: "Подготовка в вуз",
    paths: ["/art-studio", "/podgotovka-v-hudvuz", "/art-studio-9-13"],
    text: "Педагог Нина Константиновна подготовила за год к поступлению в университет. В студии и эстетическое развитие, и поездки в музеи. Видно, что педагоги хотят научить, а не отработать зарплату.",
  },
  {
    name: "Леонид Крюков",
    date: "28 ноября 2023",
    course: "Рисование и лепка",
    paths: ["/art-studio", "/art-studio-3-4", "/art-studio-5-6", "/early-childhood-care", "/sculptural-studio"],
    text: "Ходим на рисование и лепку из скульптурного пластилина — всё превосходно. Преподаватель очень опытный, есть с чем сравнивать: дочка с 3 лет рисовала и в частных, и в бюджетных школах, результата не было. Здесь дочка аж бежит на занятия.",
  },
  {
    name: "Валерьянка",
    date: "6 марта 2026",
    course: "Бьюти-лагерь",
    paths: ["/model-school", "/model-school-podium", "/model-school-makeup", "/model-school-growth"],
    text: "Огромное спасибо команде бьюти-лагеря за смену июля 2025. Дочка получила новые знания о красоте и каждый день шла туда с горящими глазами. Каждая девочка чувствовала себя уникальной.",
  },
  {
    name: "Татьяна Трепелкова",
    date: "19 мая 2022",
    course: "Программирование",
    paths: [
      "/programming-school",
      "/kursy-shkoly-programmirovaniya/it-лаборатория-create-для-детей-7-9-лет",
      "/kursy-shkoly-programmirovaniya/it-школа-программирование-на-python",
      "/kursy-shkoly-programmirovaniya/it-лаборатория-dev-для-детей-9-10-лет",
    ],
    text: "Посещали основы программирования, ребёнку 11 лет. Ходил с удовольствием, после занятий делился, что изучали. Мальчик неусидчивый, заинтересовать сложно — эти занятия увлекли. Хочет продолжать.",
  },
];

function normPath(path: string) {
  try {
    return decodeURIComponent(path).replace(/\/$/, "") || path;
  } catch {
    return path.replace(/\/$/, "") || path;
  }
}

export function reviewsForPath(path: string): Review[] {
  const p = normPath(path);
  const exact = REVIEWS.filter((r) => r.paths.some((item) => normPath(item) === p));
  if (exact.length) return exact;
  const schoolId = schoolIdOfPath(p);
  if (schoolId && schoolId !== p) {
    const inherited = REVIEWS.filter((r) => r.paths.some((item) => normPath(item) === schoolId));
    if (inherited.length) return inherited;
  }
  return [];
}