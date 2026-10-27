#!/usr/bin/env python3
"""Build Everest assets from original Copernicus GLO-30 and EOxCloudless 2024.

Run with Python + NumPy + Pillow + tifffile. Cache stays outside packaged assets.
The DEM is preserved without forcing the sampled summit to the official height.
"""
import json
import math
import urllib.parse
from pathlib import Path
import numpy as np
from PIL import Image
from copernicus_window import read_window

import importlib.util

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("terrain_builder", ROOT / "scripts/build-gongga-terrain.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
builder.CACHE = ROOT / ".cache/everest-terrain"
builder.OUT = ROOT / "public/terrain/everest"
builder.WEST, builder.SOUTH, builder.EAST, builder.NORTH = 86.87, 27.94, 86.99, 28.045
builder.GRID_SIZE = 401
download_once = builder.download


def download_with_retry(url, path):
    for attempt in range(4):
        try:
            return download_once(url, path)
        except Exception:
            if attempt == 3:
                raise
            print(f"重试下载 {path.name}", flush=True)


builder.download = download_with_retry


def build_copernicus_height():
    west, south, east, north = builder.WEST, builder.SOUTH, builder.EAST, builder.NORTH
    size = builder.GRID_SIZE
    heights = read_window((west, south, east, north), size, builder.CACHE)
    minimum, maximum = float(heights.min()), float(heights.max())
    quantized = np.rint((heights - minimum) / (maximum - minimum) * 65535).astype('<u2')
    (builder.OUT / 'height-u16.bin').write_bytes(quantized.tobytes())
    Image.fromarray(quantized).convert('RGB').save(builder.OUT / 'height-preview.jpg', quality=90, optimize=True)
    return minimum, maximum


def build_imagery():
    params = dict(SERVICE='WMS', VERSION='1.1.1', REQUEST='GetMap', LAYERS='s2cloudless-2024', STYLES='', SRS='EPSG:4326', BBOX=f'{builder.WEST},{builder.SOUTH},{builder.EAST},{builder.NORTH}', WIDTH=4096, HEIGHT=4096, FORMAT='image/jpeg')
    raw = download_with_retry('https://tiles.maps.eox.at/wms?' + urllib.parse.urlencode(params), builder.CACHE / 's2cloudless-2024-summit.jpg')
    # Preserve the source contrast: the previous snow image was brightened further.
    Image.open(raw).convert('RGB').save(builder.OUT / 'ortho.jpg', quality=93, subsampling=0, optimize=True)


def main():
    builder.OUT.mkdir(parents=True, exist_ok=True)
    minimum, maximum = build_copernicus_height()
    build_imagery()
    west, south, east, north = builder.WEST, builder.SOUTH, builder.EAST, builder.NORTH
    metadata = {
        "name": "珠穆朗玛峰 / Mount Everest",
        "gridSize": builder.GRID_SIZE,
        "bboxWGS84": [west, south, east, north],
        "widthMeters": round((east - west) * 111320 * math.cos(math.radians((south + north) / 2))),
        "heightMeters": round((north - south) * 110574),
        "minElevation": round(minimum, 3),
        "maxElevation": round(maximum, 3),
        "officialSummitElevation": 8848.86,
        "summitWGS84": [86.9250, 27.9881],
        "heightEncoding": "little-endian uint16, normalized between minElevation and maxElevation; north-to-south rows",
        "nominalSourceResolutionMeters": 30,
        "gridSpacingMeters": [round((east-west)*111320*math.cos(math.radians((south+north)/2))/(builder.GRID_SIZE-1), 2), round((north-south)*110574/(builder.GRID_SIZE-1), 2)],
        "terrainSource": "Copernicus DEM GLO-30, 1 arc-second DSM (not a 1m survey)",
        "imagerySource": "EOxCloudless 2024 / Copernicus Sentinel-2, nominal 10m imagery, resampled by WMS",
        "source": ["https://registry.opendata.aws/copernicus-dem/", "https://cloudless.eox.at/"],
        "attribution": ["Copernicus DEM GLO-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA; all rights reserved", "EOxCloudless 2024 by EOX IT Services GmbH; Contains modified Copernicus Sentinel data 2024"],
        "imageryLicense": "EOxCloudless non-commercial use with attribution; commercial use requires an appropriate license: https://cloudless.eox.at/documentation/license",
        "disclaimer": "真实DEM与卫星影像；网格重采样不代表源数据精度。2020年中尼公布的8848.86米为雪面高程，独立于DEM采样值；不修高峰顶，不用于导航。",
    }
    (builder.OUT / "metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Everest DEM: {minimum:.1f}–{maximum:.1f} m; assets: {builder.OUT}")


if __name__ == "__main__":
    main()
