# Satellite Constellation Designer — MVP

Веб-сервис для проектирования спутниковой группировки и оценки доступности связи.

## Запуск

```bash
pip install -r requirements.txt
cd backend
uvicorn main:app --reload --port 8000

## Проверочные сценарии

| Файл | Что проверяет | Ожидаемый результат |
|---|---|---|
| 01_full_constellation.json | Полная группировка | Доступность ≥ 95% |
| 02_first_launch.json | Первая очередь | Доступность ниже 90% |
| 03_satellite_outages.json | Отказы 10 аппаратов | Просадка после 6 ч |
| 04_link_range.json | ISL 2000 км | Рост перерывов |

## Архитектура
- geometry.py — расчётный модуль от организаторов
- routing.py — построение графа и BFS
- simulator.py — прогон по времени
- main.py — API

## Формат выгрузки результата
cosmo-A-result-1.0 (см. Описание данных, стр. 6)