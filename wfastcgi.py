"""
WSGI Handler for IIS using wfastcgi
This file is used when deploying with wfastcgi instead of httpPlatformHandler

LƯU Ý: File này chỉ cần thiết nếu bạn muốn sử dụng file wfastcgi.py riêng.
Thông thường, wfastcgi sẽ tự động tìm app từ PYTHONPATH và WSGI_HANDLER.
"""
import os
import sys

# Add the project directory to the Python path
project_dir = os.path.dirname(os.path.abspath(__file__))
if project_dir not in sys.path:
    sys.path.insert(0, project_dir)

# Change to project directory
os.chdir(project_dir)

# Import the Flask app
from app import app

# Export the application for wfastcgi
application = app

