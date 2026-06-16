"""At-rest encryption for Upbit secret_keys.

The Fernet key is derived from APP_SECRET so the SQLite file alone is not enough
to recover a secret_key. Decryption happens only at signing time, in-process.
"""
from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet

from .config import settings


def _fernet() -> Fernet:
    digest = hashlib.sha256(settings.APP_SECRET.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt(token: str) -> str:
    return _fernet().decrypt(token.encode("utf-8")).decode("utf-8")
