from pioneer_sdk2 import Pioneer
import time
import os
from dotenv import load_dotenv

load_dotenv()
if __name__ == '__main__':
    print('start')
    drone_ip = os.getenv("DRONE_IP")
    pioneer_mini = Pioneer(tcp=f"{drone_ip}:20556")
    
    pioneer_mini.arm()
    pioneer_mini.takeoff()
    time.sleep(4)

    pioneer_mini.go_to_local_point(x=0.5, y=0, z=1, yaw=0, time=1)
    while not pioneer_mini.point_reached():
        pass

    pioneer_mini.go_to_local_point(x=-0.5, y=0, z=1, yaw=0, time=1)
    while not pioneer_mini.point_reached():
        pass


    pioneer_mini.land()
