# backend/simulator.py
from typing import Dict, List

import geometry
from routing import build_graph, find_route
from recommendations import build_recommendations


def _step_count(scenario: dict) -> int:
    e = scenario["environment"]
    return int(e["horizon_s"] // e["step_s"])


def _classify_failure(snapshot: dict, client_id: str, gateway_ids: List[str]) -> str:
    """Определяет причину отсутствия маршрута."""
    has_client_edge = any(
        edge[0] == client_id or edge[1] == client_id
        for edge in snapshot["edges"]
    )
    if not has_client_edge:
        return "no_visible_sat"

    for gw in gateway_ids:
        for edge in snapshot["edges"]:
            if (edge[0] == gw and edge[1] != client_id) or \
               (edge[1] == gw and edge[0] != client_id):
                return "isl_disconnected"
    return "no_gateway_contact"


def run_simulation(scenario: dict) -> dict:
    geometry.validate(scenario)
    e = scenario["environment"]
    d = scenario["design"]
    step_s = e["step_s"]
    n_steps = _step_count(scenario)

    sat_ids = {s["id"] for s in d["satellites"]}
    client_ids = [g["id"] for g in scenario["ground_sites"] if g["role"] == "client"]
    gateway_ids = [g["id"] for g in scenario["ground_sites"] if g["role"] == "gateway"]

    stats = {
        c: {
            "connected_steps": 0,
            "current_gap": 0,
            "max_gap_steps": 0,
            "fail_reasons": {},
            "availability_timeline": [],
        }
        for c in client_ids
    }

    timeline: List[dict] = []

    for step in range(n_steps):
        t_s = step * step_s
        snap = geometry.snapshot(scenario, t_s)
        graph = build_graph(snap)

        step_record = {
            "step": step,
            "t_s": t_s,
            "routes": {},
            "satellites": snap["satellites"],
            "edges": snap["edges"],
        }

        for client in client_ids:
            route = find_route(graph, client, gateway_ids, sat_ids)
            if route is not None:
                stats[client]["connected_steps"] += 1
                stats[client]["current_gap"] = 0
                stats[client]["availability_timeline"].append(1)
                step_record["routes"][client] = route
            else:
                stats[client]["current_gap"] += 1
                stats[client]["max_gap_steps"] = max(
                    stats[client]["max_gap_steps"],
                    stats[client]["current_gap"]
                )
                stats[client]["availability_timeline"].append(0)
                reason = _classify_failure(snap, client, gateway_ids)
                stats[client]["fail_reasons"][reason] = (
                    stats[client]["fail_reasons"].get(reason, 0) + 1
                )

        timeline.append(step_record)

    results = {}
    for c in client_ids:
        availability = stats[c]["connected_steps"] / n_steps if n_steps else 0.0
        results[c] = {
            "availability_pct": round(availability * 100, 2),
            "connected_steps": stats[c]["connected_steps"],
            "total_steps": n_steps,
            "max_gap_steps": stats[c]["max_gap_steps"],
            "max_gap_min": round(stats[c]["max_gap_steps"] * step_s / 60, 1),
            "meets_target": availability >= e["target_availability"],
            "fail_reasons": stats[c]["fail_reasons"],
            "availability_timeline": stats[c]["availability_timeline"],
        }

    # Рекомендации на основе результатов
    recommendations = build_recommendations(results, e, scenario)

    return {
        "meta": scenario["meta"],
        "environment": e,
        "launch_stage": d["launch_stage"],
        "results": results,
        "timeline": timeline,
        "recommendations": recommendations,
    }