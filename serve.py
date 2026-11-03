import argparse
import socket
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parent


def get_lan_ip():
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(("192.0.2.1", 80))
        return probe.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        probe.close()


def create_server(start_port):
    handler = partial(SimpleHTTPRequestHandler, directory=str(PROJECT_DIR))
    last_error = None
    ports_to_try = [0] if start_port == 0 else range(start_port, min(start_port + 20, 65536))
    for port in ports_to_try:
        try:
            return ThreadingHTTPServer(("0.0.0.0", port), handler)
        except OSError as error:
            last_error = error
    raise OSError(f"Could not find an available port starting at {start_port}: {last_error}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run the SmartFoodie website on your local network.")
    parser.add_argument("--port", type=int, default=8000, help="Starting port (default: 8000; tries the next ports if busy)")
    args = parser.parse_args()
    if not 0 <= args.port <= 65535:
        parser.error("--port must be between 0 and 65535")

    try:
        server = create_server(args.port)
    except OSError as error:
        raise SystemExit(f"Could not start SmartFoodie: {error}") from error

    port = server.server_address[1]
    lan_ip = get_lan_ip()
    print(f"On this computer: http://localhost:{port}")
    print(f"On a phone on the same Wi-Fi: http://{lan_ip}:{port}")
    print("To make a QR for your phone: open the Wi-Fi address above on this computer, then select Share.")
    print("Keep this Terminal window open while the website is in use. Press Ctrl+C to stop the server.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nSmartFoodie server stopped.")
    finally:
        server.server_close()
