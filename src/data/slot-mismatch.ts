export type SlotMismatch = "" | "soft" | "hard";

export function schoolFromHay(hay: string) {
  const t = String(hay || "").toLowerCase().replace(/ё/g, "е");
  if (/худож|скульп|портрет|рисунок|вуз|манг|digital|живопис|лепк|рисов/.test(t)) return "Художественная школа";
  if (/робототех|билингв/.test(t) && !/it-школ|it-лаб|python|scratch|unity/.test(t)) return "Школа робототехники";
  if (/python|scratch|c\+\+|си\+\+|unity|it-лаб|it-школ|codebook|gamedev|програм/.test(t) && !/робототех/.test(t)) return "Школа программирования";
  if (/наук|физик|радио|беспилот|компас|blender|инженер|steam/.test(t) && !/лего|планет/.test(t)) return "Школа наук и инженерии";
  if (/лего|подготовк|к школе|планет/.test(t)) return "Школа раннего развития";
  if (/англий|япон|коре|язык|go getter|super minds|vitamin|nihongo/.test(t)) return "Школа иностранных языков";
  if (/модельн|подиум/.test(t)) return "Модельная школа";
  return "Прочее";
}

function programFamily(hay: string) {
  const t = String(hay || "").toLowerCase().replace(/ё/g, "е");
  if (/билингв|на английск\w* язык|робототех\w* на англий|english/.test(t) && /робот/.test(t)) return "robot-en";
  if (/робототех/.test(t)) return "robot";
  if (/python|питон|codebook/.test(t)) return "python";
  if (/scratch|startschool|старт\s*скул/.test(t)) return "scratch";
  if (/c\+\+|си\+\+/.test(t)) return "cpp";
  if (/unity|gamedev|game-дизайн/.test(t)) return "gamedev";
  if (/blender/.test(t)) return "blender";
  if (/компас/.test(t)) return "compass";
  if (/it-лаборатор|create|криэйт|junior/.test(t)) return "itlab";
  if (/вуз/.test(t)) return "hudvuz";
  if (/скульп/.test(t)) return "sculpt";
  if (/манг|аним/.test(t)) return "manga";
  if (/digital|цифров/.test(t)) return "digital";
  if (/художествен/.test(t)) return "art";
  if (/лего/.test(t)) return "lego";
  if (/подготовк/.test(t)) return "prep";
  if (/steam|планет/.test(t)) return "steam";
  if (/наук|физик/.test(t)) return "science";
  if (/радио/.test(t)) return "radio";
  if (/беспилот/.test(t)) return "drone";
  if (/модельн|подиум/.test(t)) return "model";
  if (/англий|go getter|super minds/.test(t)) return "english";
  if (/коре|vitamin/.test(t)) return "korean";
  if (/япон|nihongo/.test(t)) return "japanese";
  return "";
}

export function slotMismatch(s: { groupName?: string; subject?: string; subjectId?: number }): { level: SlotMismatch; text: string } {
  const name = String(s.groupName || "").trim();
  const sub = String(s.subject || "").trim();
  if (!name) return { level: "", text: "" };
  if (!s.subjectId && !sub) {
    return { level: "soft", text: "В CRM у группы нет предмета — проверьте карточку группы." };
  }
  if (!sub) return { level: "", text: "" };
  const nameSchool = schoolFromHay(name);
  const subSchool = schoolFromHay(sub);
  if (nameSchool !== "Прочее" && subSchool !== "Прочее" && nameSchool !== subSchool) {
    return {
      level: "hard",
      text: `Ошибка CRM: название «${name}» — ${nameSchool}, предмет «${sub}» — ${subSchool}. Исправьте в AlfaCRM.`,
    };
  }
  const nf = programFamily(name);
  const sf = programFamily(sub);
  if (nf && sf && nf !== sf) {
    return {
      level: "soft",
      text: `Название и предмет не совпадают: «${name}» и «${sub}». Проверьте карточку в AlfaCRM.`,
    };
  }
  return { level: "", text: "" };
}
