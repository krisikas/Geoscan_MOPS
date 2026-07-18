import os
import time
import requests
import base64
import cv2
import numpy as np
from dotenv import load_dotenv

load_dotenv()
DRONE_IP = os.getenv("DRONE_IP")
MAIN_CAMERA_URL = f'http://{DRONE_IP}:7000/main_camera'
THERMAL_CAMERA_URL = f'http://{DRONE_IP}:7000/thermal_absolute'
SAVE_DIR_MAIN = os.path.join("metashape_dataset", "main")
SAVE_DIR_THERMAL = os.path.join("metashape_dataset", "thermal")

def create_dataset_dirs():
    os.makedirs(SAVE_DIR_MAIN, exist_ok=True)
    os.makedirs(SAVE_DIR_THERMAL, exist_ok=True)

def get_image(url):
    try:
        response = requests.get(url, timeout=1)
        if response.status_code == 200:
            data = response.json()
            if 'image' in data:
                img_data = base64.b64decode(data['image'])
                np_arr = np.frombuffer(img_data, np.uint8)
                img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
                return img
    except Exception as e:
        # Silently pass to avoid spamming the console if the drone is temporarily disconnected
        pass
    return None

if __name__ == '__main__':
    create_dataset_dirs()
    
    print("Starting dataset collection.")
    print("-----------------------------------")
    print("Press SPACE to START/STOP recording (saves every 0.4s).")
    print("Press ESC or 'q' to quit.")
    print("-----------------------------------")
    
    saved_count = 0
    is_recording = False
    last_save_time = 0
    
    while True:
        # Fetch both images
        img_main = get_image(MAIN_CAMERA_URL)
        img_thermal = get_image(THERMAL_CAMERA_URL)
        
        # Display streams if available
        if img_main is not None:
            cv2.imshow('Main Camera Stream', img_main)
        if img_thermal is not None:
            cv2.imshow('Thermal Camera Stream', img_thermal)
            
        # Wait 1 ms for user input
        key = cv2.waitKey(1) & 0xFF
        
        # SPACE key toggles recording state
        if key == ord(' '):
            is_recording = not is_recording
            if is_recording:
                print(">>> Recording STARTED. Saving frames every 0.4 seconds...")
                last_save_time = time.time()  # Reset timer so we save immediately
            else:
                print(">>> Recording STOPPED.")
                
        # ESC or 'q' is pressed
        elif key == 27 or key == ord('q'):
            print("Exiting...")
            break
            
        # Auto-saving logic when recording is active
        if is_recording:
            current_time = time.time()
            if current_time - last_save_time >= 0.4:
                # Save if at least one image is available
                if img_main is not None or img_thermal is not None:
                    if img_main is not None:
                        main_filename = os.path.join(SAVE_DIR_MAIN, f"photo_main_{saved_count:04d}.jpg")
                        cv2.imwrite(main_filename, img_main)
                    
                    if img_thermal is not None:
                        thermal_filename = os.path.join(SAVE_DIR_THERMAL, f"photo_thermal_{saved_count:04d}.jpg")
                        cv2.imwrite(thermal_filename, img_thermal)
                    
                    print(f"Saved pair #{saved_count:04d}")
                    saved_count += 1
                    last_save_time = current_time

    cv2.destroyAllWindows()
    print(f"Done. Collected {saved_count} image pairs.")