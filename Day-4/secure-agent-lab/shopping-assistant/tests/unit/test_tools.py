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

import pytest
from app.agent import (
    DISCOUNT_STORE,
    CARTS,
    LOYALTY_LEDGER,
    PROCESSED_PURCHASES,
    ADMINS,
    redeem_discount,
    award_loyalty_points,
    process_cart_checkout,
    update_discount_status,
)


@pytest.fixture(autouse=True)
def reset_db_state():
    """Reset the in-memory databases before each test to isolate test state."""
    DISCOUNT_STORE.clear()
    DISCOUNT_STORE.update({"WELCOME50": False, "SUMMER20": False})

    CARTS.clear()
    CARTS.update({
        "cart-123": {"user_id": "user-123", "items": ["premium shoes"], "finalized": False},
        "cart-456": {"user_id": "user-456", "items": ["leather jacket"], "finalized": False},
    })

    LOYALTY_LEDGER.clear()
    LOYALTY_LEDGER.update({"user-123": 100, "user-456": 250})

    PROCESSED_PURCHASES.clear()

    ADMINS.clear()
    ADMINS.add("admin-001")


# --- Tests for redeem_discount ---

def test_redeem_discount_success():
    res = redeem_discount(code="WELCOME50", user_id="user-123")
    assert "Success" in res
    assert DISCOUNT_STORE["WELCOME50"] is True


def test_redeem_discount_invalid_code():
    res = redeem_discount(code="NOTREAL", user_id="user-123")
    assert "Error: Invalid discount code" in res


def test_redeem_discount_already_redeemed():
    redeem_discount(code="WELCOME50", user_id="user-123")
    res = redeem_discount(code="WELCOME50", user_id="user-456")
    assert "Error: Discount code has already been redeemed" in res


def test_redeem_discount_guest_user():
    res = redeem_discount(code="WELCOME50", user_id="guest_999")
    assert "Error: Registered user account required" in res


# --- Tests for award_loyalty_points ---

def test_award_loyalty_points_success():
    res = award_loyalty_points(user_id="user-123", points=500, purchase_id="tx-999")
    assert "Success" in res
    assert LOYALTY_LEDGER["user-123"] == 600
    assert "tx-999" in PROCESSED_PURCHASES


def test_award_loyalty_points_guest():
    res = award_loyalty_points(user_id="guest_123", points=500, purchase_id="tx-999")
    assert "Error" in res
    assert "guest_123" not in LOYALTY_LEDGER


def test_award_loyalty_points_invalid_points():
    # Test min limit constraint (ge=1)
    res = award_loyalty_points(user_id="user-123", points=0, purchase_id="tx-999")
    assert "Error: Invalid input parameters" in res

    # Test max limit constraint (le=5000)
    res = award_loyalty_points(user_id="user-123", points=9999, purchase_id="tx-999")
    assert "Error: Invalid input parameters" in res


def test_award_loyalty_points_double_claim():
    award_loyalty_points(user_id="user-123", points=500, purchase_id="tx-999")
    res = award_loyalty_points(user_id="user-123", points=500, purchase_id="tx-999")
    assert "Error: Purchase ID 'tx-999' has already been rewarded" in res
    assert LOYALTY_LEDGER["user-123"] == 600  # Points should not increase again


# --- Tests for process_cart_checkout ---

def test_process_cart_checkout_success_no_discount():
    res = process_cart_checkout(cart_id="cart-123", user_id="user-123")
    assert "Success" in res
    assert CARTS["cart-123"]["finalized"] is True


def test_process_cart_checkout_success_with_discount():
    res = process_cart_checkout(cart_id="cart-123", user_id="user-123", discount_code="WELCOME50")
    assert "Success" in res
    assert CARTS["cart-123"]["finalized"] is True
    assert DISCOUNT_STORE["WELCOME50"] is True


def test_process_cart_checkout_unauthorized_user():
    # user-456 trying to check out user-123's cart
    res = process_cart_checkout(cart_id="cart-123", user_id="user-456")
    assert "Error: Unauthorized" in res
    assert CARTS["cart-123"]["finalized"] is False


def test_process_cart_checkout_already_finalized():
    process_cart_checkout(cart_id="cart-123", user_id="user-123")
    res = process_cart_checkout(cart_id="cart-123", user_id="user-123")
    assert "Error: Cart has already been checked out" in res


def test_process_cart_checkout_invalid_cart():
    res = process_cart_checkout(cart_id="cart-invalid", user_id="user-123")
    assert "Error: Cart ID 'cart-invalid' not found" in res


# --- Tests for update_discount_status ---

def test_update_discount_status_success_deactivate():
    res = update_discount_status(admin_user_id="admin-001", code="WELCOME50", is_active=False)
    assert "Success: Discount code 'WELCOME50' has been deactivated" in res
    assert DISCOUNT_STORE["WELCOME50"] is True  # True means redeemed / inactive


def test_update_discount_status_success_activate():
    # Mark it redeemed first
    DISCOUNT_STORE["WELCOME50"] = True
    res = update_discount_status(admin_user_id="admin-001", code="WELCOME50", is_active=True)
    assert "Success: Discount code 'WELCOME50' has been activated" in res
    assert DISCOUNT_STORE["WELCOME50"] is False  # False means unredeemed / active


def test_update_discount_status_unauthorized():
    res = update_discount_status(admin_user_id="user-123", code="WELCOME50", is_active=False)
    assert "Error: Access denied. Administrator privileges required" in res
    assert DISCOUNT_STORE["WELCOME50"] is False  # State must remain unchanged
