"""Allow `python -m extract` to print usage."""

import sys

USAGE = """\
powerlay-extract: EVE Frontier static data extractor

Usage:
  python -m extract.discover --build {stillness,utopia} [--json] [--probe RES_PATH]
  python -m extract.extract  --build {stillness,utopia} [--target NAME | --all]
  python -m extract.validate RUN_DIR
  python -m extract.promote  RUN_DIR
  python -m extract.update_static_data --build {stillness,utopia} [--yes]
"""


def main() -> int:
    sys.stdout.write(USAGE)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
