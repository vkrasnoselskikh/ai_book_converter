from __future__ import annotations

import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent
SRC_PATH = PROJECT_ROOT / "src"

if str(SRC_PATH) not in sys.path:
    sys.path.insert(0, str(SRC_PATH))


def _main() -> int:
    from ai_book_converter.cli import main

    return main()


if __name__ == "__main__":
    raise SystemExit(_main())
