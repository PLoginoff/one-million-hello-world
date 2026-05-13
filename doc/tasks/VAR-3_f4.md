# Задача

VAR-3_f4 Как исправить ошибку: `@opentelemetry/exporter-trace-jaeger` is not in this registry.

## VAR-3_f4 — Исправлена ошибка установки зависимостей

**Дата: 2026-05-14 00:09**

## Причина

Пакет `@opentelemetry/exporter-trace-jaeger@^1.18.1` был удалён из npm registry.
OpenTelemetry прекратил поддержку отдельного Jaeger-экспортера в пользу OTLP.

## Решение

1. Удалён пакет `@opentelemetry/exporter-trace-jaeger` из `package.json` (не используется в коде).
2. Обновлены версии оставшихся OpenTelemetry пакетов до актуальных:
   - `@opentelemetry/api`: `^1.7.0` → `^1.9.0`
   - `@opentelemetry/sdk-trace-node`: `^0.45.1` → `^2.7.1`
   - `@opentelemetry/auto-instrumentations-node`: `^0.40.0` → `^0.75.0`

## Комментарий для коммита

```
fix: update OpenTelemetry packages and remove jaeger exporter

Удалён несуществующий @opentelemetry/exporter-trace-jaeger.
Обновлены версии opentelemetry пакетов до актуальных,
доступных в npm registry.
```

## Тестирование

```bash
wsl make install
```
