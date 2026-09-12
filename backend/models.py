# backend/models.py
from pydantic import BaseModel, Field
from typing import List, Literal

class Meta(BaseModel):
    id: str
    title: str

class Environment(BaseModel):
    altitude_km: float
    inclination_deg: float
    earth_angle0_deg: float
    horizon_s: int
    step_s: int
    min_elevation_deg: float
    isl_range_km: float
    target_availability: float

class Plane(BaseModel):
    id: str
    raan_deg: float
    phase_deg: float

class Satellite(BaseModel):
    id: str
    plane_id: str
    slot_deg: float
    launch_batch: Literal[1, 2, 3]

class Design(BaseModel):
    launch_stage: Literal[1, 2, 3]
    planes: List[Plane]
    satellites: List[Satellite]

class GroundSite(BaseModel):
    id: str
    name: str
    role: Literal["client", "gateway"]
    lat_deg: float
    lon_deg: float

class Failure(BaseModel):
    satellite_id: str
    start_s: float
    end_s: float

class GatewayOutage(BaseModel):
    gateway_id: str
    start_s: float
    end_s: float

class Scenario(BaseModel):
    schema_version: str
    meta: Meta
    environment: Environment
    design: Design
    ground_sites: List[GroundSite]
    failures: List[Failure] = Field(default_factory=list)
    gateway_outages: List[GatewayOutage] = Field(default_factory=list)