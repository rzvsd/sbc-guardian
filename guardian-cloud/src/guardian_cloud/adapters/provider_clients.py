from __future__ import annotations

import os
from urllib.parse import urlencode, urljoin

import httpx


class Auth0HttpClient:
    def __init__(self, issuer: str, client_id: str, client_secret: str, callback_url: str):
        self.issuer = issuer.rstrip("/") + "/"
        self.client_id = client_id
        self.client_secret = client_secret
        self.callback_url = callback_url

    @classmethod
    def from_environment(cls) -> Auth0HttpClient | None:
        values = [
            os.environ.get("SBC_AUTH0_ISSUER", ""),
            os.environ.get("SBC_AUTH0_CLIENT_ID", ""),
            os.environ.get("SBC_AUTH0_CLIENT_SECRET", ""),
            os.environ.get("SBC_AUTH0_CALLBACK_URL", ""),
        ]
        if not all(values):
            return None
        return cls(*values)

    def authorize_url(self, state: str, code_challenge: str) -> str:
        query = urlencode(
            {
                "response_type": "code",
                "client_id": self.client_id,
                "redirect_uri": self.callback_url,
                "scope": "openid profile email",
                "state": state,
                "code_challenge": code_challenge,
                "code_challenge_method": "S256",
            }
        )
        return urljoin(self.issuer, "authorize") + "?" + query

    def exchange(self, code: str, code_verifier: str) -> dict:
        with httpx.Client(timeout=10, follow_redirects=False) as client:
            token_response = client.post(
                urljoin(self.issuer, "oauth/token"),
                json={
                    "grant_type": "authorization_code",
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "code": code,
                    "code_verifier": code_verifier,
                    "redirect_uri": self.callback_url,
                },
            )
            token_response.raise_for_status()
            tokens = token_response.json()
            access_token = str(tokens.get("access_token") or "")
            user_response = client.get(
                urljoin(self.issuer, "userinfo"),
                headers={"Authorization": "Bearer " + access_token},
            )
            user_response.raise_for_status()
            user = user_response.json()
        return {
            "access_token": access_token,
            "issuer": self.issuer,
            "subject": user.get("sub"),
            "email": user.get("email"),
            "email_verified": user.get("email_verified") is True,
        }


class StripeHttpAdapter:
    def __init__(self, secret_key: str, price_id: str):
        self.secret_key = secret_key
        self.price_id = price_id

    @classmethod
    def from_environment(cls) -> StripeHttpAdapter | None:
        secret = os.environ.get("SBC_STRIPE_SECRET_KEY", "")
        price = os.environ.get("SBC_STRIPE_PRICE_MONTHLY", "")
        return cls(secret, price) if secret and price else None

    def _post(self, path: str, data: dict[str, str], idempotency_key: str) -> dict:
        response = httpx.post(
            "https://api.stripe.com/v1/" + path,
            data=data,
            headers={
                "Authorization": "Bearer " + self.secret_key,
                "Idempotency-Key": idempotency_key,
            },
            timeout=10,
        )
        response.raise_for_status()
        return response.json()

    def create_checkout(
        self, account_id: str, success_url: str, cancel_url: str, idempotency_key: str
    ) -> dict:
        value = self._post(
            "checkout/sessions",
            {
                "mode": "subscription",
                "success_url": success_url,
                "cancel_url": cancel_url,
                "line_items[0][price]": self.price_id,
                "line_items[0][quantity]": "1",
                "client_reference_id": account_id,
                "subscription_data[metadata][account_id]": account_id,
            },
            idempotency_key,
        )
        return {"session_id": value["id"], "url": value["url"]}

    def create_portal(
        self, account_id: str, customer_id: str, return_url: str, idempotency_key: str
    ) -> dict:
        value = self._post(
            "billing_portal/sessions",
            {"customer": customer_id, "return_url": return_url},
            idempotency_key,
        )
        return {"session_id": value["id"], "url": value["url"]}
