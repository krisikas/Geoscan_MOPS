from pioneer_sdk2 import Pioneer # импортируем класс Pioneer из библиотеки pioneer_sdk2
import time                
import os
from dotenv import load_dotenv

load_dotenv()

drone_ip = os.getenv("DRONE_IP")
drone_1 = Pioneer(tcp=f"{drone_ip}:20556")

while True:
    print(drone_1.get_local_position_lps())
    time.sleep(1)
