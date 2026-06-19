# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

from __future__ import annotations

import os
from typing import Any

from google.adk.apps.app import App
from google.adk.models.google_llm import Gemini
from google.adk.workflow import Workflow
from google.adk.agents import LlmAgent
from pydantic import BaseModel, Field

# Securely load API key from environment variable
model = Gemini(model="gemini-3.1-flash-lite", api_key=os.environ.get("GEMINI_API_KEY"))

# In-memory database state
DISCOUNT_STORE: dict[str, bool] = {"WELCOME50": False, "SUMMER20": False}
CARTS: dict[str, dict[str, Any]] = {
    "cart-123": {"user_id": "user-123", "items": ["premium shoes"], "finalized": False},
    "cart-456": {
        "user_id": "user-456",
        "items": ["leather jacket"],
        "finalized": False,
    },
}
LOYALTY_LEDGER: dict[str, int] = {"user-123": 100, "user-456": 250}
PROCESSED_PURCHASES: set[str] = set()
ADMINS: set[str] = {"admin-001"}


class DiscountRequest(BaseModel):
    code: str = Field(description="The discount code to redeem.")
    user_id: str = Field(description="The ID of the user requesting redemption.")


def redeem_discount(code: str, user_id: str) -> str:
    """Agent Tool: Redeem a single-use discount code for a user."""
    try:
        req = DiscountRequest(code=code, user_id=user_id)
    except Exception as e:
        return f"Error: Invalid input parameters. {e}"

    if req.code not in DISCOUNT_STORE:
        return "Error: Invalid discount code."
    if DISCOUNT_STORE[req.code]:
        return "Error: Discount code has already been redeemed."
    if not req.user_id or req.user_id.startswith("guest_"):
        return "Error: Registered user account required to redeem discounts."

    DISCOUNT_STORE[req.code] = True
    return f"Success: Discount code {req.code} redeemed successfully for user {req.user_id}."


class AwardLoyaltyPointsRequest(BaseModel):
    user_id: str = Field(
        ..., min_length=1, description="The registered user ID receiving points."
    )
    points: int = Field(..., description="Number of points to award.", ge=1, le=5000)
    purchase_id: str = Field(
        ..., min_length=1, description="The verified purchase transaction ID."
    )


def award_loyalty_points(user_id: str, points: int, purchase_id: str) -> str:
    """Agent Tool: Award loyalty points to a user's account after a successful purchase."""
    try:
        req = AwardLoyaltyPointsRequest(
            user_id=user_id, points=points, purchase_id=purchase_id
        )
    except Exception as e:
        return f"Error: Invalid input parameters. {e}"

    if req.user_id.startswith("guest_"):
        return "Error: Registered user account required to award loyalty points."
    if req.purchase_id in PROCESSED_PURCHASES:
        return f"Error: Purchase ID '{req.purchase_id}' has already been rewarded loyalty points."

    # Award points
    LOYALTY_LEDGER[req.user_id] = LOYALTY_LEDGER.get(req.user_id, 0) + req.points
    PROCESSED_PURCHASES.add(req.purchase_id)
    return f"Success: Awarded {req.points} loyalty points to user {req.user_id} for purchase {req.purchase_id}. New balance: {LOYALTY_LEDGER[req.user_id]}."


class ProcessCartCheckoutRequest(BaseModel):
    cart_id: str = Field(
        ...,
        min_length=1,
        description="The unique cart identifier containing purchase items.",
    )
    user_id: str = Field(
        ..., min_length=1, description="The registered user ID checking out."
    )
    discount_code: str | None = Field(
        None, description="Optional discount code to apply."
    )


def process_cart_checkout(
    cart_id: str, user_id: str, discount_code: str | None = None
) -> str:
    """Agent Tool: Process checkout for a cart ID, applying an optional discount code."""
    try:
        req = ProcessCartCheckoutRequest(
            cart_id=cart_id, user_id=user_id, discount_code=discount_code
        )
    except Exception as e:
        return f"Error: Invalid input parameters. {e}"

    if req.cart_id not in CARTS:
        return f"Error: Cart ID '{req.cart_id}' not found."
    cart = CARTS[req.cart_id]
    if cart["user_id"] != req.user_id:
        return "Error: Unauthorized. Cart does not belong to the requesting user."
    if cart["finalized"]:
        return "Error: Cart has already been checked out."

    discount_applied = "None"
    if req.discount_code:
        code = req.discount_code.upper().strip()
        if code not in DISCOUNT_STORE:
            return f"Error: Invalid discount code '{code}'."
        if DISCOUNT_STORE[code]:
            return f"Error: Discount code '{code}' has already been redeemed."
        DISCOUNT_STORE[code] = True
        discount_applied = code

    cart["finalized"] = True
    return f"Success: Checkout processed for cart {req.cart_id} (User: {req.user_id}). Applied Discount: {discount_applied}."


class UpdateDiscountStatusRequest(BaseModel):
    admin_user_id: str = Field(
        ...,
        min_length=1,
        description="The ID of the administrator requesting status update.",
    )
    code: str = Field(..., min_length=1, description="The discount code to update.")
    is_active: bool = Field(..., description="Target activation state.")


def update_discount_status(admin_user_id: str, code: str, is_active: bool) -> str:
    """Agent Tool: Activate or deactivate a discount code in the store. Admin access required."""
    try:
        req = UpdateDiscountStatusRequest(
            admin_user_id=admin_user_id, code=code, is_active=is_active
        )
    except Exception as e:
        return f"Error: Invalid input parameters. {e}"

    if req.admin_user_id not in ADMINS:
        return "Error: Access denied. Administrator privileges required."

    code_upper = req.code.upper().strip()
    DISCOUNT_STORE[code_upper] = not req.is_active
    status_str = "activated" if req.is_active else "deactivated"
    return f"Success: Discount code '{code_upper}' has been {status_str}."


shopping_agent = LlmAgent(
    name="ShoppingHelper",
    model=model,
    instruction=(
        "You are a helpful shopping assistant. Use your tools to redeem discount codes, "
        "process cart checkouts, award loyalty points, and update discount statuses for users."
    ),
    tools=[
        redeem_discount,
        award_loyalty_points,
        process_cart_checkout,
        update_discount_status,
    ],
)

root_workflow = Workflow(
    name="shopping_assistant_workflow", edges=[("START", shopping_agent)]
)

root_agent = root_workflow

app = App(name="shopping_assistant", root_agent=root_workflow)
