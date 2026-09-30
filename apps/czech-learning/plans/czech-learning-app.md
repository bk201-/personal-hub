# Plan: Czech Language Learning App («CJ»)

> PRD собран в ходе интервью 28.03.2026. Домен: `cj.dmitriishilov.com`.

---

## Архитектурные решения (константы для всех фаз)

### Стек
| Слой | Технология |
|---|---|
| Backend | Hono (Node.js, ESM), порт `3173` |
| ORM | Drizzle ORM + SQLite (локально) / Turso (прод) |
| Frontend | React 19 + Ant Design 6 + antd-style + TanStack Query v5 + Zustand |
| Сборка | Vite 6, TypeScript strict |
| SRS | `ts-fsrs` |
| AI / OCR | Azure OpenAI GPT-4o (одноразовый скрипт импорта) |
| Auth | JWT (15 min access) + httpOnly refresh-cookie, invite-only |
| CSS | `createStyles` из `antd-style`, без глобальных классов |
| i18n | UI: **English + Русский** (переключатель в header, `i18next` + `react-i18next`, детект из `localStorage`/`navigator`). Контент словаря: Czech ↔ Russian (основной); колонка `english TEXT` в таблице `words` зарезервирована для будущего Czech ↔ English |

### URL-структура API
```
/api/health                      — публичный
/api/auth/*                      — публичный (login / refresh / logout)
/api/words                       — CRUD словаря
/api/words/:id
/api/cards                       — инициализация карточек пользователя
/api/review/session              — текущая сессия (due карточки)
/api/review/submit               — отправить рейтинг, обновить FSRS
/api/review/stats                — прогресс, стрик, heatmap
/api/grammar                     — разделы грамматики
/api/grammar/:id
/api/import/words                — admin: bulk import JSON → words
/api/import/ocr                  — admin: отправить base64-изображение → GPT-4o → JSON
```

### Схема БД (Drizzle, SQLite)

```ts
// users — та же таблица, что в tg-news-reader (id, email, password_hash, role, totp_secret, created_at)
// sessions — та же таблица (JWT refresh, unlocked_group_ids не нужен, но поле можно оставить пустым)

words {
  id               INTEGER PK AUTOINCREMENT
  czech            TEXT NOT NULL
  russian          TEXT NOT NULL
  english          TEXT     -- зарезервировано: перевод на английский (Czech ↔ English в будущем)
  pos              TEXT     -- 'noun' | 'verb' | 'adjective' | 'adverb' | 'pronoun' | 'numeral' | 'preposition' | 'conjunction' | 'interjection' | 'phrase'

  -- Noun-specific
  gender           TEXT     -- 'ma' (м. одуш.) | 'mi' (м. неодуш.) | 'f' | 'n'
  number_type      TEXT     -- 'singular' | 'plural'  (только ед./только мн., singularia/pluralia tantum)
  declension_class TEXT     -- тип склонения: 'pan'|'muz'|'soudce'|'predseda' (m.an.)
                            --               'hrad'|'stroj' (m.in.)
                            --               'zena'|'ruze'|'pisen'|'kost' (f.)
                            --               'mesto'|'more'|'kure'|'staveni' (n.)

  -- Verb-specific
  aspect           TEXT     -- 'perfective' | 'imperfective'
  verb_pair        TEXT     -- парный глагол (совершенный↔несовершенный)
  conjugation_class TEXT    -- тип спряжения: 'I-nese'|'I-bere'|'I-maze'|'I-pece'
                            --               'II-tiskne'
                            --               'III-kryje'|'III-kupuje'
                            --               'IV-prosi'|'IV-trpi'|'IV-sazi'
                            --               'V-dela'

  notes            TEXT     -- уточнения в скобках, например "(разг.)"
  lesson           INTEGER  -- номер урока (null = из алфавитного словаря)
  source           TEXT     -- 'textbook' | 'manual'
  seznam_url       TEXT     -- https://slovnik.seznam.cz/preklad/cesky_rusky/{czech}
  created_at       INTEGER NOT NULL DEFAULT (unixepoch())
}

cards {
  id             INTEGER PK AUTOINCREMENT
  word_id        INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
  mode           TEXT NOT NULL CHECK(mode IN ('cz_ru','ru_cz','recognition'))
  -- FSRS fields (ts-fsrs):
  due            INTEGER  -- unixepoch timestamp
  stability      REAL
  difficulty     REAL
  elapsed_days   INTEGER
  scheduled_days INTEGER
  reps           INTEGER  DEFAULT 0
  lapses         INTEGER  DEFAULT 0
  state          INTEGER  DEFAULT 0  -- 0=New 1=Learning 2=Review 3=Relearning
  last_review    INTEGER
  UNIQUE(word_id, user_id, mode)
}

review_logs {
  id               INTEGER PK AUTOINCREMENT
  card_id          INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
  rating           INTEGER NOT NULL  -- 1=Again 2=Hard 3=Good 4=Easy
  review_at        INTEGER NOT NULL DEFAULT (unixepoch())
  scheduled_days   INTEGER
  elapsed_days     INTEGER
  review_duration  INTEGER  -- ms
}

grammar_sections {
  id           INTEGER PK AUTOINCREMENT
  title        TEXT NOT NULL
  lesson       INTEGER
  sort_order   INTEGER NOT NULL DEFAULT 0
  content_type TEXT NOT NULL CHECK(content_type IN ('image','markdown'))
  content      TEXT     -- markdown-текст (если content_type='markdown')
  image_path   TEXT     -- путь к файлу (если content_type='image')
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
}

user_settings {
  user_id         INTEGER PK REFERENCES users(id) ON DELETE CASCADE
  daily_new_limit INTEGER NOT NULL DEFAULT 10  -- 5 / 10 / 20
  modes           TEXT NOT NULL DEFAULT '["cz_ru","ru_cz","recognition"]'  -- JSON array
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
}
```

