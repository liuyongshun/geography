"""在 macOS 上生成 Windows 可识别的 UTF-8 压缩包，不包含资源叉。"""
from pathlib import Path
import sys
from zipfile import ZipFile, ZIP_DEFLATED

source = Path(sys.argv[1]).resolve()
output = Path(sys.argv[2]).resolve()
if (source / "data").exists():
    raise RuntimeError("便携目录包含用户数据，拒绝打入分发包")

with ZipFile(output, "w", compression=ZIP_DEFLATED, compresslevel=6) as archive:
    for file in sorted(source.rglob("*")):
        if file.is_file() and file.name != ".DS_Store" and not file.name.startswith("._"):
            archive.write(file, file.relative_to(source.parent).as_posix())
