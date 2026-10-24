#!/usr/bin/env python3
"""构建乞力马扎罗山精细教学场景。

高程来自 Mapzen Terrain Tiles（当地底层为 SRTM），地表来自
EOxCloudless 2016。输出 1025² 高程、8K 影像及植被概率掩膜。
需要 Python 3、NumPy 与 Pillow。
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
CACHE = ROOT / ".cache" / "kilimanjaro-terrain"
OUT = ROOT / "public" / "terrain" / "kilimanjaro"

# 包含完整独立火山体、山地森林环和南坡稀树草原。
WEST, SOUTH, EAST, NORTH = 37.23, -3.18, 37.48, -2.95
SUMMIT_LON, SUMMIT_LAT = 37.3556, -3.0674
OFFICIAL_SUMMIT_M = 5895.0
GRID_SIZE = 1025
TERRAIN_ZOOM = 13
ORTHO_TILE_SIZE = 4096


def download(url: str, path: Path) -> Path:
    if path.exists() and path.stat().st_size > 1000:
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    print(f"下载 {path.name}")
    request = urllib.request.Request(url, headers={"User-Agent": "dili-terrain-builder/1.0"})
    with urllib.request.urlopen(request, timeout=90) as response:
        path.write_bytes(response.read())
    return path


def world_pixel(lon: float, lat: float, zoom: int) -> tuple[float, float]:
    scale = 256 * (1 << zoom)
    x = (lon + 180) / 360 * scale
    latitude = math.radians(max(-85.05112878, min(85.05112878, lat)))
    y = (1 - math.asinh(math.tan(latitude)) / math.pi) / 2 * scale
    return x, y


def build_height() -> tuple[float, float, np.ndarray]:
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

    mosaic = Image.new(
        "RGB",
        ((tile_right - tile_left + 1) * 256, (tile_bottom - tile_top + 1) * 256),
    )
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
    source = rgb[:, :, 0] * 256 + rgb[:, :, 1] + rgb[:, :, 2] / 256 - 32768
    sampled = Image.fromarray(source).resize(
        (GRID_SIZE, GRID_SIZE), Image.Resampling.BICUBIC
    )
    values = np.asarray(sampled, dtype=np.float32)
    minimum, maximum = float(values.min()), float(values.max())
    quantized_values = np.rint((values - minimum) / (maximum - minimum) * 65535)
    quantized = array.array("H", quantized_values.astype(np.uint16).ravel())
    if sys.byteorder != "little":
        quantized.byteswap()
    (OUT / "height-u16.bin").write_bytes(quantized.tobytes())
    Image.fromarray(quantized_values.astype(np.uint16)).save(
        OUT / "height-preview.png", optimize=True
    )
    return minimum, maximum, values


def ortho_url(west: float, south: float, east: float, north: float) -> str:
    params = {
        "SERVICE": "WMS",
        "VERSION": "1.1.1",
        "REQUEST": "GetMap",
        "LAYERS": "s2cloudless",
        "STYLES": "",
        "SRS": "EPSG:4326",
        "BBOX": f"{west},{south},{east},{north}",
        "WIDTH": str(ORTHO_TILE_SIZE),
        "HEIGHT": str(ORTHO_TILE_SIZE),
        "FORMAT": "image/jpeg",
    }
    return "https://tiles.maps.eox.at/map?" + urllib.parse.urlencode(params)


def build_ortho() -> Image.Image:
    middle_lon = (WEST + EAST) / 2
    middle_lat = (SOUTH + NORTH) / 2
    bounds = [
        (WEST, middle_lat, middle_lon, NORTH),
        (middle_lon, middle_lat, EAST, NORTH),
        (WEST, SOUTH, middle_lon, middle_lat),
        (middle_lon, SOUTH, EAST, middle_lat),
    ]
    paths: list[Path] = []
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = []
        for index, bbox in enumerate(bounds):
            path = CACHE / f"eox-s2cloudless-2016-{index}.jpg"
            paths.append(path)
            futures.append(pool.submit(download, ortho_url(*bbox), path))
        for future in futures:
            future.result()

    image = Image.new("RGB", (ORTHO_TILE_SIZE * 2, ORTHO_TILE_SIZE * 2))
    for index, path in enumerate(paths):
        image.paste(
            Image.open(path).convert("RGB"),
            ((index % 2) * ORTHO_TILE_SIZE, (index // 2) * ORTHO_TILE_SIZE),
        )
    # 温和压缩高光、提暗部；保留森林环与高山荒漠的真实色差。
    lut = []
    for value in range(256):
        x = value / 255
        graded = x + (x**0.72 - x) * 0.22
        graded = graded / (1 + 0.08 * graded)
        lut.append(round(max(0, min(1, graded)) * 255))
    image = image.point(lut * 3)
    image.save(OUT / "ortho.jpg", quality=88, subsampling=0, optimize=True)
    image.resize((1024, 1024), Image.Resampling.LANCZOS).save(
        OUT / "ortho-preview.jpg", quality=84, optimize=True
    )
    return image


def build_vegetation(heights: np.ndarray, ortho: Image.Image) -> None:
    colors = np.asarray(
        ortho.resize((GRID_SIZE, GRID_SIZE), Image.Resampling.BILINEAR),
        dtype=np.float32,
    )
    red, green, blue = colors[:, :, 0], colors[:, :, 1], colors[:, :, 2]
    green_index = green - (red + blue) * 0.5
    color_probability = np.clip((green_index - 2) / 26, 0, 1)
    # 乞力马扎罗主要闭合林带约位于 1800–3100 m。
    lower = np.clip((heights - 1550) / 350, 0, 1)
    upper = np.clip((3400 - heights) / 450, 0, 1)
    probability = color_probability * lower * upper
    mask = np.rint(np.clip(probability, 0, 1) * 255).astype(np.uint8)
    (OUT / "vegetation-u8.bin").write_bytes(mask.tobytes())
    Image.fromarray(mask).save(OUT / "vegetation-preview.png", optimize=True)


def main() -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    minimum, maximum, heights = build_height()
    ortho = build_ortho()
    build_vegetation(heights, ortho)

    center_lat = (SOUTH + NORTH) / 2
    width_m = (EAST - WEST) * 111_320 * math.cos(math.radians(center_lat))
    height_m = (NORTH - SOUTH) * 110_574
    metadata = {
        "name": "Kilimanjaro high-detail teaching terrain",
        "gridSize": GRID_SIZE,
        "bboxWGS84": [WEST, SOUTH, EAST, NORTH],
        "widthMeters": round(width_m),
        "heightMeters": round(height_m),
        "minElevation": round(minimum, 3),
        "maxElevation": round(maximum, 3),
        "officialSummitElevation": OFFICIAL_SUMMIT_M,
        "summitWGS84": [SUMMIT_LON, SUMMIT_LAT],
        "verticalExaggeration": 1.8,
        "heightEncoding": "little-endian uint16, normalized between minElevation and maxElevation",
        "vegetationEncoding": "uint8 probability derived from imagery green index and 1550–3400 m forest envelope",
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
        "disclaimer": "课堂三维原型；地形与影像来自公开数据，植被概率与自然带边界为教学可视化。",
    }
    (OUT / "metadata.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"完成：{OUT}")
    print(f"DEM 海拔：{minimum:.1f}–{maximum:.1f} m；峰顶标注：{OFFICIAL_SUMMIT_M:.1f} m")


if __name__ == "__main__":
    main()