### Ключевые модели (shared/types.ts)
```ts
Word, Card, GrammarSection, ReviewSession, ReviewCard, ReviewResult, UserSettings
```

### FSRS
- Карточки создаются **лениво**: при первом входе в сессию, если карточек нет — создаются для выбранных режимов.
- Новые карточки (`state=0`) выдаются отдельно от due-карточек; в день выдаётся не более `daily_new_limit` новых.
- Режимы можно миксовать или выбрать один — фильтр по `mode` в `cards`.

### Уровни интенсивности
| Название | Новых слов/день | Обоснование |
|---|---|---|
| Неспеша | 5 | Рекомендация Wozniak / SuperMemo для занятых взрослых |
| Средний | 10 | Стандарт Anki |
| Быстро | 20 | Для активного режима, можно при наличии времени |

> Повторения (due reviews) сверх лимита — всегда показываются, ограничение только на новые.

---

## Фаза 1: Фундамент — новый репозиторий с рабочим стеком и auth

**User stories**:
- Как разработчик, я хочу иметь готовый проект с тем же стеком, что и tg-news-reader, чтобы не настраивать окружение с нуля.
- Как пользователь, я хочу войти в приложение по email/паролю.

### Что строим

Scaffold нового репозитория с Hono + Drizzle + React 19 + Ant Design 6 + Vite.  
Таблицы `users` + `sessions`. Скрипт `auth:create-user`.  
Роутеры `/api/health`, `/api/auth/*` (login / refresh / logout) — идентичны tg-news-reader.  
Фронтенд: `AuthGate` → `LoginPage` → пустой `Dashboard` с кнопкой logout.  
Один пользователь создаётся через CLI, никакой публичной регистрации.

### Acceptance criteria

