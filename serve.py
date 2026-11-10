import argparse
import collections
import json
import os
import socket
import threading
import time
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

try:
    import anthropic
except ImportError:  # The website works without the optional AI assistant dependency.
    anthropic = None


PROJECT_DIR = Path(__file__).resolve().parent
AI_MODEL = os.environ.get("SMARTFOODIE_MODEL", "claude-opus-5-5")
MAX_BODY_BYTES = 200_000
MAX_TOOL_ROUNDS = 5
MAX_HISTORY_MESSAGES = 16
REQUESTS_PER_MINUTE = 20  # per device, so others on the Wi-Fi can't run up your API bill


def get_lan_ip():
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(("192.0.2.1", 80))
        return probe.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        probe.close()


# ---------------------------------------------------------------------------
# AI ordering assistant (Claude). The browser sends the chat, the menu, and the
# current cart; Claude answers and calls tools. Tool calls are validated here and
# returned to the browser as actions, which the page applies to the real cart.
# Claude can never place an order: open_checkout only opens the checkout screen.
# ---------------------------------------------------------------------------

def _tool(name, description, properties, required):
    return {
        "name": name,
        "description": description,
        "strict": True,
        "input_schema": {"type": "object", "properties": properties, "required": required, "additionalProperties": False},
    }


TOOLS = [
    _tool("add_to_cart", "Add a dish to the customer's order. Use an exact dish_id from the menu.",
          {"dish_id": {"type": "string"}, "quantity": {"type": "integer", "description": "How many to add, 1-20."}},
          ["dish_id", "quantity"]),
    _tool("remove_from_cart", "Remove a dish from the customer's order. quantity 0 removes all of that dish.",
          {"dish_id": {"type": "string"}, "quantity": {"type": "integer"}},
          ["dish_id", "quantity"]),
    _tool("clear_cart", "Remove everything from the customer's order.", {}, []),
    _tool("show_dishes", "Show 1-4 dishes to the customer as cards with photo, price, rating, and an Add button. "
          "Use it whenever you recommend or talk about specific dishes.",
          {"dish_ids": {"type": "array", "items": {"type": "string"}}},
          ["dish_ids"]),
    _tool("set_fulfillment", "Switch the order between delivery and pickup.",
          {"mode": {"type": "string", "enum": ["delivery", "pickup"]}},
          ["mode"]),
    _tool("open_checkout", "Open the checkout screen so the customer can review the total with tax and place the order themselves.", {}, []),
]

SYSTEM_PROMPT = """You are SmartFoodie's ordering assistant, built into a food-ordering website. The site is a demo: orders are not sent to real restaurants and no payment is taken.

Help the customer decide what to eat and build their order with your tools:
- add_to_cart, remove_from_cart, and clear_cart change the order. Use only dish_id values from the menu below.
- show_dishes displays dish cards. Use it whenever you recommend or mention specific dishes.
- set_fulfillment switches between delivery and pickup. Pickup has no delivery fee and no tip.
- open_checkout opens checkout when the customer is ready. You cannot place orders or take payment; the customer confirms in the app.

Pricing: menu prices are in US dollars. At checkout the app adds a delivery fee per restaurant (delivery only), a 5% service fee (minimum $1, maximum $5), a $2 small-order fee when the food subtotal is under $10, sales tax on the food subtotal at the state rate given in the app state, and an optional tip. The app shows the exact breakdown under your reply, so do not calculate a final total yourself; you may give rough estimates and mention the tax rate. Treat a customer's budget as the total they want to pay, so leave room for tax and fees.

Recommend only dishes from the menu, matching cravings, diet, spice level, budget, and time. Allergen information is not verified, so suggest checking with the restaurant when allergies come up.

Each dish's first tag is its course: Appetizer, Main, Dessert, or Drink. A "Best seller" tag marks a restaurant's most popular items. When planning a meal, give each person a main; suggest drinks, appetizers, or desserts as optional extras unless the customer asks for them.

Reply in the language the customer writes in (Vietnamese or English). Keep replies to 1-3 short sentences of plain text without markdown."""


