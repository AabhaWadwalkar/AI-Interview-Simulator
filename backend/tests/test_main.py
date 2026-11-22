import asyncio
import io

import pymupdf
import pytest
from docx import Document
from fastapi import HTTPException
from fastapi.testclient import TestClient
from starlette.datastructures import UploadFile

import main
from main import extract_context, password_digest, password_matches


def upload(name: str, content: bytes) -> UploadFile:
    return UploadFile(filename=name, file=io.BytesIO(content))


def test_password_hash_verifies_without_storing_plaintext() -> None:
    stored = password_digest("practice-password")
    assert "practice-password" not in stored
    assert password_matches("practice-password", stored)
    assert not password_matches("different-password", stored)


def test_extracts_docx_paragraphs_and_tables() -> None:
    document = Document()
    document.add_paragraph("Built an inventory service.")
    table = document.add_table(rows=1, cols=2)
    table.cell(0, 0).text = "Python"
    table.cell(0, 1).text = "FastAPI"
    buffer = io.BytesIO()
    document.save(buffer)

    extracted = asyncio.run(extract_context(upload("candidate.docx", buffer.getvalue()), ""))
    assert "Built an inventory service." in extracted
    assert "Python | FastAPI" in extracted


def test_extracts_pdf_text_and_combines_material() -> None:
    document = pymupdf.open()
    page = document.new_page()
    page.insert_text((72, 72), "Backend engineer")
    pdf_content = document.tobytes()
    document.close()

    extracted = asyncio.run(extract_context(upload("candidate.pdf", pdf_content), "Practice REST APIs"))
    assert "Backend engineer" in extracted
    assert "Practice REST APIs" in extracted


def test_rejects_unsupported_document_type() -> None:
    with pytest.raises(HTTPException) as error:
        asyncio.run(extract_context(upload("candidate.txt", b"resume"), ""))
    assert error.value.status_code == 415


def test_signup_and_login_use_local_account_store(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(main, "DATABASE", tmp_path / "accounts.sqlite3")
    with TestClient(main.app) as client:
        signup = client.post(
            "/api/auth/signup",
            json={"email": "candidate@example.com", "password": "practice-password"},
        )
        login = client.post(
            "/api/auth/login",
            json={"email": "CANDIDATE@example.com", "password": "practice-password"},
        )

    assert signup.status_code == 200
    assert login.status_code == 200
    assert signup.json()["user"]["email"] == "candidate@example.com"
    assert login.json()["token"]
