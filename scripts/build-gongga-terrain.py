#!/usr/bin/env python3
"""构建贡嘎山真实地形教学场景（Mapzen Terrain Tiles + EOxCloudless）。

需要 Python 3、NumPy 与 Pillow。运行时资源输出到 public/terrain/gongga/，
下载瓦片缓存到 .cache/gongga-terrain/，不进入安装包。
"""

from __future__ import annotations

import array
import json
import math
import sys
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".cache" / "gongga-terrain"
OUT = ROOT / "public" / "terrain" / "gongga"

# 覆盖贡嘎主峰、海螺沟及东侧低山河谷，能表现完整垂直高差。
WEST, SOUTH, EAST, NORTH = 101.70, 29.43, 102.12, 29.78
SUMMIT_LON, SUMMIT_LAT = 101.87917, 29.59583
OFFICIAL_SUMMIT_M = 7508.9
GRID_SIZE = 513
TERRAIN_ZOOM = 12


def download(url: str, path: Path) -> Path:
    if path.exists() and path.stat().st_size > 1000:
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    print(f"下载 {path.name}")
    request = urllib.request.Request(url, headers={"User-Agent": "dili-terrain-builder/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        path.write_bytes(response.read())
    return path


def world_pixel(lon: float, lat: float, zoom: int) -> tuple[float, float]:
    scale = 256 * (1 << zoom)
    x = (lon + 180) / 360 * scale
    latitude = math.radians(max(-85.05112878, min(85.05112878, lat)))
    y = (1 - math.asinh(math.tan(latitude)) / math.pi) / 2 * scale
    return x, y


def build_height() -> tuple[float, float]:
    left, top = world_pixel(WEST, NORTH, TERRAIN_ZOOM)
    right, bottom = world_pixel(EAST, SOUTH, TERRAIN_ZOOM)
    tile_left, tile_top = math.floor(left / 256), math.floor(top / 256)
    tile_right, tile_bottom = math.floor(right / 256), math.floor(bottom / 256)

    paths: dict[tuple[int, int], Path] = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = []
        for tile_y in range(tile_top, tile_bottom + 1):
            for tile_x in range(tile_left, tile_right + 1):
                url = (
                    "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/"
                    f"{TERRAIN_ZOOM}/{tile_x}/{tile_y}.png"
                )
                path = CACHE / f"terrarium-{TERRAIN_ZOOM}-{tile_x}-{tile_y}.png"
                paths[(tile_x, tile_y)] = path
                futures.append(pool.submit(download, url, path))
        for future in futures:
            future.result()

    width = (tile_right - tile_left + 1) * 256
    height = (tile_bottom - tile_top + 1) * 256
    mosaic = Image.new("RGB", (width, height))
    for (tile_x, tile_y), path in paths.items():
        mosaic.paste(
            Image.open(path).convert("RGB"),
            ((tile_x - tile_left) * 256, (tile_y - tile_top) * 256),
        )

    crop = mosaic.crop(
        (
            round(left - tile_left * 256),
            round(top - tile_top * 256),
            round(right - tile_left * 256),
            round(bottom - tile_top * 256),
        )
    )
    rgb = np.asarray(crop, dtype=np.float32)
    elevations = rgb[:, :, 0] * 256 + rgb[:, :, 1] + rgb[:, :, 2] / 256 - 32768
    sampled = Image.fromarray(elevations).resize(
        (GRID_SIZE, GRID_SIZE), Image.Resampling.BICUBIC
    )
    values = np.asarray(sampled, dtype=np.float32)
    minimum = float(values.min())
    maximum = float(values.max())
    quantized_values = np.rint((values - minimum) / (maximum - minimum) * 65535)
    quantized = array.array("H", quantized_values.astype(np.uint16).ravel())
    if sys.byteorder != "little":
        quantized.byteswap()
    (OUT / "height-u16.bin").write_bytes(quantized.tobytes())

    preview = Image.fromarray(quantized_values.astype(np.uint16))
    preview.save(OUT / "height-preview.png", optimize=True)
    return minimum, maximum


def build_ortho() -> None:
    params = {
        "SERVICE": "WMS",
        "VERSION": "1.1.1",
        "REQUEST": "GetMap",
        "LAYERS": "s2cloudless",
        "STYLES": "",
        "SRS": "EPSG:4326",
        "BBOX": f"{WEST},{SOUTH},{EAST},{NORTH}",
        "WIDTH": "4096",
        "HEIGHT": "4096",
        "FORMAT": "image/jpeg",
    }
    url = "https://tiles.maps.eox.at/map?" + urllib.parse.urlencode(params)
    raw = download(url, CACHE / "eox-s2cloudless-2016-4096.jpg")
    image = Image.open(raw).convert("RGB")
    # 卫星影像自带山体阴影；适度抬升暗部以适应三维斜视，不改变地物位置。
    lut = []
    for value in range(256):
        x = value / 255
        lifted = x + (x**0.62 - x) * 0.34 + 0.012 * (1 - x)
        lut.append(round(max(0, min(1, lifted)) * 255))
    image.point(lut * 3).save(
        OUT / "ortho.jpg",
        quality=90,
        subsampling=0,
        optimize=True,
    )


def main() -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    minimum, maximum = build_height()
    build_ortho()

    center_lat = (SOUTH + NORTH) / 2
    width_m = (EAST - WEST) * 111_320 * math.cos(math.radians(center_lat))
    height_m = (NORTH - SOUTH) * 110_574
    metadata = {
        "name": "Gongga Mountain real-terrain teaching prototype",
        "gridSize": GRID_SIZE,
        "bboxWGS84": [WEST, SOUTH, EAST, NORTH],
        "widthMeters": round(width_m),
        "heightMeters": round(height_m),
        "minElevation": round(minimum, 3),
        "maxElevation": round(maximum, 3),
        "officialSummitElevation": OFFICIAL_SUMMIT_M,
        "summitWGS84": [SUMMIT_LON, SUMMIT_LAT],
        "heightEncoding": "little-endian uint16, normalized between minElevation and maxElevation",
        "terrainSource": "Mapzen Terrain Tiles on AWS Open Data; local source is SRTM",
        "imagerySource": "EOxCloudless 2016, contains modified Copernicus Sentinel data 2016 & 2017",
        "source": [
            "https://registry.opendata.aws/terrain-tiles/",
            "https://cloudless.eox.at/",
        ],
        "license": [
            "Terrain source attribution required; underlying SRTM courtesy of USGS",
            "EOxCloudless 2016: CC BY 4.0",
        ],
        "attribution": [
            "Terrain data © Mapzen; SRTM terrain data courtesy of the U.S. Geological Survey",
            "EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016 & 2017)",
        ],
        "disclaimer": "课堂三维原型；地形与影像来自公开数据，峰顶高程采用2023年国家公布值，自然带边界与标注为教学示意。",
    }
    (OUT / "metadata.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"完成：{OUT}")
    print(f"DEM 海拔：{minimum:.1f}–{maximum:.1f} m；官方峰顶：{OFFICIAL_SUMMIT_M:.1f} m")


if __name__ == "__main__":
    main()