def _clean_text(value, limit):
    return " ".join(str(value or "").split())[:limit]


def _money(amount):
    return f"${amount:,.2f}"


class InvalidRequest(ValueError):
    pass


class Assistant:
    def __init__(self):
        self.client = None
        self.disabled_reason = None
        if os.environ.get("SMARTFOODIE_AI", "").lower() in {"0", "off", "false", "no"}:
            self.disabled_reason = "turned off with SMARTFOODIE_AI"
        elif anthropic is None:
            self.disabled_reason = "the anthropic package is not installed (pip install -r requirements.txt)"
        else:
            try:
                self.client = anthropic.Anthropic()
            except Exception as error:  # e.g. no API key or login profile configured
                self.disabled_reason = f"Claude client could not start: {error}"

    @property
    def available(self):
        return self.client is not None

    def disable(self, reason):
        self.client = None
        self.disabled_reason = reason

    @staticmethod
    def _parse(payload):
        if not isinstance(payload, dict):
            raise InvalidRequest("Request body must be a JSON object.")
        menu = []
        for item in (payload.get("menu") or [])[:300]:
            if not isinstance(item, dict) or not item.get("id"):
                continue
            try:
                price = float(item.get("price"))
            except (TypeError, ValueError):
                continue
            menu.append({
                "id": _clean_text(item.get("id"), 60),
                "name": _clean_text(item.get("name"), 80),
                "restaurant": _clean_text(item.get("restaurant"), 80),
                "cuisine": _clean_text(item.get("cuisine"), 40),
                "price": round(price, 2),
                "prep": _clean_text(item.get("prep"), 6),
                "diet": _clean_text(item.get("diet"), 20),
                "spicy": _clean_text(item.get("spicy"), 4),
                "rating": _clean_text(item.get("rating"), 6),
                "ratingCount": _clean_text(item.get("ratingCount"), 8),
                "tags": _clean_text(", ".join(map(str, item.get("tags") or [])), 80),
            })
        if not menu:
            raise InvalidRequest("Menu is missing.")
        by_id = {dish["id"]: dish for dish in menu}

        history = []
        for message in (payload.get("messages") or [])[-MAX_HISTORY_MESSAGES:]:
            if not isinstance(message, dict) or message.get("role") not in {"user", "assistant"}:
                continue
            text = str(message.get("content") or "").strip()[:2000]
            if text:
                history.append({"role": message["role"], "content": text})
        while history and history[0]["role"] != "user":
            history.pop(0)
        if not history or history[-1]["role"] != "user":
            raise InvalidRequest("The last message must come from the customer.")

        cart = collections.OrderedDict()
        for line in (payload.get("cart") or [])[:100]:
            if isinstance(line, dict) and line.get("dishId") in by_id:
                try:
                    quantity = max(0, min(99, int(line.get("quantity") or 0)))
                except (TypeError, ValueError):
                    continue
                if quantity:
                    cart[line["dishId"]] = cart.get(line["dishId"], 0) + quantity

        context = payload.get("context") if isinstance(payload.get("context"), dict) else {}
        return menu, by_id, history, cart, context

    @staticmethod
    def _menu_block(menu):
        lines = [
            f"{d['id']} | {d['name']} | {d['restaurant']} | {d['cuisine']} | {_money(d['price'])} | {d['prep']} min | "
            f"{d['diet']} | {d['spicy']} | {d['rating']} ({d['ratingCount']}) | {d['tags']}"
            for d in menu
        ]
        return "Menu (id | dish | restaurant | cuisine | price | prep | diet | spice 0-2 | rating (count) | tags):\n" + "\n".join(lines)

    @staticmethod
    def _cart_summary(cart, by_id):
        if not cart:
            return "The order is empty."
        lines = [f"{qty} x {by_id[dish_id]['name']} ({dish_id}) at {_money(by_id[dish_id]['price'])}" for dish_id, qty in cart.items()]
        subtotal = sum(by_id[dish_id]["price"] * qty for dish_id, qty in cart.items())
        return "Order: " + "; ".join(lines) + f". Food subtotal {_money(subtotal)} before fees and tax."

    def _app_state(self, cart, by_id, context):
        mode = "pickup" if context.get("mode") == "pickup" else "delivery"
        state = _clean_text(context.get("state"), 4) or "unknown"
        try:
            tax_rate = float(context.get("taxRate"))
            tax = f"{state} {tax_rate:g}% on the food subtotal"
        except (TypeError, ValueError):
            tax = "unknown"
        try:
            budget = _money(float(context.get("budget")))
        except (TypeError, ValueError):
            budget = "not set"
        return (f"App state now. Fulfillment: {mode}. Sales tax: {tax}. Customer budget: {budget}. "
                + self._cart_summary(cart, by_id))

    def _run_tool(self, name, data, cart, by_id, actions, mode_holder):
        if name == "add_to_cart":
            dish = by_id.get(str(data.get("dish_id")))
            if not dish:
                return "Unknown dish_id. Use an id from the menu.", True
            quantity = max(1, min(20, int(data.get("quantity") or 1)))
            cart[dish["id"]] = cart.get(dish["id"], 0) + quantity
            actions.append({"type": "add", "dishId": dish["id"], "quantity": quantity})
            return f"Added {quantity} x {dish['name']}. {self._cart_summary(cart, by_id)}", False
        if name == "remove_from_cart":
            dish_id = str(data.get("dish_id"))
            if dish_id not in cart:
                return "That dish is not in the order.", True
            quantity = int(data.get("quantity") or 0)
            removed = cart[dish_id] if quantity <= 0 else min(quantity, cart[dish_id])
            cart[dish_id] -= removed
            if cart[dish_id] <= 0:
                del cart[dish_id]
            actions.append({"type": "remove", "dishId": dish_id, "quantity": 0 if quantity <= 0 else removed})
            return f"Removed {removed} x {by_id[dish_id]['name']}. {self._cart_summary(cart, by_id)}", False
        if name == "clear_cart":
            cart.clear()
            actions.append({"type": "clear"})
            return "The order is now empty.", False
        if name == "show_dishes":
            ids = [str(dish_id) for dish_id in (data.get("dish_ids") or []) if str(dish_id) in by_id][:4]
            if not ids:
                return "None of those dish_ids are on the menu.", True
            actions.append({"type": "show", "dishIds": ids})
            return "Shown to the customer: " + ", ".join(by_id[dish_id]["name"] for dish_id in ids), False
        if name == "set_fulfillment":
            mode = "pickup" if data.get("mode") == "pickup" else "delivery"
            mode_holder["mode"] = mode
            actions.append({"type": "mode", "mode": mode})
            return f"Switched to {mode}.", False
        if name == "open_checkout":
            if not cart:
                return "The order is empty, so checkout cannot open yet.", True
            actions.append({"type": "checkout"})
            return "Checkout is open. The customer reviews the total with tax and places the order themselves.", False
        return f"Unknown tool {name}.", True

    def reply(self, payload):
        menu, by_id, history, cart, context = self._parse(payload)
        system = [{"type": "text", "text": SYSTEM_PROMPT + "\n\n" + self._menu_block(menu), "cache_control": {"type": "ephemeral"}}]
        # Current cart and settings go in a mid-conversation system message after the newest
        # customer message, so the cached system prompt and earlier turns stay unchanged.
        messages = [*history, {"role": "system", "content": self._app_state(cart, by_id, context)}]
        actions = []
        mode_holder = {"mode": context.get("mode")}
        response = None
        for _ in range(MAX_TOOL_ROUNDS):
            response = self.client.beta.messages.create(
                model=AI_MODEL,
                max_tokens=16000,
                output_config={"effort": "low"},  # short chat turns
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",  # if a safety classifier declines, retry on the recommended fallback model
                system=system,
                tools=TOOLS,
                messages=messages,
            )
            if response.stop_reason == "refusal":
                return {"reply": "Sorry, I can't help with that. Ask me about the menu or your order.", "actions": actions, "model": response.model}
            tool_uses = [block for block in response.content if block.type == "tool_use"]
            if response.stop_reason != "tool_use" or not tool_uses:
                break
            messages.append({"role": "assistant", "content": response.content})
            results = []
            for block in tool_uses:
                try:
                    content, is_error = self._run_tool(block.name, block.input or {}, cart, by_id, actions, mode_holder)
                except (TypeError, ValueError) as error:
                    content, is_error = f"Invalid input: {error}", True
                result = {"type": "tool_result", "tool_use_id": block.id, "content": content}
                if is_error:
                    result["is_error"] = True
                results.append(result)
            messages.append({"role": "user", "content": results})
        text = "\n".join(block.text for block in (response.content if response else []) if block.type == "text").strip()
        return {"reply": text or "Done. Your order is updated.", "actions": actions, "model": getattr(response, "model", AI_MODEL)}


