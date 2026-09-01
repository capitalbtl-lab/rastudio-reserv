export const SITE = {
  name: "Студия «Развивайся»",
  shortName: "РАЗВИВАЙСЯ",
  domain: "https://www.rastudio.org",
  phone: "8 (800) 511-34-01",
  phoneHref: "tel:+78005113401",
  email: "admin@rastudio.org",
  telegram: "https://t.me/rastudiolife",
  cabinet: "https://studiyarazvivaysya.s20.online/",
  trialForm:
    "https://studiyarazvivaysya.s20.online/common/2/form/draw?id=20&lead_source_id=2&baseColor=205EDC&borderRadius=8&css=%2F%2Fcdn.alfacrm.pro%2Flead-form%2Fform.css",
  maxBot: "https://max.ru/id502210556271_bot",
  camp: "http://www.racamp.ru",
  vk: "https://vk.ru/rastudio",
  logo: {
    src: "https://static.wixstatic.com/media/4e33b6_562c01970b714565ac3c564af8248290~mv2.jpg/v1/fill/w_400,h_400,al_c,q_80,enc_avif,quality_auto/4e33b6_562c01970b714565ac3c564af8248290~mv2.jpg",
    filename: "4e33b6_562c01970b714565ac3c564af8248290~mv2.jpg",
    alt: "Логотип студии Развивайся",
  },
  homeTitle:
    'Студия "РАЗВИВАЙСЯ" | Художественная школа, робототехника, инженерные и айти-курсы',
  homeDescription:
    "Художественная школа в Коломне для детей и взрослых, занятия по робототехнике, программированию, 3D-моделированию, подготовка к школе и многое другое!",
  ogTitle: 'Студия "РАЗВИВАЙСЯ" | творчество и дошкольное образование в Коломне',
} as const;

export const BRANCHES = [
  {
    name: "Студия и ЦМИТ «Развивайся»",
    city: "Коломна",
    address: "ул. Октябрьской революции, д. 340, центральный вход, 2 этаж",
    hours: "Ср–Вс, 10:00–19:00",
    map: "https://yandex.ru/maps/-/C-WgM~Q",
    mapEmbed:
      "https://yandex.ru/map-widget/v1/?ll=38.7686%2C55.0834&z=16&text=%D0%9A%D0%BE%D0%BB%D0%BE%D0%BC%D0%BD%D0%B0%2C%20%D1%83%D0%BB.%20%D0%9E%D0%BA%D1%82%D1%8F%D0%B1%D1%80%D1%8C%D1%81%D0%BA%D0%BE%D0%B9%20%D1%80%D0%B5%D0%B2%D0%BE%D0%BB%D1%8E%D1%86%D0%B8%D0%B8%2C%20340",
    note: "Филиал работает с администратором. Визиты вне занятий — по согласованию.",
    directions:
      "Художественная школа, робототехника, программирование, науки и инженерия, мастер-классы, летний лагерь.",
  },
  {
    name: "Студия «Развивайся»",
    city: "Коломна",
    address: "ул. Гражданская, д. 2, ТЦ «Олимпийский», правый торец, 2 этаж",
    hours: "По расписанию занятий",
    map: "https://yandex.ru/maps/-/C-Wgjbb",
    mapEmbed:
      "https://yandex.ru/map-widget/v1/?ll=38.7788%2C55.0789&z=16&text=%D0%9A%D0%BE%D0%BB%D0%BE%D0%BC%D0%BD%D0%B0%2C%20%D1%83%D0%BB.%20%D0%93%D1%80%D0%B0%D0%B6%D0%B4%D0%B0%D0%BD%D1%81%D0%BA%D0%B0%D1%8F%2C%202%2C%20%D0%A2%D0%A6%20%D0%9E%D0%BB%D0%B8%D0%BC%D0%BF%D0%B8%D0%B9%D1%81%D0%BA%D0%B8%D0%B9",
    note: "Запись по телефону и на сайте. Визиты вне занятий не предусмотрены.",
    directions:
      "Школа раннего развития, художественная школа и студия, модельная школа, мастер-классы, летний детский клуб.",
  },
  {
    name: "Филиал ЦМИТ «Развивайся»",
    city: "Луховицы",
    address: "ул. Пушкина, д. 202А, ТЦ «Хороший», правый торец, 3 этаж",
    hours: "По согласованию",
    map: "https://yandex.ru/maps/-/C-WgbnB",
    mapEmbed:
      "https://yandex.ru/map-widget/v1/?ll=39.0265%2C54.9652&z=16&text=%D0%9B%D1%83%D1%85%D0%BE%D0%B2%D0%B8%D1%86%D1%8B%2C%20%D1%83%D0%BB.%20%D0%9F%D1%83%D1%88%D0%BA%D0%B8%D0%BD%D0%B0%2C%20202%D0%90",
    note: "Запись по телефону и на сайте. Визиты вне занятий — по согласованию.",
    directions:
      "Робототехника, программирование, науки и инженерия, мастер-классы, летний детский клуб.",
  },
] as const;

