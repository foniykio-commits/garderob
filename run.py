import socket
import sys

import uvicorn


def _lan_ip() -> str:
    try:
        probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        probe.connect(("8.8.8.8", 80))
        address = probe.getsockname()[0]
        probe.close()
        return address
    except OSError:
        return "127.0.0.1"


if __name__ == "__main__":
    ip = _lan_ip()
    print("Garderob")
    print(f"  shu kompyuter: http://127.0.0.1:8787")
    print(f"  telefon (Wi-Fi): http://{ip}:8787")
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8787,
        reload="--reload" in sys.argv,
    )