- [ ] `npm run dev` запускает сервер (3173) и Vite (5173)
- [ ] `npm run auth:create-user` создаёт пользователя в SQLite
- [ ] `POST /api/auth/login` возвращает `accessToken` + httpOnly cookie
- [ ] Неавторизованный запрос к `/api/words` возвращает 401
- [ ] Авторизованный пользователь видит dashboard (даже пустой)
- [ ] `npm run build && npm run build:server && npm run lint` — все три проходят

---

## Фаза 2: Словарь — просмотр и ручное добавление слов

**User stories**:
- Я хочу видеть список слов с фильтрацией по уроку и роду.
- Я хочу открыть слово и перейти на seznam.cz/slovník одним кликом.
- Я хочу добавить слово вручную (для дополнения учебника).

### Что строим

Таблица `words` (schema + миграция).  
API: `GET /api/words` (list, фильтр: lesson, gender, search), `GET /api/words/:id`, `POST /api/words`, `PATCH /api/words/:id`, `DELETE /api/words/:id`.  
Фронтенд: страница «Словарь» — таблица Ant Design с поиском, фильтрами, кнопкой «Добавить».  
Карточка слова: чешское, русское, род (цветная метка), примечания, кнопка «Открыть в seznam.cz».  
`seznam_url` генерируется автоматически по шаблону `https://slovnik.seznam.cz/preklad/cesky_rusky/{encodeURIComponent(czech)}`.

### Acceptance criteria

- [ ] `GET /api/words` возвращает массив слов с пагинацией
- [ ] Фильтр по роду (m/f/n) работает
- [ ] Фильтр по уроку работает
- [ ] Поиск по подстроке (czech OR russian) работает
- [ ] Форма добавления слова сохраняет в БД
- [ ] Кнопка «Open in seznam.cz» открывает правильный URL в новой вкладке
- [ ] Цвет метки рода: синий (m), розовый (f), серый (n), — без цвета если null

---

## Фаза 3: OCR-импорт — одноразовый скрипт для загрузки учебника

**User stories**:
- Как admin, я хочу обработать страницы PDF-учебника через GPT-4o и получить структурированный JSON.
- Как admin, я хочу загрузить JSON со словами в БД одной командой.

### Что строим

**Это dev-инструмент, не production-фича.**

Скрипт `scripts/ocr-import.ts`:
1. Принимает путь к директории с PNG-изображениями страниц словаря.
2. Для каждого изображения отправляет запрос к Azure OpenAI GPT-4o с промптом:  
   _«Это страница словаря. Колонки: чешское слово (цвет = род: синий=m, розовый=f, серый=n) + примечания | русский перевод. Верни JSON-массив `[{ czech, russian, gender, notes, lesson }]`. Если цвет не определяется — gender=null.»_
3. Сохраняет сырой JSON в `data/ocr-output/page-NNN.json`.
4. После всех страниц запускает `deduplicate + validate` и создаёт `data/ocr-output/words-final.json`.

Роут `POST /api/import/words` (только role=admin):
- Принимает JSON-массив слов, batch-insert с `INSERT OR IGNORE`.

Скрипт `scripts/import-words.ts` — читает `words-final.json` и вызывает API.

### Acceptance criteria

- [ ] Скрипт обрабатывает 5 тестовых изображений без ошибок
- [ ] Выходной JSON содержит поля `czech, russian, gender, notes, lesson` для каждой строки
- [ ] `POST /api/import/words` вставляет 100 слов за раз (batch)
- [ ] Дубликаты (совпадение czech) игнорируются при повторном импорте
- [ ] После импорта `GET /api/words` показывает правильное количество слов

---

## Фаза 4: FSRS — первая сессия повторения (режим Czech→Russian)

**User stories**:
- Я хочу начать сессию повторения и видеть N карточек на сегодня.
- Я хочу оценить карточку (Again / Hard / Good / Easy) и получить следующую.
- Алгоритм должен планировать следующий показ по ts-fsrs.

### Что строим

