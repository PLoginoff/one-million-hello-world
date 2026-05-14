# Задача

VAR-3_f1 Создай makefile в корне этого проекта, добавь сюда основные команды по запуску и деплою проекта.
Изучи для этого файлы: README.md

## VAR-3_f1 — Создан Makefile 
```
feat: add Makefile with run and deploy commands

Добавлен Makefile, оборачивающий npm-скрипты проекта.
Цель — унифицировать запуск сборки, разработки, тестов и деплоя
через стандартный интерфейс make, что упрощает onboarding
и интеграцию с CI/CD.
```

## VAR-3_f1 — Добавь комментарии к каждой команде в Makefile

**Дата: 2026-05-13 23:22**

## Комментарий для коммита

```
docs: add inline comments to every Makefile target

Каждой цели в Makefile добавлен комментарий-описание
для быстрого понимания назначения команды без чтения README.
```

## VAR-3_f1 — Исправлена ошибка `tsc: not found`

**Дата: 2026-05-14 00:05**

## Комментарий для коммита

```
fix: use npx tsc instead of npm run build in Makefile

Команда make build вызывала npm run build, который не находил tsc
в PATH при запуске через WSL. Заменено на npx tsc — ищет бинарник
локально в node_modules/.bin автоматически.
```

## Тестирование

```bash
wsl make build
```
