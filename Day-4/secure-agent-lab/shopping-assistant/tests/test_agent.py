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
    redeem_discount,
)


@pytest.fixture(autouse=True)
def reset_discount_store():
    """Reset the discount store state before each test case."""
    DISCOUNT_STORE.clear()
    DISCOUNT_STORE.update({"WELCOME50": False, "SUMMER20": False})


def test_redeem_discount_valid_registered_user():
    """Verify that a valid registered user ID can redeem an active discount code."""
    res = redeem_discount(code="WELCOME50", user_id="user-123")
    assert "Success" in res
    assert "redeemed successfully" in res
    assert DISCOUNT_STORE["WELCOME50"] is True


def test_redeem_discount_invalid_code():
    """Verify that an invalid code fails validation and returns an error."""
    res = redeem_discount(code="INVALID99", user_id="user-123")
    assert "Error: Invalid discount code" in res


def test_redeem_discount_already_redeemed():
    """Verify that a single-use code cannot be redeemed twice."""
    first_res = redeem_discount(code="WELCOME50", user_id="user-123")
    assert "Success" in first_res

    second_res = redeem_discount(code="WELCOME50", user_id="user-456")
    assert "Error: Discount code has already been redeemed" in second_res


def test_redeem_discount_guest_user_blocked():
    """Verify that guest users (starting with guest_) are blocked from redemption."""
    res = redeem_discount(code="WELCOME50", user_id="guest_user_abc")
    assert "Error: Registered user account required" in res
    assert DISCOUNT_STORE["WELCOME50"] is False


def test_redeem_discount_empty_user_id_blocked():
    """Verify that empty user IDs are blocked from redemption."""
    res = redeem_discount(code="WELCOME50", user_id="")
    assert "Error: Registered user account required" in res
    assert DISCOUNT_STORE["WELCOME50"] is False
