import os
import tempfile

os.environ["GARDEBOB_DATA_DIR"] = tempfile.mkdtemp(prefix="garderob-test-")
os.environ["GARDEBOB_OFFLINE"] = "1"
os.environ["GARDEBOB_FORCE_SQLITE"] = "1"
os.environ["DATABASE_URL"] = ""
os.environ["CLOUDINARY_URL"] = ""
os.environ["CLOUDINARY_CLOUD_NAME"] = ""
