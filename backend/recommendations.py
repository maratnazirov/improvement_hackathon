# backend/recommendations.py
from typing import Dict, List


REASON_LABELS = {
    "no_visible_sat": "нет видимого спутника",
    "gateway_outage": "недоступность шлюза",
    "no_gateway_contact": "нет контакта со шлюзом",
    "isl_disconnected": "разрыв межспутниковой сети",
}


def build_recommendations(results: Dict[str, dict], env: dict, scenario: dict) -> List[str]:
    """
    Формирует обоснованные выводы на основе фактических расчётов.
    """
    target = env["target_availability"]
    target_pct = int(target * 100)
    recs: List[str] = []

    # Общие наблюдения
    total_failures = len(scenario.get("failures", []))
    isl_range = env["isl_range_km"]
    stage = scenario["design"]["launch_stage"]

    # 1. Общее состояние
    below = [c for c, r in results.items() if r["availability_pct"] / 100 < target]
    above = [c for c, r in results.items() if r["availability_pct"] / 100 >= target]

    if not below:
        recs.append(
            f"✅ Все клиенты ({', '.join(above)}) достигают целевой доступности "
            f"{target_pct}%. Конфигурация пригодна к эксплуатации."
        )
    else:
        recs.append(
            f"⚠️ Целевая доступность {target_pct}% НЕ достигнута для клиентов: "
            f"{', '.join(below)}."
        )

    # 2. Пер-клиентский разбор
    for client in below:
        r = results[client]
        reasons = r.get("fail_reasons", {})
        top_reason = max(reasons, key=reasons.get) if reasons else None
        reason_text = REASON_LABELS.get(top_reason, "неизвестная причина")

        recs.append(
            f"   • {client}: доступность {r['availability_pct']}%, "
            f"макс. перерыв {r['max_gap_min']} мин. "
            f"Основная причина перерывов — {reason_text}."
        )

        # Адресные рекомендации
        if top_reason == "no_visible_sat":
            recs.append(
                f"     → Добавить спутники на широте клиента или изменить RAAN "
                f"плоскости для лучшего покрытия."
            )
        elif top_reason == "isl_disconnected":
            if isl_range < 2500:
                recs.append(
                    f"     → Увеличить дальность ISL с {isl_range} до 3000 км."
                )
            else:
                recs.append(
                    f"     → Рассмотреть добавление спутников или увеличение "
                    f"числа плоскостей для повышения связности."
                )
        elif top_reason == "no_gateway_contact":
            recs.append(
                f"     → Обеспечить резервный шлюз или расширить зону видимости "
                f"текущего шлюза."
            )

    # 3. Оценка устойчивости
    if total_failures > 0:
        avg_avail = sum(r["availability_pct"] for r in results.values()) / len(results)
        recs.append(
            f"📊 При {total_failures} отказах средняя доступность по группировке "
            f"составила {avg_avail:.1f}%. "
        )
        if avg_avail < target_pct:
            recs.append(
                "   Рекомендуется добавить резервные аппараты или продублировать "
                "критичные плоскости."
            )
    else:
        recs.append("📊 Отказы в сценарии не заданы — расчёт показывает идеальные условия.")

    # 4. Этап развёртывания
    if stage == 1:
        recs.append(
            "🚀 Первая очередь (16 аппаратов) обеспечивает частичное покрытие. "
            "Для достижения целевых показателей требуется развернуть вторую и третью очереди."
        )
    elif stage == 2:
        recs.append(
            "🚀 Вторая очередь (32 аппарата) заметно улучшает связность, но "
            "может не покрывать всех клиентов. Рекомендуется завершить третью очередь."
        )
    else:
        recs.append("🚀 Полная группировка (48 аппаратов) развёрнута.")

    return recs