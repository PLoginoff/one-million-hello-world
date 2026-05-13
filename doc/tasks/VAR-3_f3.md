# Задача

VAR-3_f3 Нужно создать консольный скрипт в папке scripts для подсчета статистики по проекту.

## VAR-3_f3 — Создан скрипт статистики проекта

**Дата: 2026-05-13 23:39**

## Комментарий для коммита

```
feat: add project-stats script and Makefile target

Добавлен scripts/project-stats.js — консольный скрипт для сбора
статистики по проекту: количество файлов, строк кода, коммитов,
распределение по типам, git-метрики. Добавлена команда make stats.
```

## VAR-3_f3 — Добавлено описание команд Makefile в README

**Дата: 2026-05-13 23:42**

## Комментарий для коммита

```
docs: add Makefile commands description to README.md

В раздел How to Run добавлены команды make (install, build,
start, dev, test, lint, format, stats) с кратким описанием.
```

## Тестирование

```bash
wsl make stats
```