ASSISTANT = Assistant()
_rate_lock = threading.Lock()
_recent_requests = collections.defaultdict(collections.deque)


def allow_request(client_ip):
    now = time.monotonic()
    with _rate_lock:
        window = _recent_requests[client_ip]
        while window and now - window[0] > 60:
            window.popleft()
        if len(window) >= REQUESTS_PER_MINUTE:
            return False
        window.append(now)
        return True


class SmartFoodieHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Always revalidate site files so edits show up on refresh.
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def send_json(self, status, body):
        data = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.split("?")[0] == "/api/health":
            self.send_json(HTTPStatus.OK, {"ai": ASSISTANT.available, "model": AI_MODEL if ASSISTANT.available else None})
            return
        super().do_GET()

    def do_POST(self):
        if self.path.split("?")[0] != "/api/assistant":
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "Not found"})
            return
        if not ASSISTANT.available:
            self.send_json(HTTPStatus.SERVICE_UNAVAILABLE, {"error": f"AI assistant unavailable: {ASSISTANT.disabled_reason}"})
            return
        if not allow_request(self.client_address[0]):
            self.send_json(HTTPStatus.TOO_MANY_REQUESTS, {"error": "Too many requests. Wait a minute and try again."})
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_BODY_BYTES:
            self.send_json(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {"error": "Request body is empty or too large."})
            return
        try:
            payload = json.loads(self.rfile.read(length))
            result = ASSISTANT.reply(payload)
        except (json.JSONDecodeError, InvalidRequest) as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
            return
        except anthropic.AuthenticationError:
            ASSISTANT.disable("the Anthropic API key was rejected")
            self.send_json(HTTPStatus.SERVICE_UNAVAILABLE, {"error": "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY."})
            return
        except anthropic.RateLimitError:
            self.send_json(HTTPStatus.TOO_MANY_REQUESTS, {"error": "Claude is rate limited right now. Try again shortly."})
            return
        except anthropic.APIStatusError as error:
            self.send_json(HTTPStatus.BAD_GATEWAY, {"error": f"Claude API error ({error.status_code})."})
            return
        except anthropic.APIConnectionError:
            self.send_json(HTTPStatus.BAD_GATEWAY, {"error": "Could not reach the Claude API."})
            return
        self.send_json(HTTPStatus.OK, result)


def create_server(start_port):
    handler = partial(SmartFoodieHandler, directory=str(PROJECT_DIR))
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
    if ASSISTANT.available:
        print(f"AI assistant: Claude ({AI_MODEL}) is on.")
    else:
        print(f"AI assistant: using the built-in on-device assistant ({ASSISTANT.disabled_reason}).")
    print("Keep this Terminal window open while the website is in use. Press Ctrl+C to stop the server.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nSmartFoodie server stopped.")
    finally:
        server.server_close()
