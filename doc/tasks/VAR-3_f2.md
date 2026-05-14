# Задача

VAR-3_f2 Заполни файл .gitignore

## VAR-3_f2 — Заполнен .gitignore

**Дата: 2026-05-13 23:27**

## Комментарий для коммита

```
chore: populate .gitignore for Node.js/TypeScript project

Добавлены правила для исключения:
- зависимостей (node_modules/)
- скомпилированного кода (dist/)
- отчётов тестов и покрытия (coverage/, reports/)
- логов и переменных окружения (.env, *.log)
- кешей инструментов (eslint, prettier, jest, .stryker-tmp)
- IDE (IntelliJ IDEA, VS Code)
- ОС (Thumbs.db, .DS_Store)
```

## Тестирование

```bash
wsl git status
```
