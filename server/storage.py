from __future__ import annotations

from io import BytesIO

from minio import Minio

import config

_client: Minio | None = None


def get_client() -> Minio:
    """Get or create the Minio client singleton."""
    global _client
    if _client is None:
        _client = Minio(
            config.MINIO_ENDPOINT,
            access_key=config.MINIO_ACCESS_KEY,
            secret_key=config.MINIO_SECRET_KEY,
            secure=config.MINIO_SECURE,
        )
        # Ensure buckets exist
        for bucket in (
            config.MINIO_BUCKET_PDFS,
            config.MINIO_BUCKET_PAGES,
            config.MINIO_BUCKET_OUTPUT,
        ):
            if not _client.bucket_exists(bucket):
                _client.make_bucket(bucket)
    return _client


# ---------- PDF storage ----------

def upload_pdf(uid: str, data: bytes, filename: str) -> str:
    """Store a PDF. Returns the object key."""
    key = f"{uid}.pdf"
    client = get_client()
    client.put_object(
        config.MINIO_BUCKET_PDFS,
        key,
        BytesIO(data),
        len(data),
        content_type="application/pdf",
    )
    return key


def get_pdf(uid: str) -> bytes:
    """Retrieve a PDF file."""
    key = f"{uid}.pdf"
    resp = get_client().get_object(config.MINIO_BUCKET_PDFS, key)
    data = resp.read()
    resp.close()
    resp.release_conn()
    return data


def delete_pdf(uid: str) -> bool:
    """Delete a PDF file. Returns True if deleted, False if not found."""
    key = f"{uid}.pdf"
    try:
        get_client().remove_object(config.MINIO_BUCKET_PDFS, key)
        return True
    except Exception:
        return False


# ---------- Page image storage ----------

def upload_page_image(uid: str, page_num: int, data: bytes) -> str:
    """Store a page PNG image. Returns the object key."""
    key = f"{uid}/page_{page_num:03d}.png"
    client = get_client()
    client.put_object(
        config.MINIO_BUCKET_PAGES,
        key,
        BytesIO(data),
        len(data),
        content_type="image/png",
    )
    return key


def get_page_image(uid: str, page_num: int) -> bytes:
    """Retrieve a page image."""
    key = f"{uid}/page_{page_num:03d}.png"
    resp = get_client().get_object(config.MINIO_BUCKET_PAGES, key)
    data = resp.read()
    resp.close()
    resp.release_conn()
    return data


def page_image_exists(uid: str, page_num: int) -> bool:
    """Check if a page image exists."""
    key = f"{uid}/page_{page_num:03d}.png"
    try:
        get_client().stat_object(config.MINIO_BUCKET_PAGES, key)
        return True
    except Exception:
        return False


def list_page_images(uid: str) -> list[str]:
    """List page image filenames for an upload."""
    objects = get_client().list_objects(
        config.MINIO_BUCKET_PAGES, prefix=f"{uid}/"
    )
    return sorted(
        obj.object_name.split("/")[-1]
        for obj in objects
        if obj.object_name.endswith(".png")
    )


def delete_page_images(uid: str):
    """Delete all page images for an upload."""
    client = get_client()
    objects = client.list_objects(config.MINIO_BUCKET_PAGES, prefix=f"{uid}/")
    for obj in objects:
        client.remove_object(config.MINIO_BUCKET_PAGES, obj.object_name)


# ---------- CSV output storage ----------

def upload_csv(filename: str, data: bytes) -> str:
    """Store an extraction CSV. Returns the object key."""
    client = get_client()
    client.put_object(
        config.MINIO_BUCKET_OUTPUT,
        filename,
        BytesIO(data),
        len(data),
        content_type="text/csv",
    )
    return filename


def get_csv(filename: str) -> bytes:
    """Retrieve a CSV file."""
    resp = get_client().get_object(config.MINIO_BUCKET_OUTPUT, filename)
    data = resp.read()
    resp.close()
    resp.release_conn()
    return data


def csv_exists(filename: str) -> bool:
    """Check if a CSV file exists."""
    try:
        get_client().stat_object(config.MINIO_BUCKET_OUTPUT, filename)
        return True
    except Exception:
        return False


def delete_csv(filename: str) -> bool:
    """Delete a CSV file. Returns True if deleted, False if not found."""
    try:
        get_client().remove_object(config.MINIO_BUCKET_OUTPUT, filename)
        return True
    except Exception:
        return False


# ---------- Cleanup ----------

def delete_upload_files(uid: str):
    """Delete all files associated with an upload (PDF, pages, CSVs)."""
    delete_pdf(uid)
    delete_page_images(uid)
    delete_csv(f"{uid}_extract.csv")
