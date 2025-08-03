# import cloudinary
# import cloudinary.uploader
# import cloudinary.api
# from dotenv import load_dotenv
# import os

# load_dotenv()

# # Cloudinary config
# cloudinary.config(
#     cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
#     api_key=os.getenv("CLOUDINARY_API_KEY"),
#     api_secret=os.getenv("CLOUDINARY_API_SECRET")
# )

# def upload_to_cloudinary(file_obj, destination_path=None, resource_type="auto", make_public=True):
#     result = cloudinary.uploader.upload(
#         file_obj,
#         public_id=f"uploads/{destination_path}" if destination_path else None,
#         resource_type=resource_type,
#         use_filename=True,
#         unique_filename=False,
#         overwrite=True
#     )
#     return result["secure_url"]

# def delete_from_cloudinary(public_id):
#     result = cloudinary.uploader.destroy(
#         f"uploads/{public_id}",
#         invalidate=True,
#         resource_type="image"  # or "auto" or "video", depending on your use case
#     )
#     return result["result"] == "ok"