export const SCHOOLS = [
  {
    href: "/art-studio",
    label: "Художественная школа",
    kicker: "3-17 лет",
    blurb: "Академический рисунок, живопись, скульптура и digital art.",
    image: "/courses/akadem-art.jpg",
    alt: "Академическая художественная школа в Коломне",
    filename: "Развивайся - Академическая художественная школа в Коломне.png",
  },
  {
    href: "/robototehnika-v-kolomne",
    label: "Школа робототехники",
    kicker: "5-14 лет",
    blurb: "LEGO, Arduino, схемотехника и билингвальные курсы.",
    image: "/courses/robot-10-14.jpg",
    alt: "Робототехника 10–14 лет в Коломне",
    filename: "Развивайся - Робототехника 10-14 лет в Коломне.png",
  },
  {
    href: "/programming-school",
    label: "Школа программирования",
    kicker: "5-16 лет",
    blurb: "Scratch, Python, C++ и разработка игр на Unity.",
    image: "/courses/intro-computers.jpg",
    alt: "Знакомство с компьютером и информационными технологиями",
    filename: "Развивайся - Знакомство с компьютером и информационными технологиями в Коломне.png",
  },
  {
    href: "/promising-professions",
    label: "Школа наук и инженерии",
    kicker: "5-16 лет",
    blurb: "Физика, радиотехника, 3D и инженерные проекты.",
    image: "/courses/tesla.jpg",
    alt: "Научный курс «Физика инноваций» в Коломне",
    filename: "Развивайся - Научный курс Физика инноваций в Коломне.png",
  },
  {
    href: "/model-school",
    label: "Модельная школа",
    kicker: "9-14 лет",
    blurb: "Подиум, стиль, этикет и уверенная самопрезентация.",
    image: "/courses/podium.jpg",
    alt: "Модельная школа «Подиум» в Коломне",
    filename: "Развивайся - Модельная школа Подиум в Коломне.png",
  },
  {
    href: "/early-childhood-care",
    label: "Школа раннего развития",
    kicker: "3-6 лет",
    blurb: "STEAM, лего-математика и подготовка к школе.",
    image: "/courses/prep-school.jpg",
    alt: "Комплексная подготовка к школе в Коломне",
    filename: "Развивайся - Комплексная подготовка к школе в Коломне.png",
  },
  {
    href: "/languageschool",
    label: "Школа иностранных языков",
    kicker: "9-14 лет",
    blurb: "Английский, корейский и японский с носителями.",
    image:
      "https://static.wixstatic.com/media/11062b_e2ae833a8eaa43e38e4aa6d32eb3b8f7f000.jpg/v1/fill/w_900,h_620,al_c,q_85,enc_avif,quality_auto/11062b_e2ae833a8eaa43e38e4aa6d32eb3b8f7f000.jpg",
    alt: "Школа иностранных языков в Студии Развивайся | Коломна",
    filename: "11062b_e2ae833a8eaa43e38e4aa6d32eb3b8f7f000.jpg",
  },
] as const;

export const SCHOOL_COURSE_MATCH: Record<string, (href: string) => boolean> = {
  "/art-studio": (href) => /art-studio-|sculptural|hudvuz|digitalart/i.test(href),
  "/robototehnika-v-kolomne": (href) => /robototehnika-\d|roboticsinenglish/i.test(href),
  "/programming-school": (href) => href.includes("kursy-shkoly-programmirovaniya"),
  "/promising-professions": (href) =>
    /radioengineering|science-course|teslaphysics|3d-modeling|gamedesign|mentalarithmetic|kinder-master/i.test(href),
  "/early-childhood-care": (href) => /preparation-for-school|happybricks|planet-steam/i.test(href),
  "/languageschool": (href) => /englishlanguage|japanese|vitaminkorean/i.test(href),
};

