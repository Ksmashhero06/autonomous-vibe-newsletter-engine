"""
Google Drive File Uploader
--------------------------
Uploads a local file to Google Drive using the Drive API v3.

Requirements:
    pip install google-api-python-client google-auth-httplib2 google-auth-oauthlib

Usage:
    python upload_to_drive.py
    python upload_to_drive.py --file path/to/file.pdf --mime application/pdf
    python upload_to_drive.py --file image.jpg --mime image/jpeg --folder FOLDER_ID
"""

import argparse
import mimetypes
import os

import google.auth
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload


def upload_to_drive(file_path: str, mime_type: str = None, folder_id: str = None) -> str | None:
    """
    Uploads a file to Google Drive.

    Args:
        file_path:  Local path to the file to upload.
        mime_type:  MIME type of the file (auto-detected if not provided).
        folder_id:  Optional Google Drive folder ID to upload into.

    Returns:
        The uploaded file's Drive ID, or None on failure.
    """
    # Auto-detect MIME type if not specified
    if not mime_type:
        mime_type, _ = mimetypes.guess_type(file_path)
        mime_type = mime_type or "application/octet-stream"

    # Load application default credentials (ADC)
    # Run `gcloud auth application-default login` once to set these up.
    creds, _ = google.auth.default(
        scopes=["https://www.googleapis.com/auth/drive"]
    )

    try:
        service = build("drive", "v3", credentials=creds)

        # Build file metadata
        file_name = os.path.basename(file_path)
        file_metadata = {"name": file_name}
        if folder_id:
            file_metadata["parents"] = [folder_id]

        # Prepare media payload
        # Use resumable=True for files > 5 MB to handle network interruptions
        file_size = os.path.getsize(file_path)
        resumable = file_size > 5 * 1024 * 1024  # 5 MB threshold

        media = MediaFileUpload(
            file_path,
            mimetype=mime_type,
            resumable=resumable,
        )

        print(f"Uploading '{file_name}' ({mime_type}, {file_size / 1024:.1f} KB)...")
        if resumable:
            print("  → Using resumable upload (file > 5 MB).")

        # Execute upload
        uploaded_file = (
            service.files()
            .create(
                body=file_metadata,
                media_body=media,
                fields="id, name, webViewLink",
            )
            .execute()
        )

        file_id = uploaded_file.get("id")
        web_link = uploaded_file.get("webViewLink")
        print(f"\n✅ Upload successful!")
        print(f"   File Name : {uploaded_file.get('name')}")
        print(f"   File ID   : {file_id}")
        print(f"   View Link : {web_link}")

        return file_id

    except HttpError as error:
        print(f"\n❌ Drive API error: {error}")
        return None


def main():
    parser = argparse.ArgumentParser(description="Upload a file to Google Drive.")
    parser.add_argument(
        "--file",
        default="files/photo.jpg",
        help="Path to the local file to upload (default: files/photo.jpg)",
    )
    parser.add_argument(
        "--mime",
        default=None,
        help="MIME type of the file (auto-detected if omitted)",
    )
    parser.add_argument(
        "--folder",
        default=None,
        help="Google Drive folder ID to upload into (uploads to root if omitted)",
    )
    args = parser.parse_args()

    if not os.path.exists(args.file):
        print(f"❌ File not found: {args.file}")
        return

    upload_to_drive(
        file_path=args.file,
        mime_type=args.mime,
        folder_id=args.folder,
    )


if __name__ == "__main__":
    main()
