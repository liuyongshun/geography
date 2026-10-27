#!/usr/bin/env python3
"""构建马特洪峰真实地形原型（swissALTI3D + SWISSIMAGE）。

需要 Python 3 与 Pillow。输出只保留 257×257 高程和 4096² 正射图；
下载的 2 m COG 缓存在 .cache/matterhorn-dem，不进入安装包。
"""

from __future__ import annotations

import array
import json
import re
import sys
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".cache" / "matterhorn-dem"
OUT = ROOT / "public" / "terrain" / "matterhorn"

X0, X1 = 2615, 2620
Y0, Y1 = 1090, 1095
GRID_SIZE = 257
STAC = (
    "https://data.geo.admin.ch/api/stac/v0.9/collections/"
    "ch.swisstopo.swissalti3d/items?bbox=7.62,45.95,7.69,46.00&limit=100"
)


def fetch_json(url: str) -> dict:
    with urllib.request.urlopen(url) as response:
        return json.load(response)


def download(url: str, path: Path) -> Path:
    if path.exists() and path.stat().st_size > 1000:
        return path
    print(f"下载 {path.name}")
    request = urllib.request.Request(url, headers={"User-Agent": "dili-terrain-builder/1.0"})
    with urllib.request.urlopen(request) as response:
        path.write_bytes(response.read())
    return path


def terrain_assets() -> dict[tuple[int, int], tuple[int, str]]:
    data = fetch_json(STAC)
    chosen: dict[tuple[int, int], tuple[int, str]] = {}
    pattern = re.compile(r"swissalti3d_(\d{4})_(\d{4})-(\d{4})_2_2056_5728\.tif$")
    for feature in data["features"]:
        for asset in feature.get("assets", {}).values():
            href = asset.get("href", "")
            match = pattern.search(href)
            if not match:
                continue
            year, x, y = map(int, match.groups())
            if not (X0 <= x < X1 and Y0 <= y < Y1):
                continue
            previous = chosen.get((x, y))
            if previous is None or year > previous[0]:
                chosen[(x, y)] = (year, href)
    expected = {(x, y) for x in range(X0, X1) for y in range(Y0, Y1)}
    missing = expected - chosen.keys()
    if missing:
        raise RuntimeError(f"缺少高程瓦片：{sorted(missing)}")
    return chosen


def build_height() -> tuple[float, float]:
    assets = terrain_assets()
    CACHE.mkdir(parents=True, exist_ok=True)
    paths: dict[tuple[int, int], Path] = {}
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = {}
        for key, (year, url) in assets.items():
            path = CACHE / f"swissalti3d_{year}_{key[0]}-{key[1]}_2m.tif"
            paths[key] = path
            futures[pool.submit(download, url, path)] = key
        for future in futures:
            future.result()

    tile_size = 500
    merged = Image.new("F", ((X1 - X0) * tile_size, (Y1 - Y0) * tile_size))
    for (x, y), path in paths.items():
        tile = Image.open(path)
        # GeoTIFF 行从北向南；北侧（更大的 y）放在合图顶部。
        px = (x - X0) * tile_size
        py = (Y1 - 1 - y) * tile_size
        merged.paste(tile, (px, py))

    sampled = merged.resize((GRID_SIZE, GRID_SIZE), Image.Resampling.BICUBIC)
    values = list(sampled.getdata())
    minimum = min(values)
    maximum = max(values)
    span = maximum - minimum
    quantized = array.array(
        "H",
        (max(0, min(65535, round((value - minimum) / span * 65535))) for value in values),
    )
    if sys.byteorder != "little":
        quantized.byteswap()
    (OUT / "height-u16.bin").write_bytes(quantized.tobytes())

    preview = Image.new("I;16", sampled.size)
    preview.putdata(quantized)
    preview.convert("RGB").save(OUT / "height-preview.jpg", quality=90, optimize=True)
    return minimum, maximum


def build_ortho() -> None:
    params = {
        "SERVICE": "WMS",
        "VERSION": "1.1.1",
        "REQUEST": "GetMap",
        "LAYERS": "ch.swisstopo.swissimage",
        "STYLES": "default",
        "SRS": "EPSG:2056",
        "BBOX": f"{X0 * 1000},{Y0 * 1000},{X1 * 1000},{Y1 * 1000}",
        "WIDTH": "4096",
        "HEIGHT": "4096",
        "FORMAT": "image/jpeg",
    }
    url = "https://wms.geo.admin.ch/?" + urllib.parse.urlencode(params)
    raw = download(url, CACHE / "swissimage-matterhorn-4096.jpg")
    image = Image.open(raw).convert("RGB")
    # 正射影像峰体背光区很深；抬升暗部，保留雪地高光，避免三维侧视时变成黑块。
    lut = []
    for value in range(256):
        x = value / 255
        lifted = x + (x**0.58 - x) * 0.42 + 0.02 * (1 - x)
        lut.append(round(max(0, min(1, lifted)) * 255))
    image.point(lut * 3).save(
        OUT / "ortho.jpg",
        quality=90,
        subsampling=0,
        optimize=True,
    )


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    minimum, maximum = build_height()
    build_ortho()
    metadata = {
        "name": "Matterhorn real-terrain teaching prototype",
        "gridSize": GRID_SIZE,
        "bboxLV95": [X0 * 1000, Y0 * 1000, X1 * 1000, Y1 * 1000],
        "widthMeters": (X1 - X0) * 1000,
        "heightMeters": (Y1 - Y0) * 1000,
        "minElevation": round(minimum, 3),
        "maxElevation": round(maximum, 3),
        "heightEncoding": "little-endian uint16, normalized between minElevation and maxElevation",
        "terrainSource": "swissALTI3D, Federal Office of Topography swisstopo",
        "imagerySource": "SWISSIMAGE, Federal Office of Topography swisstopo",
        "source": "https://data.geo.admin.ch/",
        "license": "swisstopo terms of use for free geodata and geoservices",
        "attribution": "Source: Federal Office of Topography swisstopo (©swisstopo), modified",
        "disclaimer": "课堂三维原型；地形与影像来自实测公开数据，标注与垂直自然带仍为教学示意。",
    }
    (OUT / "metadata.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"完成：{OUT}")
    print(f"海拔：{minimum:.1f}–{maximum:.1f} m")


if __name__ == "__main__":
    main()
