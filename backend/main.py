# backend/main.py
import json
from pathlib import Path
from typing import Dict

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from models import Scenario
from simulator import run_simulation
from vulnerability import analyze_vulnerability

ERROR_MESSAGES = {
    "Unsupported scenario schema": "Неподдерживаемая версия формата сценария. Ожидается schema_version: cosmo-A-1.0",
    "Non-finite environment value": "В параметрах окружения указано некорректное числовое значение",
    "Invalid orbit": "Некорректные параметры орбиты: высота должна быть 200–1200 км, наклонение 0–180°",
    "Time grid must use integer seconds": "Шаг расчёта и горизонт должны быть заданы целым числом секунд",
    "Invalid time grid": "Некорректная временная сетка: шаг должен быть больше 0, не превышать горизонт и делить его без остатка",
    "Invalid link/target values": "Некорректные параметры связи: угол возвышения, дальность ISL или целевая доступность заданы неверно",
    "Duplicate/empty planes": "Список орбитальных плоскостей пуст или содержит повторяющиеся ID",
    "Invalid plane angle": "RAAN и фазирование плоскости должны быть в диапазоне 0–360°",
    "Duplicate/empty satellite IDs": "Список спутников пуст или содержит повторяющиеся ID",
    "launch_stage must be 1, 2 or 3": "Этап развёртывания должен быть 1, 2 или 3",
    "Invalid satellite": "У спутника указана несуществующая плоскость или некорректные параметры",
    "Non-unique node IDs": "ID наземных пунктов повторяются или совпадают с ID спутников",
    "Client and gateway required": "В сценарии должен быть хотя бы один клиентский пункт и один шлюз",
    "Invalid ground site": "Некорректный наземный пункт: неверная роль или координаты вне диапазона",
    "Invalid outage": "Некорректный период отказа: спутник/шлюз не найден, либо интервал задан неверно",
}

def friendly(ex: ValueError) -> str:
    msg = str(ex)
    for key, text in ERROR_MESSAGES.items():
        if msg.startswith(key):
            return text
    return f"Ошибка в данных сценария: {msg}"


BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"
DATA_DIR = BASE_DIR / "data"

app = FastAPI(title="Satellite Constellation Designer")

app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

SAVED: Dict[str, dict] = {}


@app.get("/", response_class=HTMLResponse)
def index():
    return (FRONTEND_DIR / "index.html").read_text(encoding="utf-8")

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    fields = ", ".join(
        ".".join(str(p) for p in e["loc"][1:]) for e in exc.errors()
    )
    return JSONResponse(
        status_code=422,
        content={"detail": f"Некорректная структура сценария. Проверьте поля: {fields}"},
    )


# ---------- Встроенные сценарии ----------

@app.get("/api/scenarios")
def list_scenarios():
    result = []
    for p in sorted(DATA_DIR.glob("*.json")):
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            result.append({
                "file": p.name,
                "id": data.get("meta", {}).get("id", p.stem),
                "title": data.get("meta", {}).get("title", p.stem),
            })
        except Exception:
            continue
    return result


@app.get("/api/scenarios/{filename}")
def get_scenario(filename: str):
    p = DATA_DIR / filename
    if not p.exists() or p.suffix != ".json":
        raise HTTPException(404, "Сценарий не найден")
    return json.loads(p.read_text(encoding="utf-8"))


# ---------- Симуляция ----------

@app.post("/api/simulate")
def simulate(scenario: Scenario):
    try:
        return run_simulation(scenario.model_dump())
    except ValueError as ex:
        raise HTTPException(400, friendly(ex))


@app.post("/api/upload")
async def upload(file: UploadFile = File(...)):
    raw = await file.read()
    try:
        data = json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as ex:
        raise HTTPException(400, f"Некорректный JSON: {ex}")
    try:
        scenario = Scenario(**data)
    except Exception as ex:
        raise HTTPException(400, f"Неверный формат сценария: {ex}")
    try:
        return run_simulation(scenario.model_dump())
    except ValueError as ex:
        raise HTTPException(400, friendly(ex))


# ---------- Уязвимость ----------

@app.post("/api/vulnerability")
def vulnerability(scenario: Scenario, top_n: int = 5):
    try:
        return analyze_vulnerability(scenario.model_dump(), top_n)
    except ValueError as ex:
        raise HTTPException(400, friendly(ex))


# ---------- Выгрузка результата ----------

@app.post("/api/export-result")
def export_result(payload: dict):
    """
    Возвращает результат в формате cosmo-A-result-1.0.
    payload: {"scenario": {...}, "simulation": {...}}
    """
    scenario = payload.get("scenario")
    simulation = payload.get("simulation")
    if not scenario or not simulation:
        raise HTTPException(400, "Нужны scenario и simulation")

    routes = []
    for rec in simulation["timeline"]:
        for client_id in simulation["results"].keys():
            routes.append({
                "t_s": rec["t_s"],
                "client_id": client_id,
                "path": rec["routes"].get(client_id, []),
            })

    return {
        "schema_version": "cosmo-A-result-1.0",
        "effective_scenario": scenario,
        "routes": routes,
        "metrics": simulation["results"],
        "recommendations": simulation.get("recommendations", []),
    }


# ---------- Сохранение вариантов ----------

@app.post("/api/save/{name}")
def save_variant(name: str, scenario: Scenario):
    SAVED[name] = scenario.model_dump()
    return {"saved": name, "count": len(SAVED)}


@app.get("/api/saved")
def list_saved():
    return {"names": list(SAVED.keys())}


@app.get("/api/saved/{name}")
def get_saved(name: str):
    if name not in SAVED:
        raise HTTPException(404, "Вариант не найден")
    return SAVED[name]


@app.delete("/api/saved/{name}")
def delete_saved(name: str):
    SAVED.pop(name, None)
    return {"ok": True}


# ---------- Сравнение ----------

@app.get("/api/compare")
def compare(a: str, b: str):
    if a not in SAVED or b not in SAVED:
        raise HTTPException(404, "Один из вариантов не найден")
    ra = run_simulation(SAVED[a])
    rb = run_simulation(SAVED[b])

    diffs = {}
    for client in ra["results"].keys() | rb["results"].keys():
        va = ra["results"].get(client, {})
        vb = rb["results"].get(client, {})
        diffs[client] = {
            "availability_a": va.get("availability_pct"),
            "availability_b": vb.get("availability_pct"),
            "delta_availability": round(
                (vb.get("availability_pct") or 0) - (va.get("availability_pct") or 0), 2
            ),
            "max_gap_min_a": va.get("max_gap_min"),
            "max_gap_min_b": vb.get("max_gap_min"),
            "meets_target_a": va.get("meets_target"),
            "meets_target_b": vb.get("meets_target"),
            "avg_hops_a": va.get("avg_hops"),
            "avg_hops_b": vb.get("avg_hops"),

        }

    return {
        "a": {"name": a, "meta": ra["meta"], "launch_stage": ra["launch_stage"]},
        "b": {"name": b, "meta": rb["meta"], "launch_stage": rb["launch_stage"]},
        "diffs": diffs,
    }