export function coursesForSchool<T extends { href: string }>(schoolPath: string, courses: T[]) {
  const test = SCHOOL_COURSE_MATCH[schoolPath];
  if (!test) return [];
  return courses.filter((course) => course.href !== schoolPath && test(course.href));
}

export const COURSE_GROUPS = [
  { id: "all", label: "Все курсы", test: (_href: string) => true },
  {
    id: "art",
    label: "Художество",
    test: (href: string) => /art-studio|sculptural|hudvuz|digitalart/i.test(href),
  },
  {
    id: "robot",
    label: "Роботы и инженерия",
    test: (href: string) => /robot|gamedesign|3d-modeling|oge-in/i.test(href),
  },
  {
    id: "prog",
    label: "Программирование",
    test: (href: string) => /kursy-shkoly-programmirovaniya|programming-school/i.test(href),
  },
  {
    id: "science",
    label: "Науки",
    test: (href: string) => /radio|science|tesla|mental/i.test(href),
  },
  {
    id: "early",
    label: "Дошколята",
    test: (href: string) => /preparation-for-school|happybricks/i.test(href),
  },
  {
    id: "model",
    label: "Мода",
    test: (href: string) => /model-school/i.test(href),
  },
  {
    id: "lang",
    label: "Языки",
    test: (href: string) => /english|japanese|korean|vitamin/i.test(href),
  },
] as const;

export const NAV = [
  { href: "/allcourses", label: "Курсы" },
  { href: "/schedule", label: "Расписание" },
  { href: "/team", label: "Педагоги" },
  { href: "/master-class", label: "Мастер-классы" },
  { href: "/o-nas", label: "О студии" },
  { href: "/contacts", label: "Контакты" },
] as const;

export const FOOTER_LINKS = [
  { href: "/o-nas", label: "О студии" },
  { href: "/contacts", label: "Контакты" },
  { href: "/team", label: "Педагоги" },
  { href: "/allcourses", label: "Все курсы" },
  { href: "/schedule", label: "Расписание" },
  { href: "/master-class", label: "Мастер-классы" },
  { href: "/servicerules", label: "Правила оказания услуг" },
  { href: "/legal-information", label: "Правовая информация" },
  { href: "/charity", label: "Благотворительность" },
] as const;

export const STATS = [
  { value: "2016", label: "год основания" },
  { value: "3", label: "студии" },
  { value: "7", label: "школ" },
  { value: "30+", label: "курсов" },
] as const;

export const TICKER = [
  "Робототехника",
  "Python",
  "Scratch",
  "Blender",
  "Манга и аниме",
  "Академический рисунок",
  "Скульптура",
  "Беспилотники",
  "Minecraft",
  "C++",
  "Подиум",
  "STEAM",
  "Компас 3D",
  "Digital art",
  "Лего-математика",
  "Физика инноваций",
] as const;

export const SHOWCASE = [
  {
    href: "/kursy-shkoly-programmirovaniya/it-школа-программирование-на-python",
    title: "Python",
    age: "10–16 лет",
    src: "/courses/python.jpg",
    filename: "Развивайся -  Основы программирования Python в Коломне.png",
    alt: "Основы программирования Python в Коломне",
  },
  {
    href: "/gamedesign",
    title: "Game-дизайн в Blender",
    age: "10–16 лет",
    src: "/courses/blender.jpg",
    filename: "Развивайся - Game-дизайн и 3D-анимация в Blender в Коломне.png",
    alt: "Game-дизайн и 3D-анимация в Blender в Коломне",
  },
  {
    href: "/robototehnika-5-7",
    title: "Робототехника 5–6",
    age: "5–6 лет",
    src: "/courses/robot-5-6.jpg",
    filename: "Развивайся - Робототехника 5-6 лет в Коломне.png",
    alt: "Робототехника 5–6 лет в Коломне",
  },
  {
    href: "/digitalartschool",
    title: "Цифровое искусство",
    age: "7–16 лет",
    src: "/courses/digital-art.jpg",
    filename: "Развивайся - Цифровая художественная школа.png",
    alt: "Цифровая художественная школа в Коломне",
  },
  {
    href: "/robototehnika-v-kolomne",
    title: "Беспилотная авиация",
    age: "10–14 лет",
    src: "/courses/drones.jpg",
    filename: "Развивайся - Беспилотная авиация в Коломне.png",
    alt: "Беспилотная авиация в Коломне",
  },
  {
    href: "/kursy-shkoly-programmirovaniya/it-лаборатория-create-для-детей-7-9-лет",
    title: "Minecraft",
    age: "7–9 лет",
    src: "/courses/minecraft.jpg",
    filename: "Развивайся - Игровое программирование в Майнкрафт.png",
    alt: "Игровое программирование в Minecraft",
  },
  {
    href: "/teslaphysics",
    title: "Физика инноваций",
    age: "9–14 лет",
    src: "/courses/tesla.jpg",
    filename: "Развивайся - Научный курс Физика инноваций в Коломне.png",
    alt: "Научный курс «Физика инноваций» в Коломне",
  },
  {
    href: "/model-school",
    title: "Модельная школа",
    age: "9–14 лет",
    src: "/courses/podium.jpg",
    filename: "Развивайся - Модельная школа Подиум в Коломне.png",
    alt: "Модельная школа «Подиум» в Коломне",
  },
] as const;

