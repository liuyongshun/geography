#!/usr/bin/env python3
"""Build the wider real-DEM context around Everest from cached Terrain Tiles."""
import importlib.util
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('terrain_context_builder', ROOT / 'scripts/build-gongga-terrain.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
builder.CACHE = ROOT / '.cache/everest-terrain'
builder.OUT = ROOT / 'public/terrain/everest/context'
builder.WEST, builder.SOUTH, builder.EAST, builder.NORTH = 86.84, 27.90, 87.02, 28.07
builder.GRID_SIZE = 257
builder.TERRAIN_ZOOM = 13
builder.OUT.mkdir(parents=True, exist_ok=True)
minimum, maximum = builder.build_height()
west, south, east, north = builder.WEST, builder.SOUTH, builder.EAST, builder.NORTH
metadata = {
    'gridSize': builder.GRID_SIZE,
    'bboxWGS84': [west, south, east, north],
    'widthMeters': (east - west) * 111320 * math.cos(math.radians((south + north) / 2)),
    'heightMeters': (north - south) * 110574,
    'minElevation': minimum, 'maxElevation': maximum,
    'terrainSource': 'Mapzen Terrain Tiles / AWS Open Data; wider context, coarser than the summit DEM',
    'attribution': 'Terrain data © Mapzen; https://github.com/tilezen/joerd/blob/master/docs/attribution.md',
    'description': 'Real elevation with stylized earth-tone colors for peripheral visual transition; colors do not represent measured vegetation.',
}
(builder.OUT / 'metadata.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
print(f'Context ready: {minimum:.1f}–{maximum:.1f}m, {builder.OUT}')
