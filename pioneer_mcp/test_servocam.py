from pioneer_sdk2 import Pioneer, ServoCamera
import os
from dotenv import load_dotenv

load_dotenv()
angle = 45

servo_camera = ServoCamera()
servo_camera.set_angle(angle)


if __name__ == '__main__':
    print('start')
    drone_ip = os.getenv("DRONE_IP")
    pioneer_mini = Pioneer(tcp=f"{drone_ip}:20556")
