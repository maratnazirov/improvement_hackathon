# backend/routing.py
from collections import deque
from typing import Dict, List, Optional


def build_graph(snapshot: dict) -> Dict[str, List[str]]:
    """Строит граф связей из snapshot."""
    graph: Dict[str, List[str]] = {}
    for sat in snapshot["satellites"]:
        graph[sat["id"]] = []
    for a, b, _dist in snapshot["edges"]:
        graph.setdefault(a, []).append(b)
        graph.setdefault(b, []).append(a)
    return graph


def find_route(
    graph: Dict[str, List[str]],
    client_id: str,
    gateway_ids: List[str],
    satellite_ids: set,
) -> Optional[List[str]]:
    """
    BFS от клиента до любого шлюза.
    Наземные узлы (кроме старта и финиша) НЕ могут быть транзитными.
    """
    if client_id not in graph:
        return None

    queue = deque([client_id])
    visited = {client_id}
    parent: Dict[str, Optional[str]] = {client_id: None}

    goal = None
    while queue:
        node = queue.popleft()
        if node in gateway_ids:
            goal = node
            break
        for nbr in graph.get(node, []):
            if nbr in visited:
                continue
            is_ground = nbr not in satellite_ids
            if is_ground and nbr not in gateway_ids:
                continue
            visited.add(nbr)
            parent[nbr] = node
            queue.append(nbr)

    if goal is None:
        return None

    path: List[str] = []
    cur: Optional[str] = goal
    while cur is not None:
        path.append(cur)
        cur = parent[cur]
    return path[::-1]