export const MOMENTS = [
  {
    href: "/charity",
    title: 'ПРОЕКТ "РАЗВИВАЙСЯ | ВАЖНЫЕ ДЕЛА"',
    blurb: "Бесплатные мастер-классы и благотворительные проекты студии.",
    image:
      "https://static.wixstatic.com/media/4e33b6_d7e3decbbaef4a1e937baa2b83583b7e~mv2.jpg/v1/fill/w_800,h_800,al_c,q_80,enc_avif,quality_auto/4e33b6_d7e3decbbaef4a1e937baa2b83583b7e~mv2.jpg",
    alt: "Благотворительные проекты Студии Развивайся в Коломне",
    filename: "4e33b6_d7e3decbbaef4a1e937baa2b83583b7e~mv2.jpg",
  },
  {
    href: "http://www.racamp.ru",
    title: "ЛЕТНИЙ ГОРОДСКОЙ ЛАГЕРЬ 2026",
    blurb: "Науки и профориентация, питание по СанПиН, два филиала в Коломне.",
    image:
      "https://static.wixstatic.com/media/4e33b6_6c4462b65d0c4593b30ff3c96f099397~mv2.jpg/v1/fill/w_800,h_800,al_c,q_80,enc_avif,quality_auto/4e33b6_6c4462b65d0c4593b30ff3c96f099397~mv2.jpg",
    alt: "Летний лагерь в Студии Развивайся в Коломне",
    filename: "4e33b6_6c4462b65d0c4593b30ff3c96f099397~mv2.jpg",
  },
  {
    href: "/tinkercad2025itogi",
    title:
      "ВНУТРЕННЕЕ СОРЕВНОВАНИЕ СТУДИИ «РАЗВИВАЙСЯ» ПО 3D-МОДЕЛИРОВАНИЮ В TINKERCAD: «РОБОТЫ БУДУЩЕГО»",
    blurb: "Внутренний конкурс по 3D-моделированию в Tinkercad.",
    image:
      "https://static.wixstatic.com/media/4e33b6_a77d452c2a234db78242e46c3593cf1c~mv2.jpg/v1/fill/w_800,h_800,al_c,q_80,enc_avif,quality_auto/4e33b6_a77d452c2a234db78242e46c3593cf1c~mv2.jpg",
    alt: "Конкурс робототехники от Студии Развивайся в Коломне",
    filename: "4e33b6_a77d452c2a234db78242e46c3593cf1c~mv2.jpg",
  },
] as const;

