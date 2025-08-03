from google.cloud import storage
from datetime import timedelta
import os

GCS_BUCKET = "gen-ai-quiz"  # your bucket name

def upload_to_gcs(file_obj, destination_path, content_type, make_public=True):
    client = storage.Client()
    bucket = client.bucket("gen-ai-quiz")
    blob = bucket.blob(f'uploads/{destination_path}')
    blob.upload_from_file(file_obj, content_type=content_type)

    return blob.public_url

def delete_from_gcs(destination_path):
    client = storage.Client()
    bucket = client.bucket("gen-ai-quiz")
    blob = bucket.blob(f'uploads/{destination_path}')

    if blob.exists():
        blob.delete()
        return True
    else:
        return False