Таблицы `cards`, `review_logs`, `user_settings` (schema + миграция).  
`ts-fsrs` установлен как зависимость.  
API:
- `GET /api/review/session` — возвращает список карточек на сегодня (due + новые до лимита), только режим `cz_ru` пока.
- `POST /api/review/submit` — принимает `{ cardId, rating, durationMs }`, обновляет карточку через ts-fsrs, пишет в `review_logs`.

Фронтенд: страница «Повторение» — показывает чешское слово, кнопка «Показать ответ», после — 4 кнопки рейтинга.  
Прогресс-бар сессии (X из N).  
По окончании — экран «Готово» со статистикой сессии.

### Acceptance criteria

- [ ] `GET /api/review/session` возвращает не более `daily_new_limit` новых карточек + все due
- [ ] Карточка `state=0` (новая) инициализируется через `createEmptyCard()` из ts-fsrs перед показом
- [ ] После рейтинга `due` у карточки обновляется (следующий показ через N дней)
- [ ] `review_logs` содержит запись для каждого ответа
- [ ] Сессия из 10 карточек проходима без ошибок UI

---

## Фаза 5: Все три режима + настройки пользователя

**User stories**:
- Я хочу выбрать режимы повторения: cz→ru, ru→cz, recognition (или все три вперемешку).
- Я хочу выбрать интенсивность (5 / 10 / 20 новых слов в день).
- Режим «recognition»: вижу оба слова, сам оцениваю насколько знал.

### Что строим

Страница «Настройки»:
- Три чекбокса режимов (минимум один обязателен).
- Три кнопки интенсивности (Неспеша / Средний / Быстро) с подписью «N новых слов в день».

`PATCH /api/settings` — сохраняет `daily_new_limit` + `modes` в `user_settings`.  
`GET /api/review/session` теперь учитывает `modes` из настроек — создаёт карточки под каждый включённый режим, миксует.  
Режим `ru_cz`: показываем русское слово, ждём ввода чешского — сравнение строк (регистронезависимо, trim).  
Режим `recognition`: показываем оба слова сразу, 4 кнопки рейтинга без ввода текста.

### Acceptance criteria

- [ ] Настройки сохраняются и применяются к следующей сессии
- [ ] При включённых всех трёх режимах карточки перемешаны
- [ ] Режим `ru_cz`: «Good» засчитывается при точном совпадении (без учёта регистра/пробелов)
- [ ] Режим `recognition`: нет текстового ввода, только 4 кнопки
- [ ] Изменение `daily_new_limit` отражается в количестве новых карточек следующей сессии

---

## Фаза 6: Прогресс и статистика

**User stories**:
- Я хочу видеть сколько слов я уже знаю, сколько ещё новых, каков мой стрик.
- Я хочу видеть тепловую карту активности (как на GitHub).

### Что строим

`GET /api/review/stats` — возвращает:
```json
{
  "totalWords": 500,
  "cardsByState": { "new": 300, "learning": 50, "review": 140, "relearning": 10 },
  "dueToday": 25,
  "streak": 7,
  "heatmap": [{ "date": "2026-03-28", "count": 15 }, ...]
}
```

Страница «Прогресс»: четыре карточки (total, streak, due, изучено), тепловая карта за последние 90 дней.  
Тепловая карта: компонент на CSS Grid (7 столбцов × 13 строк), цвет = количество отзывов.

### Acceptance criteria

- [ ] `streak` считается верно: обнуляется если вчера не было повторений
- [ ] `heatmap` содержит данные за последние 90 дней (нулевые дни тоже включены)
- [ ] Карточки статистики отражают реальные данные из `cards` + `review_logs`
- [ ] Страница рендерится без ошибок при 0 отзывов

---

## Фаза 7: Грамматика

**User stories**:
- Я хочу видеть список разделов грамматики с заголовками.
- Я хочу открыть раздел и увидеть сканированное изображение (первый этап).
- Позже: некоторые разделы будут в markdown — хочу видеть красиво отрендеренный текст.

### Что строим