export const PARTNER_LOGOS = [
  {
    src: "https://static.wixstatic.com/media/4e33b6_5f0212bb908f42c2b022b4aa05ce2980~mv2.png/v1/fill/w_400,h_400,al_c,q_85,enc_avif,quality_auto/%D0%9B%D0%BE%D0%B3%D0%BE%D1%82%D0%B8%D0%BF%D1%8B%20%D0%BD%D0%B0%20%D0%B3%D0%BB%D0%B0%D0%B2%D0%BD%D1%83%D1%8E%20%D0%A1%D1%82%D1%83%D0%B4%D0%B8%D1%8F%20%D0%A0%D0%B0%D0%B7%D0%B2%D0%B8%D0%B2%D0%B0%D0%B9%D1%81%D1%8F%20(4).png",
    alt: "Логотипы на главную Студия Развивайся (4).png",
    filename: "Логотипы на главную Студия Развивайся (4).png",
  },
  {
    src: "https://static.wixstatic.com/media/4e33b6_284d58a7c14b4d50bc03394b5b87ad45~mv2.png/v1/fill/w_400,h_400,al_c,q_85,enc_avif,quality_auto/%D0%9B%D0%BE%D0%B3%D0%BE%D1%82%D0%B8%D0%BF%D1%8B%20%D0%BD%D0%B0%20%D0%B3%D0%BB%D0%B0%D0%B2%D0%BD%D1%83%D1%8E%20%D0%A1%D1%82%D1%83%D0%B4%D0%B8%D1%8F%20%D0%A0%D0%B0%D0%B7%D0%B2%D0%B8%D0%B2%D0%B0%D0%B9%D1%81%D1%8F%20(3).png",
    alt: "Логотипы на главную Студия Развивайся (3).png",
    filename: "Логотипы на главную Студия Развивайся (3).png",
  },
  {
    src: "https://static.wixstatic.com/media/4e33b6_920386da915e419e8380eef5d8b302af~mv2.jpg/v1/fill/w_400,h_400,al_c,q_80,enc_avif,quality_auto/%D0%9B%D0%BE%D0%B3%D0%BE%D1%82%D0%B8%D0%BF%D1%8B%20%D0%BD%D0%B0%20%D0%B3%D0%BB%D0%B0%D0%B2%D0%BD%D1%83%D1%8E%20%D0%A1%D1%82%D1%83%D0%B4%D0%B8%D1%8F%20%D0%A0%D0%B0%D0%B7%D0%B2%D0%B8%D0%B2%D0%B0%D0%B9%D1%81%D1%8F%20(2).jpg",
    alt: "Логотипы на главную Студия Развивайся (2).jpg",
    filename: "Логотипы на главную Студия Развивайся (2).jpg",
  },
  {
    src: "https://static.wixstatic.com/media/4e33b6_d9ab0d6feca64ece8d498d9b0275b293~mv2.jpg/v1/fill/w_400,h_400,al_c,q_80,enc_avif,quality_auto/%D0%9B%D0%BE%D0%B3%D0%BE%D1%82%D0%B8%D0%BF%D1%8B%20%D0%BD%D0%B0%20%D0%B3%D0%BB%D0%B0%D0%B2%D0%BD%D1%83%D1%8E%20%D0%A1%D1%82%D1%83%D0%B4%D0%B8%D1%8F%20%D0%A0%D0%B0%D0%B7%D0%B2%D0%B8%D0%B2%D0%B0%D0%B9%D1%81%D1%8F%20(1).jpg",
    alt: "Логотипы на главную Студия Развивайся (1).jpg",
    filename: "Логотипы на главную Студия Развивайся (1).jpg",
  },
  {
    src: "https://static.wixstatic.com/media/4e33b6_5b4eed978be64bd494a3b78b27ccfd70~mv2.jpg/v1/fill/w_400,h_400,al_c,q_80,enc_avif,quality_auto/%D0%9B%D0%BE%D0%B3%D0%BE%D1%82%D0%B8%D0%BF%D1%8B%20%D0%BD%D0%B0%20%D0%B3%D0%BB%D0%B0%D0%B2%D0%BD%D1%83%D1%8E%20%D0%A1%D1%82%D1%83%D0%B4%D0%B8%D1%8F%20%D0%A0%D0%B0%D0%B7%D0%B2%D0%B8%D0%B2%D0%B0%D0%B9%D1%81%D1%8F%20(3).jpg",
    alt: "Логотипы на главную Студия Развивайся (3).jpg",
    filename: "Логотипы на главную Студия Развивайся (3).jpg",
  },
  {
    src: "https://static.wixstatic.com/media/4e33b6_a30da1df107748559ac545bcd3f89c00~mv2.png/v1/fill/w_400,h_400,al_c,q_85,enc_avif,quality_auto/%D0%9B%D0%BE%D0%B3%D0%BE%D1%82%D0%B8%D0%BF%D1%8B%20%D0%BD%D0%B0%20%D0%B3%D0%BB%D0%B0%D0%B2%D0%BD%D1%83%D1%8E%20%D0%A1%D1%82%D1%83%D0%B4%D0%B8%D1%8F%20%D0%A0%D0%B0%D0%B7%D0%B2%D0%B8%D0%B2%D0%B0%D0%B9%D1%81%D1%8F%20(6).png",
    alt: "Логотипы на главную Студия Развивайся (6).png",
    filename: "Логотипы на главную Студия Развивайся (6).png",
  },
] as const;
