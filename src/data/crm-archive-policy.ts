/** Рабочий архив клиентов. Файл политики, не dossier.extras — синхронизация extras перетирает. */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isPhoneLike } from "./client-display.ts";
import { pupilNameOk } from "./crm-slots-core.ts";
import { diskIsArchive } from "./crm-person-role.ts";