Таблица `grammar_sections` (schema + миграция).  
`POST /api/grammar` (admin) — создать раздел; `PATCH /api/grammar/:id` — обновить; `DELETE /api/grammar/:id`.  
`GET /api/grammar` — список (id, title, lesson, sort_order, content_type).  
`GET /api/grammar/:id` — полный раздел с `content` / `image_path`.  

Изображения грамматики хранятся в `data/grammar/{id}.jpg`, отдаются через `GET /api/grammar/:id/image` (аналогично `/api/media`).  
Скрипт `scripts/import-grammar.ts` — принимает директорию с PNG + CSV-файл `(filename, title, lesson, sort_order)`, загружает через API.  

Фронтенд: страница «Грамматика» — список разделов (Collapse).  
При `content_type='image'` — показываем `<img>` на аутентифицированный URL.  
При `content_type='markdown'` — рендерим через `react-markdown`.

### Acceptance criteria

- [ ] Список грамматики загружается и отображается
- [ ] Изображение открывается без 401 (используется `?token=` паттерн)
- [ ] Markdown-раздел рендерится с заголовками, таблицами, bold
- [ ] Порядок разделов управляется `sort_order`
- [ ] Скрипт импорта загружает 10 тестовых изображений без ошибок

---

## Фаза 8: Деплой и CI/CD

**User stories**:
- Я хочу открывать приложение по `cj.dmitriishilov.com`.
- Я хочу чтобы каждый пуш в `main` автоматически деплоился.

### Что строим

`Dockerfile` — аналогичен tg-news-reader (multi-stage build, Node 22 slim).  
`.github/workflows/pr-check.yml` — build + lint gate (аналог tg-news-reader).  
`.github/workflows/build-main.yml` — build → docker push ACR → `az containerapp update`.  
Smoke test: `GET https://cj.dmitriishilov.com/api/health`.  
Telegram deploy alerts через `alertBot.ts` (опционально, те же секреты).  
DNS: CNAME `cj` → Azure Container App FQDN (настраивается вручную в Azure Portal + Cloudflare/регистратор).  

Secrets (GitHub):
```
ACR_LOGIN_SERVER, ACR_USERNAME, ACR_PASSWORD
AZURE_CREDENTIALS, AZURE_RESOURCE_GROUP, AZURE_CONTAINER_APP
PAT_TOKEN
ALERT_BOT_TOKEN, ALERT_CHAT_ID (optional)
```

Env vars на Container App:
```
DATABASE_URL, TURSO_AUTH_TOKEN (или пусто — тогда file SQLite)
JWT_SECRET
AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT
NODE_ENV=production
```

### Acceptance criteria

- [ ] `docker build` проходит без ошибок
- [ ] PR workflow запускается и проверяет build + lint
- [ ] После мержа в `main` Container App обновляется автоматически
- [ ] `https://cj.dmitriishilov.com/api/health` возвращает `{ status: "ok" }`
- [ ] Приложение открывается в браузере по домену

---

## Порядок выполнения

```
Фаза 1 → Фаза 2 → Фаза 3* → Фаза 4 → Фаза 5 → Фаза 6 → Фаза 7 → Фаза 8
                     ↑
              * можно параллельно с Фазой 2 (независимый скрипт)
```

Фазы 1–4 — MVP, можно начать учить слова.  
Фазы 5–6 — полноценный опыт.  
Фазы 7–8 — грамматика и прод.

---

## Заметки по репозиторию

- **Имя репозитория**: `czech-learning` (или `cj`)
- Скопировать из tg-news-reader: `eslint.config.js`, `tsconfig*.json`, `vite.config.ts` (адаптировать), `Dockerfile` (адаптировать), `.github/workflows/` (адаптировать)
- **Не копировать**: `scripts/tg-auth.ts`, всё связанное с Telegram gramjs
- Папка `data/` в `.gitignore`, но `data/grammar/` нужна пустой (`.gitkeep`)
- `ts-fsrs` устанавливается как `npm install ts-fsrs`

