"""Read only intersecting original GLO-30 COG blocks using HTTP byte ranges.

Uses TIFF metadata and Pillow's libtiff decoder; no GDAL runtime is required.
Never reads the lower-resolution COG overviews.
"""
import io
import math
import struct
import urllib.request
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import tifffile
from PIL import Image


def byte_range(url, offset, length, path):
    if path.exists() and path.stat().st_size == length:
        return path.read_bytes()
    for attempt in range(4):
        try:
            request = urllib.request.Request(url, headers={'Range': f'bytes={offset}-{offset + length - 1}'})
            with urllib.request.urlopen(request, timeout=90) as response:
                if response.status != 206:
                    raise RuntimeError('Server did not honor the byte-range request')
                data = response.read()
            if len(data) != length:
                raise RuntimeError('Incomplete COG block')
            path.write_bytes(data)
            return data
        except Exception:
            if attempt == 3:
                raise


def decode_block(data, width, height):
    # Wrap the original deflate+floating-point-predictor block in a one-strip
    # TIFF. libtiff performs the standard Predictor=3 decoding independently.
    entries = [(256, 4, width), (257, 4, height), (258, 3, 32), (259, 3, 8),
               (262, 3, 1), (273, 4, 8 + 2 + 11 * 12 + 4), (277, 3, 1),
               (278, 4, height), (279, 4, len(data)), (317, 3, 3), (339, 3, 3)]
    header = b'II' + struct.pack('<HIH', 42, 8, len(entries))
    for tag, kind, value in entries:
        header += struct.pack('<HHII', tag, kind, 1, value)
    header += struct.pack('<I', 0)
    return np.array(Image.open(io.BytesIO(header + data)), dtype=np.float32)


def sample_tile(latitude, longitudes, latitudes, cache):
    name = f'Copernicus_DSM_COG_10_N{latitude}_00_E086_00_DEM'
    url = f'https://copernicus-dem-30m.s3.amazonaws.com/{name}/{name}.tif'
    header = byte_range(url, 0, 16384, cache / f'{name}-header.tif')
    with tifffile.TiffFile(io.BytesIO(header)) as tiff:
        page = tiff.pages[0]
        if page.compression != 8 or page.predictor != 3 or page.dtype != np.dtype('float32'):
            raise RuntimeError('Unexpected source TIFF encoding')
        sx, sy, _ = page.tags['ModelPixelScaleTag'].value
        _, _, _, west, north, _ = page.tags['ModelTiepointTag'].value
        px = np.clip((longitudes - west) / sx - .5, 0, page.shape[1] - 1)
        py = np.clip((north - latitudes) / sy - .5, 0, page.shape[0] - 1)
        xx, yy = np.meshgrid(px, py)
        x0, y0 = np.floor(xx).astype(int), np.floor(yy).astype(int)
        x1, y1 = np.minimum(x0 + 1, page.shape[1] - 1), np.minimum(y0 + 1, page.shape[0] - 1)
        tw, th = page.tilewidth, page.tilelength
        columns = math.ceil(page.shape[1] / tw)
        needed = set()
        for xs, ys in ((x0, y0), (x1, y0), (x0, y1), (x1, y1)):
            needed.update(np.unique((ys // th) * columns + xs // tw).tolist())
        def fetch(index):
            count = page.databytecounts[index]
            print(f'Read {name} original block {index}: {count / 1024:.0f} KiB', flush=True)
            data = byte_range(url, page.dataoffsets[index], count, cache / f'{name}-block-{index}.deflate')
            return index, decode_block(data, tw, th)
        with ThreadPoolExecutor(max_workers=4) as pool:
            blocks = dict(pool.map(fetch, sorted(needed)))
        def gather(xs, ys):
            result = np.empty(xs.shape, dtype=np.float32)
            ids = (ys // th) * columns + xs // tw
            for index, block in blocks.items():
                mask = ids == index
                result[mask] = block[ys[mask] % th, xs[mask] % tw]
            return result
        fx, fy = xx - x0, yy - y0
        result = (gather(x0, y0) * (1-fx) + gather(x1, y0) * fx) * (1-fy) + (gather(x0, y1) * (1-fx) + gather(x1, y1) * fx) * fy
        if not np.all(np.isfinite(result)) or np.min(result) < 0 or np.max(result) > 9000:
            raise RuntimeError('Invalid decoded high-mountain elevation values')
        return result.astype(np.float32)


def read_window(bounds, size, cache):
    west, south, east, north = bounds
    cache.mkdir(parents=True, exist_ok=True)
    lons = np.linspace(west, east, size)
    lats = np.linspace(north, south, size)
    result = np.empty((size, size), dtype=np.float32)
    def read(latitude):
        mask = np.floor(lats).astype(int) == latitude
        return mask, sample_tile(latitude, lons, lats[mask], cache)
    with ThreadPoolExecutor(max_workers=2) as pool:
        for mask, values in pool.map(read, range(math.floor(south), math.floor(north) + 1)):
            result[mask] = values
    return result
